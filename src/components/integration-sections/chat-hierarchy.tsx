import type { ReactNode } from 'react';
import { displayChatName } from '../../lib/chat-display-name';
export const staticRoomFields = {
  matrixAdminRoomId: 'Admin',
  matrixBoardMembersRoomId: 'Vorstand',
  matrix1418CoachRoomId: '1418 Coaches',
  matrixTrainersRoomId: 'Trainers',
};
interface Inventory {
  spaces: { alias: string; name: string; roomId: string }[];
  planned: { alias: string; name: string; suffix: string }[];
  rooms?: { alias: string; name: string; roomId: string }[];
  plannedRooms?: { key: string; alias: string; name: string; parent: string }[];
}
export function ChatHierarchy({
  inventory,
  rooms,
  readyRooms,
  disabled,
  creationDisabled,
  onRoomChange,
  onReconcileRoom,
  onReconcile,
}: {
  inventory: Inventory | null;
  rooms: Record<string, string>;
  readyRooms: Record<string, string>;
  disabled: boolean;
  creationDisabled: boolean;
  onRoomChange(key: string, value: string): void;
  onReconcile(suffix: string): void;
  onReconcileRoom(key: string): void;
}) {
  function room(key: keyof typeof staticRoomFields) {
    const plan = inventory?.plannedRooms?.find((p) => p.key === key);
    const found = inventory?.rooms?.find((r) => r.alias === plan?.alias);
    const id = rooms[key] ?? '';
    const verified = id && (readyRooms[key] === id || found?.roomId === id);
    return (
      <li key={key} className="chat-tree-item">
        <div className="chat-tree-row">
          <div>
            <span className="chat-kind">Room</span>{' '}
            <strong>{staticRoomFields[key]}</strong>
            <span className="chat-state">
              {verified
                ? 'Found'
                : id
                  ? 'Configured · not checked'
                  : found
                    ? 'Found · ID not saved'
                    : 'Missing'}
            </span>
            {plan && <small className="chat-alias">{plan.alias}</small>}
          </div>
          <label className="field chat-room-id">
            <input
              aria-label={`${staticRoomFields[key]} room ID`}
              form="chat-configuration"
              disabled={disabled}
              value={id}
              placeholder="!room:server"
              onChange={(e) => onRoomChange(key, e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="button"
          disabled={creationDisabled}
          onClick={() => onReconcileRoom(key)}
        >
          Reconcile &amp; retry {staticRoomFields[key]} room
        </button>
      </li>
    );
  }
  function space(suffix: string, fallback: string, children?: ReactNode) {
    const plan = inventory?.planned.find((p) => p.suffix === suffix);
    const found = inventory?.spaces.find((s) => s.alias === plan?.alias);
    return (
      <li className="chat-tree-item">
        <div className="chat-tree-row">
          <div>
            <span className="chat-kind">Space</span>{' '}
            <strong>{plan ? displayChatName(plan.name) : fallback}</strong>
            <span className="chat-state">
              {inventory ? (found ? 'Found' : 'Missing') : 'Not checked'}
            </span>
            {plan && <small className="chat-alias">{plan.alias}</small>}
            {found && <small className="chat-alias">{found.roomId}</small>}
          </div>
          {plan && !found && (
            <button
              type="button"
              className="button"
              disabled={creationDisabled}
              onClick={() => onReconcile(suffix)}
            >
              Reconcile &amp; retry {displayChatName(plan.name)}
            </button>
          )}
        </div>
        {children && <ul>{children}</ul>}
      </li>
    );
  }
  return (
    <div role="group" aria-label="Spaces and rooms" className="chat-hierarchy">
      <ul>
        {space(
          '',
          'Club',
          <>
            {space(
              'Trainers',
              'Trainers',
              <>
                {room('matrixTrainersRoomId')}
                {room('matrix1418CoachRoomId')}
                <li className="chat-deferred">
                  Team trainer rooms — creation deferred
                </li>
              </>,
            )}
            {room('matrixBoardMembersRoomId')}
            {room('matrixAdminRoomId')}
            {space(
              'Teams',
              'Teams',
              <li className="chat-deferred">Team rooms — creation deferred</li>,
            )}
          </>,
        )}
      </ul>
    </div>
  );
}
