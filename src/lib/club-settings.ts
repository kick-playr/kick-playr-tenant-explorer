import { normalizeDeadlines } from './billing-deadlines';
import { validateBranding } from './club-branding';
import { validateEmailTemplate } from './email-content';
export interface ClubSettingsSnapshot extends Record<string, unknown> {
  hash: string;
}
type Kind = 'text' | 'number' | 'date' | 'object' | 'array' | 'select';
export interface SettingField {
  key: string;
  label: string;
  kind: Kind;
  choices?: readonly string[];
  hint?: string;
}
const field = (
  key: string,
  label: string,
  kind: Kind = 'text',
  hint?: string,
): SettingField => ({ key, label, kind, hint });
export const SETTINGS_GROUPS: readonly {
  id: string;
  title: string;
  fields: readonly SettingField[];
}[] = [
  {
    id: 'seasons',
    title: 'Seasons and membership',
    fields: [
      field('currentSaison', 'Current season', 'text', 'For example: 26.1'),
      field('nextSaison', 'Next season'),
      field('billingSaison', 'Billing season'),
      field(
        'currentMembershipYear',
        'Membership year',
        'text',
        'Four digits, for example: 2026',
      ),
      field(
        'currentMembershipSeason',
        'Membership season',
        'text',
        'For example: 2026/2027',
      ),
      field('membershipStartDate', 'Membership start date', 'date'),
      field('billSearchMonths', 'Bill search months', 'number'),
      field('defaultBillingTimeInDays', 'Payment period in days', 'number'),
      field('defaultBillWaitTimeInDays', 'Reminder wait in days', 'number'),
      field(
        'seasons',
        'Season dates',
        'object',
        'Season IDs mapped to startDate and endDate (YYYY-MM-DD).',
      ),
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    fields: [
      field('branding', 'Club branding', 'object'),
      {
        ...field('useIdenticons', 'Use generated club avatars', 'select'),
        choices: ['true', 'false'],
      },
      {
        ...field('avatarInitialsMaxChars', 'Avatar initials', 'select'),
        choices: ['2', '4'],
      },
      {
        ...field('chatAvatarColorMode', 'Chat avatar colors', 'select'),
        choices: ['room-type', 'mixed'],
      },
      {
        ...field('avatarGenerator', 'Avatar generator', 'select'),
        choices: ['jdenticon', 'blockies'],
      },
    ],
  },
  {
    id: 'people',
    title: 'People and shops',
    fields: [
      field(
        'responsiblePerson',
        'Responsible people',
        'object',
        'Contact references for finance, president, juniors, vice, admin and voucher.',
      ),
      field(
        'shops',
        'Shops',
        'array',
        'A JSON list of shop records. Existing shop fields are shown below.',
      ),
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    fields: [
      field(
        'cutOffDates',
        'Billing deadlines',
        'array',
        'Deadlines use MM-DD dates. Generated end boundaries are managed by the API.',
      ),
    ],
  },
  {
    id: 'trials',
    title: 'Trials and vouchers',
    fields: [
      field(
        'trial',
        'Trial settings',
        'object',
        'greenMaxDays and orangeMaxDays are non-negative whole numbers.',
      ),
      field(
        'voucher',
        'Voucher settings',
        'object',
        'searchMonths, validityDays and expiredVisibilityDays are non-negative whole numbers.',
      ),
    ],
  },
  {
    id: 'email',
    title: 'Email content',
    fields: [field('emailContent', 'Email content', 'object')],
  },
  {
    id: 'chat',
    title: 'Chat rooms',
    fields: [
      field('matrixAdminRoomId', 'Administrator room'),
      field('matrixBoardMembersRoomId', 'Board members room'),
      field('matrix1418CoachRoomId', '1418 coach room'),
      field('matrixTrainersRoomId', 'Trainers room'),
    ],
  },
];
export function writableValue(
  settings: ClubSettingsSnapshot,
  key: string,
): unknown {
  const value =
    key === 'emailContent' ? settings.emailTemplates : settings[key];
  if (key === 'responsiblePerson' && value && typeof value === 'object' && !Array.isArray(value)) {
    const source = { ...(value as Record<string, unknown>) };
    delete source.kiosk;
    return source;
  }
  if (key === 'cutOffDates' && Array.isArray(value))
    return value.map((item) => {
      const source = { ...(item as Record<string, unknown>) };
      delete source.toExcluded;
      return source;
    });
  return value;
}
export function settingText(value: unknown): string {
  return value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value, null, 2)
      : String(value);
}
export function settingsDraft(
  settings: ClubSettingsSnapshot,
): Record<string, string> {
  return Object.fromEntries(
    SETTINGS_GROUPS.flatMap((group) =>
      group.fields.map((f) => [
        f.key,
        settingText(writableValue(settings, f.key)),
      ]),
    ),
  );
}
export function settingsPatch(
  settings: ClubSettingsSnapshot,
  draft: Record<string, string>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const group of SETTINGS_GROUPS)
    for (const f of group.fields) {
      const text = draft[f.key] ?? '',
        original = writableValue(settings, f.key);
      if (text === settingText(original)) continue;
      if (!text.trim() && original === undefined) continue;
      let value: unknown = text;
      if (f.kind === 'object' || f.kind === 'array') {
        try {
          value = JSON.parse(text);
        } catch {
          throw Error(`${f.label}: enter valid JSON.`);
        }
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) !== (f.kind === 'array')
        )
          throw Error(
            `${f.label}: enter a JSON ${f.kind === 'array' ? 'list' : 'object'}.`,
          );
      } else if (f.kind === 'number' || f.key === 'avatarInitialsMaxChars') {
        value = Number(text);
        if (!text.trim() || !Number.isSafeInteger(value) || Number(value) < 0)
          throw Error(`${f.label}: enter a non-negative whole number.`);
      } else if (f.key === 'useIdenticons') {
        if (!['true', 'false'].includes(text))
          throw Error(`${f.label}: select a value.`);
        value = text === 'true';
      }
      if (f.choices && !f.choices.includes(text))
        throw Error(`${f.label}: select a supported value.`);
      if (f.key === 'responsiblePerson' && Object.prototype.hasOwnProperty.call(value, 'kiosk'))
        throw Error('Responsible people: unsupported role.');
      if (f.key === 'branding') validateBranding(value);
      if (f.key === 'emailContent') {
        const changed: Record<string, string> = {};
        for (const [key, template] of Object.entries(
          value as Record<string, unknown>,
        )) {
          if (typeof template !== 'string')
            throw Error('Email content: enter text for each template.');
          if (
            template ===
            (original as Record<string, unknown> | undefined)?.[key]
          )
            continue;
          validateEmailTemplate(key, template);
          changed[key] = template;
        }
        if (Object.keys(changed).length) patch.emailContent = changed;
      } else if (f.key === 'cutOffDates') {
        patch[f.key] = normalizeDeadlines(value);
      } else if (JSON.stringify(value) !== JSON.stringify(original))
        patch[f.key] = value;
    }
  if (
    new TextEncoder().encode(
      JSON.stringify({ expectedHash: settings.hash, patch }),
    ).length > 65536
  )
    throw Error(
      'Club settings: this update is too large. Save fewer changes at once.',
    );
  return patch;
}
