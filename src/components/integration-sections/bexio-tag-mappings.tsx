import { useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError, type Transport } from '../../lib/api';
import {
  BEXIO_MAPPING_GROUPS,
  checkedBexioCatalog,
  mappingIds,
  type BexioCatalog,
  type CatalogCollection,
} from '../../lib/bexio-tag-mappings';
import { Notice } from '../ui';
export function BexioTagMappings({
  path,
  request = apiRequest,
  active = true,
  busy,
  onBusyChange,
  onDirtyChange,
}: {
  path: string;
  request?: Transport;
  active?: boolean;
  busy: boolean;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
}) {
  const loaded = useRef(false);
  const [catalogs, setCatalogs] = useState<Record<
    CatalogCollection,
    BexioCatalog
  > | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [reload, setReload] = useState(0);
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    if (!active || loaded.current) return;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    Promise.all(
      ['categories', 'branches'].map((collection) =>
        request(`${path}/catalog/${collection}`, { signal: abort.signal }).then(
          checkedBexioCatalog,
        ),
      ),
    )
      .then(([categories, branches]) => {
        if (!abort.signal.aborted) {
          loaded.current = true;
          setCatalogs({ categories: categories!, branches: branches! });
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Unable to load Bexio mappings.',
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [path, request, active, reload]);
  function setDraft(next: Record<string, number[]>) {
    setDrafts(next);
    onDirtyChange('catalog:bexio', Object.keys(next).length > 0);
    setMessage('');
  }
  function update(
    collection: CatalogCollection,
    flag: string,
    id: number,
    checked: boolean,
  ) {
    const key = `${collection}:${flag}`,
      base = mappingIds(catalogs![collection], flag);
    const selected = drafts[key] ?? base;
    const ids = (
      checked ? [...selected, id] : selected.filter((value) => value !== id)
    ).sort((a, b) => a - b);
    const next = { ...drafts, [key]: ids };
    if (JSON.stringify(ids) === JSON.stringify(base)) delete next[key];
    setDraft(next);
    setError('');
  }
  async function save(
    collection: CatalogCollection,
    flag: string,
    label: string,
  ) {
    const key = `${collection}:${flag}`,
      ids = drafts[key];
    if (!catalogs || !ids || pending || busy) return;
    setPending(true);
    onBusyChange?.(true);
    setError('');
    setMessage('');
    try {
      const response = checkedBexioCatalog(
        await request(`${path}/catalog/${collection}/flags/${flag}`, {
          method: 'PUT',
          body: JSON.stringify({
            expectedHash: catalogs[collection].hash,
            selectors: ids.map((id) => ({ id })),
          }),
        }),
      );
      setCatalogs({ ...catalogs, [collection]: response });
      const next = { ...drafts };
      delete next[key];
      setDraft(next);
      setMessage(`${label} mapping saved.`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'Bexio mappings changed elsewhere. Reload the catalogs before saving again.'
          : e instanceof Error
            ? e.message
            : 'Unable to save Bexio mapping.',
      );
    } finally {
      setPending(false);
      onBusyChange?.(false);
    }
  }
  function refresh() {
    if (pending || busy) return;
    if (
      Object.keys(drafts).length &&
      !window.confirm('Discard unsaved Bexio mappings and reload?')
    )
      return;
    loaded.current = false;
    setDraft({});
    setReload((n) => n + 1);
  }
  return (
    <section className="bexio-tag-mappings" aria-label="Bexio tags and labels">
      <h3>Tags and labels</h3>
      <p className="muted">
        Assign the Bexio categories and tags used by your club’s workflows.
        Multiple labels can be selected for each mapping. Explorer access is
        assigned separately.
      </p>
      <p className="muted">
        Team settings, seasons and team-specific assignments remain in the club
        application.
      </p>
      {error && <Notice error>{error}</Notice>}
      {message && <p role="status">{message}</p>}
      <button
        type="button"
        className="button"
        disabled={busy || pending || loading}
        onClick={refresh}
      >
        Reload Bexio labels
      </button>
      {loading ? (
        <p role="status">Loading Bexio labels…</p>
      ) : (
        catalogs &&
        BEXIO_MAPPING_GROUPS.map((group) => (
          <section key={group.collection} aria-label={group.title}>
            <h4>{group.title}</h4>
            {group.fields.map((field) => {
              const snapshot = catalogs[group.collection],
                key = `${group.collection}:${field.key}`,
                selected = drafts[key] ?? mappingIds(snapshot, field.key);
              const names = snapshot.items
                .filter((item) => selected.includes(item.id))
                .map((item) => `${item.name} (#${item.id})`)
                .join(', ');
              return (
                <details key={field.key} className="bexio-mapping">
                  <summary>
                    <strong>{field.label}</strong>
                    <span className="muted">{names || 'Not configured'}</span>
                  </summary>
                  <p className="muted">{field.hint}</p>
                  <fieldset
                    disabled={busy || pending}
                    className="bexio-label-options"
                    aria-label={`${field.label} labels`}
                  >
                    {snapshot.items.length ? (
                      snapshot.items.map((item) => (
                        <label key={item.id}>
                          <input
                            type="checkbox"
                            aria-label={`${field.label}: ${item.name} (#${item.id})`}
                            checked={selected.includes(item.id)}
                            onChange={(e) =>
                              update(
                                group.collection,
                                field.key,
                                item.id,
                                e.target.checked,
                              )
                            }
                          />
                          {item.name} <span className="muted">#{item.id}</span>
                        </label>
                      ))
                    ) : (
                      <p>No labels configured in this club’s catalog.</p>
                    )}
                  </fieldset>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button primary"
                      disabled={!drafts[key] || busy || pending}
                      onClick={() =>
                        void save(group.collection, field.key, field.label)
                      }
                    >
                      Save {field.label} mapping
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={!drafts[key] || busy || pending}
                      onClick={() => {
                        const next = { ...drafts };
                        delete next[key];
                        setDraft(next);
                      }}
                    >
                      Reset {field.label} mapping
                    </button>
                  </div>
                </details>
              );
            })}
          </section>
        ))
      )}
    </section>
  );
}
