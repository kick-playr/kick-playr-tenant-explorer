import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { TenantKeys } from '../src/components/tenant-keys.tsx';
afterEach(cleanup);
test('shows environment variable metadata without file paths or secret values', async () => {
  render(
    <TenantKeys
      environment="development"
      tenantId="fcrww"
      request={async () => ({
        reference: 'real-development:fcrww:key',
        status: 'connected',
        profile: 'real-development',
        version: 'v1',
        files: [
          {
            kind: 'wrapping',
            source: 'environment',
            variable: 'FCRWW_WRAPPING_KEY_V1',
            status: 'available',
            bytes: 32,
            fingerprint: 'b'.repeat(64),
          },
        ],
      })}
    />,
  );
  await screen.findByText('Server environment variable');
  assert.equal(screen.getAllByText('FCRWW_WRAPPING_KEY_V1').length, 2);
  assert.equal(screen.queryByText('File on API server'), null);
});
test('shows bound key files and fingerprints without rendering secret values', async () => {
  render(
    <TenantKeys
      environment="development"
      tenantId="fcrww"
      request={async (path) => {
        assert.equal(path, 'tenants/development/fcrww/keys');
        return {
          reference: 'real-development:fcrww:key',
          status: 'connected',
          profile: 'real-development',
          version: 'v1',
          files: [
            {
              kind: 'wrapping',
              path: '/private/fcrww/v1.key',
              filename: 'v1.key',
              status: 'available',
              bytes: 32,
              fingerprint: 'a'.repeat(64),
            },
          ],
        };
      }}
    />,
  );
  await screen.findByText('v1.key');
  assert.ok(screen.getByText('/private/fcrww/v1.key'));
  assert.ok(screen.getByText('a'.repeat(64)));
  assert.ok(screen.getByText(/Key values stay on the API server/));
});
test('shows an unbound reference instead of implying a key is connected', async () => {
  render(
    <TenantKeys
      environment="development"
      tenantId="fcrww"
      request={async () => ({
        reference: 'unknown:key',
        status: 'unbound',
        files: [],
      })}
    />,
  );
  await screen.findByText(/No key sources are bound/);
});
