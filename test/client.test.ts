import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, ApiError } from '../src/lib/api.ts';
import { proxyRequest } from '../src/lib/proxy.ts';

test('client sends same-origin JSON and preserves useful conflict messages', async () => {
  const original = globalThis.fetch;
  let called = '';
  globalThis.fetch = async (url, init) => {
    called = String(url);
    assert.equal(init?.cache, 'no-store');
    assert.equal(
      new Headers(init?.headers).get('content-type'),
      'application/json',
    );
    return Response.json(
      { message: 'Tenant changed; reload before saving' },
      { status: 409 },
    );
  };
  try {
    await assert.rejects(
      apiRequest('tenants/development/winikon', {
        method: 'PATCH',
        body: '{}',
      }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 409 &&
        error.message.includes('reload'),
    );
    assert.equal(called, '/api/explorer/tenants/development/winikon');
  } finally {
    globalThis.fetch = original;
  }
});

test('proxy never forwards browser credentials, cookies or user-supplied upstream hosts', async () => {
  let called = false;
  const response = await proxyRequest(
    new Request('http://localhost:3002/api/explorer/tenants?page=1', {
      headers: { cookie: 'private-cookie', authorization: 'Bearer attacker' },
    }),
    ['tenants'],
    'verified-session',
    'http://127.0.0.1:3003',
    async (url, init) => {
      called = true;
      assert.equal(
        String(url),
        'http://127.0.0.1:3003/api/platform/tenants?page=1',
      );
      assert.equal(
        new Headers(init?.headers).get('authorization'),
        'Bearer verified-session',
      );
      assert.equal(new Headers(init?.headers).get('cookie'), null);
      assert.equal(init?.redirect, 'error');
      return Response.json({ items: [], total: 0 });
    },
  );
  assert.ok(called);
  assert.equal(response.status, 200);
});

test('proxy rejects traversal, untrusted write origins and missing sessions before transport', async () => {
  const transport = async () => {
    throw new Error('must not call upstream');
  };
  assert.equal(
    (
      await proxyRequest(
        new Request('http://localhost:3002/api/explorer/tenants'),
        ['tenants', '..'],
        'token',
        'http://127.0.0.1:3003',
        transport,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await proxyRequest(
        new Request('http://localhost:3002/api/explorer/tenants', {
          method: 'POST',
          headers: {
            origin: 'https://foreign.ch',
            'content-type': 'application/json',
          },
          body: '{}',
        }),
        ['tenants'],
        'token',
        'http://127.0.0.1:3003',
        transport,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await proxyRequest(
        new Request('http://localhost:3002/api/explorer/tenants'),
        ['tenants'],
        null,
        'http://127.0.0.1:3003',
        transport,
      )
    ).status,
    401,
  );
});

test('proxy converts upstream connection failures into safe actionable errors', async () => {
  const response = await proxyRequest(
    new Request('http://localhost:3002/api/explorer/tenants'),
    ['tenants'],
    'token',
    'http://127.0.0.1:3003',
    async () => {
      throw new Error('private credentials');
    },
  );
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('private credentials'));
});

test('proxy rejects oversized write bodies before forwarding', async () => {
  const response = await proxyRequest(
    new Request('http://localhost:3002/api/explorer/tenants', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3002',
        'content-type': 'application/json',
      },
      body: 'x'.repeat(65537),
    }),
    ['tenants'],
    'token',
    'http://127.0.0.1:3003',
    async () => {
      throw new Error('Must not forward');
    },
  );
  assert.equal(response.status, 413);
});

test('proxy admits tenant key inspection without admitting arbitrary file paths', async () => {
  const result = await proxyRequest(
    new Request(
      'http://localhost:3002/api/explorer/tenants/development/fcrww/keys',
    ),
    ['tenants', 'development', 'fcrww', 'keys'],
    'session',
    'http://127.0.0.1:3003',
    async (url) => {
      assert.equal(
        String(url),
        'http://127.0.0.1:3003/api/platform/tenants/development/fcrww/keys',
      );
      return Response.json({
        reference: 'real-development:fcrww:key',
        status: 'unbound',
        files: [],
      });
    },
  );
  assert.equal(result.status, 200);
});

test('proxy admits only bounded invitation management routes', async () => {
  for (const suffix of [
    [],
    ['abc-123', 'resend'],
    ['abc-123', 'deliver'],
    ['abc-123', 'revoke'],
  ]) {
    const result = await proxyRequest(
      new Request('http://localhost:3002/api/explorer/test'),
      ['tenants', 'development', 'club', 'invitations', ...suffix],
      'token',
      'http://127.0.0.1:3003',
      async () => Response.json([]),
    );
    assert.equal(result.status, 200);
  }
  const result = await proxyRequest(
    new Request('http://localhost:3002/api/explorer/test'),
    ['tenants', 'development', 'club', 'invitations', 'id', 'activate'],
    'token',
    'http://127.0.0.1:3003',
    async () => {
      throw Error('not called');
    },
  );
  assert.equal(result.status, 400);
});
