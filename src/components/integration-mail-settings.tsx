'use client';
import { useState, type FormEvent } from 'react';
import { Field, Notice } from './ui';
export interface MailConfiguration {
  host: string;
  port: number;
  user: string;
  hasPassword: boolean;
  allowedHosts: string[];
  fromAddress?: string;
  inbox?: string;
  archive?: string;
}
export function IntegrationMailSettings({
  configuration,
  provider,
  active,
  busy,
  onDirtyChange,
  onSave,
}: {
  configuration: MailConfiguration;
  provider: 'smtp' | 'imap';
  active: boolean;
  busy: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (secret: Record<string, unknown>) => Promise<boolean>;
}) {
  const [host, setHost] = useState(configuration.host),
    [port, setPort] = useState(configuration.port),
    [user, setUser] = useState(configuration.user),
    [password, setPassword] = useState(''),
    [inbox, setInbox] = useState(configuration.inbox ?? 'INBOX'),
    [archive, setArchive] = useState(configuration.archive ?? 'Archive');
  const [error, setError] = useState('');
  const changed = (
    next: Partial<{
      host: string;
      port: number;
      user: string;
      password: string;
      inbox: string;
      archive: string;
    }>,
  ) => {
    const value = { host, port, user, password, inbox, archive, ...next };
    onDirtyChange(
      value.host !== configuration.host ||
        value.port !== configuration.port ||
        value.user !== configuration.user ||
        !!value.password ||
        (provider === 'imap' &&
          (value.inbox !== (configuration.inbox ?? 'INBOX') ||
            value.archive !== (configuration.archive ?? 'Archive'))),
    );
  };
  const dirty =
    host !== configuration.host ||
    port !== configuration.port ||
    user !== configuration.user ||
    !!password ||
    (provider === 'imap' &&
      (inbox !== configuration.inbox || archive !== configuration.archive));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || active || !dirty) return;
    setError('');
    if (provider === 'imap' && inbox === archive) {
      setError('Inbox and archive folders must be different.');
      return;
    }
    let saved = false;
    try {
      saved = await onSave({
        host,
        port,
        user,
        ...(password ? { password } : {}),
        ...(provider === 'imap' ? { inbox, archive } : {}),
      });
    } finally {
      setPassword('');
      if (saved) onDirtyChange(false);
      else changed({ password: '' });
    }
  }
  return (
    <form className="integration-client-settings" onSubmit={save}>
      <h3>{provider.toUpperCase()} settings</h3>
      <p className="muted">
        {configuration.hasPassword
          ? 'Password configured.'
          : 'No password configured.'}{' '}
        Stored passwords are never displayed.
      </p>
      {active && (
        <p className="muted">
          Disable this connection before editing its settings.
        </p>
      )}
      {!configuration.allowedHosts.length && (
        <Notice>
          No mail hosts are configured for this provider. An operator must
          configure the server allowlist first.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      <fieldset disabled={busy || active}>
        <Field label="Mail server">
          <select
            value={host}
            required
            onChange={(e) => {
              setHost(e.target.value);
              changed({ host: e.target.value });
            }}
          >
            <option value="">Select a server</option>
            {configuration.allowedHosts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="TLS port">
          <select
            value={port}
            onChange={(e) => {
              const value = Number(e.target.value);
              setPort(value);
              changed({ port: value });
            }}
          >
            {(provider === 'smtp' ? [465, 587] : [993]).map((value) => (
              <option value={value} key={value}>
                {value} ({value === 587 ? 'STARTTLS' : 'TLS'})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Username">
          <input
            value={user}
            required
            maxLength={4096}
            autoComplete="off"
            onChange={(e) => {
              setUser(e.target.value);
              changed({ user: e.target.value });
            }}
          />
        </Field>
        <Field
          label="New password"
          hint={
            configuration.hasPassword
              ? 'Leave blank to keep the configured password.'
              : 'Required for initial setup.'
          }
        >
          <input
            type="password"
            value={password}
            required={!configuration.hasPassword}
            maxLength={4096}
            autoComplete="new-password"
            onChange={(e) => {
              setPassword(e.target.value);
              changed({ password: e.target.value });
            }}
          />
        </Field>
        {provider === 'smtp' ? (
          <Field
            label="Sender address"
            hint="The sender identity is managed by the server."
          >
            <input readOnly value={configuration.fromAddress ?? ''} />
          </Field>
        ) : (
          <>
            <Field label="Inbox folder">
              <input
                required
                value={inbox}
                maxLength={512}
                onChange={(e) => {
                  setInbox(e.target.value);
                  changed({ inbox: e.target.value });
                }}
              />
            </Field>
            <Field label="Archive folder">
              <input
                required
                value={archive}
                maxLength={512}
                onChange={(e) => {
                  setArchive(e.target.value);
                  changed({ archive: e.target.value });
                }}
              />
            </Field>
          </>
        )}
        <button
          className="button primary"
          disabled={
            busy || active || !dirty || !configuration.allowedHosts.length
          }
        >
          Save mail settings
        </button>
        <p className="muted">
          Saving does not send mail or enable the connection. Enable it
          separately when ready.
        </p>
      </fieldset>
    </form>
  );
}
