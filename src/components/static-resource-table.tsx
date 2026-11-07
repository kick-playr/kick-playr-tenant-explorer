'use client';
import React, { useState } from 'react';
type Resource = {
  _id: string;
  name: string;
  kind: string;
  currentVersionId: string;
  currentVersionNumber: number;
  revision: number;
};
type Link = { resourceId: string; accessName: string; versionPolicy: string };
export function StaticResourceTable({
  resources,
  links,
  onSave,
  disabled = false,
}: {
  resources: Resource[];
  links: Link[];
  onSave: (rows: Link[]) => Promise<void>;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<Record<string, Link>>(() =>
      Object.fromEntries(links.map((l) => [l.resourceId, l])),
    ),
    [search, setSearch] = useState(''),
    [env, setEnv] = useState(''),
    [filter, setFilter] = useState<'all' | 'linked' | 'unlinked'>('all'),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false);
  const filtered = resources.filter(
      (r) =>
        r.name.toLowerCase().includes(search.toLowerCase()) &&
        (selected[r._id]?.accessName ?? '')
          .toLowerCase()
          .includes(env.toLowerCase()) &&
        (filter === 'all' || (filter === 'linked') === !!selected[r._id]),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / 20)),
    current = Math.min(page, pages - 1);
  const update = (id: string, patch: Partial<Link>) =>
    setSelected({ ...selected, [id]: { ...selected[id]!, ...patch } });
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>
                Link{' '}
                <button
                  aria-label="Linked"
                  aria-pressed={filter === 'linked'}
                  onClick={() => {
                    setFilter(filter === 'linked' ? 'all' : 'linked');
                    setPage(0);
                  }}
                >
                  ☑
                </button>
                <button
                  aria-label="Unlinked"
                  aria-pressed={filter === 'unlinked'}
                  onClick={() => {
                    setFilter(filter === 'unlinked' ? 'all' : 'unlinked');
                    setPage(0);
                  }}
                >
                  ☐
                </button>
              </th>
              <th>
                Secret / key purpose
                <input
                  aria-label="Search key"
                  placeholder="Search key"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </th>
              <th>ID</th>
              <th>Version</th>
              <th>
                ENV / access name
                <input
                  aria-label="Filter by ENV"
                  placeholder="ENV"
                  value={env}
                  onChange={(e) => {
                    setEnv(e.target.value);
                    setPage(0);
                  }}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 20, current * 20 + 20).map((resource) => (
              <tr key={resource._id}>
                <td>
                  <input
                    aria-label={`Link ${resource.name}`}
                    type="checkbox"
                    disabled={disabled || busy}
                    checked={!!selected[resource._id]}
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelected({
                          ...selected,
                          [resource._id]: {
                            resourceId: resource._id,
                            accessName: '',
                            versionPolicy: 'latest',
                          },
                        });
                      else {
                        const next = { ...selected };
                        delete next[resource._id];
                        setSelected(next);
                      }
                    }}
                  />
                </td>
                <td>
                  <strong>{resource.name}</strong>
                  <small style={{ display: 'block' }}>{resource.kind}</small>
                </td>
                <td>
                  <code title={resource._id}>
                    {resource._id.length > 20
                      ? resource._id.slice(0, 18) + '…'
                      : resource._id}
                  </code>
                </td>
                <td>
                  {selected[resource._id] ? (
                    <>
                      <select
                        aria-label={`Version ${resource.name}`}
                        disabled={disabled || busy}
                        value={
                          selected[resource._id]!.versionPolicy === 'latest'
                            ? 'latest'
                            : 'pinned'
                        }
                        onChange={(e) =>
                          update(resource._id, {
                            versionPolicy:
                              e.target.value === 'latest'
                                ? 'latest'
                                : resource.currentVersionId,
                          })
                        }
                      >
                        <option value="latest">Latest</option>
                        <option value="pinned">Specific version</option>
                      </select>
                      {selected[resource._id]!.versionPolicy !== 'latest' && (
                        <input
                          aria-label={`Version ID ${resource.name}`}
                          value={selected[resource._id]!.versionPolicy}
                          disabled={disabled || busy}
                          onChange={(e) =>
                            update(resource._id, {
                              versionPolicy: e.target.value,
                            })
                          }
                        />
                      )}
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td>
                  {selected[resource._id] && (
                    <input
                      aria-label={`ENV ${resource.name}`}
                      disabled={disabled || busy}
                      value={selected[resource._id]!.accessName}
                      onChange={(e) =>
                        update(resource._id, { accessName: e.target.value })
                      }
                      placeholder="CLERK_SECRET_KEY"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginTop: 16,
        }}
      >
        <span>{filtered.length} resources</span>
        {pages > 1 && (
          <div>
            <button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span>
              {' '}
              {current + 1} / {pages}{' '}
            </span>
            <button
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        )}
        <button
          disabled={
            disabled ||
            busy ||
            Object.values(selected).some(
              (l) => !/^[A-Z][A-Z0-9_]{0,127}$/.test(l.accessName),
            )
          }
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(Object.values(selected));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : 'Save links'}
        </button>
      </div>
    </>
  );
}
