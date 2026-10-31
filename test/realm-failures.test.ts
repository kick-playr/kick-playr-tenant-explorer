import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, type NextFetchEvent } from 'next/server';
import proxy from '../src/proxy.ts';
import { GET as explorerRoute } from '../src/app/api/explorer/[...path]/route.ts';
import { GET as brandingRoute } from '../src/app/api/club-branding/[environment]/[id]/[variant]/route.ts';
import { realmForHost } from '../src/lib/server-realms.ts';

const originalOrigin = process.env.EXPLORER_API_ORIGIN;
beforeEach(() => {
  process.env.EXPLORER_API_ORIGIN = 'http://127.0.0.1:3003';
});
afterEach(() => {
  if (originalOrigin === undefined) delete process.env.EXPLORER_API_ORIGIN;
  else process.env.EXPLORER_API_ORIGIN = originalOrigin;
});
function limited() {
  return Response.json(
    { message: 'SECRET backend configuration' },
    {
      status: 429,
      headers: { 'Retry-After': '60' },
    },
  );
}

test('proxy returns a noncached browser 503 with manual retry instead of throwing', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return limited();
  });
  t.mock.method(console, 'error', () => {});
  const response = await proxy(
    new NextRequest('http://localhost:3002/?view=club', {
      headers: { host: 'localhost:3002', accept: 'text/html' },
    }),
    {} as NextFetchEvent,
  );
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get('cache-control'), 'no-store');
  assert.equal(response?.headers.get('retry-after'), '60');
  assert.match(response?.headers.get('content-type') ?? '', /text\/html/);
  const body = await response!.text();
  assert.match(body, /Try again/);
  assert.ok(!body.includes('SECRET'));
  assert.ok(!body.includes('Clerk'));
  assert.equal(calls, 1);
});

test('proxy gives API callers JSON 503 without reflecting the failed lookup', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => limited());
  t.mock.method(console, 'error', () => {});
  const response = await proxy(
    new NextRequest('http://localhost:3002/api/explorer/access', {
      headers: { host: 'localhost:3002', accept: 'text/html' },
    }),
    {} as NextFetchEvent,
  );
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get('cache-control'), 'no-store');
  assert.match(
    response?.headers.get('content-type') ?? '',
    /application\/json/,
  );
  assert.deepEqual(await response!.json(), {
    message: 'Explorer is temporarily unavailable. Please try again.',
  });
});

test('a later explorer route lookup failure stops before Clerk or tenant access', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1)
      return Response.json({ host: 'localhost:3002', club: false });
    return limited();
  });
  t.mock.method(console, 'error', () => {});
  await realmForHost('localhost:3002', {
    EXPLORER_API_ORIGIN: 'http://127.0.0.1:3003',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_platform',
    CLERK_SECRET_KEY: 'synthetic-secret',
  });
  const result = await explorerRoute(
    new Request('http://localhost:3002/api/explorer/access', {
      headers: { host: 'localhost:3002' },
    }),
    { params: Promise.resolve({ path: ['access'] }) },
  );
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('retry-after'), '60');
  assert.equal(calls, 2, 'no tenant request after resolution fails');
});

test('branding lookup failures produce a noncached 503 before authentication', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => limited());
  t.mock.method(console, 'error', () => {});
  const result = await brandingRoute(
    new Request(
      'http://localhost:3002/api/club-branding/development/club/faviconLight',
      {
        headers: { host: 'localhost:3002' },
      },
    ),
    {
      params: Promise.resolve({
        environment: 'development',
        id: 'club',
        variant: 'faviconLight',
      }),
    },
  );
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
