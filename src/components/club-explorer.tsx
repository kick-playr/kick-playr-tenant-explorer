'use client';
import Link from 'next/link';
import { ClubBrandingProvider } from './club-branding-provider';
import { validateBranding, type ClubBranding } from '../lib/club-branding';
import { BrandLogo } from './theme-logo';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiRequest, type Transport } from '../lib/api';
import { ErrorText, Field, Notice } from './ui';
import { ThemeSwitcher } from './theme-switcher';
import { ClubSettingsEditor } from './club-settings-editor';
import { IntegrationSections } from './integration-sections/integration-sections';
import type { Connection } from './integration-sections/types';
import type { ClubSettingsSnapshot } from '../lib/club-settings';

export interface ClubSummary {
  id: string;
  environment: string;
  public: { name: string; locale: string };
}

export function ClubExplorer({
  clubs,
  account,
  request = apiRequest,
}: {
  clubs: ClubSummary[];
  account?: ReactNode;
  request?: Transport;
}) {
  const [selected, setSelected] = useState(clubs[0]!);
  const connectionDrafts = useRef(new Set<string>());
  function connectionDirty(id: string, dirty: boolean) {
    if (dirty) setSaved(false);
    if (dirty) connectionDrafts.current.add(id);
    else connectionDrafts.current.delete(id);
    setDirty(connectionDrafts.current.size > 0);
  }
  const [tab, setTab] = useState<'settings' | 'integrations'>('settings');
  const [settingsSection, setSettingsSection] = useState('seasons');
  const [integrationSection, setIntegrationSection] = useState('');
  const [settings, setSettings] = useState<ClubSettingsSnapshot | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState<unknown>(),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [brand, setBrand] = useState<{
    scope: string;
    value: ClubBranding | null;
  } | null>(null);
  const path = `clubs/${encodeURIComponent(selected.environment)}/${encodeURIComponent(selected.id)}`;
  useEffect(() => {
    const abort = new AbortController();
    request(`${path}/${tab}`, { signal: abort.signal })
      .then((value) => {
        if (abort.signal.aborted) return;
        if (tab === 'settings') setSettings(value as ClubSettingsSnapshot);
        else setConnections((value as { items: Connection[] }).items);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e);
      });
    return () => abort.abort();
  }, [path, tab, refresh, request]);
  useEffect(() => {
    const abort = new AbortController();
    request(`${path}/branding`, { signal: abort.signal })
      .then((value) => {
        const branding = (value as { branding?: unknown }).branding;
        if (branding != null) validateBranding(branding);
        if (!abort.signal.aborted)
          setBrand({
            scope: path,
            value: branding == null ? null : (branding as ClubBranding),
          });
      })
      .catch(() => {
        if (!abort.signal.aborted) setBrand({ scope: path, value: null });
      });
    return () => abort.abort();
  }, [path, request]);
  async function mutate(suffix: string, method: string, body: unknown) {
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = await request(`${path}/${suffix}`, {
        method,
        body: JSON.stringify(body),
      });
      setDirty(connectionDrafts.current.size > 0);
      setSaved(true);
      return result;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function change(action: () => void) {
    if (busy || (dirty && !window.confirm('Discard unsaved changes?'))) return;
    connectionDrafts.current.clear();
    setDirty(false);
    setSaved(false);
    setError(undefined);
    action();
  }
  async function connect(c: Connection) {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    const result = (await mutate(
      `integrations/${c.provider}/connect`,
      'POST',
      {},
    )) as { url?: string } | null;
    setSaved(false);
    try {
      const url = new URL(result?.url ?? '');
      if (
        !['https://auth.bexio.com', 'https://www.dropbox.com'].includes(
          url.origin,
        )
      )
        throw Error();
      if (popup) popup.location.href = url.href;
      else window.location.assign(url.href);
    } catch {
      popup?.close();
      if (result)
        setError(new Error('The provider authorization link is unavailable'));
    }
  }
  return (
    <ClubBrandingProvider
      key={path}
      scope={path}
      clubName={selected.public.name}
      branding={brand?.scope === path ? brand.value : null}
    >
      <div className="app-shell">
        <div className="workspace club-workspace">
          <header className="topbar">
            <div className="club-header-brand">
              <Link
                href="/"
                aria-label="Kick Playr Tenant Explorer"
                onClick={(event) => {
                  if (
                    busy ||
                    (dirty && !window.confirm('Discard unsaved changes?'))
                  )
                    event.preventDefault();
                }}
              >
                <BrandLogo priority />
              </Link>
              <div className="breadcrumb">
                My club <span>/</span>
                <strong>
                  {tab === 'settings' ? 'Settings' : 'Integrations'}
                </strong>
              </div>
            </div>
            <div className="account">
              <ThemeSwitcher />
              {account}
            </div>
          </header>
          <main>
            <div className="page-heading">
              <h1>{selected.public.name}</h1>
              <p>Club administration</p>
            </div>
            {clubs.length > 1 && (
              <Field label="Club">
                <select
                  disabled={busy}
                  value={`${selected.environment}/${selected.id}`}
                  onChange={(e) => {
                    const club = clubs.find(
                      (c) => `${c.environment}/${c.id}` === e.target.value,
                    );
                    if (club)
                      change(() => {
                        setSettings(null);
                        setConnections(null);
                        setSelected(club);
                      });
                  }}
                >
                  {clubs.map((c) => (
                    <option
                      key={`${c.environment}/${c.id}`}
                      value={`${c.environment}/${c.id}`}
                    >
                      {c.public.name} · {c.environment}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <section className="detail-pane" aria-label="Club administration">
              <div className="tabs" aria-label="Club sections">
                {(['settings', 'integrations'] as const).map((t) => (
                  <button
                    key={t}
                    aria-pressed={tab === t}
                    disabled={busy}
                    onClick={() => {
                      if (t === tab) return;
                      change(() => {
                        setTab(t);
                        if (t === 'settings') setSettings(null);
                        else setConnections(null);
                      });
                    }}
                  >
                    {t === 'settings' ? 'Settings' : 'Integrations'}
                  </button>
                ))}
              </div>
              <div className="tab-content">
                {error != null && (
                  <Notice error>
                    <ErrorText error={error} />
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => change(() => setRefresh((n) => n + 1))}
                    >
                      Reload
                    </button>
                  </Notice>
                )}
                {saved && <p role="status">Saved.</p>}
                {tab === 'settings' &&
                  (!settings ? (
                    error ? null : (
                      <p>Loading club settings…</p>
                    )
                  ) : (
                    <ClubSettingsEditor
                      onPendingChange={setBusy}
                      key={`${path}/${settings.hash}`}
                      settings={settings}
                      activeSection={settingsSection}
                      onSectionChange={setSettingsSection}
                      busy={busy}
                      onDirtyChange={(changed) => {
                        setDirty(changed);
                        if (changed) setSaved(false);
                      }}
                      onSave={async (body) => {
                        const result = await mutate('settings', 'PATCH', body);
                        if (!result) return false;
                        setSettings(result as ClubSettingsSnapshot);
                        setBrand({
                          scope: path,
                          value:
                            ((result as ClubSettingsSnapshot)
                              .branding as ClubBranding) ?? null,
                        });
                        return true;
                      }}
                    />
                  ))}
                {tab === 'integrations' && (
                  <>
                    {!connections ? (
                      error ? null : (
                        <p>Loading integrations…</p>
                      )
                    ) : (
                      <IntegrationSections
                        request={request}
                        onBusyChange={setBusy}
                        connections={connections}
                        path={path}
                        busy={busy}
                        activeSection={integrationSection}
                        onSectionChange={setIntegrationSection}
                        onConnect={connect}
                        onDirtyChange={connectionDirty}
                        onToggle={async (c) => {
                          const result = await mutate(
                            `integrations/${c.id}`,
                            'PATCH',
                            {
                              expectedRevision: c.revision,
                              status:
                                c.status === 'active' ? 'disabled' : 'active',
                            },
                          );
                          if (result) setRefresh((n) => n + 1);
                        }}
                        onSave={async (c, secret) => {
                          const result = await mutate(
                            `integrations/${c.id}`,
                            'PUT',
                            { expectedRevision: c.revision, secret },
                          );
                          if (!result) return false;
                          setRefresh((n) => n + 1);
                          return true;
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </ClubBrandingProvider>
  );
}
