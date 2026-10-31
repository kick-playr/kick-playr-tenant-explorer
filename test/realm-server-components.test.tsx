import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { realmForHost } from '../src/lib/server-realms.ts';

const require = createRequire(import.meta.url);
// Use Clerk's Node distribution and omit CSS in this Node-only render harness.
// Authentication itself remains real and would fail without a Next request if called.
const clerkUrl = pathToFileURL(require.resolve('@clerk/nextjs')).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@clerk/nextjs')
      return { url: clerkUrl, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css'))
      return { format: 'module', source: '', shortCircuit: true };
    return next(url, context);
  },
});

test('root layout and page render neutral retry UI after an earlier successful realm lookup', async (t) => {
  const nextHeaders = require('next/headers') as typeof import('next/headers');
  t.mock.method(
    nextHeaders,
    'headers',
    async () => new Headers({ host: 'localhost:3002' }),
  );
  const oldOrigin = process.env.EXPLORER_API_ORIGIN;
  process.env.EXPLORER_API_ORIGIN = 'http://127.0.0.1:3003';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return calls === 1
      ? Response.json({ host: 'localhost:3002', club: false })
      : Response.json({ message: 'SECRET upstream detail' }, { status: 429 });
  });
  t.mock.method(console, 'error', () => {});
  try {
    await realmForHost('localhost:3002', {
      EXPLORER_API_ORIGIN: 'http://127.0.0.1:3003',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_platform',
      CLERK_SECRET_KEY: 'synthetic-secret',
    });
    const { default: RootLayout } = await import('../src/app/layout.tsx');
    const { default: Page } = await import('../src/app/page.tsx');
    const layout = renderToStaticMarkup(
      await RootLayout({ children: <div>PROTECTED CONTENT</div> }),
    );
    const page = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    for (const markup of [layout, page]) {
      assert.match(markup, /Explorer is temporarily unavailable/);
      assert.match(markup, /<a[^>]*href=""[^>]*>Try again<\/a>/);
      assert.ok(!markup.includes('PROTECTED CONTENT'));
      assert.ok(!markup.includes('SECRET'));
      assert.ok(!markup.includes('synthetic-secret'));
      assert.ok(!markup.includes('Configure Clerk'));
    }
    assert.equal(
      calls,
      3,
      'no access/data fetch after failed layout/page resolution',
    );
  } finally {
    hooks.deregister();
    if (oldOrigin === undefined) delete process.env.EXPLORER_API_ORIGIN;
    else process.env.EXPLORER_API_ORIGIN = oldOrigin;
  }
});
