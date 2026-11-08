import { test, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const authModule =
  'data:text/javascript,' +
  encodeURIComponent(
    "export async function auth(){return {userId:'fixture-user',getToken:async()=> 'fixture-token'}}",
  );
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@clerk/nextjs/server')
      return { url: authModule, shortCircuit: true };
    return next(specifier, context);
  },
});
after(() => hooks.deregister());
const { PUT } = await import('../src/app/api/vault-v2/[...path]/route.ts');
const names = [
  'VAULT_APPLICATION_ID',
  'VAULT_API_ORIGIN',
  'VAULT_PROVISIONING_GRANT',
  'EXPLORER_API_ORIGIN',
];
let previous: Record<string, string | undefined>;
beforeEach(() => {
  previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  delete process.env.VAULT_APPLICATION_ID;
  process.env.VAULT_API_ORIGIN = 'http://127.0.0.1:4000';
  process.env.VAULT_PROVISIONING_GRANT = 'fixture-provisioning';
  process.env.EXPLORER_API_ORIGIN = 'http://127.0.0.1:3003';
});
afterEach(() => {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});
const body = {
  connectionId: 'smtp',
  expectedRevision: 'r1',
  versionId: 'v1',
  settings: {
    host: 'mail.club.ch',
    port: 587,
    user: 'billing',
    fromAddress: 'billing@club.example',
  },
};
function request(
  ownerType = 'tenant',
  origin = 'http://club-one.explorer.localhost:3002',
) {
  return new Request(
    'http://club-one.explorer.localhost:3002/api/vault-v2/tenant-smtp/smtp-one?environment=development&ownerType=' +
      ownerType +
      '&ownerId=club-one',
    {
      method: 'PUT',
      headers: {
        host: 'club-one.explorer.localhost:3002',
        origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
}
test('the authenticated route scopes every Vault request to the tenant and returns no secret material', async (t) => {
  const calls: { url: URL; method: string; body: any }[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)),
        method = init?.method ?? 'GET';
      assert.equal(
        new Headers(init?.headers).get('authorization'),
        'Bearer fixture-token',
      );
      if (url.port === '3003') {
        assert.equal(
          url.pathname,
          '/api/club/tenants/development/club-one/integrations',
        );
        return Response.json({
          items: [
            {
              id: 'smtp',
              provider: 'smtp',
              status: 'disabled',
              revision: 'r1',
              mail: {
                allowedHosts: ['mail.club.ch'],
                vault: { resourceId: 'smtp-one', versionId: 'v1' },
              },
            },
          ],
        });
      }
      assert.equal(
        new Headers(init?.headers).get('x-vault-provisioning'),
        'Bearer fixture-provisioning',
      );
      assert.equal(url.searchParams.get('ownerType'), 'tenant');
      assert.equal(url.searchParams.get('ownerId'), 'club-one');
      assert.equal(url.searchParams.get('environment'), 'development');
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.pathname.endsWith('/access'))
        return Response.json({ canRead: true, canWrite: true });
      if (url.pathname.endsWith('/resources'))
        return Response.json([
          {
            _id: 'smtp-one',
            name: 'SMTP',
            kind: 'integration',
            schemaIdentity: 'builtin:email@2',
            environment: 'development',
            ownerType: 'tenant',
            ownerId: 'club-one',
            revision: 1,
            currentVersionId: 'v1',
          },
        ]);
      if (url.pathname.endsWith('/links/club-api'))
        return Response.json({
          links: [
            {
              resourceId: 'smtp-one',
              accessName: 'SMTP',
              versionPolicy: 'latest',
            },
          ],
          deployment: { revision: 1 },
        });
      if (url.pathname.includes('/reveal/'))
        return Response.json({
          protocol: 'smtp',
          host: 'mail.club.ch',
          port: 465,
          tls: 'implicit',
          username: 'old',
          password: 'SECRET-CANARY',
          sender: 'old@club.example',
        });
      if (method === 'PUT')
        return Response.json({ _id: 'smtp-one', currentVersionId: 'v2' });
      throw Error('unexpected endpoint');
    },
  );
  const response = await PUT(request(), {
    params: Promise.resolve({ path: ['tenant-smtp', 'smtp-one'] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    resourceId: 'smtp-one',
    versionId: 'v2',
  });
  const write = calls.find((c) => c.method === 'PUT')!;
  assert.equal(write.body.resource.value.password, 'SECRET-CANARY');
  assert.equal(write.body.resource.value.sender, 'billing@club.example');
});
test('the route rejects application scope and foreign origins before accessing credentials', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw Error();
  });
  for (const req of [
    request('application'),
    request('tenant', 'http://foreign.example'),
  ]) {
    const response = await PUT(req, {
      params: Promise.resolve({ path: ['tenant-smtp', 'smtp-one'] }),
    });
    assert.ok([400, 403].includes(response.status));
  }
  assert.equal(calls, 0);
});

test('malformed Vault reveal responses cannot echo secret material into route errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.port === '3003')
      return Response.json({
        items: [
          {
            id: 'smtp',
            provider: 'smtp',
            status: 'disabled',
            revision: 'r1',
            mail: {
              allowedHosts: ['mail.club.ch'],
              vault: { resourceId: 'smtp-one', versionId: 'v1' },
            },
          },
        ],
      });
    if (url.pathname.endsWith('/access'))
      return Response.json({ canRead: true, canWrite: true });
    if (url.pathname.endsWith('/resources'))
      return Response.json([
        {
          _id: 'smtp-one',
          name: 'SMTP',
          kind: 'integration',
          schemaIdentity: 'builtin:email@2',
          environment: 'development',
          ownerType: 'tenant',
          ownerId: 'club-one',
          revision: 1,
          currentVersionId: 'v1',
        },
      ]);
    if (url.pathname.endsWith('/links/club-api'))
      return Response.json({
        links: [
          {
            resourceId: 'smtp-one',
            accessName: 'SMTP',
            versionPolicy: 'latest',
          },
        ],
        deployment: { revision: 1 },
      });
    return new Response('SECRET-CANARY invalid JSON', {
      headers: { 'content-type': 'application/json' },
    });
  });
  const response = await PUT(request(), {
    params: Promise.resolve({ path: ['tenant-smtp', 'smtp-one'] }),
  });
  assert.equal(response.status, 409);
  const text = await response.text();
  assert.equal(text.includes('SECRET-CANARY'), false);
  assert.match(text, /could not be confirmed/);
});
