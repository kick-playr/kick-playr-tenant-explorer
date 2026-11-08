import { displayChatName } from '../src/lib/chat-display-name.ts';
import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { ChatRoomsIntegrationSection } from '../src/components/integration-sections/chat-rooms-section.tsx';
import { integrationSections } from '../src/components/integration-sections/registry.ts';
import { SETTINGS_SECTIONS } from '../src/components/settings-sections/registry.ts';
afterEach(cleanup);
test('Chat rooms is always in Integrations and no longer in Settings', () => {
  assert(integrationSections([]).some((s) => s.label === 'Chat rooms'));
  assert(!SETTINGS_SECTIONS.some((s) => s.label === 'Chat rooms'));
});
test('loads tenant spaces and creates root, Trainers and Teams only after clicking', async () => {
  const writes: unknown[] = [];
  const config = {
    baseUrl: 'https://matrix.example.org',
    serverName: 'example.org',
    discoveryOrigin: 'https://example.org',
    enabled: true,
    roles: ['admin'],
    search: 'names',
    blockWrites: false,
  };
  const inventory = {
    planned: [
      {
        name: 'development_fcrww',
        alias: '#kick_development_fcrww_club:example.org',
        suffix: '',
      },
    ],
    spaces: [],
  };
  render(
    <ChatRoomsIntegrationSection
      active
      path="clubs/development/fcrww"
      busy={false}
      connections={[]}
      onConnect={async () => {}}
      onToggle={async () => {}}
      onSave={async () => true}
      onDirtyChange={() => {}}
      request={async (path, init) => {
        if (init?.method === 'POST') {
          writes.push(JSON.parse(String(init.body)));
          return {};
        }
        if (path.endsWith('/settings')) return { hash: 'v1', chat: config };
        if (path.endsWith('/status')) return { credentialsConfigured: true };
        return inventory;
      }}
    />,
  );
  await screen.findByText('No spaces found for this tenant and environment.');
  assert.equal(writes.length, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Create all spaces' }));
  await waitFor(() =>
    assert.deepEqual(writes, [
      { suffix: '' },
      { suffix: 'Trainers' },
      { suffix: 'Teams' },
    ]),
  );
  await screen.findByText('Root, Trainers and Teams spaces are ready.');
});
test('switching integration subtabs preserves the unsaved chat draft', async () => {
  const config = {
    baseUrl: 'https://matrix.example.org',
    serverName: 'example.org',
    discoveryOrigin: 'https://example.org',
    enabled: true,
    roles: ['admin'],
    search: 'names',
    blockWrites: false,
  };
  const props = {
    path: 'clubs/development/fcrww',
    busy: false,
    connections: [],
    onConnect: async () => {},
    onToggle: async () => {},
    onSave: async () => true,
    onDirtyChange: () => {},
    request: async (path: string) =>
      path.endsWith('/settings')
        ? { hash: 'one', chat: config }
        : path.endsWith('/status')
          ? { credentialsConfigured: true }
          : { planned: [], spaces: [] },
  };
  const view = render(<ChatRoomsIntegrationSection {...props} active />);
  const url = await screen.findByLabelText('Matrix API URL');
  fireEvent.change(url, { target: { value: 'https://edited.example.org' } });
  const roles = screen.getByLabelText('Enabled roles (comma separated)');
  fireEvent.change(roles, { target: { value: 'admin,' } });
  assert.equal((roles as HTMLInputElement).value, 'admin,');
  fireEvent.change(roles, { target: { value: 'admin,trainer' } });
  view.rerender(<ChatRoomsIntegrationSection {...props} active={false} />);
  view.rerender(<ChatRoomsIntegrationSection {...props} active />);
  assert.equal(
    (screen.getByLabelText('Matrix API URL') as HTMLInputElement).value,
    'https://edited.example.org',
  );
});

test('space labels omit all stage prefixes, including production, without changing identifiers', () => {
  for (const stage of [
    'local',
    'development',
    'preview',
    'test',
    'staging',
    'production',
  ]) {
    assert.equal(displayChatName(stage + '_fcrww'), 'fcrww');
    assert.equal(displayChatName(stage + '_Trainers'), 'Trainers');
  }
  assert.equal(displayChatName('production_preview_Teams'), 'Teams');
  assert.equal(displayChatName('Teams_preview_U13'), 'Teams_preview_U13');
});
