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
import { ClubExplorer } from '../src/components/club-explorer.tsx';
import { ApiError, type Transport } from '../src/lib/api.ts';
const clubs = [
  {
    id: 'winikon',
    environment: 'development',
    public: { name: 'FC Winikon', locale: 'de-CH' },
  },
];
const settings = {
  hash: 'before',
  currentSaison: '26.1',
  nextSaison: '26.2',
  billingSaison: '26.1',
  useIdenticons: true,
  avatarInitialsMaxChars: 2,
};
afterEach(cleanup);
test('club administrators save operational settings through club routes without infrastructure controls', async () => {
  let write: { path: string; body: Record<string, unknown> } | undefined;
  const request: Transport = async (path, options) => {
    assert.ok(path.startsWith('clubs/development/winikon/'));
    if (options?.method === 'PATCH') {
      write = { path, body: JSON.parse(String(options.body)) };
      return { ...settings, hash: 'after', currentSaison: '26.2' };
    }
    return settings;
  };
  render(<ClubExplorer clubs={clubs} request={request} />);
  const input = await screen.findByLabelText('Current season');
  fireEvent.change(input, { target: { value: '26.2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  await screen.findByRole('status');
  assert.equal(write?.path, 'clubs/development/winikon/settings');
  assert.equal(write?.body.expectedHash, 'before');
  assert.equal(
    (write?.body.patch as Record<string, unknown>).currentSaison,
    '26.2',
  );
  for (const name of [
    'Create tenant',
    'Keys',
    'Users',
    'Domains',
    'Credentials',
  ])
    assert.equal(screen.queryByRole('button', { name }), null);
});
test('runtime credential replacements are write-only and clear their input even on failure', async () => {
  let attempted = false;
  const request: Transport = async (path, options) => {
    if (options?.method === 'PUT') {
      attempted = true;
      assert.equal(path, 'clubs/development/winikon/integrations/smtp');
      assert.deepEqual(JSON.parse(String(options.body)), {
        expectedRevision: 'one',
        secret: { password: 'new-secret-value' },
      });
      throw new ApiError(409, 'Integration changed; reload before saving');
    }
    return path.endsWith('/settings')
      ? settings
      : {
          items: [
            {
              id: 'smtp',
              provider: 'smtp',
              status: 'disabled',
              accountReference: 'mailbox',
              revision: 'one',
              secretFields: ['password'],
              canToggle: true,
              canConnect: false,
            },
          ],
        };
  };
  render(<ClubExplorer clubs={clubs} request={request} />);
  await screen.findByLabelText('Current season');
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Show settings for smtp smtp' }),
  );
  const password = (await screen.findByLabelText(
    'New password',
  )) as HTMLInputElement;
  assert.equal(password.type, 'password');
  fireEvent.change(password, { target: { value: 'new-secret-value' } });
  fireEvent.click(screen.getByRole('button', { name: 'Replace credentials' }));
  await screen.findByText('Integration changed; reload before saving');
  await waitFor(() => assert.equal(password.value, ''));
  assert.equal(attempted, true);
});

test('clicking the active Settings tab preserves the loaded editor', async () => {
  render(<ClubExplorer clubs={clubs} request={async () => settings} />);
  await screen.findByLabelText('Current season');
  fireEvent.click(screen.getByRole('button', { name: /^Settings$/ }));
  assert.ok(screen.getByLabelText('Current season'));
  assert.equal(screen.queryByText('Loading club settings…'), null);
});

test('OAuth client settings show client ID and callback, and clear new secrets after a failed save', async () => {
  let written: unknown;
  const request: Transport = async (path, options) => {
    if (options?.method === 'PUT') {
      written = JSON.parse(String(options.body));
      throw new ApiError(409, 'Integration changed; reload before saving');
    }
    return path.endsWith('/settings')
      ? settings
      : {
          items: [
            {
              id: 'bexio',
              provider: 'bexio',
              status: 'active',
              accountReference: 'club-account',
              revision: 'one',
              secretFields: [],
              canToggle: false,
              canConnect: true,
              oauth: {
                clientId: 'existing-client',
                hasClientSecret: true,
                pendingReconnect: false,
                callbackUrl:
                  'http://winikon.localhost:4311/bexio/oauth/callback',
              },
            },
          ],
        };
  };
  render(<ClubExplorer clubs={clubs} request={request} />);
  await screen.findByLabelText('Current season');
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Show settings for bexio bexio',
    }),
  );
  const clientId = await screen.findByLabelText('Client ID');
  assert.equal((clientId as HTMLInputElement).value, 'existing-client');
  assert.ok(screen.getByText(/Client secret configured\./));
  assert.equal(
    (screen.getByLabelText('Callback URL') as HTMLInputElement).readOnly,
    true,
  );
  fireEvent.change(clientId, { target: { value: 'next-client' } });
  const secret = screen.getByLabelText('New client secret') as HTMLInputElement;
  assert.equal(secret.type, 'password');
  fireEvent.change(secret, { target: { value: 'NEW_PRIVATE_SECRET' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save client settings' }));
  await screen.findByText('Integration changed; reload before saving');
  assert.deepEqual(written, {
    expectedRevision: 'one',
    secret: { clientId: 'next-client', clientSecret: 'NEW_PRIVATE_SECRET' },
  });
  await waitFor(() => assert.equal(secret.value, ''));
});

test('mail settings show safe configuration and create SMTP with a null revision without exposing passwords', async () => {
  let write: unknown;
  const request: Transport = async (path, options) => {
    if (options?.method === 'PUT') {
      write = JSON.parse(String(options.body));
      throw new ApiError(409, 'Mail settings changed; reload before saving');
    }
    return path.endsWith('/settings')
      ? settings
      : {
          items: [
            {
              id: 'smtp',
              provider: 'smtp',
              status: 'unconfigured',
              revision: null,
              accountReference: '',
              canToggle: false,
              canConnect: false,
              secretFields: [],
              mail: {
                host: 'mail.club.example',
                port: 587,
                user: '',
                hasPassword: false,
                allowedHosts: ['mail.club.example'],
                fromAddress: 'club@example.org',
              },
            },
          ],
        };
  };
  render(<ClubExplorer clubs={clubs} request={request} />);
  await screen.findByLabelText('Current season');
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Show settings for smtp smtp' }),
  );
  const user = await screen.findByLabelText('Username');
  assert.equal(
    (screen.getByLabelText('Sender address') as HTMLInputElement).readOnly,
    true,
  );
  fireEvent.change(user, { target: { value: 'club-user' } });
  const password = screen.getByLabelText('New password') as HTMLInputElement;
  fireEvent.change(password, { target: { value: 'NEW_MAIL_PASSWORD' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save mail settings' }));
  await screen.findByText('Mail settings changed; reload before saving');
  assert.deepEqual(write, {
    expectedRevision: null,
    secret: {
      host: 'mail.club.example',
      port: 587,
      user: 'club-user',
      password: 'NEW_MAIL_PASSWORD',
    },
  });
  await waitFor(() => assert.equal(password.value, ''));
});

test('saving settings keeps the selected second-level section after the snapshot changes', async () => {
  const request: Transport = async (_path, options) =>
    options?.method === 'PATCH'
      ? { ...settings, hash: 'after', avatarInitialsMaxChars: 4 }
      : settings;
  render(<ClubExplorer clubs={clubs} request={request} />);
  await screen.findByLabelText('Current season');
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Avatar initials'), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  await screen.findByText('Saved.');
  assert.equal(
    screen
      .getByRole('button', { name: 'Appearance' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    (screen.getByLabelText('Avatar initials') as HTMLSelectElement).value,
    '4',
  );
});

test('integration provider menus preserve drafts and show one provider at a time', async () => {
  const request: Transport = async (path) =>
    path.endsWith('/settings')
      ? settings
      : {
          items: ['bexio', 'dropbox'].map((provider) => ({
            id: provider,
            provider,
            status: 'active',
            accountReference: 'account-' + provider,
            revision: 'one',
            secretFields: [],
            canToggle: false,
            canConnect: true,
            oauth: {
              clientId: 'client-' + provider,
              hasClientSecret: true,
              pendingReconnect: false,
            },
          })),
        };
  render(<ClubExplorer clubs={clubs} request={request} />);
  await screen.findByLabelText('Current season');
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
  await screen.findByRole('navigation', { name: 'Integration sections' });
  assert.equal(
    screen.getByRole('button', { name: 'Bexio' }).getAttribute('aria-pressed'),
    'true',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show settings for bexio bexio' }),
  );
  const inputs = screen.getAllByLabelText('Client ID') as HTMLInputElement[];
  fireEvent.change(inputs[0]!, { target: { value: 'draft-bexio' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dropbox' }));
  assert.equal(
    screen
      .getByRole('button', { name: 'Dropbox' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(screen.queryByRole('button', { name: 'Reconnect bexio' }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Bexio' }));
  assert.equal(inputs[0]!.value, 'draft-bexio');
  assert.ok(screen.getByRole('button', { name: 'Reconnect bexio' }));
});

test('Bexio mappings remain reachable before an OAuth connection is configured', async () => {
  const request: Transport = async (path) =>
    path.endsWith('/settings')
      ? settings
      : path.includes('/catalog/')
        ? { id: 'catalog', hash: 'one', items: [] }
        : { items: [] };
  render(<ClubExplorer clubs={clubs} request={request} />);
  await screen.findByRole('button', { name: 'Integrations' });
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
  await screen.findByRole('button', { name: 'Bexio' });
  assert.equal(
    screen.queryByRole('heading', { name: 'Tags and labels' }),
    null,
  );
  assert.ok(screen.getByText(/No Bexio connection is configured/));
  fireEvent.click(screen.getByRole('button', { name: 'Bexio tags & labels' }));
  await screen.findByRole('heading', { name: 'Tags and labels' });
  assert.equal(
    screen.queryByRole('heading', { name: 'OAuth client settings' }),
    null,
  );
});
