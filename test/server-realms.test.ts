import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realmForHost } from '../src/lib/server-realms.ts';
const env = {
  EXPLORER_API_ORIGIN: 'http://127.0.0.1:3003',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_platform',
  CLERK_SECRET_KEY: 'platform-secret',
  EXPLORER_CLUB_FCRWW_CLERK_SECRET_KEY: 'club-secret',
};
const response = (data: unknown, status = 200) =>
  (async () => Response.json(data, { status })) as typeof fetch;
test('resolves only database-authorized club and platform hosts and keeps secret values server-side', async () => {
  const row = {
    host: 'fcrww.explorer.localhost:3002',
    club: true,
    publishableKey: 'pk_test_club',
    secretVariable: 'EXPLORER_CLUB_FCRWW_CLERK_SECRET_KEY',
  };
  assert.equal(
    (await realmForHost(row.host, env, response(row))).secretKey,
    'club-secret',
  );
  assert.equal(
    (
      await realmForHost(
        'localhost:3002',
        env,
        response({ host: 'localhost:3002', club: false }),
      )
    ).secretKey,
    'platform-secret',
  );
  await assert.rejects(
    realmForHost(
      row.host,
      { ...env, EXPLORER_CLUB_FCRWW_CLERK_SECRET_KEY: '' },
      response(row),
    ),
  );
  await assert.rejects(
    realmForHost(
      row.host,
      env,
      response({ ...row, secretVariable: 'NEXT_PUBLIC_SECRET' }),
    ),
  );
  await assert.rejects(
    realmForHost(
      row.host,
      env,
      response({ ...row, host: 'other.localhost:3002' }),
    ),
  );
});
test('fails closed without database routing instead of using old environment mappings', async () => {
  const stale = {
    ...env,
    EXPLORER_CLERK_HOSTS_JSON: JSON.stringify({
      'attacker.example': {
        publishableKey: 'pk_test_old',
        secretVariable: 'EXPLORER_CLUB_FCRWW_CLERK_SECRET_KEY',
      },
    }),
  };
  await assert.rejects(
    realmForHost('attacker.example', stale, response({}, 404)),
  );
  await assert.rejects(
    realmForHost('localhost:3002', stale, (async () => {
      throw Error('offline');
    }) as typeof fetch),
  );
  await assert.rejects(
    realmForHost(
      'localhost:3002',
      stale,
      response({
        host: 'localhost:3002',
        club: false,
        secretKey: 'must-not-return',
      }),
    ),
  );
});

test('rejects remote plaintext configuration origins before network access', async () => {
  let requests = 0;
  await assert.rejects(
    realmForHost(
      'localhost:3002',
      { ...env, EXPLORER_API_ORIGIN: 'http://remote.example' },
      (async () => {
        requests++;
        return Response.json({});
      }) as typeof fetch,
    ),
  );
  assert.equal(requests, 0);
});
