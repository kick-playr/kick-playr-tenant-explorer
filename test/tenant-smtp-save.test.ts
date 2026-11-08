import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmTenantSmtpSave } from '../src/lib/tenant-smtp-save.ts';
const connection: any = {
  id: 'smtp',
  provider: 'smtp',
  status: 'disabled',
  revision: 'r1',
  mail: { vault: { resourceId: 'one', versionId: 'old' } },
};
test('acknowledges only the exact published version after the tenant API has loaded it', async () => {
  const calls: any[] = [];
  let reads = 0;
  await confirmTenantSmtpSave({
    path: 'clubs/development/one',
    connection,
    settings: { fromAddress: 'billing@one.example' },
    publish: async () => ({ resourceId: 'one', versionId: 'new' }),
    pause: async () => {},
    request: async (path, options) => {
      calls.push({ path, options });
      if (options?.method === 'PUT') return {};
      reads++;
      return {
        items: [
          {
            ...connection,
            revision: 'r2',
            mail: {
              vault: {
                resourceId: 'one',
                versionId: reads === 1 ? 'old' : 'new',
              },
            },
          },
        ],
      };
    },
  });
  assert.equal(reads, 2);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), {
    expectedRevision: 'r2',
    secret: { fromAddress: 'billing@one.example' },
  });
});
test('does not acknowledge a foreign or unconfirmed version or an active connection', async () => {
  for (const mode of ['foreign', 'active']) {
    let writes = 0;
    await assert.rejects(
      confirmTenantSmtpSave({
        path: 'clubs/development/one',
        connection,
        settings: {},
        publish: async () => ({ resourceId: 'one', versionId: 'new' }),
        pause: async () => {},
        request: async (_path, options) => {
          if (options?.method === 'PUT') writes++;
          return {
            items: [
              {
                ...connection,
                status: mode === 'active' ? 'active' : 'disabled',
                mail: {
                  vault: {
                    resourceId: mode === 'foreign' ? 'foreign' : 'one',
                    versionId: 'new',
                  },
                },
              },
            ],
          };
        },
      }),
      /saved in Vault/,
    );
    assert.equal(writes, 0);
  }
});

test('waits beyond the sixty second Vault refresh interval before acknowledging', async () => {
  let elapsed = 0, writes = 0;
  await confirmTenantSmtpSave({
    path: 'clubs/development/one', connection, settings: {},
    publish: async () => ({ resourceId: 'one', versionId: 'new' }),
    pause: async (ms) => { elapsed += ms; },
    request: async (_path, options) => {
      if (options?.method === 'PUT') { writes++; return {}; }
      return { items: [{ ...connection, mail: { vault: {
        resourceId: 'one', versionId: elapsed >= 65000 ? 'new' : 'old'
      } } }] };
    },
  });
  assert.equal(writes, 1);
  assert.ok(elapsed >= 65000);
});
