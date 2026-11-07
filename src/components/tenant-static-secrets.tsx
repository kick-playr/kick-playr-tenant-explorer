'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { StaticResourceTable } from './static-resource-table';
import { IntegrationEditor } from './integration-editor';
import { TenantConsentPanel } from './tenant-consent-panel';
export function TenantStaticSecrets({
  environment,
  tenantId,
}: {
  environment: string;
  tenantId: string;
}) {
  const [applications, setApplications] = useState<any[]>([]),
    [assignments, setAssignments] = useState<any[]>([]),
    [application, setApplication] = useState(''),
    [links, setLinks] = useState<any[]>([]),
    [linkRevision, setLinkRevision] = useState(0),
    [linkEpoch, setLinkEpoch] = useState(0);
  const [resources, setResources] = useState<any[]>([]),
    [access, setAccess] = useState({ canRead: false, canWrite: false }),
    [consent, setConsent] = useState({
      enabled: false,
      revision: 0,
      canManage: false,
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false),
    [type, setType] = useState('bexio'),
    [schema, setSchema] = useState<any>(),
    [name, setName] = useState(''),
    [revealed, setRevealed] = useState<{ id: string; value: string }>();
  const call = useCallback(
    async (path: string, method = 'GET', body?: unknown) => {
      const query = new URLSearchParams({
        environment,
        ownerType: 'tenant',
        ownerId: tenantId,
      });
      const [pathname, extra] = path.split('?');
      if (extra)
        for (const [key, value] of new URLSearchParams(extra))
          query.set(key, value);
      const response = await fetch('/api/vault-v2/' + pathname + '?' + query, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
      if (!response.ok)
        throw Error(
          response.status === 403
            ? 'Your tenant approval or permission is required.'
            : 'Vault administration is unavailable.',
        );
      return response.headers.get('content-type')?.includes('application/json')
        ? response.json()
        : response.text();
    },
    [environment, tenantId],
  );
  const reload = useCallback(async () => {
    setError('');
    try {
      const [initial, permissions, approval, catalog] = await Promise.all([
        call('resources'),
        call('access'),
        call('consent'),
        call('catalog'),
      ]);
      let rows = initial;
      for (
        let page = 0, last = initial;
        last.length === 20 && page < 49;
        page++
      ) {
        last = await call(
          'resources?after=' + encodeURIComponent(last.at(-1)._id),
        );
        rows = rows.concat(last);
      }
      setApplications(catalog.applications);
      setAssignments(catalog.assignments);
      setResources(rows);
      setAccess(permissions);
      setConsent(approval);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [call]);
  useEffect(() => {
    setRevealed(undefined);
    void reload();
  }, [reload]);
  useEffect(() => {
    if (show)
      void call('schemas/' + encodeURIComponent('builtin:' + type + (['email','pingen'].includes(type) ? '@2' : '@1')))
        .then(setSchema)
        .catch(() => setError('Integration schema unavailable.'));
  }, [call, type, show]);
  useEffect(() => {
    setLinks([]);
    if (application)
      void call('links/' + application)
        .then((result) => {
          setLinks(result.links);
          setLinkRevision(result.deployment?.revision ?? 0);
          setLinkEpoch((v) => v + 1);
        })
        .catch((e) => setError(e.message));
  }, [application, call]);
  const save = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      setRevealed(undefined);
      await reload();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2>Static secrets & integrations</h2>
        <button disabled={busy} onClick={() => setShow(!show)}>
          New integration
        </button>
      </header>
      <p>
        These static values are stored in Key Vault. Access and refresh tokens
        remain encrypted in the tenant database.
      </p>
      {error && <p role="alert">{error}</p>}
      <TenantConsentPanel
        {...consent}
        busy={busy}
        onChange={(enabled) =>
          save(() =>
            call('consent', 'PUT', { enabled, revision: consent.revision }),
          ).catch(() => {})
        }
      />
      {!access.canWrite && (
        <p>
          Metadata only. The tenant’s club administrator must approve
          global-admin access before values can be viewed or edited.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Type</th>
            <th>Version</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr key={resource._id}>
              <td>
                <strong>{resource.name}</strong>
                <small style={{ display: 'block' }}>{resource._id}</small>
              </td>
              <td>{resource.kind}</td>
              <td>{resource.currentVersionNumber}</td>
              <td>
                <details>
                  <summary>Expand details</summary>
                  <p>Version ID: {resource.currentVersionId}</p>
                  <button
                    disabled={!access.canRead || busy}
                    onClick={() =>
                      void call(
                        'resources/' +
                          resource._id +
                          '/reveal/' +
                          resource.currentVersionId,
                        'POST',
                      )
                        .then((value) =>
                          setRevealed({
                            id: resource._id,
                            value:
                              typeof value === 'string'
                                ? value
                                : JSON.stringify(value),
                          }),
                        )
                        .catch((e) => setError(e.message))
                    }
                  >
                    Reveal value
                  </button>
                  {revealed && revealed.id === resource._id && (
                    <div>
                      <pre>{revealed.value}</pre>
                      <button onClick={() => setRevealed(undefined)}>
                        Hide value
                      </button>
                    </div>
                  )}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>Applications and resource links</summary>
        <label>
          Application
          <select
            value={application}
            onChange={(e) => setApplication(e.target.value)}
          >
            <option value="">Select application</option>
            {applications.map((app) => (
              <option key={app._id} value={app._id}>
                {app.name} ({app._id})
              </option>
            ))}
          </select>
        </label>
        {application && (
          <>
            <p>
              Tenant assignment enables explicit links. It does not share every
              tenant secret.
            </p>
            {consent.canManage && (
              <button
                disabled={busy}
                onClick={() =>
                  void save(() =>
                    call('enrollments/' + application, 'PUT'),
                  ).catch(() => {})
                }
              >
                Approve this application’s machine access
              </button>
            )}
            <button
              disabled={busy || !access.canWrite}
              onClick={() =>
                void save(() =>
                  call('assignments/' + application, 'PUT', {
                    enabled: true,
                    revision:
                      assignments.find((a) => a.applicationId === application)
                        ?.revision ?? 0,
                  }),
                ).catch(() => {})
              }
            >
              Assign application
            </button>
            <StaticResourceTable
              key={linkEpoch}
              resources={resources}
              links={links}
              disabled={!access.canWrite || busy}
              onSave={(rows) =>
                save(() =>
                  call('links/' + application, 'PUT', {
                    revision: linkRevision,
                    rows,
                  }),
                ).catch(() => {})
              }
            />
          </>
        )}
      </details>
      {show && (
        <section>
          <label>
            Integration name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bexio Accounting"
            />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {['bexio', 'dropbox', 'pingen', 'email'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {schema && (
            <IntegrationEditor
              key={type}
              schema={schema}
              disabled={!access.canWrite || busy || !name.trim()}
              onSave={(value) =>
                save(() =>
                  call('resources', 'POST', {
                    name,
                    kind: 'integration',
                    schemaIdentity: 'builtin:' + type + (['email','pingen'].includes(type) ? '@2' : '@1'),
                    value,
                  }),
                )
              }
            />
          )}
        </section>
      )}
    </section>
  );
}
