'use client';
import { useState, type FormEvent } from 'react';
import { Field, Notice } from './ui';
export interface OAuthSettings {
  clientId: string;
  hasClientSecret: boolean;
  pendingReconnect: boolean;
  callbackUrl?: string;
}
export function IntegrationClientSettings({
  configuration,
  busy,
  onDirtyChange,
  onSave,
}: {
  configuration: OAuthSettings;
  busy: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (secret: {
    clientId: string;
    clientSecret?: string;
  }) => Promise<boolean>;
}) {
  const [clientId, setClientId] = useState(configuration.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');
  const dirty = clientId !== configuration.clientId || clientSecret !== '';
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setError('');
    if (clientId !== configuration.clientId && !clientSecret.trim()) {
      setError('Provide the client secret when changing the client ID.');
      return;
    }
    let saved = false;
    try {
      saved = await onSave({
        clientId,
        ...(clientSecret ? { clientSecret } : {}),
      });
    } finally {
      setClientSecret('');
      onDirtyChange(!saved && clientId !== configuration.clientId);
    }
  }
  return (
    <form className="integration-client-settings" onSubmit={save}>
      <h3>OAuth client settings</h3>
      <p className="muted">
        {configuration.hasClientSecret
          ? 'Client secret configured.'
          : 'No client secret configured.'}{' '}
        Stored secrets are never displayed.
      </p>
      {configuration.pendingReconnect && (
        <Notice>
          New client settings are saved. Reconnect this integration to apply
          them.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      <fieldset disabled={busy}>
        <Field label="Client ID">
          <input
            value={clientId}
            required
            maxLength={16384}
            onChange={(e) => {
              setClientId(e.target.value);
              onDirtyChange(
                e.target.value !== configuration.clientId || !!clientSecret,
              );
            }}
          />
        </Field>
        <Field
          label="New client secret"
          hint="Leave blank to keep the configured secret. Changing the client ID requires its matching secret."
        >
          <input
            type="password"
            autoComplete="new-password"
            maxLength={16384}
            value={clientSecret}
            onChange={(e) => {
              setClientSecret(e.target.value);
              onDirtyChange(
                clientId !== configuration.clientId || !!e.target.value,
              );
            }}
          />
        </Field>
        {configuration.callbackUrl && (
          <Field
            label="Callback URL"
            hint="Register this exact URL in your provider’s OAuth application."
          >
            <input readOnly value={configuration.callbackUrl} />
          </Field>
        )}
        <button className="button primary" disabled={busy || !dirty}>
          Save client settings
        </button>
        <p className="muted">
          Saved client settings take effect after a successful reconnect. The
          current connection stays available until then.
        </p>
      </fieldset>
    </form>
  );
}
