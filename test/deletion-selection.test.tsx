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
  act,
} from '@testing-library/react';
import { Explorer } from '../src/components/explorer.tsx';
import type { Transport } from '../src/lib/api.ts';
import type { Tenant } from '../src/lib/types.ts';
afterEach(cleanup);
const alpha: Tenant = {
  id: 'alpha',
  environment: 'development',
  hostname: 'alpha.test',
  aliases: [],
  status: 'active',
  configRevision: 4,
  public: { name: 'Club Alpha', locale: 'de-CH' },
  secretReferences: { mongoUri: 'fixture:mongo', key: 'fixture:key' },
  identityRealm: 'https://fixture.clerk.accounts.dev',
  authorityRevision: 4,
  configuration: {},
  users: [],
  integrations: [],
  credentials: [],
};
const beta: Tenant = {
  ...alpha,
  id: 'beta',
  hostname: 'beta.test',
  public: { ...alpha.public, name: 'Club Beta' },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture({
  marked = false,
  phase = 'purged',
  refreshFails = false,
  postFails = false,
} = {}) {
  let deleted = marked,
    writes = 0,
    reads = 0;
  const pendingDetail = deferred<unknown>();
  const pendingList = deferred<unknown>();
  let delayDetail = false,
    delayList = false;
  let detailSignal: AbortSignal | null | undefined,
    listSignal: AbortSignal | null | undefined;
  const operation = (next = 'retained') => ({
    id: 'fixture-operation',
    phase: next,
    revision: 1,
    deletedAt: '2026-11-01T12:00:00Z',
    recoverUntil: '2027-02-01T12:00:00Z',
    targets: [],
    ...(next === 'failed' ? { error: 'Fixture cleanup incomplete' } : {}),
  });
  const status = (next = deleted ? 'retained' : '') => ({
    operation: next ? operation(next) : null,
    expectedRevision: 4,
    expectedAuthorityRevision: 4,
    expectedInvitationRevision: 0,
    identity: { name: 'Club Alpha', hostname: 'alpha.test', aliases: [] },
    impact: { users: 0, pendingInvitations: 0 },
    checklist: [],
    recoveryAvailable: next === 'retained',
    purgeInProgress: next === 'purging',
    inventory: {
      complete: true,
      controlOnly: true,
      revision: 'fixture-inventory',
      targets: [],
    },
  });
  const request: Transport = async (path, init) => {
    if (path.startsWith('tenants?')) {
      if (delayList) {
        delayList = false;
        listSignal = init?.signal;
        return pendingList.promise;
      }
      if (writes && refreshFails)
        throw new Error('Fixture directory unavailable');
      const items =
        deleted && !marked
          ? [beta]
          : [
              marked ? { ...alpha, deletionId: 'fixture-operation' } : alpha,
              beta,
            ];
      return { items, total: items.length, page: 1, pageSize: 20 };
    }
    if (path.endsWith('/deletion') || path.endsWith('/deletion/purge')) {
      if (init?.method === 'POST') {
        writes++;
        if (postFails) throw new Error('Fixture deletion rejected');
        deleted = true;
        if (path.endsWith('/purge')) return status(phase);
        // The remove endpoint returns its operation view without inventory.
        const { inventory, ...view } = status('retained');
        void inventory;
        return view;
      }
      reads++;
      // Post-success UI must not depend on this GET returning.
      if (writes && !postFails) return new Promise(() => {});
      return status();
    }
    if (path.endsWith('/audit')) return [];
    if (path === 'tenants/development/alpha') {
      if (delayDetail) {
        delayDetail = false;
        detailSignal = init?.signal;
        return pendingDetail.promise;
      }
      return {
        ...alpha,
        ...(deleted ? { deletionId: 'fixture-operation' } : {}),
      };
    }
    if (path === 'tenants/development/beta') return beta;
    throw new Error(`Unexpected fixture request ${path}`);
  };
  return {
    request,
    pendingDetail,
    pendingList,
    get writes() {
      return writes;
    },
    get reads() {
      return reads;
    },
    delayDetail() {
      delayDetail = true;
    },
    delayList() {
      delayList = true;
    },
    get detailSignal() {
      return detailSignal;
    },
    get listSignal() {
      return listSignal;
    },
  };
}
// Flush asynchronous fixture completions before inspecting the next UI state.
async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}
async function change(
  element: HTMLElement,
  value: Parameters<typeof fireEvent.change>[1],
) {
  await act(async () => {
    fireEvent.change(element, value);
  });
}
async function openAlpha() {
  await click(await screen.findByRole('button', { name: /Open Club Alpha/ }));
  await screen.findByRole('heading', { level: 1, name: 'Club Alpha' });
}
async function confirm(purge = false) {
  await click(
    await screen.findByRole('button', {
      name: purge ? 'Permanently delete…' : 'Delete tenant…',
    }),
  );
  if (purge)
    for (const label of [
      /I confirm the displayed registered databases/,
      /I confirm unregistered databases/,
      /No registered tenant database is listed/,
      /I confirm all manual cleanup/,
    ])
      await click(screen.getByLabelText(label));
  await change(screen.getByLabelText('Type development/alpha'), {
    target: { value: 'development/alpha' },
  });
  await click(
    screen.getByRole('button', {
      name: purge ? 'Permanently delete now' : 'Delete tenant',
    }),
  );
}
for (const marked of [false, true])
  test(`${marked ? 'purge' : 'soft deletion'} clears selection before status refresh and focuses the neutral view`, async () => {
    const f = fixture({ marked });
    render(<Explorer request={f.request} />);
    await openAlpha();
    await confirm(marked);
    const welcome = await screen.findByRole('heading', {
      name: 'A clear view of your platform.',
    });
    await waitFor(() => assert.equal(document.activeElement, welcome));
    assert.equal(
      screen.queryByRole('heading', { level: 1, name: 'Club Alpha' }),
      null,
    );
    assert.equal(screen.queryByRole('tablist'), null);
    assert.equal(
      screen
        .getByText('Tenant deleted. Select another tenant to continue.')
        .getAttribute('role'),
      'status',
    );
    assert.equal(f.reads, 1);
    await click(await screen.findByRole('button', { name: /Open Club Beta/ }));
    await screen.findByRole('heading', { level: 1, name: 'Club Beta' });
  });
