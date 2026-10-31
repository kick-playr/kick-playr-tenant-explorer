import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  realmForHost,
  RealmConfigurationError,
} from '../src/lib/server-realms.ts';
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

test('recovers once from brief transport and gateway failures while preserving request security options', async () => {
  for (const first of ['transport', 502, 503, 504] as const) {
    let calls = 0;
    const signals: AbortSignal[] = [];
    const transport = (async (_url, options) => {
      calls++;
      assert.equal(options?.cache, 'no-store');
      assert.equal(options?.redirect, 'error');
      signals.push(options!.signal as AbortSignal);
      if (calls === 1) {
        if (first === 'transport')
          throw new TypeError('synthetic connection failure');
        return Response.json({}, { status: first });
      }
      return Response.json({ host: 'localhost:3002', club: false });
    }) as typeof fetch;
    assert.equal(
      (await realmForHost('localhost:3002', env, transport)).secretKey,
      'platform-secret',
    );
    assert.equal(calls, 2);
    assert.equal(signals[0], signals[1], 'retries share the original deadline');
  }
});

test('classifies exhausted transport failures without exposing the original cause', async () => {
  let calls = 0;
  await assert.rejects(
    realmForHost('localhost:3002', env, (async () => {
      calls++;
      throw new TypeError('SECRET transport details');
    }) as typeof fetch),
    (error: unknown) => {
      assert.ok(error instanceof RealmConfigurationError);
      assert.equal(error.reason, 'transport');
      assert.ok(!String(error).includes('SECRET'));
      assert.equal(error.cause, undefined);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test('does not amplify rate limits, rejected hosts, invalid responses or missing credentials', async () => {
  for (const status of [400, 404, 429, 500]) {
    let calls = 0;
    await assert.rejects(
      realmForHost('localhost:3002', env, (async () => {
        calls++;
        return Response.json({}, { status, headers: { 'Retry-After': '60' } });
      }) as typeof fetch),
      (error: unknown) => {
        assert.ok(error instanceof RealmConfigurationError);
        assert.equal(error.reason, 'upstream');
        assert.equal(error.upstreamStatus, status);
        if (status === 429) assert.equal(error.retryAfterSeconds, 60);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
  for (const data of [
    null,
    { host: 'other.example', club: false },
    { host: 'localhost:3002', club: false, secretKey: 'SECRET' },
  ]) {
    let calls = 0;
    await assert.rejects(
      realmForHost('localhost:3002', env, (async () => {
        calls++;
        return Response.json(data);
      }) as typeof fetch),
      (error: unknown) =>
        error instanceof RealmConfigurationError && error.reason === 'payload',
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    realmForHost(
      'localhost:3002',
      { ...env, CLERK_SECRET_KEY: '' },
      response({ host: 'localhost:3002', club: false }),
    ),
    (error: unknown) =>
      error instanceof RealmConfigurationError &&
      error.reason === 'credentials',
  );
});

test('does not retry a gateway response that requests a delayed retry', async () => {
  let calls = 0;
  await assert.rejects(
    realmForHost('localhost:3002', env, (async () => {
      calls++;
      return Response.json(
        {},
        { status: 503, headers: { 'Retry-After': '60' } },
      );
    }) as typeof fetch),
    (error: unknown) =>
      error instanceof RealmConfigurationError &&
      error.retryAfterSeconds === 60,
  );
  assert.equal(calls, 1);
});

test('the original deadline also interrupts a stalled response body', async (t) => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 5000);
    return deadline.signal;
  });
  const timer = setTimeout(() => deadline.abort(), 5);
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    await assert.rejects(
      Promise.race([
        realmForHost(
          'localhost:3002',
          env,
          (async () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('{'));
                },
              }),
            )) as typeof fetch,
        ),
        new Promise((_, reject) => {
          watchdog = setTimeout(
            () => reject(new Error('body exceeded deadline')),
            100,
          );
        }),
      ]),
      (error: unknown) =>
        error instanceof RealmConfigurationError && error.reason === 'timeout',
    );
  } finally {
    clearTimeout(timer);
    clearTimeout(watchdog);
  }
});

test('bounds retry guidance and never reflects malformed upstream headers', async () => {
  for (const [header, expected] of [
    ['9999999', 300],
    ['not-a-date', undefined],
  ] as const) {
    await assert.rejects(
      realmForHost('localhost:3002', env, (async () =>
        Response.json(
          {},
          {
            status: 429,
            headers: { 'Retry-After': header },
          },
        )) as typeof fetch),
      (error: unknown) =>
        error instanceof RealmConfigurationError &&
        error.retryAfterSeconds === expected,
    );
  }
});

test('safe resolution logs only the category and status, without raw causes or secrets', async (t) => {
  const { resolveRealm } = await import('../src/lib/server-realms.ts');
  const diagnostics: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    diagnostics.push(args);
  });
  const result = await resolveRealm('localhost:3002', env, (async () => {
    throw Error('SECRET synthetic connection');
  }) as typeof fetch);
  assert.equal(result.ok, false);
  assert.deepEqual(diagnostics, [
    [
      'Explorer realm lookup failed',
      { reason: 'transport', upstreamStatus: undefined },
    ],
  ]);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('malformed JSON is a permanent payload failure, not a transport retry', async () => {
  let calls = 0;
  await assert.rejects(
    realmForHost('localhost:3002', env, (async () => {
      calls++;
      return new Response('{');
    }) as typeof fetch),
    (error: unknown) =>
      error instanceof RealmConfigurationError && error.reason === 'payload',
  );
  assert.equal(calls, 1);
});
