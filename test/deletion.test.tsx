import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { TenantDeletion } from '../src/components/tenant-deletion.tsx';
import type { Transport } from '../src/lib/api.ts';
afterEach(cleanup);
const state = {
  operation: {
    id: '00000000-0000-4000-8000-000000000001',
    phase: 'retained',
    revision: 1,
    deletedAt: '2026-11-01T12:00:00Z',
    recoverUntil: '2027-02-01T12:00:00Z',
    targets: [],
  },
  expectedRevision: 2,
  expectedAuthorityRevision: 2,
  expectedInvitationRevision: 2,
  identity: { name: 'Club', hostname: 'club.ch', aliases: [] },
  impact: { users: 0, pendingInvitations: 0 },
  checklist: [
    { id: 'ownership', label: 'Verify ownership' },
    { id: 'work', label: 'Reconcile ongoing work' },
  ],
  recoveryAvailable: true,
  inventory: {
    complete: true,
    revision: 'manifest',
    targets: [{ id: 'db', label: 'Database clubdata' }],
  },
};
test('permanent purge anytime requires every manual item, final confirmation and exact tenant identity', async () => {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let reload = 0;
  const request: Transport = async (path, init) => {
    if (init?.method === 'POST')
      calls.push({ path, body: JSON.parse(String(init.body)) });
    return structuredClone(state);
  };
  render(
    <TenantDeletion
      environment="development"
      tenantId="club"
      marked
      request={request}
      onReload={() => {
        reload++;
      }}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Permanently delete…' }),
  );
  const final = screen.getByLabelText(/I confirm all manual cleanup/);
  const submit = screen.getByRole('button', { name: 'Permanently delete now' });
  assert.equal((submit as HTMLButtonElement).disabled, true);
  fireEvent.change(screen.getByLabelText('Type development/club'), {
    target: { value: 'production/club' },
  });
  fireEvent.click(screen.getByLabelText('Verify ownership'));
  fireEvent.click(screen.getByLabelText('Reconcile ongoing work'));
  fireEvent.click(final);
  fireEvent.click(
    screen.getByLabelText(/I confirm the displayed registered databases/),
  );
  fireEvent.click(screen.getByLabelText(/I confirm unregistered databases/));
  assert.equal((submit as HTMLButtonElement).disabled, true);
  fireEvent.change(screen.getByLabelText('Type development/club'), {
    target: { value: 'development/club' },
  });
  fireEvent.click(submit);
  await waitFor(() => assert.equal(calls.length, 1));
  assert.deepEqual(calls[0]!.body.completed, ['ownership', 'work']);
  assert.equal(calls[0]!.body.allDone, true);
  assert.equal(calls[0]!.body.expectedInventoryRevision, 'manifest');
  assert.equal(calls[0]!.body.expectedOperationRevision, 1);
  assert.equal(calls[0]!.path, 'tenants/development/club/deletion/purge');
  await waitFor(() => assert.equal(reload, 1));
});
test('unverified inventory blocks purge and displays operator action', async () => {
  render(
    <TenantDeletion
      environment="development"
      tenantId="club"
      marked
      request={async () => ({
        ...structuredClone(state),
        inventory: {
          complete: false,
          revision: 'unconfigured',
          targets: [],
          reason: 'Operator inventory required',
        },
      })}
      onReload={() => {}}
    />,
  );
  const warning = await screen.findByText('Operator inventory required');
  assert.equal(warning.getAttribute('role'), 'alert');
  assert.ok(warning.className.includes('notice-error'));
  assert.equal(
    (
      screen.getByRole('button', {
        name: 'Permanently delete…',
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
});
test('unmarked tenant shows soft delete confirmation and three month recovery terms', async () => {
  render(
    <TenantDeletion
      environment="development"
      tenantId="club"
      request={async () => ({ ...structuredClone(state), operation: null })}
      onReload={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete tenant…' }),
  );
  assert.ok(screen.getAllByText(/three calendar months/i).length);
  assert.equal(
    (screen.getByRole('button', { name: 'Delete tenant' }) as HTMLButtonElement)
      .disabled,
    true,
  );
});

test('conflict refreshes impact and clears confirmation without silently retrying purge', async () => {
  let writes = 0;
  const request: Transport = async (_path, init) => {
    if (init?.method === 'POST') {
      writes++;
      throw new Error('Tenant changed; review updated impact');
    }
    return structuredClone(state);
  };
  render(
    <TenantDeletion
      environment="development"
      tenantId="club"
      marked
      request={request}
      onReload={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Permanently delete…' }),
  );
  for (const label of ['Verify ownership', 'Reconcile ongoing work'])
    fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByLabelText(/I confirm all manual cleanup/));
  fireEvent.click(
    screen.getByLabelText(/I confirm the displayed registered databases/),
  );
  fireEvent.click(screen.getByLabelText(/I confirm unregistered databases/));
  fireEvent.change(screen.getByLabelText('Type development/club'), {
    target: { value: 'development/club' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Permanently delete now' }),
  );
  await waitFor(() =>
    assert.equal(
      (screen.getByLabelText('Type development/club') as HTMLInputElement)
        .value,
      '',
    ),
  );
  assert.equal(writes, 1);
  assert.equal(
    (
      screen.getByLabelText(
        /I confirm the displayed registered databases/,
      ) as HTMLInputElement
    ).checked,
    false,
  );
  assert.equal(
    (
      screen.getByLabelText(
        /I confirm unregistered databases/,
      ) as HTMLInputElement
    ).checked,
    false,
  );
  assert.equal(
    (screen.getByLabelText(/I confirm all manual cleanup/) as HTMLInputElement)
      .checked,
    false,
  );
  assert.equal(
    (
      screen.getByRole('button', {
        name: 'Permanently delete now',
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
});
test('expired recovery is unavailable while permanent purge remains explicitly confirmation gated', async () => {
  render(
    <TenantDeletion
      environment="development"
      tenantId="club"
      marked
      request={async () => ({
        ...structuredClone(state),
        recoveryAvailable: false,
      })}
      onReload={() => {}}
    />,
  );
  await screen.findByRole('button', { name: 'Permanently delete…' });
  assert.equal(
    screen.queryByRole('button', { name: 'Recover to disabled…' }),
    null,
  );
  assert.equal(screen.queryByRole('dialog'), null);
});

test('successful recovery reloads parent even when refreshing deletion status fails', async () => {
  let reads = 0,
    reloads = 0;
  const request: Transport = async (_path, init) => {
    if (init?.method === 'POST')
      return {
        ...structuredClone(state),
        operation: { ...state.operation, phase: 'recovered' },
      };
    if (++reads > 1) throw new Error('Status refresh unavailable');
    return structuredClone(state);
  };
  render(
    <TenantDeletion
      environment="development"
      tenantId="club"
      marked
      request={request}
      onReload={() => {
        reloads++;
      }}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Recover to disabled…' }),
  );
  fireEvent.change(screen.getByLabelText('Type development/club'), {
    target: { value: 'development/club' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Recover to disabled' }));
  await waitFor(() => assert.equal(reloads, 1));
});

test('registered database preview requires separate ownership and unregistered-resource acknowledgments', async () => {
  render(
    <TenantDeletion
      environment="development"
      tenantId="club"
      marked
      request={async () => structuredClone(state)}
      onReload={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Permanently delete…' }),
  );
  assert.ok(screen.getAllByText('Database clubdata').length > 0);
  assert.ok(
    screen.getByLabelText(/I confirm the displayed registered databases/),
  );
  assert.ok(screen.getByLabelText(/I confirm unregistered databases/));
  assert.ok(
    screen.getByText(
      'Delete registered tenant databases and tenant control records',
    ),
  );
});
test('valid no-binding preview requires explicit control-only confirmation before sending purge', async () => {
  const calls: Record<string, unknown>[] = [];
  const request: Transport = async (_path, init) => {
    if (init?.method === 'POST') calls.push(JSON.parse(String(init.body)));
    return {
      ...structuredClone(state),
      inventory: {
        complete: true,
        revision: 'empty-derived',
        controlOnly: true,
        targets: [],
      },
    };
  };
  render(
    <TenantDeletion
      environment="development"
      tenantId="club"
      marked
      request={request}
      onReload={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Permanently delete…' }),
  );
  for (const label of ['Verify ownership', 'Reconcile ongoing work'])
    fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByLabelText(/I confirm all manual cleanup/));
  fireEvent.click(
    screen.getByLabelText(/I confirm the displayed registered databases/),
  );
  fireEvent.click(screen.getByLabelText(/I confirm unregistered databases/));
  fireEvent.change(screen.getByLabelText('Type development/club'), {
    target: { value: 'development/club' },
  });
  assert.equal(
    (
      screen.getByRole('button', {
        name: 'Permanently delete now',
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  fireEvent.click(
    screen.getByLabelText(/No registered tenant database is listed/),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Permanently delete now' }),
  );
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0]!.controlOnly, true);
  assert.equal(calls[0]!.ownershipConfirmed, true);
  assert.equal(calls[0]!.unregisteredResourcesConfirmed, true);
});
