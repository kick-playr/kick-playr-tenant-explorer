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
  async function save(
    collection: CatalogCollection,
    flag: string,
    label: string,
    ids: number[],
  ) {
    if (!catalogs || pending || busy) return;
    onDirtyChange('catalog:bexio', true);
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
      onDirtyChange('catalog:bexio', false);
      setPending(false);
      onBusyChange?.(false);
    }
  }
  function refresh() {
    if (pending || busy) return;
    loaded.current = false;
    setReload((n) => n + 1);
  }
  return (
    <section className="bexio-tag-mappings" aria-label="Bexio tags and labels">
      <h3>Tags and labels</h3>
      <p className="muted">
        Assign the Bexio categories and tags used by your club’s workflows.
        Changes save automatically. Open assigned labels directly in Bexio.
        Explorer access is assigned separately.
      </p>
      <p className="muted">
        Team settings, seasons and team-specific assignments remain in the club
        application.
      </p>
      {error && <Notice error>{error}</Notice>}
      {pending ? (
        <p role="status">Saving mapping…</p>
      ) : (
        message && <p role="status">{message}</p>
      )}
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
        [
          {
            title: 'Categories and tags',
            roles: false,
            description:
              'Identify contacts throughout your club’s workflows, from trials to billing and clothing.',
          },
          {
            title: 'Roles',
            roles: true,
            description:
              'Assign the categories and tags that identify functions and roles within your club.',
          },
        ].map((section) => (
          <section key={section.title} className="bexio-mapping-section">
            <h3>{section.title}</h3>
            <p className="muted">{section.description}</p>
            {BEXIO_MAPPING_GROUPS.map((group) => {
              const roleKeys =
                group.collection === 'categories'
                  ? ['is1418Coach', 'isTrainerChild', 'isTrainer']
                  : [
                      'isTrainer',
                      'isAthleticTrainer',
                      'isGoalieTrainer',
                      'isCoach',
                      'isCoTrainer',
                    ];
              const fields = group.fields.filter(
                (field) => roleKeys.includes(field.key) === section.roles,
              );
              const snapshot = catalogs[group.collection];
              const resource =
                group.collection === 'categories'
                  ? 'kontakt_kategorie'
                  : 'kontakt_branche';
              return (
                <section
                  key={group.collection}
                  className="bexio-mapping-group"
                  aria-label={`${section.title}: ${group.title}`}
                >
                  <div className="bexio-group-heading">
                    <h4>{group.title}</h4>
                    <span className="muted">
                      Create and manage labels in Bexio
                    </span>
                    <a
                      className="button"
                      href={`https://office.bexio.com/index.php/${resource}/list`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Bexio ↗ Manage
                    </a>
                  </div>
                  {fields.map((field) => {
                    const key = `${group.collection}:${field.key}`;
                    const selected = mappingIds(snapshot, field.key);
                    return (
                      <div key={field.key} className="bexio-mapping">
                        <label
                          className="bexio-mapping-label"
                          htmlFor={`bexio-${key}`}
                          title={field.hint}
                        >
                          {field.label}
                        </label>
                        <div className="bexio-mapping-controls">
                          <div className="bexio-select-row">
                            <select
                              id={`bexio-${key}`}
                              value={
                                selected.length > 1
                                  ? 'multiple'
                                  : (selected[0] ?? '')
                              }
                              disabled={
                                busy || pending || !snapshot.items.length
                              }
                              onChange={(e) =>
                                void save(
                                  group.collection,
                                  field.key,
                                  field.label,
                                  e.target.value
                                    ? [Number(e.target.value)]
                                    : [],
                                )
                              }
                            >
                              <option value="">Choose a label…</option>
                              {selected.length > 1 && (
                                <option value="multiple" disabled>
                                  {selected
                                    .map(
                                      (id) =>
                                        snapshot.items.find(
                                          (item) => item.id === id,
                                        )?.name,
                                    )
                                    .join(', ')}{' '}
                                  (multiple labels)
                                </option>
                              )}
                              {snapshot.items.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            {selected.map((id) => {
                              const item = snapshot.items.find(
                                (option) => option.id === id,
                              )!;
                              return (
                                <a
                                  key={id}
                                  className="bexio-direct-link"
                                  href={`https://office.bexio.com/index.php/${resource}/edit/id/${id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Open ${item.name} in Bexio`}
                                  title={`Open ${item.name} in Bexio`}
                                >
                                  <span
                                    className="bexio-icon"
                                    aria-hidden="true"
                                  />
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </section>
        ))
      )}
    </section>
  );
}
