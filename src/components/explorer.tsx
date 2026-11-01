'use client';

import { BrandLogo } from './theme-logo';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BuildingOffice2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleStackIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { apiRequest, tenantPath, type Transport } from '../lib/api';
import {
  environments,
  statuses,
  type Tenant,
  type TenantList,
  type TenantSummary,
} from '../lib/types';
import { Badge, ErrorText } from './ui';
import { CreateTenant } from './create-tenant';
import { Empty, TenantEditor } from './tenant-editor';
import { ThemeSwitcher } from './theme-switcher';

export function Explorer({
  request = apiRequest,
  account,
}: {
  request?: Transport;
  account?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [environment, setEnvironment] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [list, setList] = useState<TenantList | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<unknown>();
  const [selected, setSelected] = useState<TenantSummary | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [detailError, setDetailError] = useState<unknown>();
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [deletionNotice, setDeletionNotice] = useState('');
  const editorGeneration = useRef(0);
  const welcomeHeading = useRef<HTMLHeadingElement>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listRequest.current = controller;
    const timeout = window.setTimeout(
      () => {
        setListLoading(true);
        setListError(undefined);
        const params = new URLSearchParams({
          page: String(page),
          pageSize: '20',
        });
        if (query) params.set('search', query);
        if (environment) params.set('environment', environment);
        if (status === 'deleted') params.set('deletion', 'only');
        else if (status) params.set('status', status);
        request(`tenants?${params}`, { signal: controller.signal })
          .then((data) => {
            if (!controller.signal.aborted) setList(data as TenantList);
          })
          .catch((error) => {
            if (!controller.signal.aborted) setListError(error);
          })
          .finally(() => {
            if (!controller.signal.aborted) setListLoading(false);
          });
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, environment, status, page, refresh, request]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => {
    if (deletionNotice && !selected) welcomeHeading.current?.focus();
  }, [deletionNotice, selected]);
  useEffect(
    () => () => {
      editorGeneration.current++;
      detailRequest.current?.abort();
    },
    [],
  );
  function invalidateEditor() {
    detailRequest.current?.abort();
    const generation = ++editorGeneration.current;
    setEditorEpoch(generation);
    return generation;
  }
  async function open(summary: TenantSummary) {
    if (saving) return;
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    const generation = invalidateEditor();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDirty(false);
    setSelected(summary);
    setTenant(null);
    setDetailError(undefined);
    setDeletionNotice('');
    try {
      const detail = (await request(
        tenantPath(summary.environment, summary.id),
        { signal: controller.signal },
      )) as Tenant;
      if (!controller.signal.aborted && generation === editorGeneration.current)
        setTenant(detail);
    } catch (error) {
      if (!controller.signal.aborted && generation === editorGeneration.current)
        setDetailError(error);
    }
  }
  function updated(next: Tenant) {
    setTenant(next);
    setSelected(next);
    setList((previous) =>
      previous
        ? {
            ...previous,
            items: previous.items.map((t) =>
              t.id === next.id && t.environment === next.environment ? next : t,
            ),
          }
        : previous,
    );
  }
  function deleted() {
    invalidateEditor();
    listRequest.current?.abort();
    setSelected(null);
    setTenant(null);
    setDetailError(undefined);
    setDirty(false);
    setSaving(false);
    setList(null);
    setListError(undefined);
    setListLoading(true);
    setPage(1);
    setRefresh((n) => n + 1);
    setDeletionNotice('Tenant deleted. Select another tenant to continue.');
  }
  // Every editor callback captures its generation. Late async completions from
  // an unmounted editor must not restore selection or unlock a newer mutation.
  const currentEditor = () => editorEpoch === editorGeneration.current;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link
          className="brand"
          href="/"
          aria-label="Kick Playr Tenant Explorer"
        >
          <BrandLogo priority />
        </Link>
        <div className="sidebar-label">WORKSPACE</div>
        <div className="nav-active">
          <Squares2X2Icon />
          Tenants
          <ChevronRightIcon />
        </div>
        <div className="sidebar-label second">ENVIRONMENTS</div>
        <button
          className={`environment-nav ${!environment ? 'chosen' : ''}`}
          onClick={() => {
            setEnvironment('');
            setPage(1);
          }}
        >
          <CircleStackIcon />
          All environments
        </button>
        {environments.map((e) => (
          <button
            key={e}
            className={`environment-nav ${environment === e ? 'chosen' : ''}`}
            onClick={() => {
              setEnvironment(e);
              setPage(1);
            }}
          >
            <span className={`env-dot env-${e}`} />
            {e}
          </button>
        ))}
        <div className="sidebar-bottom">
          <ShieldCheckIcon />
          <div>
            Platform administration<small>Restricted operator access</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Platform directory <span>/</span> <strong>Tenants</strong>
          </div>
          <div className="account">
            <ThemeSwitcher />
            <span className="restricted">
              <ShieldCheckIcon />
              Admin console
            </span>
            {account}
          </div>
        </header>
        <main>
          <div className="page-heading">
            <h1>
              Tenant explorer<span>.</span>
            </h1>
            <p>Every club. One place to keep things running.</p>
            <button
              className="button primary"
              disabled={saving}
              onClick={() => {
                if (!dirty || window.confirm('Discard unsaved changes?')) {
                  setDirty(false);
                  invalidateEditor();
                  setCreating(true);
                }
              }}
            >
              <PlusIcon />
              Create tenant
            </button>
          </div>
          <div className="directory-toolbar">
            <div className="search">
              <MagnifyingGlassIcon />
              <input
                type="search"
                aria-label="Search tenants"
                placeholder="Search clubs, IDs or domains…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              aria-label="Filter environment"
              value={environment}
              onChange={(e) => {
                setEnvironment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All environments</option>
              {environments.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
            <select
              aria-label="Filter status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
              <option value="deleted">Marked for deletion</option>
            </select>
          </div>
          <div role="status" aria-live="polite">
            {deletionNotice}
          </div>
          <div
            className={`directory-layout ${selected ? 'has-selection' : ''}`}
          >
            <section className="directory" aria-label="Tenant directory">
              <header className="directory-heading">
                <span>YOUR TENANTS</span>
                <span className="count">{list?.total ?? '—'}</span>
              </header>
              {listError ? (
                <div className="directory-error">
                  <ErrorText error={listError} />
                  <button
                    className="button secondary small"
                    onClick={() => setRefresh((n) => n + 1)}
                  >
                    Retry
                  </button>
                </div>
              ) : listLoading ? (
                <div className="list-loading" role="status">
                  Loading tenants…
                </div>
              ) : list?.items.length ? (
                <div className="tenant-list">
                  {list.items.map((t) => (
                    <button
                      key={`${t.environment}/${t.id}`}
                      type="button"
                      className={`tenant-row ${selected?.id === t.id && selected?.environment === t.environment ? 'selected' : ''}`}
                      disabled={saving}
                      aria-label={`Open ${t.public.name} in ${t.environment}`}
                      aria-pressed={
                        selected?.id === t.id &&
                        selected?.environment === t.environment
                      }
                      onClick={() => void open(t)}
                    >
                      <div className="tenant-row-top">
                        <div className="tenant-avatar">
                          {t.public.name
                            .replace(/^FC\s*/i, '')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="tenant-row-name">
                          <strong>{t.public.name}</strong>
                          <small>{t.id}</small>
                        </div>
                        <ChevronRightIcon className="row-chevron" />
                      </div>
                      <p>{t.hostname}</p>
                      <div className="tenant-row-bottom">
                        <Badge value={t.deletionId ? 'deleted' : t.status} />
                        <span>{t.environment}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No tenants found"
                  description={
                    query || environment || status
                      ? 'Try a different search or filter.'
                      : 'Create your first tenant to get started.'
                  }
                />
              )}
              <footer className="pagination">
                <span>
                  {list?.total
                    ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, list.total)} of ${list.total}`
                    : '0 tenants'}
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Previous page"
                    disabled={page === 1 || listLoading}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    <ChevronLeftIcon />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next page"
                    disabled={!list || page * 20 >= list.total || listLoading}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              </footer>
            </section>
            {selected ? (
              <div className="detail-wrapper">
                <button
                  className="text-button mobile-back"
                  disabled={saving}
                  onClick={() => {
                    if (!dirty || window.confirm('Discard unsaved changes?')) {
                      invalidateEditor();
                      setSelected(null);
                      setTenant(null);
                      setDirty(false);
                    }
                  }}
                >
                  <ChevronLeftIcon />
                  Back to tenants
                </button>
                {detailError ? (
                  <div className="detail-error">
                    <ErrorText error={detailError} />
                    <button
                      className="button secondary"
                      onClick={() => void open(selected)}
                    >
                      Try again
                    </button>
                  </div>
                ) : tenant ? (
                  <TenantEditor
                    key={`${selected.environment}/${selected.id}/${editorEpoch}`}
                    tenant={tenant}
                    request={request}
                    onUpdated={(next) => {
                      if (currentEditor()) updated(next);
                    }}
                    onBusyChange={(busy) => {
                      if (currentEditor()) setSaving(busy);
                    }}
                    dirty={dirty}
                    setDirty={(next) => {
                      if (currentEditor()) setDirty(next);
                    }}
                    onDeleted={() => {
                      if (currentEditor()) deleted();
                    }}
                    onReload={() => {
                      if (!currentEditor()) return;
                      setPage(1);
                      setRefresh((n) => n + 1);
                      void open(selected);
                    }}
                  />
                ) : (
                  <div className="detail-loading" role="status">
                    Loading tenant details…
                  </div>
                )}
              </div>
            ) : (
              <section className="welcome-pane">
                <div className="welcome-graphic">
                  <BuildingOffice2Icon />
                  <span className="graphic-dot one" />
                  <span className="graphic-dot two" />
                </div>
                <div className="eyebrow">A HOME FOR EVERY CLUB</div>
                <h2 ref={welcomeHeading} tabIndex={-1}>
                  A clear view of your platform.
                </h2>
                <p>
                  Select a tenant to manage its domains, configuration,
                  connections and people.
                </p>
                <div className="welcome-features">
                  <span>
                    <ShieldCheckIcon />
                    Controlled access
                  </span>
                  <span>
                    <CircleStackIcon />
                    Separate tenant identities
                  </span>
                </div>
              </section>
            )}
          </div>
          <footer className="workspace-footer">
            <span>
              Kick Playr <span>·</span> Tenant Explorer
            </span>
            <span>All times Europe/Zurich</span>
          </footer>
        </main>
      </div>
      {creating && (
        <CreateTenant
          request={request}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            invalidateEditor();
            setCreating(false);
            setDirty(false);
            setSelected(created);
            setTenant(created);
            setDetailError(undefined);
            setDeletionNotice('');
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
