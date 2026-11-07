'use client';

import { useState } from 'react';
import type { Transport } from '../lib/api';
import { environments, type Tenant } from '../lib/types';
import { Dialog, ErrorText, Field, value } from './ui';

export function CreateTenant({
  request,
  onCreated,
  onClose,
}: {
  request: Transport;
  onCreated: (tenant: Tenant) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [tenantId, setTenantId] = useState(''),
    [stage, setStage] = useState('development');
  const [mongo, setMongo] = useState<string | undefined>(),
    [key, setKey] = useState<string | undefined>();
  const prefix = (
    {
      development: 'workflow-local',
      preview: 'preview',
      production: 'prod',
      test: 'test',
    } as Record<string, string>
  )[stage];
  return (
    <Dialog title="Create a tenant" onClose={onClose} busy={busy}>
      <p className="muted modal-intro">
        Start with a club’s identity and routing. New tenants stay in
        provisioning until you activate them.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError(undefined);
          try {
            const tenant = (await request('tenants', {
              method: 'POST',
              body: JSON.stringify({
                id: value(form, 'id'),
                environment: value(form, 'environment'),
                hostname: value(form, 'hostname'),
                aliases: [],
                public: {
                  name: value(form, 'name'),
                  locale: value(form, 'locale'),
                },
                identityRealm: value(form, 'realm'),
                secretReferences: {
                  mongoUri: value(form, 'mongo'),
                  key: value(form, 'key'),
                },
              }),
            })) as Tenant;
            onCreated(tenant);
          } catch (error) {
            setError(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <div className="form-grid">
            <Field
              label="Tenant ID"
              hint="Lowercase letters, numbers and hyphens."
            >
              <input
                name="id"
                onChange={(e) => setTenantId(e.target.value)}
                required
                pattern="[a-z0-9][a-z0-9-]*"
                maxLength={64}
                placeholder="fc-winikon"
              />
            </Field>
            <Field label="Environment">
              <select
                name="environment"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                {environments.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </Field>
            <Field label="Display name">
              <input
                name="name"
                required
                maxLength={256}
                placeholder="FC Winikon"
              />
            </Field>
            <Field label="Locale">
              <input
                name="locale"
                required
                defaultValue="de-CH"
                maxLength={35}
              />
            </Field>
            <div className="span-full">
              <Field
                label="Canonical hostname"
                hint="Hostname only. No https:// or path."
              >
                <input
                  name="hostname"
                  required
                  placeholder="club.kick-playr.ch"
                />
              </Field>
            </div>
            <div className="span-full">
              <Field
                label="Identity realm"
                hint="The club’s Clerk issuer, including https://."
              >
                <input
                  name="realm"
                  type="url"
                  required
                  placeholder="https://your-instance.clerk.accounts.dev"
                />
              </Field>
            </div>
            <Field
              label="MongoDB reference"
              hint="An opaque reference, never a connection URI."
            >
              <input
                name="mongo"
                value={mongo ?? (tenantId ? `${prefix}:${tenantId}:mongo` : '')}
                onChange={(e) => setMongo(e.target.value)}
                required
                placeholder="workflow-local:fc-winikon:mongo"
              />
            </Field>
            <Field
              label="Encryption key reference"
              hint="Reference to the club’s runtime key."
            >
              <input
                name="key"
                required
                value={key ?? (tenantId ? `${prefix}:${tenantId}:key` : '')}
                onChange={(e) => setKey(e.target.value)}
                placeholder="workflow-local:fc-winikon:key"
              />
            </Field>
          </div>
        </fieldset>
        {error ? <ErrorText error={error} /> : null}
        <footer className="form-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create provisioning tenant'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
