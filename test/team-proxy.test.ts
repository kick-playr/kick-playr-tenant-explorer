import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyRequest } from '../src/lib/proxy.ts';
const key = '11111111-1111-4111-8111-111111111111';
test('team proxy forwards only fixed team commands and preserves same-origin write protection', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    return Response.json({ ok: true });
  };
  for (const [method, suffix] of [
    ['GET', 'teams'],
    ['GET', 'teams/readiness'],
    ['POST', 'teams/create'],
    ['POST', `teams/operations/${key}/resume`],
    ['POST', 'teams/123/refresh'],
    ['PUT', 'catalog/categories/team-seasons'],
  ]) {
    const path = `clubs/development/winikon/${suffix}`;
    const request = new Request(`http://localhost:3002/api/explorer/${path}`, {
      method,
      headers: {
        origin: 'http://localhost:3002',
        'content-type': 'application/json',
      },
      ...(method !== 'GET' ? { body: '{}' } : {}),
    });
    assert.equal(
      (
        await proxyRequest(
          request,
          path.split('/'),
          'token',
          'http://localhost:3003',
          transport,
        )
      ).status,
      200,
    );
  }
  for (const [method, suffix] of [
    ['POST', 'teams'],
    ['GET', 'teams/create'],
    ['POST', 'teams/0/refresh'],
    ['POST', 'teams/123/remap'],
    ['POST', 'teams/operations/bad/resume'],
  ]) {
    const path = `clubs/development/winikon/${suffix}`;
    assert.equal(
      (
        await proxyRequest(
          new Request('http://localhost:3002', {
            method,
            headers: {
              origin: 'http://localhost:3002',
              'content-type': 'application/json',
            },
            ...(method !== 'GET' ? { body: '{}' } : {}),
          }),
          path.split('/'),
          'token',
          'http://localhost:3003',
          transport,
        )
      ).status,
      400,
    );
  }
  assert.equal(calls, 6);
  const path = 'clubs/development/winikon/teams/create';
  const crossOrigin = new Request('http://localhost:3002', {
    method: 'POST',
    headers: {
      origin: 'http://evil.example',
      'content-type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(
    (
      await proxyRequest(
        crossOrigin,
        path.split('/'),
        'token',
        'http://localhost:3003',
        transport,
      )
    ).status,
    403,
  );
  assert.equal(calls, 6);
});