for (const phase of ['failed', 'purging'])
  test(`HTTP-success purge with ${phase} retains read-only details and progress`, async () => {
    const f = fixture({ marked: true, phase });
    render(<Explorer request={f.request} />);
    await openAlpha();
    await confirm(true);
    await screen.findByText(
      phase === 'failed'
        ? 'Cleanup incomplete'
        : 'Permanent deletion in progress',
    );
    assert.ok(screen.getByRole('heading', { level: 1, name: 'Club Alpha' }));
    assert.equal(
      screen.queryByRole('heading', { name: 'A clear view of your platform.' }),
      null,
    );
    if (phase === 'failed')
      assert.ok(screen.getByText('Fixture cleanup incomplete'));
  });
test('directory refresh failure cannot restore successfully deleted details', async () => {
  const f = fixture({ refreshFails: true });
  render(<Explorer request={f.request} />);
  await openAlpha();
  await confirm();
  await screen.findByText('Fixture directory unavailable');
  assert.ok(
    screen.getByRole('heading', { name: 'A clear view of your platform.' }),
  );
  assert.equal(
    screen.queryByRole('heading', { level: 1, name: 'Club Alpha' }),
    null,
  );
});
test('cancel and rejected deletion retain the selected tenant', async () => {
  const f = fixture({ postFails: true });
  render(<Explorer request={f.request} />);
  await openAlpha();
  await click(await screen.findByRole('button', { name: 'Delete tenant…' }));
  await click(screen.getByRole('button', { name: 'Cancel' }));
  assert.equal(f.writes, 0);
  assert.ok(screen.getByRole('heading', { level: 1, name: 'Club Alpha' }));
  await confirm();
  await screen.findAllByText('Fixture deletion rejected');
  assert.ok(screen.getByRole('heading', { level: 1, name: 'Club Alpha' }));
});
test('late detail response from a prior selection cannot overwrite the next tenant after deletion', async () => {
  const f = fixture();
  render(<Explorer request={f.request} />);
  f.delayDetail();
  await click(await screen.findByRole('button', { name: /Open Club Alpha/ }));
  await waitFor(() => assert.ok(f.detailSignal));
  await click(screen.getByRole('button', { name: /Open Club Beta/ }));
  await screen.findByRole('heading', { level: 1, name: 'Club Beta' });
  // Reopen Alpha using a current response while its obsolete request ignores abort.
  // The old request must remain fenced even after deletion and another selection.
  await openAlpha();
  await confirm();
  await screen.findByRole('heading', {
    name: 'A clear view of your platform.',
  });
  await click(await screen.findByRole('button', { name: /Open Club Beta/ }));
  await screen.findByRole('heading', { level: 1, name: 'Club Beta' });
  await act(async () => f.pendingDetail.resolve(alpha));
  assert.ok(f.detailSignal?.aborted);
  assert.ok(screen.getByRole('heading', { level: 1, name: 'Club Beta' }));
});
test('a directory response started before deletion cannot resurrect its row', async () => {
  const f = fixture();
  render(<Explorer request={f.request} />);
  await openAlpha();
  f.delayList();
  await change(screen.getByLabelText('Filter environment'), {
    target: { value: 'development' },
  });
  await waitFor(() => assert.ok(f.listSignal));
  await confirm();
  await screen.findByRole('heading', {
    name: 'A clear view of your platform.',
  });
  await screen.findByText('1–1 of 1');
  await act(async () =>
    f.pendingList.resolve({
      items: [alpha, beta],
      total: 2,
      page: 1,
      pageSize: 20,
    }),
  );
  assert.ok(f.listSignal?.aborted);
  assert.equal(screen.queryByRole('button', { name: /Open Club Alpha/ }), null);
  assert.equal(
    (screen.getByLabelText('Filter environment') as HTMLSelectElement).value,
    'development',
  );
});
