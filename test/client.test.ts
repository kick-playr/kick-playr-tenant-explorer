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

test('club proxy routes reach club endpoints without granting platform access', async () => {
  let called = '';
  const result = await proxyRequest(
    new Request(
      'http://localhost:3002/api/explorer/clubs/development/winikon/settings',
    ),
    ['clubs', 'development', 'winikon', 'settings'],
    'session',
    'http://127.0.0.1:3003',
    async (url) => {
      called = String(url);
      return Response.json({ hash: 'one' });
    },
  );
  assert.equal(result.status, 200);
  assert.equal(
    called,
    'http://127.0.0.1:3003/api/club/tenants/development/winikon/settings',
  );
  const invalid = await proxyRequest(
    new Request(
      'http://localhost:3002/api/explorer/clubs/development/winikon/keys',
    ),
    ['clubs', 'development', 'winikon', 'keys'],
    'session',
    'http://127.0.0.1:3003',
  );
  assert.equal(invalid.status, 400);
});

test('club writes validate Origin against the public Host, not the internal Next URL or forwarded headers', async () => {
  for (const [origin, host, status] of [
    [
      'http://fcrww.explorer.localhost:3002',
      'fcrww.explorer.localhost:3002',
      200,
    ],
    ['http://localhost:3002', 'fcrww.explorer.localhost:3002', 403],
    ['https://foreign.example', 'fcrww.explorer.localhost:3002', 403],
    ['https://foreign.example', 'fcrww.explorer.localhost:3002/path', 403],
  ] as const) {
    let dispatched = false;
    const response = await proxyRequest(
      new Request(
        'http://localhost:3002/api/explorer/clubs/development/fcrww/integrations/bexio/connect',
        {
          method: 'POST',
          headers: {
            host,
            origin,
            'x-forwarded-host': 'foreign.example',
            'content-type': 'application/json',
          },
          body: '{}',
        },
      ),
      ['clubs', 'development', 'fcrww', 'integrations', 'bexio', 'connect'],
      'verified-session',
      'http://127.0.0.1:3003',
      async () => {
        dispatched = true;
        return Response.json({ url: 'https://auth.bexio.com/' });
      },
    );
    assert.equal(response.status, status);
    assert.equal(dispatched, status === 200);
  }
});

test('club catalog bridge exposes label mappings but refuses operational team routes and flags', async () => {
  const calls: string[] = [];
  const transport: typeof fetch = async (url) => {
    calls.push(String(url));
    return Response.json({ id: 'catalog', hash: 'one', items: [] });
  };
  for (const suffix of [
    'catalog/categories',
    'catalog/branches/flags/isTrial',
  ]) {
    const path = `clubs/development/fcrww/${suffix}`;
    const request = new Request(
      `http://fcrww.explorer.localhost:3002/api/explorer/${path}`,
      {
        method: suffix.includes('flags') ? 'PUT' : 'GET',
        ...(suffix.includes('flags')
          ? {
              headers: {
                origin: 'http://fcrww.explorer.localhost:3002',
                'content-type': 'application/json',
              },
              body: JSON.stringify({ expectedHash: 'one', selectors: [] }),
            }
          : {}),
      },
    );
    assert.equal(
      (
        await proxyRequest(
          request,
          path.split('/'),
          'synthetic-token',
          'http://localhost:3003',
          transport,
        )
      ).status,
      200,
    );
  }
  for (const suffix of [
    'catalog/categories/teams',
    'catalog/categories/coaches1418',
    'catalog/branches/player-trainers',
    'catalog/categories/flags/isTeam',
    'catalog/categories/flags/isAdmin',
    'catalog/branches/flags/isKiosk',
  ]) {
    const path = `clubs/development/fcrww/${suffix}`;
    assert.equal(
      (
        await proxyRequest(
          new Request('http://localhost:3002'),
          path.split('/'),
          'synthetic-token',
          'http://localhost:3003',
          transport,
        )
      ).status,
      400,
    );
  }
  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'http://localhost:3003/api/club/tenants/development/fcrww/catalog/branches/flags/isTrial',
  );
});
