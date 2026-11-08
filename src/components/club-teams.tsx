'use client';
import { TeamMatrixProvider, TeamMatrixRooms } from './team-matrix-rooms';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, type Transport } from '../lib/api';
import {
  checkedTeamCatalog,
  checkedTeamInventory,
  checkedTeamOperation,
  operationKey,
  type TeamInventory,
  type TeamOperation,
  type TeamReadiness,
  type TeamItem,
  type TeamCommandResult,
} from '../lib/club-teams';
import { Dialog, ErrorText, Field, Notice, PanelHeading } from './ui';
interface Creation {
  operationKey: string;
  name: string;
  expectedHash: string;
}
interface Seasons {
  currentSaison?: string;
  nextSaison?: string;
}
const messages = {
  verified: 'Verified',
  'name-differs': 'Name differs — review',
  missing: 'Linked category missing',
  unavailable: 'Check unavailable',
};
export function ClubTeams({
  path,
  request,
  onBusyChange,
  onDirtyChange,
}: {
  path: string;
  request: Transport;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [inventory, setInventory] = useState<TeamInventory>();
  const [settings, setSettings] = useState<Seasons>();
  const [settingsError, setSettingsError] = useState<unknown>();
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const [readiness, setReadiness] = useState<TeamReadiness>();
  const [readinessError, setReadinessError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [ownBusy, setBusy] = useState(false);
  const [matrixBusy, setMatrixBusy] = useState(false),
    [matrixDirty, setMatrixDirty] = useState(false);
  const busy = ownBusy || matrixBusy;
  const [reconcile, setReconcile] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [review, setReview] = useState(false);
  const [creation, setCreation] = useState<Creation>();
  const [creationError, setCreationError] = useState(false);
  const [reviewTeam, setReviewTeam] = useState<TeamItem>();
  const [reviewName, setReviewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [matrixReload, setMatrixReload] = useState(0);
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const lock = useRef(false),
    life = useRef({ active: false });
  const dirtyCallback = useRef(onDirtyChange),
    busyCallback = useRef(onBusyChange);
  useLayoutEffect(() => {
    dirtyCallback.current = onDirtyChange;
    busyCallback.current = onBusyChange;
  }, [onDirtyChange, onBusyChange]);
  const storageKey = 'club-team-create:' + path;
  useEffect(() => {
    const relinkDraft = !!reviewTeam && reviewName !== reviewTeam.name;
    dirtyCallback.current(
      (adding && !!name.trim()) || matrixDirty || relinkDraft,
    );
  }, [adding, name, matrixDirty, reviewTeam, reviewName]);
  const active = (scope = life.current) =>
    scope.active && scope === life.current;
  async function loadTeams() {
    const scope = life.current;
    const next = checkedTeamInventory(await request(path + '/teams'));
    if (active(scope)) {
      setInventory(next);
      setReconcile(false);
    }
    return next;
  }
  async function checkReadiness() {
    const scope = life.current;
    setChecking(true);
    setReadinessError(false);
    try {
      const v = (await request(path + '/teams/readiness')) as TeamReadiness;
      if (
        !v ||
        !Array.isArray(v.items) ||
        typeof v.checkedAt !== 'string' ||
        v.items.some(
          (t) =>
            !Number.isSafeInteger(t.id) || !Object.hasOwn(messages, t.status),
        )
      )
        throw Error();
      if (active(scope)) setReadiness(v);
    } catch {
      if (active(scope)) {
        setReadinessError(true);
        setReadiness(undefined);
      }
    } finally {
      if (active(scope)) setChecking(false);
    }
  }
  useEffect(() => {
    const scope = { active: true };
    life.current = scope;
    void Promise.resolve().then(() => {
      if (!scope.active) return;
      setInventory(undefined);
      setError(undefined);
      setSettingsError(undefined);
      setReconcile(false);
      void loadTeams().catch((e) => {
        if (scope.active) setError(e);
      });
      void request(path + '/settings').then(
        (v) => {
          if (scope.active) setSettings(v as Seasons);
        },
        (e) => {
          if (scope.active) setSettingsError(e);
        },
      );
      void checkReadiness();
      try {
        const stored = JSON.parse(
          window.localStorage.getItem(storageKey) ?? 'null',
        ) as Creation | null;
        if (
          stored &&
          operationKey(stored.operationKey) &&
          typeof stored.name === 'string' &&
          typeof stored.expectedHash === 'string'
        ) {
          setCreation(stored);
          setName(stored.name);
          setCreationError(true);
        }
      } catch {
        /* Durable server operations remain available when browser storage is unavailable. */
      }
    });
    return () => {
      scope.active = false;
      dirtyCallback.current(false);
      busyCallback.current(false);
    };
    // All async responses are scoped to this mounted club/environment, keyed by the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, request, reload]);
  async function mutation(work: () => Promise<void>) {
    if (lock.current || !inventory || reconcile) return;
    lock.current = true;
    setBusy(true);
    busyCallback.current(true);
    setError(undefined);
    setNotice('');
    try {
      await work();
    } catch (e) {
      if (active()) setError(e);
    } finally {
      lock.current = false;
      if (active()) {
        setBusy(false);
        busyCallback.current(false);
      }
    }
  }
  async function toggle(team: TeamItem, season: string) {
    await mutation(async () => {
      const catalog = inventory!.catalog,
        selected = team.saison?.includes(season) ?? false;
      const selectedTeamIds = catalog.items
        .filter(
          (t) =>
            t.isTeam &&
            (t.id === team.id ? !selected : t.saison?.includes(season)),
        )
        .map((t) => t.id);
      try {
        const saved = checkedTeamCatalog(
          await request(path + '/catalog/categories/team-seasons', {
            method: 'PUT',
            body: JSON.stringify({
              selectedTeamIds,
              season,
              expectedHash: catalog.hash,
            }),
          }),
        );
        if (active()) {
          setInventory((prev) => (prev ? { ...prev, catalog: saved } : prev));
          setNotice(`${team.name} #${team.id} · ${season}: saved.`);
        }
      } catch (e) {
        if (!active()) return;
        setReconcile(true);
        try {
          await loadTeams();
          setNotice(
            e instanceof ApiError && e.status === 409
              ? 'Changed elsewhere. Review the latest selection and try again.'
              : 'The result was not confirmed. The latest saved selection has been reloaded.',
          );
        } catch {
          if (active()) {
            setReconcile(true);
            setNotice(
              'Result not confirmed. Reload the teams before making another change.',
            );
          }
        }
        throw e;
      }
    });
  }
  function remember(c: Creation) {
    setCreation(c);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(c));
    } catch {
      /* Server intent is the durable authority. */
    }
  }
  function forget() {
    setCreation(undefined);
    setCreationError(false);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {}
  }
  async function acceptResult(raw: unknown) {
    const result = raw as TeamCommandResult;
    const op = checkedTeamOperation(result?.operation);
    const catalog = result.catalog
      ? checkedTeamCatalog(result.catalog)
      : undefined;
    if (!active()) return;
    if (op.state === 'complete' && catalog) {
      setInventory((prev) =>
        prev
          ? {
              catalog,
              operations: prev.operations.filter(
                (o) => o.operationKey !== op.operationKey,
              ),
            }
          : prev,
      );
      if (op.operationKey === creation?.operationKey || adding) {
        forget();
        setAdding(false);
        setName('');
        setReview(false);
      }
      setNotice(
        `${op.name} #${op.categoryId}: team and Bexio category confirmed.`,
      );
      setMatrixReload((v) => v + 1);
      void checkReadiness();
    } else {
      setInventory((prev) =>
        prev
          ? {
              ...prev,
              operations: [
                ...prev.operations.filter(
                  (o) => o.operationKey !== op.operationKey,
                ),
                op,
              ],
            }
          : prev,
      );
      setCreationError(true);
      setNotice(
        op.message ??
          (op.state === 'unknown'
            ? 'Creation result is uncertain. Check status before trying again.'
            : 'Creation incomplete. Continue setup to confirm the existing operation.'),
      );
      // The server has durably recorded this operation. Move recovery to its
      // operation row and fetch the latest CAS hash before local-link retry.
      if (adding || creation?.operationKey === op.operationKey) {
        forget();
        setAdding(false);
        setName('');
        setReview(false);
      }
      try {
        await loadTeams();
      } catch (e) {
        if (active()) {
          setReconcile(true);
          setError(e);
        }
      }
    }
  }
  async function create() {
    await mutation(async () => {
      const c = creation ?? {
        operationKey: crypto.randomUUID(),
        name: name.trim(),
        expectedHash: inventory!.catalog.hash,
      };
      remember(c);
      try {
        await acceptResult(
          await request(path + '/teams/create', {
            method: 'POST',
            body: JSON.stringify(c),
          }),
        );
      } catch (e) {
        if (active()) {
          setCreationError(true);
          setNotice(
            'Result not confirmed. Check creation status before starting another creation.',
          );
        }
        throw e;
      }
    });
  }
  async function resume(op: TeamOperation) {
    await mutation(async () => {
      await acceptResult(
        await request(`${path}/teams/operations/${op.operationKey}/resume`, {
          method: 'POST',
          body: JSON.stringify({ expectedHash: inventory!.catalog.hash }),
        }),
      );
    });
  }
  async function reviewCategory(
    team: TeamItem,
    change?: { name: string } | { action: 'delete' },
  ) {
    const deleting = change && 'action' in change;
    const relinking = change && 'name' in change;
    await mutation(async () => {
      try {
        const result = (await request(`${path}/teams/${team.id}/refresh`, {
          method: 'POST',
          body: JSON.stringify({
            expectedHash: inventory!.catalog.hash,
            ...change,
          }),
        })) as { catalog: unknown; issue?: string };
        if (result.issue) {
          const issues: Record<string, string> = {
            'name-missing': 'Bexio has no category with that exact name.',
            'name-ambiguous':
              'Bexio has multiple categories with that name. Resolve the duplicate names and try again.',
            'category-valid':
              'The recorded Bexio category is available again. Review its current name.',
            'category-in-use':
              'The matching Bexio category already belongs to another team or has saved team records.',
          };
          if (active()) {
            setError(
              new Error(
                issues[result.issue] ??
                  'The Bexio category could not be verified.',
              ),
            );
            if (result.issue === 'category-valid') void checkReadiness();
          }
          return;
        }
        const catalog = checkedTeamCatalog(result.catalog);
        if (active()) {
          setInventory((prev) => (prev ? { ...prev, catalog } : prev));
          setReviewTeam(undefined);
          setNotice(
            deleting
              ? 'Team deleted from the club catalogue.'
              : relinking
                ? 'Team relinked to the matching Bexio category.'
                : 'Team name refreshed from Bexio.',
          );
          if (change) setMatrixReload((v) => v + 1);
          void checkReadiness();
        }
      } catch (e) {
        if (!active()) return;
        setReconcile(true);
        try {
          const latest = await loadTeams();
          if (!active()) return;
          if (
            deleting &&
            latest.catalog.items.some((t) => t.id === team.id && !t.isTeam)
          ) {
            setReviewTeam(undefined);
            setNotice('Team deleted from the club catalogue.');
            setMatrixReload((v) => v + 1);
            void checkReadiness();
            return;
          }
          const relinked = relinking
            ? latest.catalog.items.find(
                (item) =>
                  item.isTeam && item.previousCategoryIds?.includes(team.id),
              )
            : undefined;
          if (relinked) {
            setReviewTeam(undefined);
            setNotice(`Team is linked to ${relinked.name} #${relinked.id}.`);
            setMatrixReload((v) => v + 1);
            void checkReadiness();
            return;
          }
          setReviewTeam(
            latest.catalog.items.find((t) => t.id === team.id && t.isTeam),
          );
          setNotice(
            e instanceof ApiError && e.status === 409
              ? 'Changed elsewhere. Review the latest category and confirm again.'
              : 'The result was not confirmed. The latest saved configuration has been reloaded.',
          );
        } catch {
          if (active()) {
            setReconcile(true);
            setNotice(
              'Result not confirmed. Close this review and reload teams before making another change.',
            );
          }
        }
        throw e;
      }
    });
  }
  const teams = (inventory?.catalog.items ?? [])
    .filter((t) => t.isTeam)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const visible = teams.filter((t) =>
    (t.name + ' ' + t.id).toLowerCase().includes(search.toLowerCase()),
  );
  const reviewStatus = readiness?.items.find(
    (item) => item.id === reviewTeam?.id,
  );
  const seasons = [
    { label: 'Current', season: settings?.currentSaison },
    ...(settings?.currentSaison === settings?.nextSaison &&
    settings?.currentSaison
      ? []
      : [{ label: 'Next', season: settings?.nextSaison }]),
  ];
  return (
    <div className="club-teams">
      {error != null && !reviewTeam && !adding && <ErrorText error={error} />}
      {notice && <Notice>{notice}</Notice>}
      {(!inventory || reconcile) && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setReload((v) => v + 1)}
        >
          Reload teams
        </button>
      )}
      <section aria-label="All teams">
        <PanelHeading
          title="1. All teams"
          description="Every configured club team, including teams without an active season."
          aside={
            <button
              className="button primary"
              disabled={!inventory || busy || reconcile || !!creation}
              onClick={() => {
                setName('');
                setReview(false);
                setCreationError(false);
                setAdding(true);
              }}
            >
              Add team
            </button>
          }
        />
        <div className="team-toolbar">
          <Field label="Find a team">
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <button
            className="button secondary"
            disabled={checking || busy}
            onClick={() => void checkReadiness()}
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
        {readinessError && (
          <Notice>
            Bexio verification is unavailable. Season selection remains
            available.
          </Notice>
        )}
        {readiness && (
          <p className="field-hint">
            Last check: {new Date(readiness.checkedAt).toLocaleString()}
          </p>
        )}
        {!inventory && !error && <p role="status">Loading teams…</p>}
        {inventory && teams.length === 0 && (
          <p>No teams configured. Add a team to get started.</p>
        )}
        {inventory && teams.length > 0 && visible.length === 0 && (
          <p>No teams match this search.</p>
        )}
        <TeamMatrixProvider
          key={path}
          path={path}
          request={request}
          externalBusy={ownBusy}
          reloadSignal={matrixReload}
          onDirtyChange={setMatrixDirty}
          onBusyChange={(value) => {
            setMatrixBusy(value);
            busyCallback.current(value);
          }}
        >
          <div className="team-inventory">
            {visible.map((team) => {
              const ready = readiness?.items.find((r) => r.id === team.id);
              return (
                <article
                  key={team.id}
                  className="team-card"
                  data-readiness={ready?.status}
                >
                  <h3>{team.name}</h3>
                  <div>
                    <span className="field-hint">Bexio category</span>
                    <p>
                      {ready?.upstreamName ?? team.name} · #{team.id}
                    </p>
                  </div>
                  <p className="team-readiness">
                    {ready
                      ? messages[ready.status]
                      : checking
                        ? 'Checking…'
                        : readinessError
                          ? 'Check unavailable'
                          : 'Not checked'}
                  </p>
                  <TeamMatrixRooms team={team} />
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setReviewName(team.name);
                      setConfirmDelete(false);
                      setReviewTeam(team);
                    }}
                    aria-label={`Review ${team.name} #${team.id}`}
                  >
                    Review
                  </button>
                </article>
              );
            })}
          </div>
        </TeamMatrixProvider>
        {(inventory?.operations.length ?? 0) > 0 && (
          <section aria-label="Incomplete team creation">
            <h3>Incomplete team creation</h3>
            {inventory!.operations.map((op) => (
              <div className="team-operation" key={op.operationKey}>
                <p>
                  {op.name}
                  {op.categoryId ? ` #${op.categoryId}` : ''} · {op.state}
                </p>
                <p className="field-hint">
                  Operation {op.operationKey}. {op.message}
                </p>
                <button
                  className="button secondary"
                  disabled={busy || reconcile}
                  onClick={() => void resume(op)}
                  aria-label={`Check status for ${op.name}`}
                >
                  {op.state === 'link-pending'
                    ? 'Continue setup'
                    : 'Check status'}
                </button>
              </div>
            ))}
          </section>
        )}
        {creation &&
          !inventory?.operations.some(
            (o) => o.operationKey === creation.operationKey,
          ) &&
          !adding && (
            <Notice>
              Result not confirmed for {creation.name}.{' '}
              <button
                className="text-button"
                disabled={busy || reconcile}
                onClick={() => void create()}
              >
                Check creation status
              </button>
            </Notice>
          )}
      </section>
      <section aria-label="Active teams by season">
        <PanelHeading
          title="2. Active teams by season"
          description="Click a team to enable or disable it. Changes are saved immediately."
        />
        {settingsError != null ? (
          <ErrorText error={settingsError} />
        ) : !settings ? (
          <p role="status">Loading seasons…</p>
        ) : (
          seasons.map(({ label, season }) =>
            season && /^\d{2}(?:\d{2})?\.[12]$/.test(season) ? (
              <fieldset
                className="team-season"
                key={label}
                disabled={!inventory || busy || reconcile}
              >
                <legend>
                  {label} · {season}
                </legend>
                <div className="team-toggles">
                  {visible.map((team) => (
                    <SeasonTeamButton
                      key={team.id}
                      team={team}
                      label={label}
                      season={season}
                      onToggle={toggle}
                    />
                  ))}
                </div>
              </fieldset>
            ) : (
              <p key={label}>
                {label}: season is not configured. Configure it in Settings.
              </p>
            ),
          )
        )}
        {busy && <p role="status">Saving…</p>}
      </section>
      {adding && (
        <Dialog
          title="Add team"
          busy={busy}
          onClose={() => {
            setAdding(false);
            setReview(false);
          }}
        >
          {error != null && <ErrorText error={error} />}
          <p className="modal-intro">
            Links a matching Bexio category or creates one if needed. New teams
            start without a season.
          </p>
          <p className="field-hint">
            Club / environment: {path.split('/').slice(1).reverse().join(' / ')}
          </p>
          {review ? (
            <>
              <p>
                Team name: <strong>{name.trim()}</strong>
              </p>
            </>
          ) : (
            <Field label="Team name">
              <input
                maxLength={256}
                value={name}
                disabled={busy || !!creation}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          {creationError && (
            <Notice>
              Result not confirmed. Check this creation using the same
              operation; do not submit a new category.
            </Notice>
          )}
          <div className="actions">
            {creationError ? (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void create()}
              >
                Check creation status
              </button>
            ) : review ? (
              <>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setReview(false)}
                >
                  Back
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void create()}
                >
                  Link or create team
                </button>
              </>
            ) : (
              <button
                className="button primary"
                disabled={!name.trim() || busy}
                onClick={() => setReview(true)}
              >
                Review creation
              </button>
            )}
          </div>
        </Dialog>
      )}
      {reviewTeam && (
        <Dialog
          title={`Review ${reviewTeam.name} #${reviewTeam.id}`}
          busy={busy}
          onClose={() => setReviewTeam(undefined)}
        >
          {error != null && <ErrorText error={error} />}
          <p>
            Recorded category: {reviewTeam.name} · #{reviewTeam.id}
          </p>
          {reviewStatus?.status === 'missing' && confirmDelete ? (
            <>
              <p>
                Delete {reviewTeam.name} from the club catalogue and remove its
                season selections? Saved season records and Matrix mappings
                will be kept.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={busy || checking || reconcile || matrixDirty}
                  onClick={() =>
                    void reviewCategory(reviewTeam, { action: 'delete' })
                  }
                >
                  Confirm deletion
                </button>
              </div>
            </>
          ) : reviewStatus?.status === 'missing' ? (
            <>
              <p>
                Bexio could not find category #{reviewTeam.id}. Relink the team
                to a replacement category or delete it from the club catalogue.
              </p>
              <Field label="New team name">
                <input
                  value={reviewName}
                  onChange={(event) => setReviewName(event.target.value)}
                  maxLength={256}
                  disabled={busy}
                />
              </Field>
              {matrixDirty && (
                <Notice>
                  Save your Matrix drafts before relinking or deleting the team.
                </Notice>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={
                    busy || reconcile || matrixDirty || !reviewName.trim()
                  }
                  onClick={() =>
                    void reviewCategory(reviewTeam, { name: reviewName.trim() })
                  }
                >
                  Validate and relink
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={busy || checking || reconcile || matrixDirty}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete team
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Bexio category{' '}
                {reviewStatus?.upstreamName ?? 'verification unavailable'} · #
                {reviewTeam.id}
              </p>
              <button
                type="button"
                className="button primary"
                disabled={busy || reconcile}
                onClick={() => void reviewCategory(reviewTeam)}
              >
                Confirm name refresh
              </button>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

function SeasonTeamButton({
  team,
  label,
  season,
  onToggle,
}: {
  team: TeamItem;
  label: string;
  season: string;
  onToggle: (team: TeamItem, season: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      className="button secondary team-toggle"
      aria-pressed={team.saison?.includes(season) ?? false}
      aria-label={`${team.name} #${team.id} · ${label} ${season}`}
      onClick={() => {
        void onToggle(team, season);
      }}
    >
      <span aria-hidden="true">
        {team.saison?.includes(season) ? '✓' : '○'}
      </span>{' '}
      {team.name} <span className="field-hint">#{team.id}</span>
    </button>
  );
}
