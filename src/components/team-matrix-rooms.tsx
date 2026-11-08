'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { type Transport } from '../lib/api';
interface Draft {
  matrixRoomId: string;
  matrixTrainerRoomId: string;
  trainerGroup: string;
}
interface Mapping extends Draft {
  teamId: number;
  canonical?: boolean;
  legacyConflict?: boolean;
  legacyRoomIds?: string[];
  legacyTrainerRoomIds?: string[];
}
interface Inventory {
  revision: string;
  items: Mapping[];
  names?: Record<string, string>;
  groups: { key: string; name: string; roomId: string }[];
}
interface Context {
  data?: Inventory;
  drafts: Record<number, Draft>;
  busy: boolean;
  error: string;
  messages: Record<number, string>;
  errors: Record<number, string>;
  change(id: number, base: Draft, key: keyof Draft, value: string): void;
  run(
    id: number,
    value: Draft,
    action: 'create' | 'reconcile' | 'save',
    review: boolean,
  ): Promise<void>;
  reload(): void;
}
const MatrixContext = createContext<Context | null>(null);
const blank: Draft = {
  matrixRoomId: '',
  matrixTrainerRoomId: '',
  trainerGroup: '',
};
const pick = (v: Draft): Draft => ({
  matrixRoomId: v.matrixRoomId,
  matrixTrainerRoomId: v.matrixTrainerRoomId,
  trainerGroup: v.trainerGroup,
});
function checked(v: unknown): Inventory {
  const value = v as Inventory;
  if (
    !value ||
    typeof value.revision !== 'string' ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.groups) ||
    value.items.some(
      (m) =>
        !Number.isSafeInteger(m.teamId) ||
        ['matrixRoomId', 'matrixTrainerRoomId', 'trainerGroup'].some(
          (k) => typeof m[k as keyof Draft] !== 'string',
        ),
    )
  )
    throw Error('Matrix mappings are unavailable. Reload before editing.');
  return value;
}
export function TeamMatrixProvider({
  path,
  request,
  onDirtyChange,
  onBusyChange,
  externalBusy = false,
  reloadSignal = 0,
  children,
}: {
  path: string;
  request: Transport;
  onDirtyChange(dirty: boolean): void;
  onBusyChange(busy: boolean): void;
  externalBusy?: boolean;
  reloadSignal?: number;
  children: ReactNode;
}) {
  const [data, setData] = useState<Inventory>();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [messages, setMessages] = useState<Record<number, string>>({}),
    [errors, setErrors] = useState<Record<number, string>>({});
  const life = useRef({ active: false, loadSequence: 0 }),
    lock = useRef(false);
  const callbacks = useRef({ onDirtyChange, onBusyChange });
  useEffect(() => {
    callbacks.current = { onDirtyChange, onBusyChange };
  }, [onDirtyChange, onBusyChange]);
  async function load(scope = life.current) {
    if (lock.current) return;
    const sequence = ++scope.loadSequence;
    const active = () =>
      scope.active && scope === life.current && sequence === scope.loadSequence;
    try {
      const next = checked(await request(path + '/chat/team-rooms'));
      if (active()) {
        setData(next);
        setError('');
      }
    } catch (e) {
      if (active())
        setError(
          e instanceof Error ? e.message : 'Unable to load Matrix mappings',
        );
    }
  }
  useEffect(() => {
    const scope = { active: true, loadSequence: 0 };
    life.current = scope;
    void load(scope);
    return () => {
      scope.active = false;
      callbacks.current.onDirtyChange(false);
      callbacks.current.onBusyChange(false);
    };
    // Parent keys this provider by club/environment; drafts survive filtering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, request]);
  useEffect(() => {
    if (reloadSignal) void load();
    // A catalogue relink refreshes mappings within the current provider lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);
  const dirty = Object.entries(drafts).some(
    ([id, value]) =>
      JSON.stringify(value) !==
      JSON.stringify(
        pick(data?.items.find((m) => m.teamId === Number(id)) ?? blank),
      ),
  );
  useEffect(() => callbacks.current.onDirtyChange(dirty), [dirty]);
  function change(id: number, base: Draft, key: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? pick(base)), [key]: value },
    }));
    setMessages((prev) => ({ ...prev, [id]: '' }));
  }
  async function run(
    id: number,
    value: Draft,
    action: 'create' | 'reconcile' | 'save',
    review: boolean,
  ) {
    if (lock.current || externalBusy || !data) return;
    lock.current = true;
    setBusy(true);
    callbacks.current.onBusyChange(true);
    const scope = life.current;
    ++scope.loadSequence;
    setErrors((prev) => ({ ...prev, [id]: '' }));
    setMessages((prev) => ({ ...prev, [id]: '' }));
    const active = () => scope.active && scope === life.current;
    try {
      const body =
        action === 'save'
          ? {
              ...pick(value),
              expectedRevision: data.revision,
              acceptLegacyConflict: review,
            }
          : {
              ...pick(value),
              ...(action === 'reconcile' ? { reconcile: true } : {}),
            };
      const result = await request(
        path + '/chat/team-rooms/' + id + (action === 'save' ? '' : '/create'),
        {
          method: action === 'save' ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        },
      );
      if (!active()) return;
      if (action === 'save') {
        const saved = result as {
          revision: string;
          mapping: Mapping;
          projectionPending: boolean;
          names?: Record<string, string>;
        };
        if (
          !saved ||
          typeof saved.revision !== 'string' ||
          saved.mapping?.teamId !== id
        )
          throw Error(
            'Save result was not confirmed. Reload Matrix mappings before retrying.',
          );
        const mapping = {
          ...saved.mapping,
          canonical: true,
          legacyConflict: false,
        };
        setData((prev) =>
          prev
            ? {
                ...prev,
                revision: saved.revision,
                names: { ...prev.names, ...saved.names },
                items: [...prev.items.filter((m) => m.teamId !== id), mapping],
              }
            : prev,
        );
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setMessages((prev) => ({
          ...prev,
          [id]: saved.projectionPending
            ? 'Mapping saved for all seasons. Older record projection is pending; Save again to retry.'
            : 'Matrix mapping saved for all seasons.',
        }));
      } else {
        const created = result as Draft & {
          warning?: string;
          names?: Record<string, string>;
        };
        if (
          !created ||
          ['matrixRoomId', 'matrixTrainerRoomId', 'trainerGroup'].some(
            (k) => typeof created[k as keyof Draft] !== 'string',
          )
        )
          throw Error(
            'Creation result was not confirmed. Reconcile before retrying.',
          );
        setDrafts((prev) => ({ ...prev, [id]: pick(created) }));
        if (created.names)
          setData((prev) =>
            prev
              ? { ...prev, names: { ...prev.names, ...created.names } }
              : prev,
          );
        if (created.warning)
          setErrors((prev) => ({ ...prev, [id]: created.warning! }));
        else
          setMessages((prev) => ({
            ...prev,
            [id]: 'Rooms linked. Save to persist these IDs.',
          }));
      }
    } catch (e) {
      if (active())
        setErrors((prev) => ({
          ...prev,
          [id]: e instanceof Error ? e.message : 'Matrix operation failed',
        }));
    } finally {
      lock.current = false;
      if (active()) {
        setBusy(false);
        callbacks.current.onBusyChange(false);
      }
    }
  }
  return (
    <MatrixContext.Provider
      value={{
        data,
        drafts,
        busy: busy || externalBusy,
        error,
        messages,
        errors,
        change,
        run,
        reload: () => void load(),
      }}
    >
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="text-button"
        disabled={busy || externalBusy}
        onClick={() => void load()}
      >
        Reload Matrix mappings
      </button>
      {children}
    </MatrixContext.Provider>
  );
}
export function TeamMatrixRooms({
  team,
}: {
  team: { id: number; name: string };
}) {
  const state = useContext(MatrixContext);
  const [review, setReview] = useState(false);
  if (!state) return null;
  const saved = state.data?.items.find((mapping) => mapping.teamId === team.id);
  const base: Mapping = saved ?? {
    ...blank,
    teamId: team.id,
  };
  const value = state.drafts[team.id] ?? pick(base);
  const disabled = state.busy || !saved;
  return (
    <fieldset
      className="team-matrix-column"
      aria-label={`Matrix rooms for ${team.name} #${team.id}`}
      disabled={disabled}
    >
      <legend>Matrix rooms</legend>
      {(['matrixRoomId', 'trainerGroup', 'matrixTrainerRoomId'] as const).map(
        (key) => {
          const title = {
            matrixRoomId: 'Team room ID',
            trainerGroup: 'Trainer group',
            matrixTrainerRoomId: 'Trainer room ID',
          }[key];
          const name =
            key === 'trainerGroup'
              ? undefined
              : state.data?.names?.[value[key]];
          return (
            <label className="field" key={key}>
              <span>
                {title}
                {typeof name === 'string' && name && (
                  <>
                    : <strong className="team-matrix-room-name">{name}</strong>
                  </>
                )}
              </span>
              <input
                aria-label={title}
                value={value[key]}
                placeholder={key === 'trainerGroup' ? 'e.g. D' : '!room:server'}
                onChange={(e) =>
                  state.change(team.id, value, key, e.target.value)
                }
              />
            </label>
          );
        },
      )}
      {base.legacyConflict && (
        <div className="team-matrix-conflict">
          <p>
            Existing seasons have different room IDs. Review and choose the
            desired mapping.
          </p>
          <small>
            {[
              ...(base.legacyRoomIds ?? []),
              ...(base.legacyTrainerRoomIds ?? []),
            ].join(' · ')}
          </small>
          <label>
            <input
              type="checkbox"
              checked={review}
              onChange={(e) => setReview(e.target.checked)}
            />{' '}
            I reviewed the conflicting season mappings
          </label>
        </div>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => void state.run(team.id, value, 'create', review)}
        >
          Create/link rooms
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => void state.run(team.id, value, 'reconcile', review)}
        >
          Reconcile &amp; retry
        </button>
        <button
          type="button"
          className="button primary"
          disabled={disabled || (base.legacyConflict && !review)}
          onClick={() => void state.run(team.id, value, 'save', review)}
        >
          Save
        </button>
      </div>
      {state.errors[team.id] && <p role="alert">{state.errors[team.id]}</p>}
      {state.messages[team.id] && (
        <p role="status">{state.messages[team.id]}</p>
      )}
    </fieldset>
  );
}
