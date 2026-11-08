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
          return { roomId: '!created:example.org' };
        }
        if (path.endsWith('/settings')) return { hash: 'v1', chat: config };
        if (path.endsWith('/status')) return { credentialsConfigured: true };
        return inventory;
      }}
    />,
  );
  await screen.findByRole('group', { name: 'Spaces and rooms' });
  assert.equal(writes.length, 0);
  fireEvent.click(
    screen.getByRole('button', { name: 'Create missing spaces & rooms' }),
  );
  await waitFor(() =>
    assert.deepEqual(writes, [
      { suffix: '' },
      { suffix: 'Trainers' },
      { suffix: 'Teams' },
      { key: 'matrixTrainersRoomId', roomId: '' },
      { key: 'matrix1418CoachRoomId', roomId: '' },
      { key: 'matrixBoardMembersRoomId', roomId: '' },
      { key: 'matrixAdminRoomId', roomId: '' },
    ]),
  );
  await screen.findByText(
    'Spaces and static rooms are ready. Save to persist generated room IDs.',
  );
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
test('reconciliation retries only the selected missing space, not existing root or Trainers', async () => {
  const calls: unknown[] = [];
  const config = {
    baseUrl: 'https://matrix.example.org',
    serverName: 'example.org',
    discoveryOrigin: 'https://example.org',
    enabled: true,
    roles: ['admin'],
    search: 'names',
    blockWrites: false,
  };
  const planned = [
    {
      suffix: '',
      name: 'development_fcrww',
      alias: '#kick_development_fcrww_club:example.org',
    },
    {
      suffix: 'Trainers',
      name: 'development_Trainers',
      alias: '#kick_development_fcrww_Trainers:example.org',
    },
    {
      suffix: 'Teams',
      name: 'development_Teams',
      alias: '#kick_development_fcrww_Teams:example.org',
    },
  ];
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
          calls.push(JSON.parse(String(init.body)));
          return {};
        }
        if (path.endsWith('/settings')) return { hash: 'v1', chat: config };
        if (path.endsWith('/status')) return { credentialsConfigured: true };
        return {
          planned,
          spaces: planned
            .slice(0, calls.length ? 3 : 2)
            .map((p, i) => ({ ...p, roomId: '!space' + i + ':example.org' })),
        };
      }}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconcile & retry Teams' }),
  );
  await waitFor(() =>
    assert.deepEqual(calls, [{ suffix: 'Teams', reconcile: true }]),
  );
  await screen.findByText('Teams space reconciled and ready.');
});

test('hierarchy creation retains draft IDs on partial failure and Save persists IDs with flags', async () => {
  const calls: {
    path: string;
    method: string;
    body: {
      key?: string;
      roomId?: string;
      expectedHash?: string;
      patch: Record<string, unknown> & { chat: { enabled: boolean } };
    };
  }[] = [];
  const config = {
    baseUrl: 'https://matrix.example.org',
    serverName: 'example.org',
    discoveryOrigin: 'https://example.org',
    enabled: true,
    roles: ['admin'],
    search: 'names',
    blockWrites: false,
  };
  const planned = ['', 'Trainers', 'Teams'].map((suffix) => ({
    suffix,
    name: 'development_' + (suffix || 'fcrww'),
    alias: '#kick_development_fcrww_' + (suffix || 'club') + ':example.org',
  }));
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
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (init?.method) calls.push({ path, method: init.method, body });
        if (init?.method === 'PATCH')
          return { hash: 'v2', chat: body.patch.chat, ...body.patch };
        if (path.endsWith('/settings'))
          return {
            hash: 'v1',
            chat: config,
            matrixTrainersRoomId: '!legacy:example.org',
          };
        if (path.endsWith('/status')) return { credentialsConfigured: true };
        if (init?.method === 'POST' && path.endsWith('/rooms')) {
          if (body.key === 'matrixBoardMembersRoomId')
            throw Error('Rate limited; retry later');
          return { roomId: body.roomId || '!generated:example.org' };
        }
        return { planned, spaces: [] };
      }}
    />,
  );
  await screen.findByRole('group', { name: 'Spaces and rooms' });
  assert.equal(calls.length, 0);
  fireEvent.click(
    screen.getByRole('button', { name: 'Create missing spaces & rooms' }),
  );
  await screen.findByRole('alert');
  assert.equal(
    (screen.getByLabelText('Trainers room ID') as HTMLInputElement).value,
    '!legacy:example.org',
  );
  assert.equal(
    (screen.getByLabelText('1418 Coaches room ID') as HTMLInputElement).value,
    '!generated:example.org',
  );
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.deepEqual(
    calls.filter((c) => c.path.endsWith('/rooms')).map((c) => c.body),
    [
      { key: 'matrixTrainersRoomId', roomId: '!legacy:example.org' },
      { key: 'matrix1418CoachRoomId', roomId: '' },
      { key: 'matrixBoardMembersRoomId', roomId: '' },
    ],
  );
  fireEvent.click(screen.getByLabelText('Enable chat'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Save chat configuration' }),
  );
  await screen.findByText('Chat configuration saved.');
  const saved = calls.find((c) => c.method === 'PATCH')!.body;
  assert.equal(saved.expectedHash, 'v1');
  assert.equal(saved.patch.chat.enabled, false);
  assert.equal(saved.patch.matrix1418CoachRoomId, '!generated:example.org');
  assert.equal(saved.patch.matrixTrainersRoomId, undefined);
});

