import './dom.ts';
import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { ManagerInvitations } from '../src/components/manager-invitations.tsx';
test('invitation UI sends recipient then processes outbox and shows separate delivery status', async () => {
  const calls: { path: string; body?: unknown }[] = [];
  window.confirm = () => true;
  const item = {
    id: 'invite-id',
    recipient: { kind: 'email', email: 'new@example.ch' },
    state: 'pending',
    expiresAt: '2026-11-07T12:00:00Z',
    delivery: { status: 'accepted', attempts: 1 },
    bootstrap: true,
  };
  const request = async (path: string, options?: RequestInit) => {
    calls.push({
      path,
      body: options?.body ? JSON.parse(String(options.body)) : undefined,
    });
    return options?.method === 'POST' ? item : calls.length > 1 ? [item] : [];
  };
  try {
    render(
      <ManagerInvitations
        environment="development"
        tenantId="club"
        request={request}
      />,
    );
    fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), {
      target: { value: 'new@example.ch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Einladung senden' }));
    await waitFor(() =>
      assert.ok(calls.some((c) => c.path.endsWith('/invite-id/deliver'))),
    );
    assert.deepEqual(
      calls.find((c) => c.body && Object.keys(c.body as object).length)?.body,
      { kind: 'email', email: 'new@example.ch' },
    );
    await screen.findByText(/Versandstatus prüfen/);
    assert.ok(screen.getByText(/pending/));
  } finally {
    cleanup();
  }
});
