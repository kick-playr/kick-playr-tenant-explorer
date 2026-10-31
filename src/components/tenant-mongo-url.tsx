'use client';
import { useId, useState } from 'react';
export interface MongoUrlStatus {
  configured: boolean;
  editable: boolean;
  available: boolean;
  revision: string | null;
  source: 'runtime' | 'pending' | null;
  requiresReload: boolean;
  onboardingRevision?: number;
}
export function TenantMongoUrl({
  status,
  save,
}: {
  status?: MongoUrlStatus;
  save: (uri: string, expectedRevision: string) => Promise<MongoUrlStatus>;
}) {
  const id = useId();
  const [uri, setUri] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const editable = Boolean(
    status?.available && status.editable && status.revision,
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || !status?.revision || !uri || busy) return;
    const value = uri;
    setUri('');
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await save(value, status.revision);
      setMessage(
        result.source === 'pending'
          ? 'Verschlüsselt gespeichert. Die vollständige Runtime-Registrierung und Bereitstellung fehlen noch.'
          : 'Verschlüsselt gespeichert. Die APIs müssen die Konfiguration neu laden.',
      );
    } catch {
      setError(
        'Speichern fehlgeschlagen. URL, Berechtigungen und aktuellen Konfigurationsstand prüfen; gegebenenfalls neu laden und die URL erneut eingeben.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby={id + '-title'}>
      <h3 id={id + '-title'}>MongoDB-Verbindung</h3>
      <p>
        {status?.configured
          ? status.source === 'pending'
            ? 'URL als verschlüsselter Vorbereitungsentwurf gespeichert; noch keine vollständige Runtime-Registrierung.'
            : 'URL in der verschlüsselten Runtime-Konfiguration gespeichert.'
          : 'Noch keine MongoDB-URL gespeichert.'}
      </p>
      <p>
        Die gespeicherte URL wird nicht wieder angezeigt. Speichern prüft das
        Format und die Zuordnung, stellt aber keine Datenbankverbindung her.
      </p>
      {!status?.available ? (
        <p>Der Speicheradapter ist für diese Umgebung noch nicht verfügbar.</p>
      ) : !status.editable ? (
        <p>
          Die URL kann nur während der Vorbereitung vor der ersten
          Manager-Einladung geändert werden.
        </p>
      ) : null}
      <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <div className="field">
          <label className="field-label" htmlFor={id + '-uri'}>
            MongoDB-URL
          </label>
          <input
            id={id + '-uri'}
            name="mongodb-uri"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            maxLength={8192}
            required
            value={uri}
            disabled={!editable || busy}
            onChange={(event) => setUri(event.target.value)}
            placeholder="mongodb+srv://BENUTZER:PASSWORT@CLUSTER/VEREINSDATENBANK?authSource=admin"
            aria-describedby={id + '-help'}
          />
          <p className="field-hint" id={id + '-help'}>
            Vollständige URL mit eigener Vereinsdatenbank und den konfigurierten
            Runtime-Zugangsdaten eintragen. Die gemeinsame Kontrolldatenbank
            hier nicht verwenden.
          </p>
        </div>
        <div className="form-actions">
          <button
            type="submit"
            className="button primary"
            disabled={!editable || !uri || busy}
          >
            MongoDB-URL verschlüsselt speichern
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Wird verschlüsselt gespeichert…' : message}</p>
    </section>
  );
}
