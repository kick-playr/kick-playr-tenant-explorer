import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  bindingDigest,
  createApplicationRuntime,
  type SecretsRuntime,
} from '@kick-playr/local-key-vault/runtime-client';
import { createLiveServerSecretsSource } from '../src/lib/server-secrets-live';
import { realmForHost } from '../src/lib/server-realms';
const scope = { environment: 'development', tenant: '_shared' };
const attrs = {
  enabled: true,
  created: 1,
  updated: 1,
  recoveryLevel: 'Purgeable' as const,
};
const canonical = (x: unknown) =>
  JSON.stringify(x, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
function fixture(failFirstLiveStart = false, expiry?: number) {
  let live = false,
    denied = false,
    outage = false,
    generation = 1,
    secret = 'sk_test_old123',
    secretVersion = 'a'.repeat(32),
    encryptionVersion = 'b'.repeat(32);
  const encryption = Buffer.alloc(32, 7).toString('base64');
  let legacyReads = 0;
  const calls: string[] = [];
  const names = {
    CLERK_SECRET_KEY: 'clerk-secret',
    CLERK_ENCRYPTION_KEY: 'clerk-encryption',
  };
  const physical = (purpose: string) =>
    'kv-' +
    createHash('sha256')
      .update(JSON.stringify(['development', '_shared', 'secret', purpose]))
      .digest('hex');
  function descriptor() {
    const resources = Object.entries(names)
      .map(([mapping, purpose]) => ({
        kind: 'secrets' as const,
        name: physical(purpose),
        mapping,
        policy: 'latest',
        version:
          mapping === 'CLERK_SECRET_KEY' ? secretVersion : encryptionVersion,
        classification:
          mapping === 'CLERK_SECRET_KEY'
            ? ('secret' as const)
            : ('encryption-key' as const),
        attributes: {
          ...attrs,
          ...(expiry === undefined ? {} : { exp: expiry }),
        },
      }))
      .sort((a, b) => (a.mapping < b.mapping ? -1 : 1));
    const identity = {
      schemaVersion: 2 as const,
      application: 'explorer',
      scope,
      resources,
    };
    return {
      ...identity,
      generation,
      digest: createHash('sha256').update(canonical(identity)).digest('hex'),
    };
  }
  const fetcher: typeof fetch = async (input) => {
    const action = new URL(String(input)).pathname.split('/').at(-1)!;
    calls.push(action);
    if (denied || outage)
      return Response.json(
        { error: { code: 'private-failure' } },
        { status: denied ? 403 : 503 },
      );
    const d = descriptor();
    if (action === 'mode')
      return Response.json({
        schemaVersion: 2,
        application: 'explorer',
        scope,
        mode: live ? 'live' : 'legacy',
      });
    if (action === 'desired') return Response.json(d);
    if (action === 'in-use') return Response.json({ valid: true });
    if (action === 'snapshot')
      return Response.json({
        ...d,
        resources: d.resources.map((r) => ({
          ...r,
          value: r.mapping === 'CLERK_SECRET_KEY' ? secret : encryption,
        })),
      });
    if (action === 'register')
      return Response.json({
        instanceId: 'a'.repeat(36),
        proof: 'p'.repeat(43),
        expiresAt: Date.now() + 30000,
      });
    if (action === 'acknowledge')
      return Response.json({ accepted: true, expiresAt: Date.now() + 30000 });
    throw Error('unexpected runtime request');
  };
  const request = {
    schemaVersion: 1 as const,
    bindingRevision: 1,
    keySets: [],
    secrets: [
      {
        mapping: 'CLERK_SECRET_KEY',
        purpose: 'clerk-secret',
        version: 'a'.repeat(32),
      },
      {
        mapping: 'CLERK_ENCRYPTION_KEY',
        purpose: 'clerk-encryption',
        version: 'b'.repeat(32),
      },
    ],
  };
  const legacySnapshot = {
    ...request,
    bindingDigest: bindingDigest(request),
    ...scope,
    generation: 1,
    loadedAt: Date.now(),
    secrets: request.secrets.map((s) => ({
      ...s,
      value: s.mapping === 'CLERK_SECRET_KEY' ? 'sk_test_old123' : encryption,
      attributes: {
        ...attrs,
        ...(expiry === undefined ? {} : { exp: expiry }),
      },
    })),
  };
  const environment = {
    NODE_ENV: 'development',
    SECRETS_KEYS_STRATEGY: 'LOCAL_KEYVAULT',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
    EXPLORER_API_ORIGIN: 'http://127.0.0.1:5000',
    LOCAL_KEYVAULT_AUTH_JSON: JSON.stringify({
      schemaVersion: 1,
      grants: [{ ...scope, token: 'test-vault-token-aaaaaaaaaaaaaaaaaaaa' }],
    }),
    LOCAL_KEYVAULT_BINDINGS_JSON: JSON.stringify({
      applications: { explorer: { request } },
    }),
  };
  const source = createLiveServerSecretsSource(environment, {
    legacyFactory: async () =>
      ({
        loadApplication: async () => ({
          scope,
          request: { ...request, bindingDigest: bindingDigest(request) },
        }),
        loadProcess: async () => {
          legacyReads++;
          return {
            strategy: 'LOCAL_KEYVAULT',
            mappings: {
              CLERK_SECRET_KEY: 'sk_test_old123',
              CLERK_ENCRYPTION_KEY: encryption,
            },
            snapshot: legacySnapshot,
          };
        },
        close() {},
      }) as unknown as SecretsRuntime,
    runtimeFactory: (options) => {
      const runtime = createApplicationRuntime({ ...options, fetch: fetcher });
      return {
        ...runtime,
        start: async () => {
          if (failFirstLiveStart) {
            failFirstLiveStart = false;
            throw Error('Temporary startup failure');
          }
          return runtime.start();
        },
      };
    },
  });
  return {
    source,
    calls,
    legacyReads: () => legacyReads,
    activate: () => {
      live = true;
    },
    updateSecret: () => {
      secret = 'sk_test_new123';
      secretVersion = 'c'.repeat(32);
      generation++;
    },
    updateEncryption: () => {
      encryptionVersion = 'd'.repeat(32);
      generation++;
    },
    deny: () => {
      denied = true;
    },
    outage: () => {
      outage = true;
    },
  };
}
test('keeps legacy startup until explicit activation, then real realm lookups use the refreshed key without restart', async () => {
  const f = fixture();
  try {
    const old = await f.source.load();
    assert.equal(old.CLERK_SECRET_KEY, 'sk_test_old123');
    assert.equal(f.legacyReads(), 1);
    assert.equal(f.calls.includes('snapshot'), false);
    f.activate();
    const deadline = Date.now() + 4500;
    f.updateSecret();
    let environment = old;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      environment = await f.source.load();
      if (environment.CLERK_SECRET_KEY === 'sk_test_new123') break;
    }
    assert.equal(environment.CLERK_SECRET_KEY, 'sk_test_new123');
    const realm = await realmForHost('localhost', environment, async () =>
      Response.json({ host: 'localhost', club: false }),
    );
    assert.equal(realm.secretKey, 'sk_test_new123');
    assert.equal(f.source.status().state, 'applied');
    assert.equal(f.legacyReads(), 1);
  } finally {
    f.source.close();
  }
});
test('live outage retains working credentials but observed denial prevents the next realm read', async () => {
  const f = fixture();
  try {
    f.activate();
    await f.source.load();
    f.outage();
    await f.source.refresh();
    assert.equal((await f.source.load()).CLERK_SECRET_KEY, 'sk_test_old123');
    assert.equal(f.source.status().state, 'warning');
    f.deny();
    await assert.rejects(f.source.refresh(), /unavailable/i);
    await assert.rejects(f.source.load(), /unavailable/i);
  } finally {
    f.source.close();
  }
});
test('activation never treats a changed Clerk encryption key as a fresh unguarded startup', async () => {
  const f = fixture();
  try {
    await f.source.load();
    f.activate();
    f.updateEncryption();
    await f.source.refresh();
    assert.equal((await f.source.load()).CLERK_SECRET_KEY, 'sk_test_old123');
    assert.equal(f.source.status().reason, 'MigrationRequired');
  } finally {
    f.source.close();
  }
});

