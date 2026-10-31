import './dom.ts';
import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TenantMongoUrl } from '../src/components/tenant-mongo-url.tsx';
const status = {
  configured: false,
  editable: true,
  available: true,
  revision: 'a'.repeat(64),
  source: null,
  requiresReload: false,
} as const;
test('sends a transient masked MongoDB URL and clears it after saving without reading a stored secret', async () => {
  const calls: unknown[] = [];
  try {
    render(
      <TenantMongoUrl
        status={status}
        save={async (uri, expectedRevision) => {
          calls.push({ uri, expectedRevision });
          return {
            ...status,
            configured: true,
            source: 'pending',
            revision: 'b'.repeat(64),
          };
        }}
      />,
    );
    const input = screen.getByLabelText('MongoDB-URL') as HTMLInputElement;
    assert.equal(input.type, 'password');
    assert.equal(input.value, '');
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
    assert.equal(input.value, '');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      uri: 'mongodb://u:CANARY_SECRET@cluster.invalid/demo?tls=true&authSource=admin',
      expectedRevision: status.revision,
    });
    assert.ok(!document.body.textContent?.includes('CANARY_SECRET'));
  } finally {
    cleanup();
  }
});
test('clears the secret on failure and never displays an upstream error containing it', async () => {
  try {
    render(
      <TenantMongoUrl
        status={status}
        save={async () => {
          throw Error('CANARY_SECRET');
        }}
      />,
    );
    const input = screen.getByLabelText('MongoDB-URL') as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: 'mongodb://u:CANARY_SECRET@cluster.invalid/demo' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'MongoDB-URL verschlüsselt speichern',
      }),
    );
    await screen.findByRole('alert');
    assert.equal(input.value, '');
    assert.ok(!document.body.textContent?.includes('CANARY_SECRET'));
  } finally {
    cleanup();
  }
});
test('a configured active tenant shows only status and cannot submit a replacement', () => {
  try {
    render(
      <TenantMongoUrl
        status={{
          ...status,
          configured: true,
          editable: false,
          source: 'runtime',
        }}
        save={async () => {
          throw Error('must not call');
        }}
      />,
    );
    assert.ok(
      (screen.getByLabelText('MongoDB-URL') as HTMLInputElement).disabled,
    );
    assert.ok(
      (
        screen.getByRole('button', {
          name: 'MongoDB-URL verschlüsselt speichern',
        }) as HTMLButtonElement
      ).disabled,
    );
    assert.equal(
      (screen.getByLabelText('MongoDB-URL') as HTMLInputElement).value,
      '',
    );
  } finally {
    cleanup();
  }
});
