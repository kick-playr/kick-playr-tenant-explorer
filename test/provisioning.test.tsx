import './dom.ts';
import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { TenantProvisioning } from '../src/components/tenant-provisioning.tsx';
import { CreateTenant } from '../src/components/create-tenant.tsx';
test('tenant creation prefills stage-specific references and preserves explicit operator edits', () => {
  try {
    render(
      <CreateTenant
        request={async () => ({})}
        onCreated={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Tenant ID'), {
      target: { value: 'fcrww' },
    });
    assert.equal(
      (screen.getByLabelText('MongoDB reference') as HTMLInputElement).value,
      'workflow-local:fcrww:mongo',
    );
    fireEvent.change(screen.getByLabelText('Environment'), {
      target: { value: 'preview' },
    });
    assert.equal(
      (screen.getByLabelText('Encryption key reference') as HTMLInputElement)
        .value,
      'preview:fcrww:key',
    );
    fireEvent.change(screen.getByLabelText('Environment'), {
      target: { value: 'production' },
    });
    assert.equal(
      (screen.getByLabelText('MongoDB reference') as HTMLInputElement).value,
      'prod:fcrww:mongo',
    );
  } finally {
    cleanup();
  }
});
test('operator checklist distinguishes manual acknowledgements from verified infrastructure', async () => {
  const calls: { path: string; body?: unknown }[] = [];
  const guide = {
    onboardingRevision: 0,
    steps: [
      {
        id: 'clerk',
        title: 'Clerk-Anwendung erstellen',
        instructions: 'Manuell erstellen.',
      },
      {
        id: 'claims',
        title: 'Claims eintragen',
        instructions: 'aud konfigurieren.',
      },
    ],
    references: {
      mongoUri: 'workflow-local:club:mongo',
      key: 'workflow-local:club:key',
    },
    operatorSteps: [],
    verification: null,
    clerk: {
      issuer: 'https://club.example',
      origin: 'http://club.localhost:4311',
      setupAudience: 'club-setup',
      claims: { aud: ['club-setup', 'kick-playr:development:club'] },
    },
    keys: { files: [] },
    emailConfigured: false,
  };
  const transport = async (path: string, options?: RequestInit) => {
    calls.push({
      path,
      body: options?.body ? JSON.parse(String(options.body)) : undefined,
    });
    return options?.method === 'POST' ? { onboardingRevision: 1 } : guide;
  };
  try {
    render(
      <TenantProvisioning
        environment="development"
        tenantId="club"
        request={transport}
      />,
    );
    await screen.findByText('Clerk-Anwendung erstellen');
    assert.ok(screen.getByText(/Noch nicht serverseitig bestätigt/));
    fireEvent.click(
      screen.getByLabelText('Clerk-Anwendung erstellen: manuell erledigt'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Fortschritt speichern' }),
    );
    await waitFor(() => assert.ok(calls.some((c) => c.path.endsWith('/save'))));
    assert.deepEqual(calls.find((c) => c.path.endsWith('/save'))?.body, {
      steps: ['clerk'],
      expectedRevision: 0,
    });
    assert.ok(screen.getByText('workflow-local:club:mongo'));
    assert.ok(screen.getByText(/HSM.*nicht verfügbar/));
  } finally {
    cleanup();
  }
});
