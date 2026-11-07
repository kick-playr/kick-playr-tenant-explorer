'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { type Transport, tenantPath } from '../lib/api';
import { ErrorText } from './ui';
interface Invitation {
  id: string;
  recipient: { kind: string; email?: string; subject?: string };
  state: string;
  expiresAt: string;
  delivery: { status: string; attempts: number };
  bootstrap: boolean;
  membershipState?: string;
}
export function ManagerInvitations({
  environment,
  tenantId,
  request,
}: {
  environment: string;
  tenantId: string;
  request: Transport;
}) {
  const [items, setItems] = useState<Invitation[]>([]),
    [mode, setMode] = useState('email'),
    [recipient, setRecipient] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [message, setMessage] = useState('');
  const path = `${tenantPath(environment, tenantId)}/invitations`;
  useEffect(() => {
    const c = new AbortController();
    request(path, { signal: c.signal })
      .then((x) => {
        if (!c.signal.aborted) setItems(x as Invitation[]);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      });
    return () => c.abort();
  }, [path, request]);
  async function action(
    id: string,
    kind: 'resend' | 'revoke' | 'deliver' | 'revoke-access',
  ) {
    if (
      ['revoke', 'revoke-access'].includes(kind) &&
      !window.confirm(
        kind === 'revoke-access' && items.find((i) => i.id === id)?.bootstrap
          ? 'Eigentümerzugang widerrufen? Die Einrichtung bleibt gesperrt. Eigentümerwechsel oder Wiederherstellung erfordern einen separat freigegebenen Prozess.'
          : 'Einladung/Zugang widerrufen?',
      )
    )
      return;
    setBusy(true);
    setError(undefined);
    setMessage('');
    try {
      await request(`${path}/${encodeURIComponent(id)}/${kind}`, {
        method: 'POST',
        body: '{}',
      });
      if (kind === 'resend')
        await request(`${path}/${encodeURIComponent(id)}/deliver`, {
          method: 'POST',
          body: '{}',
        });
      setItems((await request(path)) as Invitation[]);
      setMessage(
        ['revoke', 'revoke-access'].includes(kind)
          ? 'Einladung widerrufen.'
          : 'Versandstatus aktualisiert.',
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !window.confirm(
        `Vereinsmanager zu ${tenantId} einladen: ${recipient}? Gültig für sieben Tage.`,
      )
    )
      return;
    setBusy(true);
    setError(undefined);
    setMessage('');
    try {
      const i = (await request(path, {
        method: 'POST',
        body: JSON.stringify(
          mode === 'email'
            ? { kind: 'email', email: recipient }
            : { kind: 'subject', subject: recipient },
        ),
      })) as Invitation;
      await request(`${path}/${i.id}/deliver`, { method: 'POST', body: '{}' });
      setItems((await request(path)) as Invitation[]);
      setRecipient('');
      setMessage('Einladung gespeichert. Bitte Versandstatus prüfen.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Manager-Einladungen">
      <h2>Manager einladen</h2>
      <p>
        Verein: <strong>{tenantId}</strong>. Die Plattform lädt den ersten
        Manager als Eigentümer ein. Weitere Einladungen folgen nach
        abgeschlossener Einrichtung.
      </p>
      <p>
        Rolle: Vereinsmanager · Link gültig für sieben Tage. Die Annahme erteilt
        noch keinen Zugang zum Vereinsbetrieb.
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Empfängerart{' '}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="email">E-Mail</option>
              <option value="subject">Clerk-Benutzer-ID</option>
            </select>
          </label>
          <label>
            {mode === 'email' ? 'E-Mail-Adresse' : 'Exakte Clerk-Benutzer-ID'}{' '}
            <input
              required
              type={mode === 'email' ? 'email' : 'text'}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              maxLength={254}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Einladung senden
          </button>
        </fieldset>
      </form>
      {error ? <ErrorText error={error} /> : null}
      <p role="status">{busy ? 'Wird verarbeitet…' : message}</p>
      <h3>Einladungen</h3>
      {items.length === 0 ? (
        <p>Keine Einladungen vorhanden.</p>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              <strong>{i.recipient.email ?? i.recipient.subject}</strong> ·{' '}
              {i.state} · Versand: {i.delivery.status}
              <br />
              Gültig bis {new Date(i.expiresAt).toLocaleString('de-CH')}{' '}
              {i.bootstrap
                ? '· Verein einrichten'
                : '· Als Vereinsmanager beitreten'}
              <div>
                {i.state === 'accepted' && i.membershipState !== 'revoked' && (
                  <button
                    disabled={busy}
                    onClick={() => void action(i.id, 'revoke-access')}
                  >
                    Zugang widerrufen
                  </button>
                )}
                {['pending', 'expired'].includes(i.state) && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => void action(i.id, 'resend')}
                    >
                      Neu senden (alter Link wird ungültig)
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void action(i.id, 'revoke')}
                    >
                      Widerrufen
                    </button>
                    {['failed', 'queued', 'sending'].includes(
                      i.delivery.status,
                    ) && (
                      <button
                        disabled={busy}
                        onClick={() => void action(i.id, 'deliver')}
                      >
                        Versand erneut versuchen
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p>
        „accepted“ beim Versand bedeutet Annahme durch den Mailserver, keine
        bestätigte Zustellung.
      </p>
    </section>
  );
}
