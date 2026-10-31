'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { ApiError, tenantPath, type Transport } from '../lib/api';
import {
  providers,
  statuses,
  type AuditEvent,
  type Integration,
  type Tenant,
  type UserGrant,
} from '../lib/types';
import {
  Badge,
  Dialog,
  ErrorText,
  Field,
  lines,
  Notice,
  PanelHeading,
  value,
} from './ui';
import { TenantKeys } from './tenant-keys';
import {
  tenantAdministratorPermissions,
  hasTenantAdministratorPermissions,
} from '../lib/tenant-permissions';

const tabs = [
  'Overview',
  'Domains',
  'Configuration',
  'Keys',
  'Integrations',
  'Credentials',
  'Users',
  'Audit',
] as const;
type Tab = (typeof tabs)[number];
type Mutate = (
  suffix: string,
  method: string,
  body: Record<string, unknown>,
) => Promise<boolean>;
export function TenantEditor({
  tenant,
  request,
  onUpdated,
  onBusyChange,
  dirty,
  setDirty,
  onReload,
}: {
  tenant: Tenant;
  request: Transport;
  onUpdated: (tenant: Tenant) => void;
  onBusyChange: (value: boolean) => void;
  dirty: boolean;
  setDirty: (value: boolean) => void;
  onReload: () => void;
}) {
  const [tab, setTab] = useState<Tab>('Overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const [dialog, setDialog] = useState<
    'credential' | 'integration' | 'user' | null
  >(null);
  const [editing, setEditing] = useState<
    Integration | UserGrant | string | null
  >(null);
  const mutate: Mutate = async (suffix, method, body) => {
    if (busy) return false;
    setBusy(true);
    onBusyChange(true);
    setError(undefined);
    setSaved(false);
    try {
      const updated = (await request(
        `${tenantPath(tenant.environment, tenant.id)}${suffix}`,
        {
          method,
          body: JSON.stringify({
            ...body,
            expectedRevision: tenant.configRevision,
            ...(suffix.startsWith('/users/')
              ? { expectedAuthorityRevision: tenant.authorityRevision }
              : {}),
          }),
        },
      )) as Tenant;
      setDirty(false);
      setDialog(null);
      setEditing(null);
      onUpdated(updated);
      setSaved(true);
      return true;
    } catch (error) {
      setError(error);
      return false;
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  const open = (
    type: 'credential' | 'integration' | 'user',
    item?: Integration | UserGrant | string,
  ) => {
    setEditing(item ?? null);
    setError(undefined);
    setDialog(type);
  };
  function changeTab(next: Tab) {
    if (busy || next === tab) return;
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setDirty(false);
    setError(undefined);
    setSaved(false);
    setTab(next);
  }
  return (
    <section
      className="detail-pane"
      aria-label={`${tenant.public.name} details`}
    >
      <div className="tenant-heading">
        <div className="tenant-avatar large">
          {tenant.public.name
            .replace(/^FC\s*/i, '')
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="tenant-heading-text">
          <div className="eyebrow">
            {tenant.environment} <span>/</span> {tenant.id}
          </div>
          <h1>{tenant.public.name}</h1>
          <p>{tenant.hostname}</p>
        </div>
        <Badge value={tenant.status} />
      </div>
      <div className="tenant-meta">
        <span>
          Configuration <strong>r{tenant.configRevision}</strong>
        </span>
        <span>
          Authority <strong>r{tenant.authorityRevision}</strong>
        </span>
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              !dirty ||
              window.confirm('Discard unsaved changes and reload?')
            ) {
              setDirty(false);
              onReload();
            }
          }}
        >
          <ArrowPathIcon />
          Reload
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Tenant management">
        {tabs.map((t) => (
          <button
            type="button"
            key={t}
            id={`tab-${t}`}
            role="tab"
            aria-label={t}
            aria-selected={tab === t}
            aria-controls="tenant-panel"
            tabIndex={tab === t ? 0 : -1}
            disabled={busy}
            onClick={() => changeTab(t)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const next =
                  tabs[
                    (tabs.indexOf(t) +
                      (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) %
                      tabs.length
                  ]!;
                changeTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
          >
            {t}
            {t === 'Users' && (
              <small>
                {tenant.users.filter((u) => u.status === 'active').length}
              </small>
            )}
          </button>
        ))}
      </div>
      <div
        className="tab-content"
        role="tabpanel"
        id="tenant-panel"
        aria-labelledby={`tab-${tab}`}
      >
        {error ? <ErrorText error={error} /> : null}
        {error instanceof ApiError && error.status === 409 && (
          <p className="muted">
            Your edits are still here. Reload the latest version before trying
            again.
          </p>
        )}
        {saved && (
          <Notice>
            <CheckIcon className="inline-icon" />
            Changes saved.
          </Notice>
        )}
        <div key={`${tab}-${tenant.configRevision}`}>
          {tab === 'Overview' && (
            <>
              <PanelHeading
                title="Tenant overview"
                description="The club’s public identity and lifecycle."
              />
              <div className="stat-grid">
                <div>
                  <span>Domains</span>
                  <strong>{tenant.aliases.length + 1}</strong>
                </div>
                <div>
                  <span>Integration records</span>
                  <strong>{tenant.integrations.length}</strong>
                </div>
                <div>
                  <span>Active users</span>
                  <strong>
                    {tenant.users.filter((u) => u.status === 'active').length}
                  </strong>
                </div>
              </div>
              <SaveForm
                busy={busy}
                onDirty={() => setDirty(true)}
                label="Save overview"
                submit={(form) =>
                  mutate('', 'PATCH', {
                    public: {
                      name: value(form, 'name'),
                      locale: value(form, 'locale'),
                    },
                    status: value(form, 'status'),
                  })
                }
              >
                <div className="form-grid">
                  <Field label="Display name">
                    <input
                      name="name"
                      required
                      defaultValue={tenant.public.name}
                      maxLength={256}
                    />
                  </Field>
                  <Field label="Locale">
                    <input
                      name="locale"
                      required
                      defaultValue={tenant.public.locale}
                      maxLength={35}
                    />
                  </Field>
                  <Field
                    label="Tenant status"
                    hint="Suspended and disabled tenants cannot authenticate."
                  >
                    <select name="status" defaultValue={tenant.status}>
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </SaveForm>
              {tenant.status === 'provisioning' && (
                <Notice>
                  Set up the tenant’s runtime bindings, database and identity
                  provider before activation. Creating this record does not
                  provision infrastructure.
                </Notice>
              )}
            </>
          )}
          {tab === 'Domains' && (
            <>
              <PanelHeading
                title="Domains & routing"
                description="One canonical hostname and optional aliases, scoped to this environment."
              />
              <SaveForm
                busy={busy}
                onDirty={() => setDirty(true)}
                label="Save domains"
                submit={(form) =>
                  mutate('', 'PATCH', {
                    hostname: value(form, 'hostname'),
                    aliases: lines(form.get('aliases')),
                  })
                }
              >
                <Field
                  label="Canonical hostname"
                  hint="Hostname only. Development .localhost names may include a port."
                >
                  <input
                    name="hostname"
                    required
                    defaultValue={tenant.hostname}
                  />
                </Field>
                <Field
                  label="Aliases"
                  hint="One hostname per line. A hostname can belong to only one tenant per environment."
                >
                  <textarea
                    name="aliases"
                    rows={5}
                    defaultValue={tenant.aliases.join('\n')}
                    placeholder="another.club.ch"
                  />
                </Field>
              </SaveForm>
              <Notice>
                Routing records are updated together. DNS records and TLS
                certificates must be configured separately.
              </Notice>
            </>
          )}
          {tab === 'Keys' && (
            <TenantKeys
              environment={tenant.environment}
              tenantId={tenant.id}
              request={request}
            />
          )}
          {tab === 'Configuration' && (
            <>
              <PanelHeading
                title="Configuration"
                description="Identity, runtime references and non-secret administrative settings."
              />
              <SaveForm
                busy={busy}
                onDirty={() => setDirty(true)}
                label="Save configuration"
                submit={(form) =>
                  mutate('', 'PATCH', {
                    identityRealm: value(form, 'realm'),
                    secretReferences: {
                      mongoUri: value(form, 'mongo'),
                      key: value(form, 'key'),
                    },
                    configuration: JSON.parse(value(form, 'configuration')),
                  })
                }
              >
                <Field
                  label="Identity realm"
                  hint="HTTPS Clerk issuer origin. Changing a realm with existing grants requires a migration."
                >
                  <input
                    name="realm"
                    type="url"
                    required
                    defaultValue={tenant.identityRealm}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="MongoDB reference">
                    <input
                      name="mongo"
                      required
                      defaultValue={tenant.secretReferences.mongoUri}
                    />
                  </Field>
                  <Field label="Encryption key reference">
                    <input
                      name="key"
                      required
                      defaultValue={tenant.secretReferences.key}
                    />
                  </Field>
                </div>
                <Field
                  label="Administrative configuration (JSON)"
                  hint="Explorer-owned metadata; runtime operational settings use their existing encrypted API. Store all secrets in Credentials."
                >
                  <textarea
                    className="code-input"
                    name="configuration"
                    rows={10}
                    required
                    defaultValue={JSON.stringify(tenant.configuration, null, 2)}
                    spellCheck={false}
                  />
                </Field>
              </SaveForm>
            </>
          )}
          {tab === 'Integrations' && (
            <>
              <PanelHeading
                title="Integrations"
                description="Connection configuration and credential references."
                aside={
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => open('integration')}
                  >
                    <PlusIcon />
                    Add integration
                  </button>
                }
              />
              <Notice>
                These are administrative connection records. Provider OAuth,
                runtime activation and live connection checks require a runtime
                adapter.
              </Notice>
              {!tenant.integrations.length ? (
                <Empty
                  title="No integration records"
                  description="Add a provider connection after saving its credential."
                />
              ) : (
                <div className="record-list">
                  {tenant.integrations.map((connection) => (
                    <article key={connection.id} className="record">
                      <div>
                        <div className="record-title">
                          {connection.label}
                          <Badge
                            value={connection.enabled ? 'enabled' : 'disabled'}
                          />
                        </div>
                        <p>
                          {connection.provider} <span>·</span> {connection.id}
                        </p>
                        <code>{connection.accountReference}</code>
                      </div>
                      <div className="record-actions">
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => open('integration', connection)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button danger"
                          disabled={busy || connection.enabled}
                          title={
                            connection.enabled
                              ? 'Disable before removing'
                              : undefined
                          }
                          onClick={() => {
                            if (window.confirm(`Remove ${connection.label}?`))
                              void mutate(
                                `/integrations/${connection.id}`,
                                'DELETE',
                                {},
                              );
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === 'Credentials' && (
            <>
              <PanelHeading
                title="Credentials"
                description="Encrypted, write-only values. Existing values cannot be viewed."
                aside={
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => open('credential')}
                  >
                    <PlusIcon />
                    Add credential
                  </button>
                }
              />
              {!tenant.credentials.length ? (
                <Empty
                  title="No credentials stored"
                  description="Add a credential to reference from an integration."
                />
              ) : (
                <div className="record-list">
                  {tenant.credentials.map((c) => (
                    <article key={c.id} className="record">
                      <div>
                        <div className="record-title">
                          {c.label}
                          <Badge value={c.status} />
                        </div>
                        <p>
                          {c.id} <span>·</span> revision {c.revision}
                        </p>
                        <small>Updated {formatDate(c.updatedAt)}</small>
                      </div>
                      <div className="record-actions">
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => open('credential', c.id)}
                        >
                          {c.status === 'revoked' ? 'Restore' : 'Replace'}
                        </button>
                        <button
                          className="text-button danger"
                          disabled={busy || c.status === 'revoked'}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Revoke ${c.label}? The stored value will be removed.`,
                              )
                            )
                              void mutate(`/credentials/${c.id}`, 'DELETE', {});
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === 'Users' && (
            <>
              <PanelHeading
                title="Users & permissions"
                description="Manage existing Clerk identities and their access to this tenant."
                aside={
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => open('user')}
                  >
                    <PlusIcon />
                    Add user
                  </button>
                }
              />
              {!tenant.users.length ? (
                <Empty
                  title="No tenant users"
                  description="Add a Clerk subject and its tenant permissions. External Clerk accounts are managed in Clerk."
                />
              ) : (
                <div className="record-list">
                  {tenant.users.map((user) => (
                    <article
                      key={`${user.issuer}/${user.subject}`}
                      className="record"
                    >
                      <div>
                        <div className="record-title">
                          <code>{user.subject}</code>
                          <Badge value={user.status} />
                          {user.status === 'active' &&
                            user.issuer === tenant.identityRealm &&
                            hasTenantAdministratorPermissions(
                              user.permissions,
                            ) && (
                              <span className="badge badge-enabled">
                                Tenant administrator
                              </span>
                            )}
                        </div>
                        <p>
                          Contact #{user.contactId} <span>·</span>{' '}
                          {user.permissions.length} permissions <span>·</span>{' '}
                          revision {user.revision}
                        </p>
                        <small>{user.issuer}</small>
                      </div>
                      <div className="record-actions">
                        <button
                          className="text-button"
                          disabled={
                            busy || user.issuer !== tenant.identityRealm
                          }
                          onClick={() => open('user', user)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button danger"
                          disabled={
                            busy ||
                            user.status === 'revoked' ||
                            user.issuer !== tenant.identityRealm
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                `Revoke access for ${user.subject}?`,
                              )
                            )
                              void mutate(
                                `/users/${encodeURIComponent(user.subject)}`,
                                'DELETE',
                                {},
                              );
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === 'Audit' && <Audit tenant={tenant} request={request} />}
        </div>
        {dirty && (
          <p className="dirty-indicator">
            <span />
            Unsaved changes
          </p>
        )}
      </div>
      {dialog && (
        <Dialog
          title={
            dialog === 'credential'
              ? 'Store a credential'
              : dialog === 'integration'
                ? 'Integration configuration'
                : 'Tenant user access'
          }
          busy={busy}
          onClose={() => {
            if (!dirty || window.confirm('Discard unsaved changes?')) {
              setDialog(null);
              setDirty(false);
            }
          }}
        >
          {error ? <ErrorText error={error} /> : null}
          {dialog === 'credential' && (
            <CredentialForm
              tenant={tenant}
              credentialId={typeof editing === 'string' ? editing : undefined}
              busy={busy}
              mutate={mutate}
              onDirty={() => setDirty(true)}
            />
          )}
          {dialog === 'integration' && (
            <IntegrationForm
              tenant={tenant}
              existing={
                editing && typeof editing === 'object' && 'provider' in editing
                  ? editing
                  : undefined
              }
              busy={busy}
              mutate={mutate}
              onDirty={() => setDirty(true)}
            />
          )}
          {dialog === 'user' && (
            <UserForm
              tenant={tenant}
              existing={
                editing && typeof editing === 'object' && 'subject' in editing
                  ? editing
                  : undefined
              }
              busy={busy}
              mutate={mutate}
              onDirty={() => setDirty(true)}
            />
          )}
        </Dialog>
      )}
    </section>
  );
}
function SaveForm({
  children,
  busy,
  label,
  onDirty,
  submit,
  clearSecret = false,
}: {
  children: ReactNode;
  busy: boolean;
  label: string;
  onDirty: () => void;
  submit: (data: FormData) => Promise<boolean>;
  clearSecret?: boolean;
}) {
  const [error, setError] = useState<unknown>();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const form = event.currentTarget;
    try {
      await submit(new FormData(form));
    } catch (error) {
      setError(
        error instanceof SyntaxError
          ? new Error('Enter valid JSON configuration before saving.')
          : error,
      );
    } finally {
      if (clearSecret) {
        const input = form.elements.namedItem(
          'secret',
        ) as HTMLInputElement | null;
        if (input) input.value = '';
      }
    }
  }
  return (
    <form className="editor-form" onChange={onDirty} onSubmit={onSubmit}>
      <fieldset disabled={busy}>{children}</fieldset>
      {error ? <ErrorText error={error} /> : null}
      <div className="form-actions">
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : label}
        </button>
      </div>
    </form>
  );
}
function CredentialForm({
  tenant,
  credentialId,
  busy,
  mutate,
  onDirty,
}: {
  tenant: Tenant;
  credentialId?: string;
  busy: boolean;
  mutate: Mutate;
  onDirty: () => void;
}) {
  return (
    <SaveForm
      busy={busy}
      label="Store credential"
      clearSecret
      onDirty={onDirty}
      submit={(form) =>
        mutate(`/credentials/${encodeURIComponent(value(form, 'id'))}`, 'PUT', {
          label: value(form, 'label'),
          value: String(form.get('secret') ?? ''),
        })
      }
    >
      <Field label="Credential ID">
        <input
          name="id"
          required
          pattern="[a-z0-9][a-z0-9-]*"
          maxLength={64}
          defaultValue={credentialId}
          readOnly={Boolean(credentialId)}
          placeholder="smtp-primary"
        />
      </Field>
      <Field label="Label">
        <input
          name="label"
          required
          maxLength={256}
          defaultValue={
            tenant.credentials.find((c) => c.id === credentialId)?.label
          }
          placeholder="Club mail password"
        />
      </Field>
      <Field
        label="Secret value"
        hint="Encrypted on the API server. Cleared from this form after submission. Disable linked integrations before replacing a value."
      >
        <textarea
          name="secret"
          required
          maxLength={16384}
          rows={4}
          autoComplete="off"
          spellCheck={false}
          className="secret-input"
        />
      </Field>
    </SaveForm>
  );
}
function IntegrationForm({
  tenant,
  existing,
  busy,
  mutate,
  onDirty,
}: {
  tenant: Tenant;
  existing?: Integration;
  busy: boolean;
  mutate: Mutate;
  onDirty: () => void;
}) {
  return (
    <SaveForm
      busy={busy}
      label="Save integration"
      onDirty={onDirty}
      submit={(form) =>
        mutate(
          `/integrations/${encodeURIComponent(value(form, 'id'))}`,
          'PUT',
          {
            provider: value(form, 'provider'),
            label: value(form, 'label'),
            accountReference: value(form, 'account'),
            credentialId: value(form, 'credential'),
            capabilities: lines(form.get('capabilities')),
            enabled: form.get('enabled') === 'on',
          },
        )
      }
    >
      <div className="form-grid">
        <Field label="Connection ID">
          <input
            name="id"
            required
            pattern="[a-z0-9][a-z0-9-]*"
            maxLength={64}
            readOnly={Boolean(existing)}
            defaultValue={existing?.id}
            placeholder="club-mail"
          />
        </Field>
        <Field label="Provider">
          <select name="provider" defaultValue={existing?.provider ?? 'bexio'}>
            {providers.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Connection label">
        <input
          name="label"
          required
          maxLength={256}
          defaultValue={existing?.label}
        />
      </Field>
      <Field label="Account reference" hint="A non-secret account identifier.">
        <input
          name="account"
          required
          maxLength={256}
          defaultValue={existing?.accountReference}
        />
      </Field>
      <Field label="Credential">
        <select
          name="credential"
          required
          defaultValue={existing?.credentialId ?? ''}
        >
          <option value="" disabled>
            Select a credential
          </option>
          {tenant.credentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.status})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Capabilities" hint="One per line, for example mail:send.">
        <textarea
          name="capabilities"
          rows={3}
          defaultValue={existing?.capabilities.join('\n')}
        />
      </Field>
      <label className="checkbox-field">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={existing?.enabled}
        />
        Enable this administrative connection record
      </label>
      <p className="field-hint">
        This flag does not activate the provider in the tenant runtime.
      </p>
    </SaveForm>
  );
}
function UserForm({
  tenant,
  existing,
  busy,
  mutate,
  onDirty,
}: {
  tenant: Tenant;
  existing?: UserGrant;
  busy: boolean;
  mutate: Mutate;
  onDirty: () => void;
}) {
  const [permissions, setPermissions] = useState(
    existing?.permissions.join('\n') ?? '',
  );
  const entries = permissions
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const administrator = hasTenantAdministratorPermissions(entries);
  return (
    <SaveForm
      busy={busy}
      label="Save user access"
      onDirty={onDirty}
      submit={(form) =>
        mutate(`/users/${encodeURIComponent(value(form, 'subject'))}`, 'PUT', {
          subject: value(form, 'subject'),
          issuer: tenant.identityRealm,
          contactId: Number(value(form, 'contact')),
          permissions: lines(form.get('permissions')),
          status: value(form, 'status'),
        })
      }
    >
      <Field
        label="Clerk subject"
        hint="The existing user ID from the tenant’s Clerk instance."
      >
        <input
          name="subject"
          required
          pattern="[A-Za-z0-9_-]+"
          maxLength={128}
          defaultValue={existing?.subject}
          readOnly={Boolean(existing)}
          placeholder="user_…"
        />
      </Field>
      <div className="form-grid">
        <Field label="Bexio contact ID">
          <input
            name="contact"
            required
            type="number"
            min={1}
            step={1}
            defaultValue={existing?.contactId}
          />
        </Field>
        <Field label="Grant status">
          <select name="status" defaultValue={existing?.status ?? 'active'}>
            <option>active</option>
            <option>disabled</option>
            <option>revoked</option>
          </select>
        </Field>
      </div>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={administrator}
          onChange={(event) => {
            setPermissions(
              event.target.checked
                ? [
                    ...new Set([...entries, ...tenantAdministratorPermissions]),
                  ].join('\n')
                : entries
                    .filter(
                      (p) =>
                        p !== 'club:*:*' &&
                        !tenantAdministratorPermissions.some(
                          (required) => required === p,
                        ),
                    )
                    .join('\n'),
            );
            onDirty();
          }}
        />
        Tenant administrator
      </label>
      <p className="field-hint">
        Adds the permissions needed for club settings, integration credentials
        and OAuth. Existing Bexio administrator checks still apply.
      </p>
      <Field
        label="Tenant permissions"
        hint="One club permission per line. Use club:*:* for all currently supported club permissions in this tenant; platform privileges are excluded."
      >
        <textarea
          className="code-input"
          name="permissions"
          rows={6}
          value={permissions}
          onChange={(event) => setPermissions(event.target.value)}
          placeholder={'club:teams:read\nclub:settings:read'}
        />
      </Field>
      <p className="field-hint">Issuer: {tenant.identityRealm}</p>
    </SaveForm>
  );
}
function Audit({ tenant, request }: { tenant: Tenant; request: Transport }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    const controller = new AbortController();
    request(`${tenantPath(tenant.environment, tenant.id)}/audit`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setEvents(data as AuditEvent[]);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error);
      });
    return () => controller.abort();
  }, [tenant.id, tenant.environment, request]);
  return (
    <>
      <PanelHeading
        title="Audit history"
        description="The latest 100 administrative changes. Secret values are never recorded."
      />
      {error ? (
        <ErrorText error={error} />
      ) : events === null ? (
        <p className="loading-text">Loading audit history…</p>
      ) : !events.length ? (
        <Empty
          title="No administrative events"
          description="New changes made through the explorer appear here."
        />
      ) : (
        <ol className="audit-list">
          {events.map((event) => (
            <li key={event.id}>
              <span className="audit-dot" />
              <div>
                <strong>{event.action.replaceAll('.', ' ')}</strong>
                {event.resource && <code>{event.resource}</code>}
                <p>
                  {event.actor} <span>·</span> revision {event.revision}
                </p>
                <time dateTime={event.at}>{formatDate(event.at)}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Zurich',
  }).format(new Date(date));
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <ArrowTopRightOnSquareIcon />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
