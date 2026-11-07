'use client';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Notice } from './ui';
import { SETTINGS_SECTIONS } from './settings-sections/registry';
import {
  SETTINGS_GROUPS,
  settingsDraft,
  settingsPatch,
  type ClubSettingsSnapshot,
} from '../lib/club-settings';
export function ClubSettingsEditor({
  settings,
  busy: externalBusy,
  onPendingChange,
  onSave,
  onDirtyChange,
  activeSection,
  onSectionChange,
}: {
  settings: ClubSettingsSnapshot;
  busy: boolean;
  onPendingChange?: (pending: boolean) => void;
  activeSection?: string;
  onSectionChange?: (id: string) => void;
  onSave: (body: {
    expectedHash: string;
    patch: Record<string, unknown>;
  }) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [processing, setProcessing] = useState(false);
  const busy = externalBusy || processing;
  const prefix = useId();
  const [localSection, setLocalSection] = useState(SETTINGS_SECTIONS[0]!.id);
  const requestedSection = activeSection ?? localSection;
  const selected = SETTINGS_SECTIONS.some(
    (section) => section.id === requestedSection,
  )
    ? requestedSection
    : SETTINGS_SECTIONS[0]!.id;
  function selectSection(id: string) {
    setLocalSection(id);
    onSectionChange?.(id);
  }
  const initial = useMemo(() => settingsDraft(settings), [settings]);
  const snapshotJson = useMemo(
    () => JSON.stringify(settings, null, 2),
    [settings],
  );
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  function reset() {
    setDraft(initial);
    setDirty(false);
    onDirtyChange(false);
    setError('');
    setMessage('');
  }
  function change(key: string, value: string) {
    changeMany({ [key]: value });
  }
  function changeMany(changes: Record<string, string>) {
    const next = { ...draft, ...changes };
    const changed = Object.keys(initial).some((k) => initial[k] !== next[k]);
    setDraft(next);
    setDirty(changed);
    onDirtyChange(changed);
    setMessage('');
    setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setError('');
    setMessage('');
    try {
      const patch = settingsPatch(settings, draft);
      if (!Object.keys(patch).length) {
        reset();
        setMessage('No changes to save.');
        return;
      }
      if (await onSave({ expectedHash: settings.hash, patch })) {
        setDirty(false);
        onDirtyChange(false);
      }
    } catch (e) {
      if (e instanceof Error) {
        const group = SETTINGS_GROUPS.find((group) =>
          group.fields.some((field) => e.message.startsWith(field.label + ':')),
        );
        if (group) selectSection(group.id);
      }
      setError(
        e instanceof Error ? e.message : 'Unable to save club settings.',
      );
    }
  }
  return (
    <form className="club-settings-editor" onSubmit={save}>
      <nav className="tabs settings-subnav" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map(({ id, label }) => (
          <button
            type="button"
            key={id}
            id={`${prefix}-${id}-menu`}
            aria-pressed={selected === id}
            aria-controls={`${prefix}-${id}-panel`}
            disabled={busy}
            onClick={() => selectSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <h2>Club settings</h2>
      <p className="muted">
        Manage your club’s seasons, billing, people, shops and appearance.
        Changes are validated before saving.
      </p>
      {error && <Notice error>{error}</Notice>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={busy}>
        {SETTINGS_SECTIONS.map(({ id, Component }) => (
          <div
            key={id}
            id={`${prefix}-${id}-panel`}
            role="region"
            aria-labelledby={`${prefix}-${id}-menu`}
            hidden={selected !== id}
          >
            <fieldset disabled={busy || selected !== id}>
              <Component
                onPendingChange={(pending) => {
                  setProcessing(pending);
                  onPendingChange?.(pending);
                }}
                disabled={busy || selected !== id}
                draft={draft}
                onChange={change}
                onChangeMany={changeMany}
                snapshotJson={snapshotJson}
              />
            </fieldset>
          </div>
        ))}
        <div className="form-actions settings-actions">
          <button
            type="submit"
            className="button primary"
            disabled={!dirty || busy}
          >
            {busy ? 'Saving…' : 'Save club settings'}
          </button>
          <button
            type="button"
            className="button"
            disabled={!dirty || busy}
            onClick={reset}
          >
            Reset changes
          </button>
          {dirty && <span className="muted">Unsaved changes</span>}
        </div>
      </fieldset>
    </form>
  );
}
