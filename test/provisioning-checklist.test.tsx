import './dom.ts';
import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from '@testing-library/react';
import { ProvisioningChecklist } from '../src/components/provisioning-checklist.tsx';
test('checklist separates topic, description and concrete actions and keeps completion controls accessible', () => {
  const changes: string[][] = [];
  try {
    const view = render(
      <ProvisioningChecklist
        steps={[
          {
            id: 'clerk',
            title: 'Clerk-Anwendung erstellen',
            instructions: 'Legacy text',
            description: 'Anmeldung für diesen Verein vorbereiten.',
            actions: [
              'Anwendung im Clerk-Dashboard erstellen.',
              'APP-Origin und Weiterleitungen eintragen.',
            ],
          },
        ]}
        checked={[]}
        disabled={false}
        onChange={(value) => changes.push(value)}
      />,
    );
    const row = screen
      .getByRole('heading', { name: 'Clerk-Anwendung erstellen' })
      .closest('li')!;
    assert.ok(
      within(row)
        .getByRole('heading', { name: 'Clerk-Anwendung erstellen' })
        .querySelector('strong'),
    );
    assert.ok(
      within(row).getByText('Anmeldung für diesen Verein vorbereiten.'),
    );
    assert.ok(within(row).getByText('Anwendung im Clerk-Dashboard erstellen.'));
    assert.equal(within(row).queryByText('Legacy text'), null);
    const checkbox = screen.getByRole('checkbox', {
      name: 'Clerk-Anwendung erstellen: manuell erledigt',
    });
    fireEvent.click(checkbox);
    assert.deepEqual(changes, [['clerk']]);
    view.rerender(
      <ProvisioningChecklist
        steps={[
          {
            id: 'clerk',
            title: 'Clerk-Anwendung erstellen',
            instructions: 'Legacy text',
          },
        ]}
        checked={['clerk']}
        disabled={true}
        onChange={(value) => changes.push(value)}
      />,
    );
    assert.ok((screen.getByRole('checkbox') as HTMLInputElement).checked);
    assert.ok((screen.getByRole('checkbox') as HTMLInputElement).disabled);
    assert.ok(screen.getByText('Legacy text'));
  } finally {
    cleanup();
  }
});
