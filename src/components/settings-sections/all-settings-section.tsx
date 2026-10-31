import type { SettingsSectionProps } from './types';
export function AllSettingsSection({ snapshotJson }: SettingsSectionProps) {
  return (
    <section className="settings-group protected-settings">
      <h3>All settings (read only)</h3>
      <p className="muted">
        This complete snapshot includes protected runtime configuration, record
        metadata and generated views. Integration credentials are managed
        separately.
      </p>
      <pre tabIndex={0} aria-label="Complete club settings snapshot">
        {snapshotJson}
      </pre>
    </section>
  );
}
