import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from '@testing-library/react';
import { IntegrationConnectionCard } from '../src/components/integration-sections/integration-connection-card.tsx';
import type { Connection } from '../src/components/integration-sections/types.ts';
afterEach(cleanup);
const connection = (id: string): Connection => ({
  id,
  provider: 'bexio',
  status: 'active',
  accountReference: 'club-' + id,
  revision: 'one',
  secretFields: [],
  canConnect: true,
  canToggle: false,
  oauth: {
    clientId: 'client-' + id,
    hasClientSecret: true,
    pendingReconnect: false,
  },
});
function setup() {
  const calls: string[] = [];
  return {
    calls,
    actions: {
      path: 'clubs/development/fcrww',
      busy: false,
      onConnect: async () => {
        calls.push('connect');
      },
      onToggle: async () => {
        calls.push('toggle');
      },
      onSave: async () => {
        calls.push('save');
        return true;
      },
      onDirtyChange: () => {
        calls.push('dirty');
      },
    },
  };
}
test('each connection starts collapsed with visible identity, status and independent accessible disclosures', () => {
  const { actions, calls } = setup();
  render(
    <>
      <IntegrationConnectionCard connection={connection('one')} {...actions} />
      <IntegrationConnectionCard connection={connection('two')} {...actions} />
    </>,
  );
  assert.ok(screen.getByText('bexio · one'));
  assert.ok(screen.getByText('club-two'));
  assert.equal(screen.getAllByText('active').length, 2);
  const first = screen.getByRole('button', {
      name: 'Show settings for bexio one',
    }),
    second = screen.getByRole('button', {
      name: 'Show settings for bexio two',
    });
  assert.equal(first.getAttribute('type'), 'button');
  assert.equal(first.getAttribute('aria-expanded'), 'false');
  assert.notEqual(
    first.getAttribute('aria-controls'),
    second.getAttribute('aria-controls'),
  );
  assert.equal(screen.queryByRole('textbox', { name: 'Client ID' }), null);
  fireEvent.click(first);
  assert.equal(first.getAttribute('aria-expanded'), 'true');
  assert.equal(second.getAttribute('aria-expanded'), 'false');
  const region = screen.getByRole('region', { name: 'Settings for bexio one' });
  assert.equal(region.id, first.getAttribute('aria-controls'));
  assert.ok(within(region).getByLabelText('Client ID'));
  fireEvent.click(second);
  fireEvent.click(first);
  assert.equal(second.getAttribute('aria-expanded'), 'true');
  assert.equal(first.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(calls, []);
});
test('collapsing preserves OAuth drafts, disables hidden controls and never submits or changes dirty state', () => {
  const { actions, calls } = setup();
  const view = render(
    <IntegrationConnectionCard connection={connection('one')} {...actions} />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show settings for bexio one' }),
  );
  const client = screen.getByLabelText('Client ID') as HTMLInputElement;
  const secret = screen.getByLabelText('New client secret') as HTMLInputElement;
  fireEvent.change(client, { target: { value: 'draft-client' } });
  fireEvent.change(secret, { target: { value: 'draft-secret' } });
  assert.deepEqual(calls, ['dirty', 'dirty']);
  calls.length = 0;
  fireEvent.click(
    screen.getByRole('button', { name: 'Hide settings for bexio one' }),
  );
  assert.equal(
    screen.queryByRole('region', { name: 'Settings for bexio one' }),
    null,
  );
  assert.ok(client.matches(':disabled'));
  assert.equal(client.value, 'draft-client');
  assert.equal(secret.value, 'draft-secret');
  fireEvent.click(
    screen.getByRole('button', { name: 'Show settings for bexio one' }),
  );
  assert.equal(screen.getByLabelText('Client ID'), client);
  assert.equal(secret.value, 'draft-secret');
  assert.equal(client.matches(':disabled'), false);
  assert.deepEqual(calls, []);
  view.unmount();
  render(
    <IntegrationConnectionCard connection={connection('one')} {...actions} />,
  );
  assert.equal(
    screen
      .getByRole('button', { name: 'Show settings for bexio one' })
      .getAttribute('aria-expanded'),
    'false',
  );
});
test('uncontrolled credential drafts survive disclosure toggles and busy restrictions remain in force', () => {
  const { actions, calls } = setup();
  const c = {
    ...connection('token'),
    oauth: undefined,
    provider: 'pingen',
    status: 'disabled',
    secretFields: ['accessToken'],
    canConnect: false,
  };
  const view = render(
    <IntegrationConnectionCard connection={c} {...actions} />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show settings for pingen token' }),
  );
  const token = screen.getByLabelText('New access token') as HTMLInputElement;
  fireEvent.change(token, { target: { value: 'draft-token' } });
  calls.length = 0;
  fireEvent.click(
    screen.getByRole('button', { name: 'Hide settings for pingen token' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show settings for pingen token' }),
  );
  assert.equal(token.value, 'draft-token');
  assert.deepEqual(calls, []);
  view.rerender(<IntegrationConnectionCard connection={c} {...actions} busy />);
  assert.ok(token.matches(':disabled'));
  assert.equal(
    screen
      .getByRole('button', { name: 'Hide settings for pingen token' })
      .hasAttribute('disabled'),
    true,
  );
});

test('mail drafts survive collapse while active connection editing restrictions stay unchanged', () => {
  const { actions, calls } = setup();
  const c: Connection = {
    ...connection('mail'),
    provider: 'smtp',
    status: 'disabled',
    oauth: undefined,
    mail: {
      host: 'mail.club.example',
      port: 587,
      user: 'club',
      hasPassword: true,
      allowedHosts: ['mail.club.example'],
    },
  };
  const view = render(
    <IntegrationConnectionCard connection={c} {...actions} />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show settings for smtp mail' }),
  );
  const user = screen.getByLabelText('Username') as HTMLInputElement;
  const password = screen.getByLabelText('New password') as HTMLInputElement;
  fireEvent.change(user, { target: { value: 'draft-mail-user' } });
  fireEvent.change(password, { target: { value: 'draft-mail-password' } });
  calls.length = 0;
  fireEvent.click(
    screen.getByRole('button', { name: 'Hide settings for smtp mail' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show settings for smtp mail' }),
  );
  assert.equal(user.value, 'draft-mail-user');
  assert.equal(password.value, 'draft-mail-password');
  assert.deepEqual(calls, []);
  view.rerender(
    <IntegrationConnectionCard
      connection={{ ...c, status: 'active' }}
      {...actions}
    />,
  );
  assert.ok(user.matches(':disabled'));
  assert.ok(password.matches(':disabled'));
  assert.ok(
    screen.getByText('Disable this connection before editing its settings.'),
  );
});