test('automatically retries a failed handover without waiting for another user request', async () => {
  const f = fixture(true);
  try {
    await f.source.load();
    f.activate();
    const deadline = Date.now() + 4500;
    while (!f.calls.includes('acknowledge') && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(f.calls.includes('acknowledge'));
    assert.equal(f.source.status().state, 'applied');
  } finally {
    f.source.close();
  }
});

test('an already-live cold start cannot bypass the pinned encryption baseline', async () => {
  const f = fixture();
  try {
    f.activate();
    f.updateEncryption();
    await assert.rejects(f.source.load(), /unavailable/i);
    assert.equal(f.source.status().reason, 'MigrationRequired');
    assert.equal(f.legacyReads(), 0);
  } finally {
    f.source.close();
  }
});
test('an already-live cold start adopts ordinary updates without loading obsolete secret values', async () => {
  const f = fixture();
  try {
    f.activate();
    f.updateSecret();
    assert.equal((await f.source.load()).CLERK_SECRET_KEY, 'sk_test_new123');
    assert.equal(f.source.status().state, 'applied');
    assert.equal(f.legacyReads(), 0);
  } finally {
    f.source.close();
  }
});

test('healthy legacy metadata does not extend known cached secret expiry', async () => {
  const expiry = Math.floor(Date.now() / 1000) + 600;
  const f = fixture(false, expiry);
  const original = Date.now;
  try {
    await f.source.load();
    Date.now = () => expiry * 1000 + 1;
    await assert.rejects(f.source.load(), /unavailable/i);
    assert.equal(f.legacyReads(), 1);
  } finally {
    Date.now = original;
    f.source.close();
  }
});
