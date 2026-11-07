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
import type { MongoUrlStatus } from '../src/components/tenant-mongo-url.tsx';
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

test('saving the MongoDB URL updates the setup revision and clears old readiness before the next checklist save', async () => {
  const calls: { path: string; body: unknown }[] = [];
  const status: MongoUrlStatus = {
    configured: false,
    editable: true,
    available: true,
    revision: 'a'.repeat(64),
    source: null,
    requiresReload: false,
  };
  let guide = {
    onboardingRevision: 3,
    steps: [],
    references: {
      mongoUri: 'workflow-local:demo:mongo',
      key: 'workflow-local:demo:key',
    },
    operatorSteps: [],
    verification: { verifiedAt: 'today', checks: { mongodb: 'verified' } } as {
      verifiedAt: string;
      checks: Record<string, string>;
    } | null,
    clerk: null,
    keys: { files: [] },
    emailConfigured: false,
    mongo: status,
  };
  const request = async (path: string, options?: RequestInit) => {
    if (!options) return guide;
    const body = JSON.parse(String(options.body));
    calls.push({ path, body });
    if (path.endsWith('/mongo-url')) {
      guide = {
        ...guide,
        onboardingRevision: 4,
        verification: null,
        mongo: {
          ...status,
          configured: true,
          source: 'pending',
          revision: 'b'.repeat(64),
          onboardingRevision: 4,
        },
      };
      return guide.mongo;
    }
    return {};
  };
  try {
    render(
      <TenantProvisioning
        environment="development"
        tenantId="demo"
        request={request}
      />,
    );
    const input = await screen.findByLabelText('MongoDB-URL');
    fireEvent.change(input, {
      target: {
        value:
          'mongodb://u:CANARY_SECRET@cluster.invalid/demo?tls=true&authSource=admin',
      },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'MongoDB-URL verschlüsselt speichern',
      }),
    );
    await screen.findByText(/Verschlüsselt gespeichert/);
    assert.ok(screen.getByText('Noch nicht serverseitig bestätigt.'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Fortschritt speichern' }),
    );
    await waitFor(() => assert.ok(calls.some((c) => c.path.endsWith('/save'))));
    assert.deepEqual(calls.find((c) => c.path.endsWith('/save'))?.body, {
      steps: [],
      expectedRevision: 4,
    });
  } finally {
    cleanup();
  }
});

test('configures tenant keys without a runtime row and shares the new revision with MongoDB provisioning', async () => {
  const files = ['wrapping', 'index', 'control'].map((kind) => ({
    kind,
    variable: `WORKFLOW_REAL_DEMO_${kind === 'wrapping' ? 'WRAPPING_KEY_V1' : kind.toUpperCase() + '_KEY'}`,
    status: 'available',
  }));
  const guide = {
    onboardingRevision: 1,
    steps: [],
    references: {
      mongoUri: 'workflow-local:demo:mongo',
      key: 'workflow-local:demo:key',
    },
    operatorSteps: [],
    verification: null,
    clerk: null,
    keys: { files: [] },
    emailConfigured: false,
    mongo: {
      configured: false,
      editable: true,
      available: true,
      revision: 'a'.repeat(64),
      source: null,
      requiresReload: false,
    },
    keySetup: {
      available: true,
      editable: true,
      registered: false,
      revision: 'a'.repeat(64),
      local: { status: 'connected', files },
    },
  };
  const calls: string[] = [];
  const request = async (path: string, options?: RequestInit) => {
    if (!options) return guide;
    calls.push(path);
    const body = JSON.parse(String(options.body));
    if (path.endsWith('/configure-keys')) {
      assert.deepEqual(body, { expectedRevision: 'a'.repeat(64) });
      return {
        ...guide.keySetup,
        registered: true,
        revision: 'b'.repeat(64),
        onboardingRevision: 2,
      };
    }
    if (path.endsWith('/mongo-url')) {
      assert.equal(body.expectedRevision, 'b'.repeat(64));
      return {
        ...guide.mongo,
        configured: true,
        source: 'pending',
        revision: 'c'.repeat(64),
        onboardingRevision: 3,
      };
    }
    throw Error('unexpected');
  };
  try {
    render(
      <TenantProvisioning
        environment="development"
        tenantId="demo"
        request={request}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Schlüssel konfigurieren' }),
    );
    await screen.findByText(/Schlüssel stimmen in beiden APIs überein/);
    assert.equal(
      (
        screen.getByRole('button', {
          name: 'Schlüssel konfigurieren',
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.change(screen.getByLabelText('MongoDB-URL'), {
      target: { value: 'mongodb://PRIVATE_URI' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'MongoDB-URL verschlüsselt speichern',
      }),
    );
    await waitFor(() => assert.equal(calls.length, 2));
    assert.equal(
      calls[0],
      'tenants/development/demo/onboarding/configure-keys',
    );
  } finally {
    cleanup();
  }
});
