export type RealmFailureReason =
  | 'host'
  | 'origin'
  | 'transport'
  | 'timeout'
  | 'upstream'
  | 'payload'
  | 'credentials';

/** Contains only allowlisted diagnostics, never upstream bodies or secret values. */
export class RealmConfigurationError extends Error {
  constructor(
    readonly reason: RealmFailureReason,
    readonly upstreamStatus?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super('Explorer database realm configuration unavailable');
    this.name = 'RealmConfigurationError';
  }
}
export interface ServerRealm {
  publishableKey: string;
  secretKey: string;
  club: boolean;
}
export type RealmResult =
  | { ok: true; realm: ServerRealm }
  | { ok: false; error: RealmConfigurationError };

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  // Do not turn an upstream instruction to wait into an immediate retry.
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, 300)
    : undefined;
}

/** Also bound injected transports/body readers that do not honor fetch's signal. */
function beforeDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const expired = () => reject(new RealmConfigurationError('timeout'));
    signal.addEventListener('abort', expired, { once: true });
    if (signal.aborted) expired();
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', expired);
    });
  });
}

/** Server-only routing comes from the authoritative explorer API.
 * The same deadline covers both attempts; authorization is never cached here. */
export async function realmForHost(
  host: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  request: typeof fetch = fetch,
): Promise<ServerRealm> {
  if (
    env === process.env &&
    env.SECRETS_KEYS_STRATEGY !== undefined &&
    env.SECRETS_KEYS_STRATEGY !== 'ENV_VARIABLES'
  ) {
    try {
      env = await (await import('./server-secrets')).serverSecrets();
    } catch {
      throw new RealmConfigurationError('credentials');
    }
  }
  if (
    host.length > 253 ||
    !/^[a-z0-9][a-z0-9.-]*(?::[1-9][0-9]{0,4})?$/.test(host)
  )
    throw new RealmConfigurationError('host');
  try {
    if (new URL(`http://${host}`).host !== host)
      throw new RealmConfigurationError('host');
  } catch {
    throw new RealmConfigurationError('host');
  }
  let origin: URL;
  try {
    origin = new URL(env.EXPLORER_API_ORIGIN ?? '');
    if (
      origin.origin !== env.EXPLORER_API_ORIGIN ||
      origin.username ||
      origin.password ||
      (origin.protocol !== 'https:' &&
        !(
          origin.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
        ))
    )
      throw new Error();
  } catch {
    throw new RealmConfigurationError('origin');
  }
  const signal = AbortSignal.timeout(5000);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      signal.throwIfAborted();
      response = await beforeDeadline(
        request(
          `${origin.origin}/public/realm?host=${encodeURIComponent(host)}`,
          { cache: 'no-store', redirect: 'error', signal },
        ),
        signal,
      );
      signal.throwIfAborted();
    } catch {
      if (signal.aborted) throw new RealmConfigurationError('timeout');
      if (attempt === 0) continue;
      throw new RealmConfigurationError('transport');
    }
    if (response.ok) break;
    const retry = retryAfter(response);
    void response.body?.cancel().catch(() => {});
    if (
      attempt === 0 &&
      [502, 503, 504].includes(response.status) &&
      retry === undefined
    )
      continue;
    throw new RealmConfigurationError('upstream', response.status, retry);
  }
  let row;
  try {
    row = await beforeDeadline(response!.json(), signal);
    signal.throwIfAborted();
  } catch {
    throw new RealmConfigurationError(signal.aborted ? 'timeout' : 'payload');
  }
  if (!row || row.host !== host || typeof row.club !== 'boolean')
    throw new RealmConfigurationError('payload');
  if (!row.club) {
    if (Object.keys(row).sort().join(',') !== 'club,host')
      throw new RealmConfigurationError('payload');
    const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const secretKey = env.CLERK_SECRET_KEY;
    if (!publishableKey || !secretKey)
      throw new RealmConfigurationError('credentials');
    return { publishableKey, secretKey, club: false };
  }
  if (
    Object.keys(row).sort().join(',') !==
      'club,host,publishableKey,secretVariable' ||
    typeof row.publishableKey !== 'string' ||
    !/^pk_(?:test|live)_[A-Za-z0-9+/_=-]+$/.test(row.publishableKey) ||
    typeof row.secretVariable !== 'string' ||
    !/^EXPLORER_CLUB_[A-Z0-9_]+_CLERK_SECRET_KEY$/.test(row.secretVariable)
  )
    throw new RealmConfigurationError('payload');
  const secretKey = env[row.secretVariable];
  if (!secretKey) throw new RealmConfigurationError('credentials');
  return { publishableKey: row.publishableKey, secretKey, club: true };
}

/** Callers must stop before Clerk or tenant operations when resolution fails. */
export async function resolveRealm(
  host: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  request: typeof fetch = fetch,
): Promise<RealmResult> {
  try {
    return { ok: true, realm: await realmForHost(host, env, request) };
  } catch (cause) {
    const error =
      cause instanceof RealmConfigurationError
        ? cause
        : new RealmConfigurationError('transport');
    console.error('Explorer realm lookup failed', {
      reason: error.reason,
      upstreamStatus: error.upstreamStatus,
    });
    return { ok: false, error };
  }
}
