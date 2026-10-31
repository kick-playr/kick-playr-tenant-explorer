'use client';
import { useEffect, useState } from 'react';
import { TenantMongoUrl, type MongoUrlStatus } from './tenant-mongo-url';
import {
  ProvisioningChecklist,
  type ProvisioningStep,
} from './provisioning-checklist';
import { tenantPath, type Transport } from '../lib/api';
interface Guide {
  onboardingRevision: number;
  mongo?: MongoUrlStatus;
  steps: ProvisioningStep[];
  references: { mongoUri: string; key: string };
  configuredReferences?: { mongoUri: string; key: string };
  operatorSteps: string[];
  verification: { verifiedAt: string; checks: Record<string, string> } | null;
  emailConfigured: boolean;
  environmentSnippet?: string;
  clerk: {
    issuer: string;
    origin: string;
    setupAudience: string;
    secretVariable?: string;
    claims: unknown;
  } | null;
  keys: { files: { kind: string; variable?: string; status: string }[] };
}
export function TenantProvisioning({
  environment,
  tenantId,
  request,
}: {
  environment: string;
  tenantId: string;
  request: Transport;
}) {
  const [guide, setGuide] = useState<Guide | null>(null),
    [steps, setSteps] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const path = tenantPath(environment, tenantId) + '/onboarding';
  useEffect(() => {
    let active = true;
    void request(path)
      .then((v) => {
        if (active) {
          const g = v as Guide;
          setGuide(g);
          setSteps(g.operatorSteps);
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Vorbereitung nicht verfügbar. Plattform-Konfiguration und Setup-API prüfen.',
          );
      });
    return () => {
      active = false;
    };
  }, [path, request]);
  async function action(name: 'save' | 'verify') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request(path + '/' + name, {
        method: 'POST',
        body: JSON.stringify(
          name === 'save'
            ? { steps, expectedRevision: guide!.onboardingRevision }
            : {},
        ),
      });
      const g = (await request(path)) as Guide;
      setGuide(g);
      setSteps(g.operatorSteps);
      setMessage(
        name === 'save'
          ? 'Manueller Fortschritt gespeichert.'
          : 'Technische Verbindungen geprüft. Die Claims werden zusätzlich bei der Manager-Anmeldung geprüft.',
      );
    } catch {
      setError(
        name === 'verify'
          ? 'Prüfung fehlgeschlagen. Datenbank, zugeordnete Vereinsschlüssel, Runtime-Verbindung und Plattform-Konfiguration prüfen. Es wurde keine Einladung gesendet.'
          : 'Speichern fehlgeschlagen. Fortschritt neu laden und erneut versuchen.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-group" aria-labelledby="provisioning-title">
      <h2 id="provisioning-title">Plattform-Vorbereitung</h2>
      <p>
        Vor der ersten Einladung: Clerk, Datenbank und Schlüssel manuell
        bereitstellen. Abgehakte Schritte speichern Ihren Arbeitsstand; sie
        ersetzen keine technische Prüfung.
      </p>
      {error && <p role="alert">{error}</p>}
      {!guide ? (
        <p role="status">Wird geladen…</p>
      ) : (
        <>
          <dl>
            <dt>MongoDB-Referenz</dt>
            <dd>
              <code>
                {guide.configuredReferences?.mongoUri ??
                  guide.references.mongoUri}
              </code>
            </dd>
            <dt>Schlüsselreferenz</dt>
            <dd>
              <code>
                {guide.configuredReferences?.key ?? guide.references.key}
              </code>
            </dd>
          </dl>
          <p>
            Schlüssel und andere Umgebungswerte direkt in serverseitige
            .env-/Deployment-Secrets installieren. Die MongoDB-URL kann hier
            verschlüsselt gespeichert werden.
          </p>
          <TenantMongoUrl
            key={environment + '/' + tenantId}
            status={guide.mongo}
            save={async (uri, expectedRevision) => {
              const result = (await request(path + '/mongo-url', {
                method: 'POST',
                body: JSON.stringify({ uri, expectedRevision }),
              })) as MongoUrlStatus;
              setGuide((current) =>
                current
                  ? {
                      ...current,
                      mongo: result,
                      verification: null,
                      onboardingRevision:
                        result.onboardingRevision ?? current.onboardingRevision,
                    }
                  : current,
              );
              return result;
            }}
          />
          <ProvisioningChecklist
            steps={guide.steps}
            checked={steps}
            disabled={busy}
            onChange={setSteps}
          />
          {guide.clerk ? (
            <section>
              <h3>Clerk-Konfiguration</h3>
              <p>
                Issuer: <code>{guide.clerk.issuer}</code>
              </p>
              <p>
                Backend-Secret-Variable:{' '}
                <code>
                  {guide.clerk.secretVariable ??
                    'Einladungsbindung konfigurieren'}
                </code>
              </p>
              <p>
                APP-Origin: <code>{guide.clerk.origin}</code>
              </p>
              {guide.clerk.claims ? (
                <>
                  <p>
                    In Clerk als Session-Claims eintragen und danach neu
                    anmelden:
                  </p>
                  <pre tabIndex={0} aria-label="Clerk Session-Claims">
                    {JSON.stringify(guide.clerk.claims, null, 2)}
                  </pre>
                </>
              ) : (
                <p>
                  Die Betriebs-Audience muss vom eingerichteten Runtime-Adapter
                  bestätigt werden.
                </p>
              )}
            </section>
          ) : (
            <p>
              Die Clerk-Einladungsbindung fehlt. Issuer, APP-Origin, Audience
              und Backend-Schlüssel zuerst konfigurieren.
            </p>
          )}
          <section>
            <h3>Schlüsselzuordnung</h3>
            {guide.keys.files.length ? (
              <ul>
                {guide.keys.files.map((file) => (
                  <li key={file.kind}>
                    {file.kind}:{' '}
                    <code>
                      {file.variable ?? 'Keine Umgebungsvariable zugeordnet'}
                    </code>{' '}
                    — {file.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Schlüsselreferenz zuerst mit den serverseitigen Variablen
                verbinden.
              </p>
            )}
            <p>
              Vorlage für serverseitige Secret-Variablen (Platzhalter ersetzen;
              vorhandene Werte behalten):
            </p>
            <pre tabIndex={0} aria-label="Serverseitige Secret-Variablen">
              {guide.environmentSnippet}
            </pre>
            <p>
              HSM/KMS ist mit dem aktuellen Adapter nicht verfügbar. Nicht
              exportierbare Schlüssel bleiben im Provider.
            </p>
          </section>
          <p>
            Plattform-E-Mail:{' '}
            {guide.emailConfigured
              ? 'konfiguriert; Verbindung bei Prüfung bestätigen'
              : 'noch nicht konfiguriert'}
          </p>
          <p role="status">
            {guide.verification
              ? 'Serverseitig bestätigt: ' +
                Object.keys(guide.verification.checks).join(', ')
              : 'Noch nicht serverseitig bestätigt.'}
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void action('save')}
            >
              Fortschritt speichern
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void action('verify')}
            >
              Verbindungen prüfen
            </button>
          </div>
          <p role="status">{busy ? 'Wird verarbeitet…' : message}</p>
        </>
      )}
    </section>
  );
}
