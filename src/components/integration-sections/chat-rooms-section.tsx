'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChatHierarchy, staticRoomFields } from './chat-hierarchy';
import { apiRequest } from '../../lib/api';
import type { IntegrationSectionProps } from './types';
interface ChatConfig {
  baseUrl: string;
  serverName: string;
  discoveryOrigin: string;
  enabled: boolean;
  roles: string[];
  search: string;
  blockWrites: boolean;
}
interface Space {
  alias: string;
  name: string;
  roomId: string;
}
interface Inventory {
  spaces: Space[];
  planned: { alias: string; name: string; suffix: string }[];
  rooms?: Space[];
  plannedRooms?: { key: string; alias: string; name: string; parent: string }[];
}
const empty: ChatConfig = {
  baseUrl: '',
  serverName: '',
  discoveryOrigin: '',
  enabled: false,
  roles: [],
  search: 'names',
  blockWrites: false,
};
const roomFields = staticRoomFields;
export function ChatRoomsIntegrationSection(props: IntegrationSectionProps) {
  return <ChatRoomsEditor key={props.path} {...props} />;
}
function ChatRoomsEditor({
  path,
  active,
  busy,
  request = apiRequest,
  onBusyChange,
  onDirtyChange,
}: IntegrationSectionProps) {
  const loaded = useRef(false);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(
    null,
  );
  const [draft, setDraft] = useState<ChatConfig>(empty);
  const [rolesText, setRolesText] = useState('');
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState(false);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const disabled = busy || pending;
  const connectionDirty =
    !!settings &&
    JSON.stringify(draft) !== JSON.stringify(settings.chat ?? empty);
  const [readyRooms, setReadyRooms] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!active || loaded.current) return;
    const abort = new AbortController();
    Promise.all([
      request(path + '/settings', { signal: abort.signal }),
      request(path + '/chat/status', { signal: abort.signal }),
    ])
      .then(([snapshot, status]) => {
        if (abort.signal.aborted) return;
        loaded.current = true;
        const s = snapshot as Record<string, unknown>;
        setSettings(s);
        setDraft((s.chat as ChatConfig | undefined) ?? empty);
        setRolesText(
          ((s.chat as ChatConfig | undefined)?.roles ?? []).join(','),
        );
        setRooms(
          Object.fromEntries(
            Object.keys(roomFields).map((key) => [
              key,
              typeof s[key] === 'string' ? (s[key] as string) : '',
            ]),
          ),
        );
        const ready = (status as { credentialsConfigured: boolean })
          .credentialsConfigured;
        setConfigured(ready);
        if (ready && s.chat)
          request(path + '/chat/spaces', { signal: abort.signal })
            .then((value) => {
              if (!abort.signal.aborted) setInventory(value as Inventory);
            })
            .catch((e) => {
              if (!abort.signal.aborted)
                setError(
                  e instanceof Error ? e.message : 'Unable to find spaces',
                );
            });
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : 'Unable to load chat configuration',
          );
      });
    return () => abort.abort();
  }, [active, path, request]);
  const change = (next: ChatConfig) => {
    setDraft(next);
    setDirty(true);
    onDirtyChange('chat-rooms', true);
    setMessage('');
  };
  async function work(action: () => Promise<void>) {
    setPending(true);
    onBusyChange?.(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat operation failed');
    } finally {
      setPending(false);
      onBusyChange?.(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || disabled) return;
    await work(async () => {
      const patch: Record<string, unknown> = { chat: draft };
      for (const key of Object.keys(roomFields))
        if (rooms[key] !== (settings[key] ?? '')) patch[key] = rooms[key] || '';
      const next = (await request(path + '/settings', {
        method: 'PATCH',
        body: JSON.stringify({ expectedHash: settings.hash, patch }),
      })) as Record<string, unknown>;
      setSettings(next);
      setDraft(next.chat as ChatConfig);
      setRolesText((next.chat as ChatConfig).roles.join(','));
      setDirty(false);
      onDirtyChange('chat-rooms', false);
      setInventory(null);
      setMessage('Chat configuration saved.');
    });
  }
  async function discover() {
    await work(async () => {
      setInventory((await request(path + '/chat/spaces')) as Inventory);
    });
  }
  function updateRoom(key: string, id: string) {
    setRooms((previous) => ({ ...previous, [key]: id }));
    setDirty(true);
    onDirtyChange('chat-rooms', true);
    setMessage('');
    setReadyRooms((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }
  async function create() {
    await work(async () => {
      try {
        for (const suffix of ['', 'Trainers', 'Teams']) {
          await request(path + '/chat/spaces', {
            method: 'POST',
            body: JSON.stringify({ suffix }),
          });
        }
        for (const key of [
          'matrixTrainersRoomId',
          'matrix1418CoachRoomId',
          'matrixBoardMembersRoomId',
          'matrixAdminRoomId',
        ]) {
          const result = (await request(path + '/chat/rooms', {
            method: 'POST',
            body: JSON.stringify({ key, roomId: rooms[key] ?? '' }),
          })) as { roomId: string; warning?: string };
          if (!result.roomId)
            throw Error(
              'Room creation returned no ID; find and reconcile before retrying.',
            );
          if (result.roomId !== (rooms[key] ?? ''))
            updateRoom(key, result.roomId);
          if (result.warning) throw Error(result.warning);
          setReadyRooms((previous) => ({ ...previous, [key]: result.roomId }));
        }
        setMessage(
          'Spaces and static rooms are ready. Save to persist generated room IDs.',
        );
      } finally {
        const next = (await request(path + '/chat/spaces').catch(
          () => inventory,
        )) as Inventory | null;
        setInventory(next);
      }
    });
  }
  async function reconcile(suffix: string) {
    await work(async () => {
      await request(path + '/chat/spaces', {
        method: 'POST',
        body: JSON.stringify({ suffix, reconcile: true }),
      });
      setInventory((await request(path + '/chat/spaces')) as Inventory);
      setMessage((suffix || 'Root') + ' space reconciled and ready.');
    });
  }
  async function reconcileRoom(key: string) {
    await work(async () => {
      try {
        const result = (await request(path + '/chat/rooms', {
          method: 'POST',
          body: JSON.stringify({
            key,
            roomId: rooms[key] ?? '',
            reconcile: true,
          }),
        })) as { roomId: string; warning?: string };
        if (!result.roomId) throw Error('No reconciled room ID returned');
        if (result.roomId !== (rooms[key] ?? ''))
          updateRoom(key, result.roomId);
        if (result.warning) throw Error(result.warning);
        setReadyRooms((previous) => ({ ...previous, [key]: result.roomId }));
        setMessage('Room reconciled. Save any generated room ID.');
      } finally {
        setInventory(
          (await request(path + '/chat/spaces').catch(
            () => inventory,
          )) as Inventory | null,
        );
      }
    });
  }
  return (
    <section>
      <h3>Chat rooms</h3>
      <p>
        Matrix administrator credentials:{' '}
        {configured ? 'Configured in shared Vault' : 'Unavailable'}. Credentials
        remain server-side.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!settings ? (
        <p>Loading chat configuration…</p>
      ) : (
        <form id="chat-configuration" onSubmit={save}>
          <fieldset disabled={disabled}>
            {(['baseUrl', 'serverName', 'discoveryOrigin'] as const).map(
              (key) => (
                <label className="field" key={key}>
                  <span>
                    {
                      {
                        baseUrl: 'Matrix API URL',
                        serverName: 'Matrix server name',
                        discoveryOrigin: 'Discovery origin',
                      }[key]
                    }
                  </span>
                  <input
                    required
                    value={draft[key]}
                    onChange={(e) =>
                      change({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ),
            )}
            <label className="field">
              <span>Enable chat</span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  change({ ...draft, enabled: e.target.checked })
                }
              />
            </label>
            <label className="field">
              <span>Enabled roles (comma separated)</span>
              <input
                value={rolesText}
                onChange={(e) => {
                  setRolesText(e.target.value);
                  change({
                    ...draft,
                    roles: e.target.value
                      .split(',')
                      .map((r) => r.trim())
                      .filter(Boolean),
                  });
                }}
              />
            </label>
            <label className="field">
              <span>Search</span>
              <select
                value={draft.search}
                onChange={(e) => change({ ...draft, search: e.target.value })}
              >
                {['names', 'messages', 'none'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Block Matrix writes</span>
              <input
                type="checkbox"
                checked={draft.blockWrites}
                onChange={(e) =>
                  change({ ...draft, blockWrites: e.target.checked })
                }
              />
            </label>
            <button type="submit" className="button primary" disabled={!dirty}>
              Save chat configuration
            </button>
          </fieldset>
        </form>
      )}
      <h3>Spaces and rooms</h3>
      <p>
        Create the tenant spaces and four static rooms on demand. Existing room
        IDs are reused. New rooms are private, invite-only and encrypted.
        Generated IDs stay unsaved until you save chat configuration.
      </p>
      <div className="form-actions">
        <button
          type="button"
          className="button"
          disabled={
            disabled || connectionDirty || !configured || !settings?.chat
          }
          onClick={() => void discover()}
        >
          Find spaces &amp; rooms
        </button>
        <button
          type="button"
          className="button primary"
          disabled={
            disabled ||
            connectionDirty ||
            !configured ||
            !settings?.chat ||
            draft.blockWrites
          }
          onClick={() => void create()}
        >
          Create missing spaces &amp; rooms
        </button>
      </div>
      {connectionDirty && (
        <p>Save configuration before managing spaces and rooms.</p>
      )}
      {settings && (
        <ChatHierarchy
          inventory={inventory}
          rooms={rooms}
          readyRooms={readyRooms}
          disabled={disabled}
          creationDisabled={
            disabled || connectionDirty || !configured || draft.blockWrites
          }
          onRoomChange={updateRoom}
          onReconcileRoom={(key) => void reconcileRoom(key)}
          onReconcile={(suffix) => void reconcile(suffix)}
        />
      )}
    </section>
  );
}
