import { HtmlEmailEditor } from '../html-email-editor';
import { useState } from 'react';
import { Field } from '../ui';
import {
  EMAIL_EXAMPLES,
  EMAIL_VARIABLES,
  emailPreviewDocument,
  previewEmail,
} from '../../lib/email-content';
import type { SettingsSectionProps } from './types';
const templates = [
  {
    id: 'welcome',
    label: 'Welcome',
    subject: 'welcomeSubject',
    body: 'welcomeHtml',
    html: true,
    description:
      'Sent after membership registration and payment, with team and clothing information.',
  },
  {
    id: 'billing',
    label: 'Billing',
    subject: 'billingSubject',
    body: 'billingHtml',
    html: true,
    description:
      'Used for membership invoice emails. Invoice amounts and due dates are filled at runtime.',
  },
  {
    id: 'trial',
    label: 'Trial invitation',
    subject: 'trialSubject',
    body: 'trialBody',
    html: false,
    description:
      'Used when preparing a trial invitation. Team, training and contact details are filled at runtime.',
  },
] as const;
export function EmailContentSettings({
  draft,
  onChange,
  disabled,
}: SettingsSectionProps) {
  const [selected, setSelected] = useState<string>('welcome');
  const template = templates.find((t) => t.id === selected)!;
  const values: Record<string, string> = draft.emailContent
    ? JSON.parse(draft.emailContent)
    : {};
  if (!draft.emailContent)
    return (
      <p role="status">
        Email templates are unavailable for this club. Refresh after the tenant
        API is updated.
      </p>
    );
  function update(key: string, value: string) {
    onChange(
      'emailContent',
      JSON.stringify({ ...values, [key]: value }, null, 2),
    );
  }
  return (
    <section className="settings-group" aria-label="Email content">
      <h3>Email content</h3>
      <p className="muted">
        Changes take effect after saving. Previews use example data and do not
        send email.
      </p>
      <Field label="Email template">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {templates.map((t) => (
            <option value={t.id} key={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="muted">{template.description}</p>
      <Field
        label={`${template.label} subject`}
        hint="Single line, up to 128 characters."
      >
        <input
          value={values[template.subject] ?? ''}
          maxLength={128}
          onChange={(e) => update(template.subject, e.target.value)}
        />
      </Field>
      {template.html ? (
        <HtmlEmailEditor
          key={template.body}
          label={`${template.label} HTML`}
          value={values[template.body] ?? ''}
          onChange={(html) => update(template.body, html)}
          variables={EMAIL_VARIABLES[template.body]}
          disabled={disabled}
        />
      ) : (
        <Field
          label={`${template.label} text`}
          hint="Plain-text email body. Line breaks are preserved."
        >
          <textarea
            className="settings-json"
            rows={10}
            spellCheck={false}
            value={values[template.body] ?? ''}
            onChange={(e) => update(template.body, e.target.value)}
          />
        </Field>
      )}
      <details className="email-template-help">
        <summary>Supported placeholders</summary>
        <p>
          Use the exact name inside double braces, for example{' '}
          <code>{'{{firstName}}'}</code>.
        </p>
        <p>
          <strong>Subject:</strong>{' '}
          {EMAIL_VARIABLES[template.subject].map((name) => (
            <code key={name}>{`{{${name}}} `}</code>
          ))}
        </p>
        <table>
          <thead>
            <tr>
              <th>Body placeholder</th>
              <th>Example value</th>
            </tr>
          </thead>
          <tbody>
            {EMAIL_VARIABLES[template.body].map((name) => (
              <tr key={name}>
                <td>
                  <code>{`{{${name}}}`}</code>
                </td>
                <td>{EMAIL_EXAMPLES[name]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details className="email-template-preview">
        <summary>Preview with example data</summary>
        <p>
          <strong>Subject:</strong>{' '}
          {previewEmail(values[template.subject] ?? '')}
        </p>
        {template.html ? (
          <iframe
            title={`${template.label} email preview`}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={emailPreviewDocument(values[template.body] ?? '')}
          />
        ) : (
          <pre>{previewEmail(values[template.body] ?? '')}</pre>
        )}
      </details>
    </section>
  );
}
