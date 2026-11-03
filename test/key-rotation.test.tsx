import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, cleanup } from '@testing-library/react';
import { TenantKeyRotation } from '../src/components/tenant-key-rotation';
afterEach(cleanup);
test('shows persisted migration stage/counts and scope, never plaintext or invented percentage', async () => {
  render(
    <TenantKeyRotation
      environment="development"
      tenantId="club"
      request={async () => ({
        rotation: {
          operationId: 'a'.repeat(64),
          scope: { environment: 'development', tenant: 'club' },
          stage: 'waiting-expiry',
          completed: 12,
          waitUntil: Date.now() + 1000,
          privateValue: 'DO_NOT_RENDER',
        },
      })}
    />,
  );
  await screen.findByText(/Waiting for existing approvals and guards to expire/);
  assert.ok(screen.getByText(/12 records processed/));
  assert.equal(screen.queryByText(/DO_NOT_RENDER/), null);
  assert.equal(screen.queryByText(/%/), null);
});
test('rejects cross-tenant progress instead of exposing another tenant operation', async () => {
  render(
    <TenantKeyRotation
      environment="development"
      tenantId="club"
      request={async () => ({
        rotation: {
          operationId: 'a'.repeat(64),
          scope: { environment: 'development', tenant: 'other' },
          stage: 'completed',
          completed: 0,
        },
      })}
    />,
  );
  await screen.findByText(/Key rotation status is unavailable/);
});
