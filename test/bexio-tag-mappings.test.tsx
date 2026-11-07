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
import { BexioTagMappings } from '../src/components/integration-sections/bexio-tag-mappings.tsx';
import { ApiError, type Transport } from '../src/lib/api.ts';
afterEach(cleanup);
const catalogs = {
  categories: {
    id: 'catalog',
    hash: 'cat-before',
    items: [
      {
        id: 1,
        name: 'Members',
        isInactive: true,
        isTeam: true,
        saison: ['26.1'],
      },
      { id: 2, name: 'Archived' },
    ],
  },
  branches: {
    id: 'catalog',
    hash: 'tag-before',
    items: [
      { id: 10, name: 'Trial label', isTrial: true, playerTrainerCategory: 1 },
      { id: 11, name: 'Other label' },
    ],
  },
};
test('edits all mapping types using focused CAS writes and keeps team metadata outside the payload', async () => {
  const writes: { path: string; body: unknown }[] = [];
  const dirty: boolean[] = [];
  const request: Transport = async (path, options) => {
    if (options?.method === 'PUT') {
      const body = JSON.parse(String(options.body));
      writes.push({ path, body });
      return {
        ...catalogs.branches,
        hash: 'tag-after',
        items: catalogs.branches.items.map((i) => ({
          ...i,
          isTrial: body.selectors.some((s: { id: number }) => s.id === i.id),
        })),
      };
    }
    return path.endsWith('categories')
      ? catalogs.categories
      : catalogs.branches;
  };
  render(
    <BexioTagMappings
      path="clubs/development/fcrww"
      request={request}
      busy={false}
      onDirtyChange={(_, value) => dirty.push(value)}
    />,
  );
  await screen.findByLabelText('Trial');
  assert.equal(screen.queryByText('Kiosk'), null);
  assert.equal(
    screen
      .getByRole('link', { name: 'Open Trial label in Bexio' })
      .getAttribute('href'),
    'https://office.bexio.com/index.php/kontakt_branche/edit/id/10',
  );
  assert.equal(
    screen
      .getByRole('link', { name: 'Open Members in Bexio' })
      .getAttribute('href'),
    'https://office.bexio.com/index.php/kontakt_kategorie/edit/id/1',
  );
  fireEvent.change(screen.getByLabelText('Trial'), {
    target: { value: '11' },
  });
  assert.equal(dirty.at(-1), true);
  await waitFor(() => assert.equal(writes.length, 1));
  assert.deepEqual(writes[0], {
    path: 'clubs/development/fcrww/catalog/branches/flags/isTrial',
    body: { expectedHash: 'tag-before', selectors: [{ id: 11 }] },
  });
  await waitFor(() => assert.equal(dirty.at(-1), false));
  assert.equal(screen.queryByText('Team seasons'), null);
  assert.equal(screen.queryByText('Player-trainer assignments'), null);
});

test('preserves the edit revision across tabs and restores the saved selection after conflicts', async () => {
  let reads = 0;
  const request: Transport = async (path, options) => {
    if (options?.method === 'PUT') throw new ApiError(409, 'changed');
    reads++;
    return path.endsWith('categories')
      ? catalogs.categories
      : catalogs.branches;
  };
  const props = {
    path: 'clubs/development/fcrww',
    request,
    busy: false,
    onDirtyChange: () => {},
  };
  const view = render(<BexioTagMappings {...props} active />);
  await screen.findByLabelText('Trial');
  fireEvent.change(screen.getByLabelText('Trial'), {
    target: { value: '11' },
  });
  view.rerender(<BexioTagMappings {...props} active={false} />);
  view.rerender(<BexioTagMappings {...props} active />);
  assert.equal(reads, 2);
  await screen.findByRole('alert');
  assert.match(screen.getByRole('alert').textContent!, /changed elsewhere/);
  assert.equal(
    (screen.getByLabelText('Trial') as HTMLSelectElement).value,
    '10',
  );
  assert.equal(
    screen.queryByRole('button', { name: 'Save Trial mapping' }),
    null,
  );
  assert.equal(view.container.querySelector('details'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Reload Bexio labels' }));
  await waitFor(() => assert.equal(reads, 4));
});
