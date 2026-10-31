import { Field } from '../ui';
import { SETTINGS_GROUPS } from '../../lib/club-settings';
import type { SettingsSectionProps } from './types';
export function SettingsSectionFields({
  groupId,
  draft,
  onChange,
}: SettingsSectionProps & { groupId: string }) {
  const group = SETTINGS_GROUPS.find((group) => group.id === groupId);
  if (!group) throw Error('Unknown settings section');
  return (
    <section className="settings-group" aria-label={group.title}>
      <h3>{group.title}</h3>
      <div className="form-grid">
        {group.fields
          .filter((f) => f.key !== 'branding')
          .map((f) => (
            <div
              key={f.key}
              className={
                f.kind === 'object' || f.kind === 'array'
                  ? 'settings-wide'
                  : undefined
              }
            >
              <Field label={f.label} hint={f.hint}>
                {f.choices ? (
                  <select
                    value={draft[f.key]}
                    onChange={(e) => onChange(f.key, e.target.value)}
                  >
                    <option value="">Not configured</option>
                    {f.choices.map((value) => (
                      <option value={value} key={value}>
                        {value === 'true'
                          ? 'Enabled'
                          : value === 'false'
                            ? 'Disabled'
                            : value}
                      </option>
                    ))}
                  </select>
                ) : f.kind === 'object' || f.kind === 'array' ? (
                  <textarea
                    className="settings-json"
                    rows={Math.min(
                      12,
                      Math.max(4, (draft[f.key] ?? '').split('\n').length),
                    )}
                    spellCheck={false}
                    value={draft[f.key]}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    placeholder={f.kind === 'array' ? '[]' : '{}'}
                  />
                ) : (
                  <input
                    type={
                      f.kind === 'number'
                        ? 'number'
                        : f.kind === 'date'
                          ? 'date'
                          : 'text'
                    }
                    min={f.kind === 'number' ? 0 : undefined}
                    step={f.kind === 'number' ? 1 : undefined}
                    value={draft[f.key]}
                    onChange={(e) => onChange(f.key, e.target.value)}
                  />
                )}
              </Field>
            </div>
          ))}
      </div>
    </section>
  );
}
