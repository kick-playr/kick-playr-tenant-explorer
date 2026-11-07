/** The bootstrap loader reads its current memory snapshot after startup. */
export async function serverApiOrigin(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  load = async () => (await import('./server-secrets')).serverSecrets(),
): Promise<string> {
  if (!environment.VAULT_APPLICATION_ID)
    return environment.EXPLORER_API_ORIGIN ?? '';
  // A blocked bootstrap must never fall back to a stale process origin.
  return (await load()).EXPLORER_API_ORIGIN ?? '';
}
