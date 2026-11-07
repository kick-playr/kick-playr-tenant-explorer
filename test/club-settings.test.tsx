import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ClubSettingsEditor } from '../src/components/club-settings-editor.tsx';
const snapshot = {
  id: 42,
  hash: 'before',
  currentSaison: '26.1',
  avatarInitialsMaxChars: 4,
  responsiblePerson: { finance: 'Finance contact' },
  shops: [{ id: 'club-shop', name: 'Club shop', active: true }],
  cutOffDates: [
    {
      from: '01-01',
      toExcluded: '12-32',
      discount: 0,
      createBill: true,
      sendBill: false,
      isRenewal: false,
    },
  ],
  workflow: { domain: { clubName: 'Protected runtime' } },
};
afterEach(cleanup);
test('edits nested settings and sends only changed writable values with the snapshot hash', async () => {
  let body: unknown;
  render(
    <ClubSettingsEditor
      settings={snapshot}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async (patch) => {
        body = patch;
        return true;
      }}
    />,
  );
  assert.equal(
    (screen.getByLabelText('Avatar initials') as HTMLSelectElement).value,
    '4',
  );
  fireEvent.click(screen.getByRole('button', { name: 'People & shops' }));
  fireEvent.change(screen.getByLabelText('Responsible people'), {
    target: { value: '{"finance":"New contact"}' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  await screen.findByRole('button', { name: 'Save club settings' });
  assert.deepEqual(body, {
    expectedHash: 'before',
    patch: { responsiblePerson: { finance: 'New contact' } },
  });
  assert.equal(screen.queryByLabelText('workflow'), null);
  assert.ok(screen.getByText('All settings (read only)'));
});
test('invalid nested JSON blocks writes and keeps the draft', async () => {
  let called = false;
  render(
    <ClubSettingsEditor
      settings={snapshot}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async () => {
        called = true;
        return true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'People & shops' }));
  fireEvent.change(screen.getByLabelText('Shops'), {
    target: { value: '{bad' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  await screen.findByRole('alert');
  assert.equal(
    screen
      .getByRole('button', { name: 'People & shops' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(called, false);
  assert.equal(
    (screen.getByLabelText('Shops') as HTMLTextAreaElement).value,
    '{bad',
  );
});
test('normalizes generated cutoff metadata and preserves unsaved changes after a rejected save', async () => {
  let body: unknown;
  render(
    <ClubSettingsEditor
      settings={snapshot}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async (patch) => {
        body = patch;
        return false;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
  const input = screen.getByLabelText(
    'Discount (%) for deadline 1',
  ) as HTMLInputElement;
  assert.equal(input.value, '0');
  assert.match(
    screen.getByLabelText('Complete club settings snapshot').textContent ?? '',
    /toExcluded/,
  );
  const cutoffs = snapshot.cutOffDates.map(({ toExcluded, ...entry }) => {
    void toExcluded;
    return entry;
  });
  cutoffs[0]!.discount = 25;
  fireEvent.change(input, { target: { value: '25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  assert.deepEqual(body, {
    expectedHash: 'before',
    patch: { cutOffDates: cutoffs },
  });
  assert.ok(input.value.includes('25'));
  fireEvent.click(screen.getByRole('button', { name: 'Reset changes' }));
  assert.ok(!input.value.includes('25'));
});

test('second-level menus switch sections without losing drafts and save changes across sections', async () => {
  let body: unknown;
  render(
    <ClubSettingsEditor
      settings={snapshot}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async (value) => {
        body = value;
        return true;
      }}
    />,
  );
  const menu = screen.getByRole('navigation', { name: 'Settings sections' });
  assert.ok(menu);
  assert.equal(
    screen
      .getByRole('button', { name: 'Seasons & membership' })
      .getAttribute('aria-pressed'),
    'true',
  );
  fireEvent.change(screen.getByLabelText('Current season'), {
    target: { value: '26.2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  assert.equal(
    screen
      .getByRole('button', { name: 'Appearance' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    (screen.getByLabelText('Current season') as HTMLInputElement).closest(
      'fieldset',
    )?.disabled,
    true,
  );
  fireEvent.change(screen.getByLabelText('Avatar initials'), {
    target: { value: '2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Seasons & membership' }));
  assert.equal(
    (screen.getByLabelText('Current season') as HTMLInputElement).value,
    '26.2',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  assert.deepEqual(body, {
    expectedHash: 'before',
    patch: { currentSaison: '26.2', avatarInitialsMaxChars: 2 },
  });
});

const emailTemplates = {
  welcomeSubject: 'Welcome {{firstName}}',
  welcomeHtml: '<p>{{firstName}}: {{shopArticle1}}</p>',
  billingSubject: 'Invoice {{lastName}}',
  billingHtml: '<p>{{amount}}</p>',
  trialSubject: 'Trial {{trialTeam}}',
  trialBody: 'Hello {{givenName}}\n{{trainingLines}}',
};
test('email content preserves drafts and sends only changed template fields with the revision', async () => {
  let body: unknown;
  render(
    <ClubSettingsEditor
      settings={{ ...snapshot, emailTemplates }}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async (value) => {
        body = value;
        return true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Email content' }));
  fireEvent.change(screen.getByLabelText('Welcome subject'), {
    target: { value: 'Hello {{firstName}}' },
  });
  fireEvent.change(screen.getByLabelText('Email template'), {
    target: { value: 'trial' },
  });
  assert.equal(
    (screen.getByLabelText('Trial invitation text') as HTMLTextAreaElement)
      .value,
    emailTemplates.trialBody,
  );
  fireEvent.change(screen.getByLabelText('Trial invitation text'), {
    target: { value: 'Welcome {{givenName}}' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Seasons & membership' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  assert.deepEqual(body, {
    expectedHash: 'before',
    patch: {
      emailContent: {
        welcomeSubject: 'Hello {{firstName}}',
        trialBody: 'Welcome {{givenName}}',
      },
    },
  });
});
test('email previews isolate HTML and use example data rather than executing or sending it', () => {
  render(
    <ClubSettingsEditor
      settings={{ ...snapshot, emailTemplates }}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async () => true}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Email content' }));
  const frame = screen.getByTitle('Welcome email preview');
  assert.equal(frame.getAttribute('sandbox'), '');
  assert.equal(frame.getAttribute('referrerpolicy'), 'no-referrer');
  assert.match(frame.getAttribute('srcdoc')!, /default-src 'none'/);
  assert.match(frame.getAttribute('srcdoc')!, /Alex Example: Shirt/);
  assert.doesNotMatch(frame.getAttribute('srcdoc')!, /\{\{shopArticle1\}\}/);
});
test('invalid email placeholders prevent saving and reveal the email section', () => {
  let saves = 0;
  render(
    <ClubSettingsEditor
      settings={{ ...snapshot, emailTemplates }}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async () => {
        saves++;
        return true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Email content' }));
  fireEvent.change(screen.getByLabelText('Welcome subject'), {
    target: { value: '{{amount}}' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Seasons & membership' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  assert.equal(saves, 0);
  assert.equal(
    screen
      .getByRole('button', { name: 'Email content' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.match(
    screen.getByRole('alert').textContent!,
    /unsupported placeholder/,
  );
});

test('retired kiosk settings stay outside writable drafts and cannot be reinstated', async () => {
  const { settingsDraft, settingsPatch, SETTINGS_GROUPS } =
    await import('../src/lib/club-settings.ts');
  const legacy = {
    ...snapshot,
    matrixKioskRoomId: '!legacy:example.test',
    responsiblePerson: { finance: 'Finance', kiosk: 'Legacy' },
  };
  const draft = settingsDraft(legacy);
  assert.equal(draft.matrixKioskRoomId, undefined);
  assert.deepEqual(JSON.parse(draft.responsiblePerson!), {
    finance: 'Finance',
  });
  assert.ok(
    !SETTINGS_GROUPS.flatMap((g) => g.fields).some((f) =>
      /kiosk/i.test(f.key + f.label + f.hint),
    ),
  );
  assert.throws(
    () =>
      settingsPatch(legacy, {
        ...draft,
        responsiblePerson: JSON.stringify({ finance: 'Finance', kiosk: 'New' }),
      }),
    /unsupported/i,
  );
  assert.equal(legacy.responsiblePerson.kiosk, 'Legacy');
});

test('operational settings step seasons and membership together and preserve other season dates', async () => {
  let body: unknown;
  render(
    <ClubSettingsEditor
      settings={{
        ...snapshot,
        currentSaison: '26.2',
        nextSaison: '26.2',
        billingSaison: '26.2',
        currentMembershipYear: '2027',
        currentMembershipSeason: '2026/2027',
        seasons: {
          '26.2': { startDate: '2026-08-17', endDate: '2026-12-19' },
          '26.1': { startDate: '2026-01-01', endDate: '2026-07-01' },
        },
      }}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async (value) => {
        body = value;
        return true;
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Previous membership year' }),
  );
  assert.equal(
    (screen.getByLabelText('Membership year') as HTMLInputElement).value,
    '2026',
  );
  assert.equal(
    (screen.getByLabelText('Membership season') as HTMLInputElement).value,
    '2025/2026',
  );
  fireEvent.change(screen.getByLabelText('Season start date'), {
    target: { value: '2026-08-18' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  await screen.findByRole('button', { name: 'Save club settings' });
  const saved = body as {
    expectedHash: string;
    patch: {
      seasons: Record<string, { startDate: string; endDate: string }>;
      currentMembershipYear: string;
      currentMembershipSeason: string;
    };
  };
  assert.equal(saved.expectedHash, 'before');
  assert.deepEqual(saved.patch.seasons['26.1'], {
    startDate: '2026-01-01',
    endDate: '2026-07-01',
  });
  assert.equal(saved.patch.seasons['26.2']!.startDate, '2026-08-18');
  assert.equal(saved.patch.currentMembershipYear, '2026');
  assert.equal(saved.patch.currentMembershipSeason, '2025/2026');
  fireEvent.click(screen.getByRole('button', { name: 'Advance season' }));
  assert.equal(
    (screen.getByLabelText('Current season') as HTMLInputElement).value,
    '27.1',
  );
  assert.equal(
    (screen.getByLabelText('Next season') as HTMLInputElement).value,
    '27.2',
  );
  assert.equal(
    (screen.getByLabelText('Billing season') as HTMLInputElement).value,
    '27.2',
  );
});

test('deadline cards preview contributions and validate day-month dates before saving', async () => {
  let body: unknown,
    saves = 0;
  render(
    <ClubSettingsEditor
      settings={{
        ...snapshot,
        cutOffDates: [
          {
            from: '01-01',
            discount: 0,
            createBill: true,
            sendBill: true,
            isRenewal: false,
          },
          {
            from: '05-01',
            discount: 70,
            createBill: false,
            sendBill: false,
            isRenewal: true,
            validFrom: '09-01',
            validTo: '09-30',
          },
        ],
      }}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async (value) => {
        body = value;
        saves++;
        return false;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
  const chart = screen.getByRole('img', {
    name: 'Annual membership contribution after discount',
  });
  assert.match(chart.textContent ?? '', /1\.5\.: 30% contribution/);
  fireEvent.change(screen.getByLabelText('Send until for deadline 2'), {
    target: { value: '31.2.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  assert.equal(saves, 0);
  assert.match(screen.getByRole('alert').textContent ?? '', /check dates/);
  fireEvent.change(screen.getByLabelText('Send until for deadline 2'), {
    target: { value: '30.9.' },
  });
  fireEvent.change(screen.getByLabelText('Discount starts for deadline 2'), {
    target: { value: '1.6.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  assert.equal(saves, 1);
  const saved = body as { patch: { cutOffDates: Record<string, unknown>[] } };
  assert.equal(saved.patch.cutOffDates[1]!.from, '06-01');
  assert.equal(saved.patch.cutOffDates[1]!.validTo, '09-30');
  assert.equal(saved.patch.cutOffDates[1]!.validFrom, '09-01');
  assert.equal(saved.patch.cutOffDates[1]!.isRenewal, true);
  assert.equal(saved.patch.cutOffDates[1]!.toExcluded, undefined);
});
