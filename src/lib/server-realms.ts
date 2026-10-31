/** Server-only routing comes from the shared database through the explorer API.
 * Only this server's Clerk bootstrap secret values remain in its environment. */
export async function realmForHost(
  host: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  request: typeof fetch = fetch,
): Promise<{
  publishableKey: string | undefined;
  secretKey: string | undefined;
  club: boolean;
}> {
  const unavailable = () =>
    Error('Explorer database realm configuration unavailable');
  try {
    if (!/^[a-z0-9][a-z0-9.-]*(?::[1-9][0-9]{0,4})?$/.test(host))
      throw unavailable();
    const origin = new URL(env.EXPLORER_API_ORIGIN ?? '');
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
      throw unavailable();
    const response = await request(
      `${origin.origin}/public/realm?host=${encodeURIComponent(host)}`,
      {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw unavailable();
    const row = await response.json();
    if (!row || row.host !== host || typeof row.club !== 'boolean')
      throw unavailable();
    if (!row.club) {
      if (Object.keys(row).sort().join(',') !== 'club,host')
        throw unavailable();
      return {
        publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        secretKey: env.CLERK_SECRET_KEY,
        club: false,
      };
    }
    if (
      Object.keys(row).sort().join(',') !==
        'club,host,publishableKey,secretVariable' ||
      typeof row.publishableKey !== 'string' ||
      !/^pk_(?:test|live)_[A-Za-z0-9+/_=-]+$/.test(row.publishableKey) ||
      typeof row.secretVariable !== 'string' ||
      !/^EXPLORER_CLUB_[A-Z0-9_]+_CLERK_SECRET_KEY$/.test(row.secretVariable)
    )
      throw unavailable();
    const secretKey = env[row.secretVariable];
    if (!secretKey) throw unavailable();
    return { publishableKey: row.publishableKey, secretKey, club: true };
  } catch {
    throw unavailable();
  }
}
