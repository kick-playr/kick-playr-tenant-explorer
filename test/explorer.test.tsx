import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { Explorer } from '../src/components/explorer.tsx';
import { ApiError, type Transport } from '../src/lib/api.ts';
import type { Tenant } from '../src/lib/types.ts';
afterEach(cleanup);
const tenant: Tenant = {
  id: 'winikon',
  environment: 'development',
  hostname: 'winikon.localhost:4311',
  aliases: [],
  status: 'active',
  configRevision: 4,
  public: { name: 'FC Winikon', locale: 'de-CH' },
  secretReferences: { mongoUri: 'local:mongo', key: 'local:key' },
  identityRealm: 'https://club.clerk.accounts.dev',
  authorityRevision: 4,
  configuration: {},
  users: [],
  integrations: [],
  credentials: [],
};

test('loads a real tenant editor and sends domain changes with the current revision', async () => {
  let body: Record<string, unknown> | undefined;
  const request: Transport = async (path, options) => {
    if (options?.method === 'PATCH') {
      body = JSON.parse(String(options.body));
      return { ...tenant, hostname: body!.hostname, configRevision: 5 };
    }
    if (path.includes('?'))
      return { items: [tenant], total: 1, page: 1, pageSize: 20 };
    return tenant;
  };
  render(<Explorer request={request} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /Open FC Winikon/ }),
  );
  fireEvent.click(await screen.findByRole('tab', { name: 'Domains' }));
  fireEvent.change(screen.getByLabelText('Canonical hostname'), {
    target: { value: 'new.localhost:4311' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save domains' }));
  await waitFor(() => assert.equal(body?.hostname, 'new.localhost:4311'));
  assert.equal(body?.expectedRevision, 4);
  await screen.findByText('Changes saved.');
});

test('keeps a failed edit and shows a useful conflict instead of claiming success', async () => {
  const request: Transport = async (path, options) => {
    if (options?.method)
      throw new ApiError(409, 'Tenant changed; reload before saving');
    return path.includes('?')
      ? { items: [tenant], total: 1, page: 1, pageSize: 20 }
      : tenant;
  };
  render(<Explorer request={request} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /Open FC Winikon/ }),
  );
  fireEvent.click(await screen.findByRole('tab', { name: 'Domains' }));
  fireEvent.change(screen.getByLabelText('Canonical hostname'), {
    target: { value: 'new.localhost:4311' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save domains' }));
  await screen.findByText('Tenant changed; reload before saving');
  assert.equal(
    (screen.getByLabelText('Canonical hostname') as HTMLInputElement).value,
    'new.localhost:4311',
  );
});

test('tenant creation collects control-plane references and opens the created tenant', async () => {
  let submitted: Record<string, unknown> | undefined;
  const request: Transport = async (_path, options) => {
    if (options?.method === 'POST') {
      submitted = JSON.parse(String(options.body));
      return tenant;
    }
    return { items: [], total: 0, page: 1, pageSize: 20 };
  };
  render(<Explorer request={request} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create tenant' }));
  for (const [label, value] of [
    ['Tenant ID', 'winikon'],
    ['Display name', 'FC Winikon'],
    ['Canonical hostname', 'winikon.localhost:4311'],
    ['Identity realm', tenant.identityRealm],
    ['MongoDB reference', 'local:mongo'],
    ['Encryption key reference', 'local:key'],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create provisioning tenant' }),
  );
  await waitFor(() => assert.equal(submitted?.id, 'winikon'));
  assert.deepEqual(submitted?.secretReferences, {
    mongoUri: 'local:mongo',
    key: 'local:key',
  });
  await screen.findByRole('tab', { name: 'Domains' });
});

test('prevents switching tenants while a save is in flight', async () => {
  let finish!: (result: unknown) => void;
  const other = {
    ...tenant,
    id: 'uster',
    public: { ...tenant.public, name: 'FC Uster' },
  };
  const request: Transport = async (path, options) => {
    if (options?.method === 'PATCH')
      return new Promise((resolve) => {
        finish = resolve;
      });
    return path.includes('?')
      ? { items: [tenant, other], total: 2, page: 1, pageSize: 20 }
      : tenant;
  };
  render(<Explorer request={request} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /Open FC Winikon/ }),
  );
  fireEvent.click(await screen.findByRole('tab', { name: 'Domains' }));
  fireEvent.change(screen.getByLabelText('Canonical hostname'), {
    target: { value: 'new.localhost:4311' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save domains' }));
  assert.equal(
    (screen.getByRole('button', { name: /Open FC Uster/ }) as HTMLButtonElement)
      .disabled,
    true,
  );
  assert.equal(
    (screen.getByRole('button', { name: 'Create tenant' }) as HTMLButtonElement)
      .disabled,
    true,
  );
  finish({ ...tenant, configRevision: 5 });
  await screen.findByText('Changes saved.');
});

test('discarding edits to open creation resets the old form even if creation is cancelled', async () => {
  const original = window.confirm;
  window.confirm = () => true;
  const request: Transport = async (path) =>
    path.includes('?')
      ? { items: [tenant], total: 1, page: 1, pageSize: 20 }
      : tenant;
  try {
    render(<Explorer request={request} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Open FC Winikon/ }),
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Domains' }));
    fireEvent.change(screen.getByLabelText('Canonical hostname'), {
      target: { value: 'discard.localhost:4311' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create tenant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Domains' }));
    assert.equal(
      (screen.getByLabelText('Canonical hostname') as HTMLInputElement).value,
      tenant.hostname,
    );
  } finally {
    window.confirm = original;
  }
});

test('credential, integration and user forms call their real management routes', async () => {
  let current = structuredClone(tenant);
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const request: Transport = async (path, options) => {
    if (options?.method) {
      const body = JSON.parse(String(options.body));
      writes.push({ path, body });
      current = { ...current, configRevision: current.configRevision + 1 };
      if (path.includes('/credentials/'))
        current.credentials = [
          {
            id: 'mail',
            label: 'Mail password',
            status: 'active',
            revision: 1,
            updatedAt: '2026-10-30T12:00:00Z',
          },
        ];
      return current;
    }
    return path.includes('?')
      ? { items: [current], total: 1, page: 1, pageSize: 20 }
      : current;
  };
  render(<Explorer request={request} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /Open FC Winikon/ }),
  );
  fireEvent.click(await screen.findByRole('tab', { name: 'Credentials' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add credential' }));
  fireEvent.change(screen.getByLabelText('Credential ID'), {
    target: { value: 'mail' },
  });
  fireEvent.change(screen.getByLabelText('Label'), {
    target: { value: 'Mail password' },
  });
  fireEvent.change(screen.getByLabelText('Secret value'), {
    target: { value: 'private-value' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Store credential' }));
  await waitFor(() => assert.equal(writes.length, 1));
  await screen.findByText('Changes saved.');
  assert.equal(writes[0]?.path, 'tenants/development/winikon/credentials/mail');
  assert.equal(writes[0]?.body.value, 'private-value');
  assert.equal(screen.queryByDisplayValue('private-value'), null);

  fireEvent.click(screen.getByRole('tab', { name: 'Integrations' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add integration' }));
  for (const [label, entry] of [
    ['Connection ID', 'club-mail'],
    ['Connection label', 'Club mail'],
    ['Account reference', 'mailbox-1'],
    ['Credential', 'mail'],
    ['Provider', 'smtp'],
    ['Capabilities', 'mail:send'],
  ])
    fireEvent.change(screen.getByLabelText(label!), {
      target: { value: entry },
    });
  fireEvent.click(screen.getByRole('button', { name: 'Save integration' }));
  await waitFor(() => assert.equal(writes.length, 2));
  await screen.findByText('Changes saved.');
  assert.equal(writes[1]?.body.expectedRevision, 5);
  assert.equal(writes[1]?.body.credentialId, 'mail');
  assert.equal(writes[1]?.body.enabled, false);

  fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
  for (const [label, entry] of [
    ['Clerk subject', 'user_member'],
    ['Bexio contact ID', '23'],
    ['Tenant permissions', 'club:teams:read\nclub:settings:read'],
  ])
    fireEvent.change(screen.getByLabelText(label!), {
      target: { value: entry },
    });
  fireEvent.click(screen.getByRole('button', { name: 'Save user access' }));
  await waitFor(() => assert.equal(writes.length, 3));
  assert.equal(writes[2]?.body.issuer, tenant.identityRealm);
  assert.equal(writes[2]?.body.contactId, 23);
  assert.deepEqual(writes[2]?.body.permissions, [
    'club:teams:read',
    'club:settings:read',
  ]);
  await screen.findByText('Changes saved.');
});

test('tenant administrator checkbox fills required permissions and preserves other grants when unchecked', async () => {
  let body: Record<string, unknown> | undefined;
  const request: Transport = async (path, options) => {
    if (options?.method) {
      body = JSON.parse(String(options.body));
      return { ...tenant, configRevision: 5 };
    }
    return path.includes('?')
      ? { items: [tenant], total: 1, page: 1, pageSize: 20 }
      : tenant;
  };
  render(<Explorer request={request} />);
  fireEvent.click(await screen.findByRole('button', { name: /FC Winikon/ }));
  await screen.findByRole('tab', { name: 'Users' });
  fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
  const permissions = screen.getByLabelText(
    'Tenant permissions',
  ) as HTMLTextAreaElement;
  fireEvent.change(permissions, { target: { value: 'club:teams:write' } });
  const admin = screen.getByRole('checkbox', { name: 'Tenant administrator' });
  fireEvent.click(admin);
  assert.ok(permissions.value.includes('club:settings:write'));
  assert.ok(permissions.value.includes('club:actions:oauth:state'));
  assert.ok(permissions.value.includes('club:integrations:use'));
  assert.ok(permissions.value.includes('club:teams:write'));
  fireEvent.click(admin);
  assert.equal(permissions.value, 'club:teams:write');
  fireEvent.change(permissions, { target: { value: 'club:*:*' } });
  assert.equal((admin as HTMLInputElement).checked, true);
  fireEvent.change(screen.getByLabelText('Clerk subject'), {
    target: { value: 'user_admin' },
  });
  fireEvent.change(screen.getByLabelText('Bexio contact ID'), {
    target: { value: '23' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save user access' }));
  await waitFor(() => assert.deepEqual(body?.permissions, ['club:*:*']));
  assert.equal(body?.expectedAuthorityRevision, tenant.authorityRevision);
});

test('user list marks active tenant administrators and excludes partial or revoked grants', async () => {
  const { tenantAdministratorPermissions } =
    await import('../src/lib/tenant-permissions.ts');
  const users = [
    {
      subject: 'user_admin',
      permissions: [...tenantAdministratorPermissions],
      status: 'active' as const,
    },
    {
      subject: 'user_partial',
      permissions: ['club:settings:read'],
      status: 'active' as const,
    },
    {
      subject: 'user_revoked',
      permissions: [...tenantAdministratorPermissions],
      status: 'revoked' as const,
    },
  ].map((u) => ({
    ...u,
    issuer: tenant.identityRealm,
    contactId: 23,
    revision: 1,
  }));
  const current = { ...tenant, users };
  const request: Transport = async (path) =>
    path.includes('?')
      ? { items: [current], total: 1, page: 1, pageSize: 20 }
      : current;
  render(<Explorer request={request} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /Open FC Winikon/ }),
  );
  fireEvent.click(await screen.findByRole('tab', { name: 'Users' }));
  assert.equal(screen.getAllByText('Tenant administrator').length, 1);
  assert.ok(
    screen
      .getByText('user_admin')
      .closest('article')
      ?.textContent?.includes('Tenant administrator'),
  );
  for (const subject of ['user_partial', 'user_revoked'])
    assert.ok(
      !screen
        .getByText(subject)
        .closest('article')
        ?.textContent?.includes('Tenant administrator'),
    );
});

test('Deleted tenants filter sends deletion=only, resets pagination and uses returned deleted-only rows and totals', async () => {
  const paths: string[] = [];
  const deleted = {
    ...tenant,
    id: 'deleted-club',
    deletionId: 'retained-or-purged-operation',
    status: 'disabled',
    public: { ...tenant.public, name: 'Deleted Club' },
  };
  const request: Transport = async (path) => {
    paths.push(path);
    const query = new URL('http://fixture.invalid/' + path).searchParams;
    if (query.get('deletion') === 'only')
      return { items: [deleted], total: 1, page: 1, pageSize: 20 };
    return {
      items: [tenant],
      total: 21,
      page: Number(query.get('page') ?? 1),
      pageSize: 20,
    };
  };
  render(<Explorer request={request} />);
  await screen.findByRole('button', { name: /Open FC Winikon/ });
  await screen.findByText('1–20 of 21');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() =>
    assert.ok(
      paths.some(
        (path) =>
          new URL('http://fixture.invalid/' + path).searchParams.get('page') ===
          '2',
      ),
    ),
  );
  const select = screen.getByLabelText('Filter status');
  assert.ok(screen.getByRole('option', { name: 'Deleted tenants' }));
  fireEvent.change(select, { target: { value: 'deleted' } });
  await screen.findByRole('button', { name: /Open Deleted Club/ });
  await screen.findByText('1–1 of 1');
  assert.equal(screen.queryByRole('button', { name: /Open FC Winikon/ }), null);
  const last = new URL('http://fixture.invalid/' + paths.at(-1));
  assert.equal(last.searchParams.get('deletion'), 'only');
  assert.equal(last.searchParams.get('page'), '1');
  assert.equal(last.searchParams.has('status'), false);
  assert.equal(
    (screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement)
      .disabled,
    true,
  );
  fireEvent.change(select, { target: { value: '' } });
  await screen.findByRole('button', { name: /Open FC Winikon/ });
  assert.equal(
    new URL('http://fixture.invalid/' + paths.at(-1)).searchParams.has(
      'deletion',
    ),
    false,
  );
});

test('successful soft deletion and recovery refresh directory rows/counts immediately while keeping selected details', async () => {
  let current: Tenant = structuredClone(tenant);
  let operation: null | {
    id: string;
    phase: string;
    revision: number;
    deletedAt: string;
    recoverUntil: string;
    targets: [];
  } = null;
  let directoryReads = 0;
  const status = () => ({
    operation,
    expectedRevision: current.configRevision,
    expectedAuthorityRevision: current.authorityRevision,
    expectedInvitationRevision: 0,
    identity: {
      name: current.public.name,
      hostname: current.hostname,
      aliases: current.aliases,
    },
    impact: { users: 0, pendingInvitations: 0 },
    checklist: [],
    recoveryAvailable: operation?.phase === 'retained',
    inventory: {
      complete: true,
      controlOnly: true,
      revision: 'fixture-registered-inventory',
      targets: [],
    },
  });
  const request: Transport = async (path, options) => {
    if (path.startsWith('tenants?')) {
      directoryReads++;
      const deletedOnly =
        new URL('http://fixture.invalid/' + path).searchParams.get(
          'deletion',
        ) === 'only';
      const visible = Object.hasOwn(current, 'deletionId') === deletedOnly;
      return {
        items: visible ? [structuredClone(current)] : [],
        total: visible ? 1 : 0,
        page: 1,
        pageSize: 20,
      };
    }
    if (path.endsWith('/deletion/recover') && options?.method === 'POST') {
      const { deletionId, ...recovered } = current;
      void deletionId;
      current = {
        ...recovered,
        status: 'disabled',
        configRevision: 6,
        authorityRevision: 6,
      };
      operation = { ...operation!, phase: 'recovered', revision: 2 };
      return status();
    }
    if (path.endsWith('/deletion') && options?.method === 'POST') {
      operation = {
        id: '00000000-0000-4000-8000-000000000001',
        phase: 'retained',
        revision: 1,
        deletedAt: '2026-11-01T12:00:00Z',
        recoverUntil: '2027-02-01T12:00:00Z',
        targets: [],
      };
      current = {
        ...current,
        deletionId: operation.id,
        status: 'disabled',
        configRevision: 5,
        authorityRevision: 5,
      };
      return status();
    }
    if (path.endsWith('/deletion')) return status();
    if (path.endsWith('/audit')) return [];
    return structuredClone(current);
  };
  render(<Explorer request={request} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /Open FC Winikon/ }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete tenant…' }),
  );
  fireEvent.change(screen.getByLabelText('Type development/winikon'), {
    target: { value: 'development/winikon' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Delete tenant' }));
  await screen.findByText(
    'This tenant is read-only while marked for deletion.',
  );
  await screen.findByText('0 tenants');
  assert.equal(screen.queryByRole('button', { name: /Open FC Winikon/ }), null);
  assert.ok(screen.getByRole('heading', { level: 1, name: 'FC Winikon' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Recover to disabled…' }),
  );
  fireEvent.change(screen.getByLabelText('Type development/winikon'), {
    target: { value: 'development/winikon' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Recover to disabled' }));
  await screen.findByRole('button', { name: /Open FC Winikon/ });
  await screen.findByText('1–1 of 1');
  await screen.findByRole('tab', { name: 'Overview' });
  assert.equal(
    screen.queryByText('This tenant is read-only while marked for deletion.'),
    null,
  );
  assert.ok(directoryReads >= 3);
});
