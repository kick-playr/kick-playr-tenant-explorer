'use client';
import { useId, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Field, Badge } from '../ui';
import { IntegrationMailSettings } from '../integration-mail-settings';
import { IntegrationClientSettings } from '../integration-client-settings';
import type { Connection, IntegrationActions } from './types';
export function IntegrationConnectionCard({
  connection: c,
  path,
  busy,
  onConnect,
  onToggle,
  onSave,
  onDirtyChange,
}: IntegrationActions & { connection: Connection }) {
  const [expanded, setExpanded] = useState(false);
  const settingsId = useId();
  const connectionLabel = `${c.provider} ${c.id}`;
  return (
    <article
      className="record integration-connection-card"
      key={`${path}/${c.id}/${c.revision}`}
    >
      <div>
        <strong>
          {c.provider} · {c.id}
        </strong>
        <p className="muted">{c.accountReference}</p>
        <Badge value={c.status} />
        {c.canConnect && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void onConnect(c)}
          >
            Reconnect {c.provider}
          </button>
        )}
        {c.canToggle && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void onToggle(c)}
          >
            {c.status === 'active' ? 'Disable' : 'Enable'} {c.provider}
          </button>
        )}
        <button
          type="button"
          className="button secondary integration-disclosure"
          aria-label={`${expanded ? 'Hide' : 'Show'} settings for ${connectionLabel}`}
          aria-expanded={expanded}
          aria-controls={settingsId}
          disabled={busy}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDownIcon aria-hidden="true" />
          {expanded ? 'Hide settings' : 'Show settings'}
        </button>
        <div
          id={settingsId}
          role="region"
          aria-label={`Settings for ${connectionLabel}`}
          className="integration-settings-region"
          hidden={!expanded}
        >
          <fieldset disabled={busy || !expanded}>
            {c.mail && (c.provider === 'smtp' || c.provider === 'imap') && (
              <IntegrationMailSettings
                configuration={c.mail}
                provider={c.provider}
                active={c.status === 'active'}
                busy={busy}
                onDirtyChange={(dirty) => onDirtyChange(c.id, dirty)}
                onSave={(secret) => onSave(c, secret)}
              />
            )}
            {c.oauth && (
              <IntegrationClientSettings
                configuration={c.oauth}
                busy={busy}
                onDirtyChange={(dirty) => onDirtyChange(c.id, dirty)}
                onSave={(secret) => onSave(c, secret)}
              />
            )}
            {c.secretFields.length > 0 &&
              (c.status === 'active' ? (
                <p className="muted">
                  Disable this connection before replacing its credentials.
                </p>
              ) : (
                <form
                  onChange={() => onDirtyChange(c.id, true)}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      data = new FormData(form),
                      secret = Object.fromEntries(
                        c.secretFields.map((key) => [
                          key,
                          String(data.get(key) ?? ''),
                        ]),
                      );
                    try {
                      await onSave(c, secret);
                    } finally {
                      form.reset();
                      onDirtyChange(c.id, false);
                    }
                  }}
                >
                  <fieldset disabled={busy}>
                    {c.secretFields.map((key) => (
                      <Field
                        key={key}
                        label={
                          key === 'password'
                            ? 'New password'
                            : key === 'webhookSecret'
                              ? 'New webhook secret'
                              : 'New access token'
                        }
                      >
                        <input
                          name={key}
                          type="password"
                          autoComplete="new-password"
                          required
                          maxLength={16384}
                        />
                      </Field>
                    ))}
                    <button className="button primary" disabled={busy}>
                      Replace credentials
                    </button>
                  </fieldset>
                </form>
              ))}
          </fieldset>
        </div>
      </div>
    </article>
  );
}
