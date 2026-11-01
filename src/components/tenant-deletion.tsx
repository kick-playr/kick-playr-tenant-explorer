'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { tenantPath, type Transport } from '../lib/api';
import type { DeletionStatus } from '../lib/tenant-deletion';
import { Dialog, ErrorText, Field, Notice, PanelHeading } from './ui';
export function TenantDeletion({
  environment,
  tenantId,
  marked = false,
  request,
  onReload,
  disabled = false,
  onBusyChange,
}: {
  environment: string;
  tenantId: string;
  marked?: boolean;
  request: Transport;
  onReload: () => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [state, setState] = useState<DeletionStatus | null>(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<'remove' | 'recover' | 'purge' | null>(null),
    [confirmation, setConfirmation] = useState(''),
    [completed, setCompleted] = useState<string[]>([]),
    [allDone, setAllDone] = useState(false),
    [ownershipConfirmed, setOwnershipConfirmed] = useState(false),
    [unregisteredResourcesConfirmed, setUnregisteredResourcesConfirmed] =
      useState(false),
    [controlOnlyConfirmed, setControlOnlyConfirmed] = useState(false);
  const path = `${tenantPath(environment, tenantId)}/deletion`,
    identity = `${environment}/${tenantId}`;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await request(path, { signal });
      if (
        !signal?.aborted &&
        result &&
        typeof result === 'object' &&
        'inventory' in result
      )
        setState(result as DeletionStatus);
    },
    [request, path],
  );
  useEffect(() => {
    const controller = new AbortController();
    request(path, { signal: controller.signal })
      .then((result) => {
        if (
          !controller.signal.aborted &&
          result &&
          typeof result === 'object' &&
          'inventory' in result
        )
          setState(result as DeletionStatus);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e);
      });
    return () => controller.abort();
  }, [request, path]);
  const reset = () => {
    setConfirmation('');
    setCompleted([]);
    setAllDone(false);
    setOwnershipConfirmed(false);
    setUnregisteredResourcesConfirmed(false);
    setControlOnlyConfirmed(false);
  };
  function open(next: typeof mode) {
    reset();
    setError(undefined);
    setMode(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!state || busy || !mode || confirmation !== identity) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(undefined);
    const action = mode;
    try {
      await request(action === 'remove' ? path : `${path}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: state.expectedRevision,
          confirmation,
          ...(action === 'remove'
            ? {
                expectedAuthorityRevision: state.expectedAuthorityRevision,
                expectedInvitationRevision: state.expectedInvitationRevision,
              }
            : {
                operationId: state.operation!.id,
                expectedOperationRevision: state.operation!.revision,
              }),
          ...(action === 'purge'
            ? {
                completed,
                allDone,
                ownershipConfirmed,
                unregisteredResourcesConfirmed,
                controlOnly:
                  state.inventory.controlOnly ??
                  state.inventory.targets.length === 0,
                expectedInventoryRevision: state.inventory.revision,
              }
            : {}),
        }),
      });
      setMode(null);
      reset();
      try {
        await load();
      } catch (refreshError) {
        setError(refreshError);
      } finally {
        onReload();
      }
    } catch (e) {
      setError(e);
      reset();
      await load().catch(() => {});
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  const op = state?.operation,
    deleted = marked || Boolean(op && op.phase !== 'recovered');
  const enabled = Boolean(
    state &&
    confirmation === identity &&
    (mode !== 'purge' ||
      (allDone &&
        ownershipConfirmed &&
        unregisteredResourcesConfirmed &&
        (!(
          state.inventory.controlOnly ?? state.inventory.targets.length === 0
        ) ||
          controlOnlyConfirmed) &&
        completed.length === state.checklist.length &&
        state.inventory.complete)),
  );
  const activeLease = state?.purgeInProgress ?? false;
  return (
    <section className="deletion-section" aria-label="Tenant deletion">
      <PanelHeading
        title={deleted ? 'Tenant deletion' : 'Danger zone'}
        description={identity}
      />
      {error ? <ErrorText error={error} /> : null}
      {!state ? (
        <p role="status">Loading deletion impact…</p>
      ) : (
        <>
          {deleted && op ? (
            <>
              <p>
                <strong>
                  {op.phase === 'purged'
                    ? 'Registered tenant databases and tenant control records deleted'
                    : op.phase === 'failed'
                      ? 'Cleanup incomplete'
                      : op.phase === 'purging'
                        ? 'Permanent deletion in progress'
                        : 'Tenant access blocked; data retained for recovery'}
                </strong>
              </p>
              <p>
                Recovery deadline:{' '}
                {new Intl.DateTimeFormat('en-GB', {
                  timeZone: 'Europe/Zurich',
                  dateStyle: 'long',
                  timeStyle: 'short',
                }).format(new Date(op.recoverUntil))}{' '}
                (Europe/Zurich).
              </p>
              <p>
                Operation <code>{op.id}</code>
              </p>
              {op.error ? <Notice error>{op.error}</Notice> : null}
              {op.targets.length > 0 && (
                <ul>
                  {op.targets.map((t) => (
                    <li key={t.id}>
                      {t.label}:{' '}
                      {t.done ? 'Deletion verified' : 'Pending verification'}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p>
              Deletion immediately blocks access and retains data for three
              calendar months. Permanent deletion is available anytime after
              manual cleanup confirmation.
            </p>
          )}
          {op?.phase !== 'purged' && (
            <>
              <p>
                Registered tenant databases are derived from authenticated
                runtime configuration. Confirm their exclusive ownership before
                permanent deletion. Shared resources remain protected.
              </p>
              {state.inventory.reason && (
                <Notice error>{state.inventory.reason}</Notice>
              )}
              <ul>
                {state.inventory.targets.map((t) => (
                  <li key={t.id}>{t.label}</li>
                ))}
              </ul>
              <p>
                DNS, Clerk, providers, backups, caches and already-running
                external work require the manual checklist. No automatic purge
                occurs at the recovery deadline.
              </p>
            </>
          )}
          <div className="form-actions">
            {!deleted ? (
              <button
                type="button"
                className="button danger"
                disabled={disabled || busy}
                onClick={() => open('remove')}
              >
                Delete tenant…
              </button>
            ) : (
              <>
                {state.recoveryAvailable && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => open('recover')}
                  >
                    Recover to disabled…
                  </button>
                )}
                {op?.phase !== 'purged' && (
                  <button
                    type="button"
                    className="button danger"
                    disabled={busy || activeLease || !state.inventory.complete}
                    onClick={() => open('purge')}
                  >
                    {op?.phase === 'failed' || op?.phase === 'purging'
                      ? 'Retry permanent deletion…'
                      : 'Permanently delete…'}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setError(undefined);
                reset();
                load().catch(setError);
              }}
            >
              Refresh deletion status
            </button>
          </div>
        </>
      )}
      {mode && state && (
        <Dialog
          title={
            mode === 'remove'
              ? 'Delete tenant'
              : mode === 'recover'
                ? 'Recover tenant'
                : 'Permanently delete tenant'
          }
          busy={busy}
          onClose={() => {
            setMode(null);
            reset();
          }}
        >
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <p>
                <strong>{state.identity.name}</strong> · {identity}
              </p>
              <p>
                {state.identity.hostname}
                {state.identity.aliases.length
                  ? ` · ${state.identity.aliases.join(', ')}`
                  : ''}
              </p>
              {mode === 'remove' ? (
                <>
                  <p>
                    Access stops immediately. Retained data can be recovered for
                    three calendar months. Recovery restores a disabled tenant
                    and requires fresh access grants.
                  </p>
                  <p>
                    Affected active users: {state.impact.users}; pending
                    invitations: {state.impact.pendingInvitations}.
                    Already-running external work may still complete.
                  </p>
                </>
              ) : mode === 'recover' ? (
                <p>
                  Recover to disabled. Review and grant access again before
                  activating this tenant.
                </p>
              ) : (
                <>
                  <p>
                    Delete registered tenant databases and tenant control
                    records
                  </p>
                  <p>
                    Permanent deletion is available anytime. Recovery ends
                    immediately. A minimal deletion audit and identity
                    reservations remain.
                  </p>
                  <ul>
                    {state.inventory.targets.map((target) => (
                      <li key={target.id}>{target.label}</li>
                    ))}
                  </ul>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={ownershipConfirmed}
                      onChange={(e) => setOwnershipConfirmed(e.target.checked)}
                    />
                    I confirm the displayed registered databases and tenant
                    control records belong exclusively to this tenant.
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={unregisteredResourcesConfirmed}
                      onChange={(e) =>
                        setUnregisteredResourcesConfirmed(e.target.checked)
                      }
                    />
                    I confirm unregistered databases, external infrastructure
                    and shared resources have been handled manually without
                    deleting others’ data.
                  </label>
                  {(state.inventory.controlOnly ??
                    state.inventory.targets.length === 0) && (
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={controlOnlyConfirmed}
                        onChange={(e) =>
                          setControlOnlyConfirmed(e.target.checked)
                        }
                      />
                      No registered tenant database is listed. Delete tenant
                      control records only.
                    </label>
                  )}
                  <h3>Manual cleanup checklist</h3>
                  {state.checklist.map((item) => (
                    <label className="checkbox-field" key={item.id}>
                      <input
                        type="checkbox"
                        checked={completed.includes(item.id)}
                        onChange={(e) =>
                          setCompleted((previous) =>
                            e.target.checked
                              ? [...previous, item.id]
                              : previous.filter((id) => id !== item.id),
                          )
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                  <p>
                    The server deletes only the registered databases shown above
                    and scoped tenant control records. Unregistered databases
                    and infrastructure require manual cleanup. Shared databases
                    are never dropped.
                  </p>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={allDone}
                      onChange={(e) => setAllDone(e.target.checked)}
                    />
                    I confirm all manual cleanup steps are complete. Delete
                    registered tenant databases and tenant control records now.
                    This cannot be undone.
                  </label>
                </>
              )}
              <Field label={`Type ${identity}`}>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              {error ? (
                <>
                  <ErrorText error={error} />
                  <p>
                    Review updated impact and enter the confirmation again. No
                    automatic retry was made.
                  </p>
                </>
              ) : null}
              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setMode(null);
                    reset();
                  }}
                >
                  Cancel
                </button>
                <button className="button danger" disabled={!enabled || busy}>
                  {busy
                    ? 'Processing…'
                    : mode === 'remove'
                      ? 'Delete tenant'
                      : mode === 'recover'
                        ? 'Recover to disabled'
                        : 'Permanently delete now'}
                </button>
              </div>
            </fieldset>
          </form>
        </Dialog>
      )}
    </section>
  );
}
