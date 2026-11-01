import test from 'node:test';
import type { SecretsRuntime } from '@kick-playr/local-key-vault/runtime-client';
import assert from 'node:assert/strict';
import {
  createServerSecretsLoader,
  installClerkProcessSecrets,
} from '../src/lib/server-secrets-core';

test('frontend vault loader loads Clerk before use once, discards legacy secrets and retains memory until restart', async () => {
  let calls = 0;
  const input = {
    NODE_ENV: 'development',
    SECRETS_KEYS_STRATEGY: 'LOCAL_KEYVAULT',
    CLERK_SECRET_KEY: 'stale',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
    LOCAL_KEYVAULT_BINDINGS_JSON: JSON.stringify({
      schemaVersion: 1,
      applications: {
        explorer: {
          scope: { environment: 'development', tenant: '_shared' },
          request: {
            keySets: [],
            secrets: [
              { mapping: 'CLERK_SECRET_KEY' },
              { mapping: 'CLERK_ENCRYPTION_KEY' },
            ],
          },
        },
      },
      tenants: [],
    }),
  };
  const load = createServerSecretsLoader(
    input,
    () =>
      ({
        loadProcess: async (name: string) => {
          calls++;
          assert.equal(name, 'explorer');
          return {
            strategy: 'LOCAL_KEYVAULT',
            mappings: {
              CLERK_SECRET_KEY: 'sk_test_vault123',
              CLERK_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
            },
          };
        },
        close() {},
      }) as unknown as SecretsRuntime,
  );
  const env = await load();
  assert.equal(env.CLERK_SECRET_KEY, 'sk_test_vault123');
  assert.equal(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, 'pk_test_public');
  assert.equal((await load()).CLERK_SECRET_KEY, 'sk_test_vault123');
  assert.equal(calls, 1);
  assert.equal(input.CLERK_SECRET_KEY, 'stale');
});
test('missing vault credential fails without environment fallback and never retries per request', async () => {
  let calls = 0;
  const load = createServerSecretsLoader(
    {
      NODE_ENV: 'development',
      SECRETS_KEYS_STRATEGY: 'LOCAL_KEYVAULT',
      CLERK_SECRET_KEY: 'stale',
      LOCAL_KEYVAULT_BINDINGS_JSON: JSON.stringify({
        applications: {
          explorer: { request: { secrets: [{ mapping: 'CLERK_SECRET_KEY' }] } },
        },
      }),
    },
    () =>
      ({
        loadProcess: async () => {
          calls++;
          throw Error('sensitive upstream');
        },
        close() {},
      }) as unknown as SecretsRuntime,
  );
  await assert.rejects(load(), /unavailable/i);
  await assert.rejects(load(), /unavailable/i);
  assert.equal(calls, 1);
});
test('unknown strategy and cloud local vault activation fail closed', async () => {
  for (const env of [
    { SECRETS_KEYS_STRATEGY: 'oops' },
    { SECRETS_KEYS_STRATEGY: 'LOCAL_KEYVAULT', NODE_ENV: 'production' },
  ]) {
    const load = createServerSecretsLoader(env, () => {
      throw Error('must not construct');
    });
    await assert.rejects(load(), /unavailable/i);
  }
});

test('vault mode requires a shared Clerk request-encryption key instead of falling back to old SDK env', async () => {
  const environment = {
    NODE_ENV: 'development',
    SECRETS_KEYS_STRATEGY: 'LOCAL_KEYVAULT',
    CLERK_ENCRYPTION_KEY: 'old',
    LOCAL_KEYVAULT_BINDINGS_JSON: JSON.stringify({
      applications: {
        explorer: { request: { secrets: [{ mapping: 'CLERK_SECRET_KEY' }] } },
      },
    }),
  };
  const load = createServerSecretsLoader(
    environment,
    () =>
      ({
        loadProcess: async () => ({
          strategy: 'LOCAL_KEYVAULT',
          mappings: { CLERK_SECRET_KEY: 'sk_test_valid123' },
        }),
        close() {},
      }) as unknown as SecretsRuntime,
  );
  await assert.rejects(load(), /unavailable/i);
});

test('vault mode discards an ambient Clerk machine secret and accepts only an explicitly mapped vault machine key', async () => {
  const encryption = Buffer.alloc(32, 9).toString('base64');
  for (const includeMachine of [false, true]) {
    const names = [
      'CLERK_SECRET_KEY',
      'CLERK_ENCRYPTION_KEY',
      ...(includeMachine ? ['CLERK_MACHINE_SECRET_KEY'] : []),
    ];
    const mappings = {
      CLERK_SECRET_KEY: 'sk_test_platform123',
      CLERK_ENCRYPTION_KEY: encryption,
      ...(includeMachine
        ? { CLERK_MACHINE_SECRET_KEY: 'ak_test_vault123' }
        : {}),
    };
    const load = createServerSecretsLoader(
      {
        NODE_ENV: 'development',
        SECRETS_KEYS_STRATEGY: 'LOCAL_KEYVAULT',
        CLERK_MACHINE_SECRET_KEY: 'ambient-machine-secret',
        LOCAL_KEYVAULT_BINDINGS_JSON: JSON.stringify({
          applications: {
            explorer: {
              request: { secrets: names.map((mapping) => ({ mapping })) },
            },
          },
        }),
      },
      () =>
        ({
          loadProcess: async () => ({ strategy: 'LOCAL_KEYVAULT', mappings }),
          close() {},
        }) as unknown as SecretsRuntime,
    );
    const environment = await load();
    assert.equal(
      environment.CLERK_MACHINE_SECRET_KEY,
      includeMachine ? 'ak_test_vault123' : undefined,
    );
    const target: Record<string, string | undefined> = {
      CLERK_MACHINE_SECRET_KEY: 'ambient-machine-secret',
    };
    installClerkProcessSecrets(environment, target);
    assert.equal(
      target.CLERK_MACHINE_SECRET_KEY,
      includeMachine ? 'ak_test_vault123' : undefined,
    );
  }
});
