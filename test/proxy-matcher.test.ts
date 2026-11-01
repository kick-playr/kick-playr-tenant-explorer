import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server.js';
import { config } from '../src/proxy.ts';

const matches = (path: string) => unstable_doesMiddlewareMatch({
  config,
  url: 'http://fcrww.explorer.localhost:3002' + path,
});

test('branding favicon routes receive Clerk middleware context, including cache-busting queries', () => {
  for (const variant of ['faviconLight', 'faviconDark']) {
    assert.equal(matches('/api/club-branding/development/fcrww/' + variant), true);
    assert.equal(matches('/api/club-branding/development/fcrww/' + variant + '?v=4'), true);
  }
});

test('existing authenticated routes stay covered and static assets stay excluded', () => {
  for (const path of ['/', '/sign-in', '/sign-in/callback', '/api/explorer/clubs/development/fcrww/settings']) {
    assert.equal(matches(path), true, path);
  }
  for (const path of ['/_next/static/chunks/app.js', '/favicon.ico', '/logo.svg']) {
    assert.equal(matches(path), false, path);
  }
});
