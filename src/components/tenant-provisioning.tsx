'use client';
import { useEffect, useState } from 'react';
import { TenantMongoUrl, type MongoUrlStatus } from './tenant-mongo-url';
import {
  ProvisioningChecklist,
  type ProvisioningStep,
} from './provisioning-checklist';
import { tenantPath, type Transport } from '../lib/api';
interface KeySetupStatus {
  available: boolean;
  editable: boolean;
  registered: boolean;
  revision: string | null;
  local: {
    strategy?: 'ENV_VARIABLES' | 'LOCAL_KEYVAULT';
    requiresRestart?: boolean;
    status: string;
    files: { kind: string; variable?: string; status: string }[];
  } | null;
  onboardingRevision?: number;
}
interface Guide {
  onboardingRevision: number;
  mongo?: MongoUrlStatus;
  keySetup?: KeySetupStatus;
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
  async function configureKeys() {
    if (busy || !guide?.keySetup?.revision) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = (await request(path + '/configure-keys', {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: guide.keySetup.revision }),
      })) as KeySetupStatus;
      setGuide((current) =>
        current
          ? {
              ...current,
              keySetup: result,
              keys: result.local ?? current.keys,
              mongo: current.mongo
                ? { ...current.mongo, revision: result.revision }
                : undefined,
              verification: null,
              onboardingRevision:
                result.onboardingRevision ?? current.onboardingRevision,
            }
          : current,
      );
      setMessage(
        'Schlüssel stimmen in beiden APIs überein; Zuordnung verschlüsselt gespeichert. Die restliche Runtime-Einrichtung bleibt erforderlich.',
      );
    } catch {
      setError(
        'Schlüssel konnten nicht zugeordnet werden. Drei gültige, unterschiedliche Schlüssel müssen in beiden APIs übereinstimmen. Berechtigungen und aktuellen Konfigurationsstand prüfen; bei Änderungen neu laden.',
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
            {guide.keySetup?.local?.strategy === 'LOCAL_KEYVAULT'
              ? 'Alle Schlüssel und Zugangsdaten im lokalen Key Vault bereitstellen. Exakte Versionen zuordnen und beide APIs nach Änderungen neu starten. Diese Ansicht erzeugt oder importiert keine Schlüssel.'
              : 'Schlüssel und andere Umgebungswerte direkt in serverseitige .env-/Deployment-Secrets installieren. Die MongoDB-URL kann hier verschlüsselt gespeichert werden.'}
          </p>
          <TenantMongoUrl
            key={environment + '/' + tenantId}
            status={
              guide.mongo
                ? { ...guide.mongo, editable: guide.mongo.editable && !busy }
                : undefined
            }
            save={async (uri, expectedRevision) => {
              setBusy(true);
              try {
                const result = (await request(path + '/mongo-url', {
                  method: 'POST',
                  body: JSON.stringify({ uri, expectedRevision }),
                })) as MongoUrlStatus;
                setGuide((current) =>
                  current
                    ? {
                        ...current,
                        mongo: result,
                        keySetup: current.keySetup
                          ? { ...current.keySetup, revision: result.revision }
                          : undefined,
                        verification: null,
                        onboardingRevision:
                          result.onboardingRevision ??
                          current.onboardingRevision,
                      }
                    : current,
                );
                return result;
              } finally {
                setBusy(false);
              }
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
            {(guide.keySetup?.local?.files ?? guide.keys.files).length ? (
              <ul>
                {(guide.keySetup?.local?.files ?? guide.keys.files).map(
                  (file) => (
                    <li key={file.kind}>
                      {file.kind}:{' '}
                      <code>
                        {file.variable ?? 'Keine Umgebungsvariable zugeordnet'}
                      </code>{' '}
                      — {file.status}
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p>
                Schlüsselreferenz zuerst mit den serverseitigen Variablen
                verbinden.
              </p>
            )}
            <p>
              {guide.keySetup?.registered
                ? 'Schlüsselzuordnung registriert.'
                : 'Schlüsselzuordnung noch nicht registriert.'}
            </p>
            <p>
              {guide.keySetup?.local?.strategy === 'LOCAL_KEYVAULT'
                ? 'Die Prüfung vergleicht die geladenen, versionierten Vault-Zuordnungen beider APIs. Änderungen oder neue Tenants benötigen einen Neustart; die Prüfung lädt keine neuen Schlüssel.'
                : 'Die Prüfung vergleicht die drei Schlüssel in Tenant-API und Runtime-API und speichert nur ihre Variablennamen. Eine vollständige Runtime-Registrierung ist dafür noch nicht erforderlich.'}
            </p>
            {guide.keySetup?.available && !guide.keySetup.editable ? (
              <p>Zuordnung nur vor der ersten Manager-Einladung möglich.</p>
            ) : !guide.keySetup?.available ? (
              <p>Schlüsseladapter für diese Umgebung nicht verfügbar.</p>
            ) : null}
            <button
              className="button primary"
              disabled={
                busy ||
                !guide.keySetup?.available ||
                !guide.keySetup.editable ||
                !guide.keySetup.revision ||
                guide.keySetup.registered ||
                guide.keySetup.local?.status !== 'connected'
              }
              onClick={() => void configureKeys()}
            >
              Schlüssel konfigurieren
            </button>
            {guide.keySetup?.local?.strategy !== 'LOCAL_KEYVAULT' && (
              <p>
                Vorlage für serverseitige Secret-Variablen (Platzhalter
                ersetzen; vorhandene Werte behalten):
              </p>
            )}
            {guide.keySetup?.local?.strategy !== 'LOCAL_KEYVAULT' && (
              <pre tabIndex={0} aria-label="Serverseitige Secret-Variablen">
                {guide.environmentSnippet}
              </pre>
            )}
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
