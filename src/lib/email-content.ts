import { themeDefinitions } from './theme';
/** Sample data is synthetic. Previews never call providers or send email. */
export const EMAIL_EXAMPLES: Readonly<Record<string, string>> = {
  firstName: 'Alex Example',
  lastName: 'Sample',
  givenName: 'Alex',
  clubName: 'Example Club',
  clubShortName: 'EXC',
  teamName: 'Juniors E',
  trainerNames: 'Sam Coach',
  lastDay: '30.11.2026',
  shopName: 'Example Sports',
  contactEmail: 'club@example.invalid',
  shopMapsLink: 'https://example.invalid/shop',
  shopAddressLine: 'Example Street 1',
  shopMembershipSplit: '50%',
  shopArticle1: 'Shirt',
  shopArticle2: 'Shorts',
  shopArticle3: 'Socks',
  shopArticle4: 'Jacket',
  shopTeamlineDiscount: '20%',
  shopMembershipDiscount: '10%',
  shopOtherDiscount: '5%',
  voucherValidityDays: '30',
  amount: '120.00',
  dueDate: '30.11.2026',
  trialTeam: 'Juniors E',
  birthday: '01.01.2016',
  contactDetails: '- Kontakt: parent@example.invalid',
  teamLine: '- Team: Juniors E',
  nextTraining: '02.11.2026, 18:00',
  trainingLines: '- Monday, 18:00–19:30',
  trainerLines: '- Sam Coach: coach@example.invalid',
};
const common = ['firstName', 'lastName', 'clubName'];
export const EMAIL_VARIABLES = {
  welcomeSubject: common,
  welcomeHtml: [
    ...common,
    'teamName',
    'trainerNames',
    'lastDay',
    'shopName',
    'contactEmail',
    'shopMapsLink',
    'shopAddressLine',
    'shopMembershipSplit',
    'shopArticle1',
    'shopArticle2',
    'shopArticle3',
    'shopArticle4',
    'shopTeamlineDiscount',
    'shopMembershipDiscount',
    'shopOtherDiscount',
    'voucherValidityDays',
  ],
  billingSubject: common,
  billingHtml: [...common, 'amount', 'dueDate'],
  trialSubject: [...common, 'clubShortName', 'trialTeam'],
  trialBody: [
    ...common,
    'clubShortName',
    'trialTeam',
    'givenName',
    'birthday',
    'contactDetails',
    'teamLine',
    'nextTraining',
    'trainingLines',
    'trainerNames',
    'trainerLines',
  ],
} as const;
export function validateEmailTemplate(key: string, value: string) {
  const variables: readonly string[] | undefined =
    EMAIL_VARIABLES[key as keyof typeof EMAIL_VARIABLES];
  if (!variables) throw Error('Email content: unsupported template field.');
  if (!value.trim() || new TextEncoder().encode(value).length > 65536)
    throw Error(
      'Email content: each template is required and must be at most 64 KiB.',
    );
  if (
    key.endsWith('Subject') &&
    (value.length > 128 || /[\r\n\x00-\x1f\x7f]/.test(value))
  )
    throw Error(
      'Email content: subjects must be a single line of at most 128 characters.',
    );
  const remainder = value.replace(/\{\{([\s\S]*?)\}\}/g, (_, name: string) => {
    if (!variables.includes(name))
      throw Error(
        `Email content: unsupported placeholder {{${name}}} in ${key}.`,
      );
    return '';
  });
  if (remainder.includes('{{') || remainder.includes('}}'))
    throw Error('Email content: check placeholder braces.');
}
export function previewEmail(template: string, html = false) {
  return template.replace(
    /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g,
    (_, key: string) => {
      const value = EMAIL_EXAMPLES[key] ?? `[${key}]`;
      return html
        ? value.replace(
            /[&<>"']/g,
            (c) =>
              ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
              })[c]!,
          )
        : value;
    },
  );
}
export function emailPreviewDocument(template: string) {
  const paper = themeDefinitions.find((theme) => theme.id === 'white')!.palette;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>body{font:14px/1.5 sans-serif;padding:12px;color:${paper.text};background:${paper.surface};overflow-wrap:anywhere}a{pointer-events:none}</style></head><body>${previewEmail(template, true)}</body></html>`;
}