test('individual reconciliation keeps a verified partial room ID but never adopts an inventory collision', async () => {
  const config = {
    baseUrl: 'https://matrix.example.org',
    serverName: 'example.org',
    discoveryOrigin: 'https://example.org',
    enabled: true,
    roles: ['admin'],
    search: 'names',
    blockWrites: false,
  };
  for (const collision of [false, true]) {
    const props = {
      active: true,
      path: 'clubs/development/fcrww',
      busy: false,
      connections: [],
      onConnect: async () => {},
      onToggle: async () => {},
      onSave: async () => true,
      onDirtyChange: () => {},
    };
    render(
      <ChatRoomsIntegrationSection
        {...props}
        request={async (path, init) => {
          if (path.endsWith('/settings')) return { hash: 'v1', chat: config };
          if (path.endsWith('/status')) return { credentialsConfigured: true };
          if (init?.method === 'POST') {
            if (collision)
              throw Error('Alias belongs to another administrator');
            return {
              roomId: '!verified:example.org',
              linked: false,
              warning: 'Room exists but link failed',
            };
          }
          return {
            planned: [],
            spaces: [],
            plannedRooms: [
              {
                key: 'matrixAdminRoomId',
                alias: '#kick_development_fcrww_Admin_room:example.org',
                name: 'development_fcrww_Admin',
                parent: '',
              },
            ],
            rooms: [
              {
                alias: '#kick_development_fcrww_Admin_room:example.org',
                roomId: '!foreign:example.org',
                name: 'Foreign',
              },
            ],
          };
        }}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Reconcile & retry Admin room',
      }),
    );
    await screen.findByRole('alert');
    assert.equal(
      (screen.getByLabelText('Admin room ID') as HTMLInputElement).value,
      collision ? '' : '!verified:example.org',
    );
    cleanup();
  }
});

test('qualified names hide the stage and tenant while root and unprefixed names stay readable', () => {
 for (const stage of ['development','production','preview','local']) {
  assert.equal(displayChatName(stage+'_fcrww_Trainers'),'Trainers');
  assert.equal(displayChatName(stage+'_fcuster_Teams'),'Teams');
  assert.equal(displayChatName(stage+'_fcrww'),'fcrww');
 }
 assert.equal(displayChatName('Trainers'),'Trainers');
});

test('static room labels hide the room suffix and format the coaches label', () => {
 for (const [suffix,label] of [['Trainers','Trainers'],['1418_Coaches','1418 Coaches'],['Vorstand','Vorstand'],['Admin','Admin']]) {
  assert.equal(displayChatName('development_fcrww_'+suffix+'_room'),label);
  assert.equal(displayChatName('production_fcrww_'+suffix+'_room'),label);
 }
});
