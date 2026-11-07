import test from 'node:test';
import assert from 'node:assert/strict';
import { serverApiOrigin } from '../src/lib/server-api-origin';
test('legacy proxy origin remains process configured without loading bootstrap', async () => {
  assert.equal(await serverApiOrigin({ EXPLORER_API_ORIGIN: 'http://127.0.0.1:3003' }, async () => { throw Error('unexpected load'); }), 'http://127.0.0.1:3003');
});
test('v2 proxy uses current bootstrap memory instead of stale process origin', async () => {
  const env = { VAULT_APPLICATION_ID: 'explorer-app', EXPLORER_API_ORIGIN: 'http://127.0.0.1:3999' };
  assert.equal(await serverApiOrigin(env, async () => ({ EXPLORER_API_ORIGIN: 'http://127.0.0.1:3003' })), 'http://127.0.0.1:3003');
  assert.equal(await serverApiOrigin(env, async () => ({})), '');
  await assert.rejects(serverApiOrigin(env, async () => { throw Error('blocked'); }), /blocked/);
});
