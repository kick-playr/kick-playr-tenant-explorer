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
  within,
} from '@testing-library/react';
import { ClubTeams } from '../src/components/club-teams.tsx';
import type { TeamCatalog } from '../src/lib/club-teams.ts';
import { ApiError, type Transport } from '../src/lib/api.ts';
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
const path = 'clubs/development/winikon';
const original: TeamCatalog = {
  id: 'catalog',
  hash: 'one',
  items: [
    { id: 123, name: 'Team A', isTeam: true, saison: ['26.1', '25.2'] },
    { id: 456, name: 'Team A', isTeam: true, saison: ['26.2'] },
    { id: 789, name: 'Role' },
  ],
};
const settings = {
  currentSaison: '26.1',
  nextSaison: '26.2',
  seasons: { '26.1': {}, '26.2': {} },
};
function fixture(extra?: Transport) {
  let catalog = structuredClone(original);
  const writes: {
    path: string;
    body: { selectedTeamIds: number[]; season: string; expectedHash: string };
  }[] = [];
  const request: Transport = async (p, o) => {
    if (extra) {
      const r = await extra(p, o);
      if (r !== undefined) return r;
    }
    if (p.endsWith('/settings')) return settings;
    if (p.endsWith('/readiness')) throw new ApiError(503, 'Bexio unavailable');
    if (o?.method === 'PUT') {
      const b = JSON.parse(String(o.body));
      writes.push({ path: p, body: b });
      catalog = {
        ...catalog,
        hash: 'two',
        items: catalog.items.map((t) => ({
          ...t,
          saison: [
            ...(t.saison ?? []).filter((s) => s !== b.season),
            ...(b.selectedTeamIds.includes(t.id) ? [b.season] : []),
          ],
        })),
      };
      return catalog;
    }
    return { catalog, operations: [] };
  };
  return { request, writes };
}
test('combined inventory excludes season state and season buttons save independently without readiness gate', async () => {
  const f = fixture();
  render(
    <ClubTeams
      path={path}
      request={f.request}
      onBusyChange={() => {}}
      onDirtyChange={() => {}}
    />,
  );
  const all = await screen.findByRole('region', { name: 'All teams' });
  await waitFor(() => assert.match(all.textContent ?? '', /#123/));
  assert.match(all.textContent ?? '', /#456/);
  assert.equal(within(all).queryByText(/Current/), null);
  assert.equal(within(all).queryByText('Role'), null);
  const button = await screen.findByRole('button', {
    name: 'Team A #456 · Current 26.1',
  });
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  fireEvent.click(button);
  await waitFor(() =>
    assert.equal(button.getAttribute('aria-pressed'), 'true'),
  );
  assert.deepEqual(f.writes, [
    {
      path: path + '/catalog/categories/team-seasons',
      body: {
        selectedTeamIds: [123, 456],
        season: '26.1',
        expectedHash: 'one',
      },
    },
  ]);
  assert.equal(
    screen
      .getByRole('button', { name: 'Team A #123 · Next 26.2' })
      .getAttribute('aria-pressed'),
    'false',
  );
});
test('same-name creation is explicit and retries keep the operation key after a lost response', async () => {
  const writes: { operationKey: string; name: string; expectedHash: string }[] =
    [];
  const f = fixture(async (p, o) => {
    if (p.endsWith('/create')) {
      writes.push(JSON.parse(String(o?.body)));
      throw new ApiError(502, 'Result unavailable');
    }
  });
  render(
    <ClubTeams
      path={path}
      request={f.request}
      onBusyChange={() => {}}
      onDirtyChange={() => {}}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Add team' }));
  fireEvent.change(screen.getByLabelText('Team name'), {
    target: { value: 'Team A' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review creation' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Create team and Bexio category' }),
  );
  await screen.findByText(
    'Result not confirmed. Check creation status before starting another creation.',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Check creation status' }),
  );
  await waitFor(() => assert.equal(writes.length, 2));
  assert.equal(writes[0]!.operationKey, writes[1]!.operationKey);
  assert.equal(writes[0]!.name, 'Team A');
  assert.equal(screen.queryByText(/duplicate.*resolve/i), null);
});
test('unknown durable operations can be checked without a new create request', async () => {
  const calls: string[] = [];
  const operation = {
    operationKey: '11111111-1111-4111-8111-111111111111',
    name: 'Team A',
    state: 'unknown',
  };
  const f = fixture(async (p, o) => {
    calls.push(p);
    if (o?.method === 'POST') return { operation };
    if (p.endsWith('/teams'))
      return { catalog: original, operations: [operation] };
  });
  render(
    <ClubTeams
      path={path}
      request={f.request}
      onBusyChange={() => {}}
      onDirtyChange={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Check status for Team A' }),
  );
  await waitFor(() =>
    assert.ok(
      calls.some((p) =>
        p.endsWith('/operations/' + operation.operationKey + '/resume'),
      ),
    ),
  );
  assert.equal(
    calls.some((p) => p.endsWith('/create')),
    false,
  );
});
test('conflicting season save reloads confirmed state without automatic replay', async () => {
  let writes = 0;
  const f = fixture(async (_p, o) => {
    if (o?.method === 'PUT') {
      writes++;
      throw new ApiError(409, 'Changed elsewhere');
    }
  });
  render(
    <ClubTeams
      path={path}
      request={f.request}
      onBusyChange={() => {}}
      onDirtyChange={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Team A #456 · Current 26.1' }),
  );
  await screen.findByText(
    'Changed elsewhere. Review the latest selection and try again.',
  );
  assert.equal(
    screen
      .getByRole('button', { name: 'Team A #456 · Current 26.1' })
      .getAttribute('aria-pressed'),
    'false',
  );
  assert.equal(writes, 1);
});

test('reload ignores a late previous inventory response and keeps the newer confirmed hash', async () => {
  let release!: (v: unknown) => void;
  let reads = 0;
  const pending = new Promise((r) => {
    release = r;
  });
  const f = fixture(async (p) => {
    if (p.endsWith('/teams'))
      return ++reads === 1
        ? pending
        : { catalog: { ...original, hash: 'latest' }, operations: [] };
  });
  render(
    <ClubTeams
      path={path}
      request={f.request}
      onBusyChange={() => {}}
      onDirtyChange={() => {}}
    />,
  );
  await waitFor(() => assert.equal(reads, 1));
  fireEvent.click(screen.getByRole('button', { name: 'Reload teams' }));
  await screen.findByRole('button', { name: 'Team A #456 · Current 26.1' });
  const { act } = await import('@testing-library/react');
  await act(async () =>
    release({ catalog: { ...original, hash: 'stale' }, operations: [] }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Team A #456 · Current 26.1' }),
  );
  await waitFor(() => assert.equal(f.writes.length, 1));
  assert.equal(f.writes[0]!.body.expectedHash, 'latest');
});

test('partial creation reloads current catalog before resuming local linking and permits a new deliberate operation', async () => {
  const operation = {
    operationKey: '11111111-1111-4111-8111-111111111111',
    name: 'Team C',
    state: 'link-pending',
    categoryId: 901,
  };
  let posted = false;
  let resumed: unknown;
  const f = fixture(async (p, o) => {
    if (p.endsWith('/create')) {
      posted = true;
      return { operation };
    }
    if (p.endsWith('/resume')) {
      resumed = JSON.parse(String(o?.body));
      return { operation };
    }
    if (p.endsWith('/teams'))
      return {
        catalog: { ...original, hash: posted ? 'changed' : 'one' },
        operations: posted ? [operation] : [],
      };
  });
  render(
    <ClubTeams
      path={path}
      request={f.request}
      onBusyChange={() => {}}
      onDirtyChange={() => {}}
    />,
  );
  await waitFor(() =>
    assert.equal(
      (screen.getByRole('button', { name: 'Add team' }) as HTMLButtonElement)
        .disabled,
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add team' }));
  fireEvent.change(screen.getByLabelText('Team name'), {
    target: { value: 'Team C' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review creation' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Create team and Bexio category' }),
  );
  await waitFor(() => assert.equal(!!screen.queryByRole('dialog'), false));
  fireEvent.click(
    screen.getByRole('button', { name: 'Check status for Team C' }),
  );
  await waitFor(() => assert.deepEqual(resumed, { expectedHash: 'changed' }));
  assert.equal(
    (screen.getByRole('button', { name: 'Add team' }) as HTMLButtonElement)
      .disabled,
    false,
  );
});
