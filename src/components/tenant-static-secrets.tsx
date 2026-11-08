'use client';
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { StaticResourceTable } from './static-resource-table';
import { IntegrationEditor } from './integration-editor';
import { TenantConsentPanel } from './tenant-consent-panel';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
type Resource = React.ComponentProps<typeof StaticResourceTable>['resources'][number];
type Link = React.ComponentProps<typeof StaticResourceTable>['links'][number];
type Application = {_id:string;name?:string;displayName?:string};
type Assignment = {applicationId:string;revision:number};
type VersionMetadata = {_id:string;resourceId:string;versionNumber:number};
type StaticSecretRow = {
  resource: Resource;
  versionId: string;
  displayedVersionId?: string;
  versionLabel: string;
  accessName: string;
};
export function TenantStaticSecrets({
  environment,
  tenantId,
}: {
  environment: string;
  tenantId: string;
}) {
  const [applications, setApplications] = useState<Application[]>([]),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [application, setApplication] = useState(''),
    [links, setLinks] = useState<Link[]>([]),
    [linkRevision, setLinkRevision] = useState(0),
    [linkEpoch, setLinkEpoch] = useState(0);
  const [resources, setResources] = useState<Resource[]>([]),
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
    [schema, setSchema] = useState<React.ComponentProps<typeof IntegrationEditor>['schema']>(),
    [name, setName] = useState(''),
    [copying, setCopying] = useState(''),
    [copied, setCopied] = useState<{context:string;name:string}|null>(null);
  const contextKey = `${environment}/${tenantId}/${application}`;
  const activeContext = useRef(contextKey);
  useLayoutEffect(() => { activeContext.current = contextKey; }, [contextKey]);
  const [versionSelection, setVersionSelection] = useState<{
    context: string;
    resourceSnapshot: Resource[];
    links: Link[];
    versions: Record<string, number>;
  }>();
  const [selectionError, setSelectionError] = useState('');
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
      setError('');
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
    const timer = setTimeout(() => { void reload(); }, 0);
    return () => clearTimeout(timer);
  }, [reload]);
  useEffect(() => {
    if (show)
      void call(
        'schemas/' +
          encodeURIComponent(
            'builtin:' +
              type +
              (['email', 'pingen'].includes(type) ? '@2' : '@1'),
          ),
      )
        .then(setSchema)
        .catch(() => setError('Integration schema unavailable.'));
  }, [call, type, show]);
  useEffect(() => {
    let cancelled = false;
    if (application) {
      void (async () => {
        const result = await call('links/' + encodeURIComponent(application));
        if (!Array.isArray(result.links))
          throw Error('Application links unavailable.');
        const pinnedResources = [
          ...new Set<string>(
            result.links
              .filter((link: Link) => link.versionPolicy !== 'latest')
              .map((link: Link) => link.resourceId),
          ),
        ];
        const metadata = await Promise.all(
          pinnedResources.map(async (id) => {
            const versions = await call(
              'resources/' + encodeURIComponent(id) + '/versions',
            );
            if (!Array.isArray(versions))
              throw Error('Version metadata unavailable.');
            return versions
              .filter(
                (v: VersionMetadata) =>
                  v.resourceId === id &&
                  Number.isSafeInteger(v.versionNumber) &&
                  v.versionNumber > 0,
              )
              .map((v: VersionMetadata) => [`${id}/${v._id}`, v.versionNumber] as const);
          }),
        );
        if (cancelled) return;
        setSelectionError('');
        setLinks(result.links);
        setVersionSelection({
          context: contextKey,
          resourceSnapshot: resources,
          links: result.links,
          versions: Object.fromEntries(metadata.flat()),
        });
        setLinkRevision(result.deployment?.revision ?? 0);
        setLinkEpoch((v) => v + 1);
      })().catch(() => {
        if (!cancelled) {
          setSelectionError(contextKey);
          setError(
            'Application version information is unavailable. Try reloading the page.',
          );
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [application, call, contextKey, resources]);
  const selectionReady = versionSelection?.context === contextKey &&
    versionSelection.resourceSnapshot === resources && selectionError !== contextKey;
  const displayRows = resources.flatMap<StaticSecretRow>((resource) => {
    if (!application)
      return [
        {
          resource,
          versionId: resource.currentVersionId,
          versionLabel: `${resource.currentVersionNumber} · Current`,
          accessName: '',
        },
      ];
    if (!selectionReady)
      return [
        {
          resource,
          versionId: '',
          versionLabel:
            selectionError === contextKey ? 'Unavailable' : 'Loading…',
          accessName: '',
        },
      ];
    const resourceLinks = versionSelection.links.filter(
      (link) => link.resourceId === resource._id,
    );
    if (!resourceLinks.length)
      return [
        { resource, versionId: '', versionLabel: 'Not linked', accessName: '' },
      ];
    return resourceLinks.map((link) => {
      const latest = link.versionPolicy === 'latest';
      const id = latest ? resource.currentVersionId : link.versionPolicy;
      const number = latest
        ? resource.currentVersionNumber
        : versionSelection.versions[`${resource._id}/${id}`];
      return {
        resource,
        versionId: number ? id : '',
        displayedVersionId: id,
        accessName: link.accessName,
        versionLabel: number
          ? `${number} · ${latest ? 'Latest' : 'Pinned'}`
          : 'Pinned · Unavailable',
      };
    });
  });
  const save = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      setCopied(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const copyValue = async (resource: Resource, versionId: string) => {
    const requestedContext = contextKey;
    if (!access.canRead || busy || copying || !versionId) return;
    setCopying(resource._id);
    setCopied(null);
    setError('');
    try {
      if (!navigator.clipboard?.writeText) throw Error();
      const value = await call(
        'resources/' +
          encodeURIComponent(resource._id) +
          '/reveal/' +
          encodeURIComponent(versionId),
        'POST',
      );
      if (activeContext.current !== requestedContext) return;
      await navigator.clipboard.writeText(
        typeof value === 'string' ? value : JSON.stringify(value),
      );
      setCopied({context:requestedContext,name:resource.name});
    } catch {
      setError(
        'Could not copy the value. Check your permission and clipboard access, then try again.',
      );
    } finally {
      setCopying('');
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
      <label>
        Application
        <select
          aria-label="Application version context"
          disabled={busy || !!copying}
          value={application}
          onChange={(e) => setApplication(e.target.value)}
        >
          <option value="">Resource current versions</option>
          {applications.map((app) => (
            <option key={app._id} value={app._id}>
              {app.name || app.displayName || app._id}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">
        {application
          ? 'Versions selected by the application’s saved links. Latest follows the current resource version; Pinned uses the exact saved version.'
          : 'Resource current versions are shown. Select an application to see its Latest or Pinned version policy.'}
      </p>
      {copied?.context === contextKey && <p role="status">Copied value for {copied.name}.</p>}
      <div
        className="static-secrets-table-scroll"
        role="region"
        aria-label="Static secrets"
        tabIndex={0}
      >
        <table className="static-secrets-table">
          <caption className="sr-only">
            Static secrets and selected versions
          </caption>
          <thead>
            <tr>
              <th scope="col">Purpose</th>
              <th scope="col">Type</th>
              <th scope="col">Version</th>
              <th scope="col">Version ID</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={`${row.resource._id}/${row.accessName}`}>
                <th scope="row">
                  {row.resource.name}
                  {row.accessName && (
                    <span className="field-hint" style={{ display: 'block' }}>
                      {row.accessName}
                    </span>
                  )}
                </th>
                <td>{row.resource.kind}</td>
                <td>{row.versionLabel}</td>
                <td>
                  <code>{row.displayedVersionId || row.versionId || '—'}</code>
                </td>
                <td>
                  <button
                    type="button"
                    className="button secondary static-secret-copy"
                    aria-label={`Copy value for ${row.resource.name}`}
                    title={`Copy value for ${row.resource.name}`}
                    disabled={
                      !access.canRead || busy || !!copying || !row.versionId
                    }
                    onClick={() => void copyValue(row.resource, row.versionId)}
                  >
                    <ClipboardDocumentIcon aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {resources.length === 0 && (
              <tr>
                <td colSpan={5}>No static secrets to display.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Applications and resource links</summary>
        {application && selectionReady && (
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
                    schemaIdentity:
                      'builtin:' +
                      type +
                      (['email', 'pingen'].includes(type) ? '@2' : '@1'),
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
