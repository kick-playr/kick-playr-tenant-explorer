import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveTenantSmtpVault } from '../src/lib/tenant-smtp-vault.ts';
function fixture(pinned = false) {
  let resource: any = {
    _id: 'smtp-one',
    name: 'SMTP',
    kind: 'integration',
    schemaIdentity: 'builtin:email@2',
    environment: 'development',
    ownerType: 'tenant',
    ownerId: 'club-one',
    revision: 2,
    currentVersionId: 'v2',
    currentVersionNumber: 2,
  };
  let links: any[] = [
    {
      resourceId: 'smtp-one',
      accessName: 'SMTP',
      versionPolicy: pinned ? 'v1' : 'latest',
    },
    { resourceId: 'unrelated', accessName: 'OTHER', versionPolicy: 'latest' },
  ];
  const values: any = {
    v1: {
      protocol: 'smtp',
      host: 'mail.club.ch',
      port: 465,
      tls: 'implicit',
      username: 'old',
      password: 'PRIVATE',
      sender: 'old@club.example',
    },
    v2: {
      protocol: 'smtp',
      host: 'mail.club.ch',
      port: 465,
      tls: 'implicit',
      username: 'old',
      password: 'PRIVATE',
      sender: 'old@club.example',
    },
  };
  const writes: any[] = [];
  let lostVersion = false,
    lostLinks = false,
    failPin = false,
    active = false;
  const input = {
    connectionId: 'smtp',
    expectedRevision: 'connection-1',
    versionId: pinned ? 'v1' : 'v2',
    settings: {
      host: 'mail.club.ch',
      port: 587,
      user: 'billing',
      fromAddress: 'billing@club.example',
    },
  };
  const ports: any = {
    scope: { environment: 'development', tenantId: 'club-one' },
    resourceId: 'smtp-one',
    input,
    connection: async () => ({
      id: 'smtp',
      provider: 'smtp',
      status: active ? 'active' : 'disabled',
      revision: 'connection-1',
      mail: {
        allowedHosts: ['mail.club.ch'],
        vault: { resourceId: 'smtp-one', versionId: input.versionId },
      },
    }),
    vault: async (path: string, method = 'GET', body?: any) => {
      if (path === 'access') return { canRead: true, canWrite: true };
      if (path.startsWith('resources?')) return [structuredClone(resource)];
      if (path === 'links/club-api' && method === 'GET')
        return { links: structuredClone(links), deployment: { revision: 7 } };
      if (path.includes('/reveal/'))
        return structuredClone(values[path.split('/').at(-1)!]);
      writes.push({ path, method, body });
      if (path === 'resources/smtp-one' && method === 'PUT') {
        assert.equal(body.revision, resource.revision);
        values.v3 = body.resource.value;
        resource = {
          ...resource,
          revision: 3,
          currentVersionNumber: 3,
          currentVersionId: 'v3',
        };
        if (lostVersion) throw Error('lost reply');
        return structuredClone(resource);
      }
      if (path === 'links/club-api' && method === 'PUT') {
        if (failPin) throw Error('concurrent links');
        links = body.rows;
        if (lostLinks) throw Error('lost reply');
        return {};
      }
      throw Error('Unexpected path');
    },
  };
  return {
    ports,
    writes,
    values,
    getResource: () => resource,
    setForeign: () => (resource.ownerId = 'foreign'),
    setActive: () => (active = true),
    loseReplies: () => {
      lostVersion = true;
      lostLinks = true;
    },
    failPin: () => (failPin = true),
    allowPin: () => (failPin = false),
    getLinks: () => links,
  };
}
test('publishes every SMTP field in a tenant Vault version and retains the omitted password', async () => {
  const f = fixture();
  const result = await saveTenantSmtpVault(f.ports);
  assert.equal(result.versionId, 'v3');
  assert.deepEqual(f.values.v3, {
    protocol: 'smtp',
    host: 'mail.club.ch',
    port: 587,
    tls: 'starttls',
    username: 'billing',
    password: 'PRIVATE',
    sender: 'billing@club.example',
  });
  assert.equal(f.writes.length, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
test('advances only this resource pin and preserves unrelated links', async () => {
  const f = fixture(true);
  await saveTenantSmtpVault(f.ports);
  assert.equal(f.getLinks()[0].versionPolicy, 'v3');
  assert.equal(f.getLinks()[1].resourceId, 'unrelated');
  assert.equal(f.getLinks()[1].versionPolicy, 'latest');
});
test('reconciles lost successful version and pin replies without repeating writes', async () => {
  const f = fixture(true);
  f.loseReplies();
  const result = await saveTenantSmtpVault(f.ports);
  assert.equal(result.versionId, 'v3');
  assert.equal(f.writes.length, 2);
});
test('rejects foreign tenant resource and active connection before writes', async () => {
  for (const change of ['foreign', 'active']) {
    const f = fixture();
    if (change === 'foreign') f.setForeign();
    else f.setActive();
    await assert.rejects(saveTenantSmtpVault(f.ports));
    assert.equal(f.writes.length, 0);
  }
});
test('rejects invalid sender, host, port and unexpected settings before writes', async () => {
  for (const patch of [
    { fromAddress: 'x\r\nBcc:other@example.org' },
    { host: 'other-tenant.example' },
    { port: 25 },
    { mailboxId: 'foreign' },
  ]) {
    const f = fixture();
    Object.assign(f.ports.input.settings, patch);
    await assert.rejects(saveTenantSmtpVault(f.ports));
    assert.equal(f.writes.length, 0);
  }
});
test('reports partial publication rather than success when a pin update cannot be confirmed', async () => {
  const f = fixture(true);
  f.failPin();
  await assert.rejects(saveTenantSmtpVault(f.ports), /version.*saved.*link/i);
  assert.equal(f.getResource().currentVersionId, 'v3');
  assert.equal(f.getLinks()[0].versionPolicy, 'v1');
});

test('reuses a previously published exact version after a partial pin update', async () => {
  const f = fixture(true);
  f.failPin();
  await assert.rejects(saveTenantSmtpVault(f.ports));
  f.allowPin();
  const result = await saveTenantSmtpVault(f.ports);
  assert.equal(result.versionId, 'v3');
  assert.equal(
    f.writes.filter((w) => w.path === 'resources/smtp-one').length,
    1,
  );
  assert.equal(f.getLinks()[0].versionPolicy, 'v3');
});

test('a historical pin cannot overwrite a divergent current password or other newer configuration', async () => {
  const f = fixture(true);
  f.values.v2.password = 'ROTATED-PRIVATE';
  await assert.rejects(saveTenantSmtpVault(f.ports), /older version/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.values.v2.password, 'ROTATED-PRIVATE');
});
test('permits initial tenant connection metadata acknowledgement with an explicit null revision', async () => {
  const f = fixture();
  f.ports.input.expectedRevision = null;
  const prior = f.ports.connection;
  f.ports.connection = async () => ({
    ...(await prior()),
    revision: null,
    status: 'unconfigured',
  });
  assert.equal((await saveTenantSmtpVault(f.ports)).versionId, 'v3');
});
test('invalid mailbox lengths and domain labels fail before publishing a Vault version', async () => {
  for (const fromAddress of [
    'a'.repeat(65) + '@club.example',
    'x@-club.example',
    'x@club-.example',
    'x@club..example',
    '.x@club.example',
  ]) {
    const f = fixture();
    f.ports.input.settings.fromAddress = fromAddress;
    await assert.rejects(saveTenantSmtpVault(f.ports));
    assert.equal(f.writes.length, 0);
  }
});

test('retains whitespace-bearing passwords byte-for-byte on sender-only saves', async () => {
  const f = fixture();
  f.values.v2.password = ' KEEP SPACES ';
  await saveTenantSmtpVault(f.ports);
  assert.equal(f.values.v3.password, ' KEEP SPACES ');
});

test('retries an already published latest or pinned version without another write', async () => {
  for (const pinned of [false, true]) {
    const f = fixture(pinned);
    await saveTenantSmtpVault(f.ports);
    const count = f.writes.length;
    assert.equal((await saveTenantSmtpVault(f.ports)).versionId, 'v3');
    assert.equal(f.writes.length, count);
    f.ports.input.settings.fromAddress = 'different@club.example';
    await assert.rejects(saveTenantSmtpVault(f.ports));
    assert.equal(f.writes.length, count);
  }
});

test('publishes tenant IMAP configuration and preserves its omitted password', async () => {
  const f = fixture();
  f.ports.provider = 'imap';
  f.getResource().schemaIdentity = 'builtin:email@1';
  f.ports.input.settings = {host:'mail.club.ch', port:993, user:'inbox-user', inbox:'INBOX', archive:'Processed'};
  f.values.v2.protocol = 'imap';
  f.values.v2.inboxFolder = 'INBOX';
  f.values.v2.archiveFolder = 'Archive';
  const connection = f.ports.connection;
  f.ports.connection = async () => ({...await connection(), provider:'imap'});
  const result = await saveTenantSmtpVault(f.ports);
  assert.equal(result.versionId, 'v3');
  assert.equal(f.writes[0].body.resource.schemaIdentity, 'builtin:email@2');
  assert.equal(f.values.v3.protocol, 'imap');
  assert.equal(f.values.v3.tls, 'implicit');
  assert.equal(f.values.v3.username, 'inbox-user');
  assert.equal(f.values.v3.archiveFolder, 'Processed');
  assert.equal(f.values.v3.password, 'PRIVATE');
});

test('rejects IMAP folders and usernames that the runtime cannot consume before writes', async () => {
  for (const patch of [{archive:'A/../B'}, {archive:'a'.repeat(129)}, {user:'u'.repeat(257)}]) {
    const f=fixture(); f.ports.provider='imap';
    f.ports.input.settings={host:'mail.club.ch',port:993,user:'inbox-user',inbox:'INBOX',archive:'Processed',...patch};
    await assert.rejects(saveTenantSmtpVault(f.ports));
    assert.equal(f.writes.length,0);
  }
});
test('SMTP and IMAP accept a new tenant server without a manual allowlist', async()=>{
 for(const provider of ['smtp','imap']) {
  const f=fixture(); f.ports.provider=provider;
  const current=f.ports.connection;
  f.ports.connection=async()=>{const c=await current();return {...c,provider,mail:{...c.mail,allowedHosts:[]}}};
  if(provider==='imap') { f.values.v2.protocol='imap';f.ports.input.settings={host:'mail.new-provider.ch',port:993,user:'inbox',inbox:'INBOX',archive:'Archive'}; }
  else f.ports.input.settings.host='mail.new-provider.ch';
  await saveTenantSmtpVault(f.ports);
  assert.equal(f.values.v3.host,'mail.new-provider.ch');
 }
});
