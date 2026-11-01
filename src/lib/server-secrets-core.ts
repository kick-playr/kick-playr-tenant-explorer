import type { SecretsRuntime } from '@kick-playr/local-key-vault/runtime-client';
function isEncryptionKey(value: string) {
  const bytes = Buffer.from(value, 'base64');
  try {
    return bytes.length === 32 && bytes.toString('base64') === value;
  } finally {
    bytes.fill(0);
  }
}
const unavailable = () => Error('Explorer server secrets unavailable');
/** Server-only state factory. Tests inject a transport; no global env mutation. */
export function createServerSecretsLoader(
  environment: Record<string, string | undefined>,
  factory: () => SecretsRuntime | Promise<SecretsRuntime> = async () =>
    (
      await import('@kick-playr/local-key-vault/runtime-client')
    ).createSecretsRuntime({ environment }),
) {
  let pending:
    Promise<Readonly<Record<string, string | undefined>>> | undefined;
  return () =>
    (pending ??= (async () => {
      if (typeof window !== 'undefined') throw unavailable();
      const strategy = environment.SECRETS_KEYS_STRATEGY ?? 'ENV_VARIABLES';
      if (strategy === 'ENV_VARIABLES')
        return Object.freeze({ ...environment });
      if (
        strategy !== 'LOCAL_KEYVAULT' ||
        environment.NODE_ENV !== 'development' ||
        environment.VERCEL !== undefined ||
        environment.AWS_LAMBDA_FUNCTION_NAME !== undefined
      )
        throw unavailable();
      let runtime: SecretsRuntime | undefined;
      try {
        runtime = await factory();
        // Discover the finite server-owned mapping policy before loading values.
        const application = environment.LOCAL_KEYVAULT_BINDINGS_JSON
          ? JSON.parse(environment.LOCAL_KEYVAULT_BINDINGS_JSON)?.applications?.explorer
          : await runtime.loadApplication('explorer');
        const secrets = application?.request?.secrets;
        if (!Array.isArray(secrets) || !secrets.length || secrets.length > 100)
          throw unavailable();
        const names = secrets.map(
          (item: { mapping?: unknown }) => item?.mapping,
        ) as string[];
        if (
          names.some(
            (name: unknown) =>
              typeof name !== 'string' ||
              !(
                name === 'CLERK_SECRET_KEY' ||
                name === 'CLERK_ENCRYPTION_KEY' ||
                name === 'CLERK_MACHINE_SECRET_KEY' ||
                /^EXPLORER_CLUB_[A-Z0-9_]+_CLERK_SECRET_KEY$/.test(name)
              ),
          ) ||
          new Set(names).size !== names.length
        )
          throw unavailable();
        const loaded = await runtime.loadProcess('explorer', {
          allowedMappings: names,
          requiredMappings: [
            'CLERK_SECRET_KEY',
            'CLERK_ENCRYPTION_KEY',
            ...names,
          ],
        });
        if (
          loaded.strategy !== strategy ||
          !loaded.mappings.CLERK_SECRET_KEY ||
          !loaded.mappings.CLERK_ENCRYPTION_KEY ||
          Object.keys(loaded.mappings).some((name) => !names.includes(name))
        )
          throw unavailable();
        const captured = { ...environment };
        for (const name of Object.keys(captured))
          if (
            name === 'CLERK_SECRET_KEY' ||
            name === 'CLERK_ENCRYPTION_KEY' ||
            name === 'CLERK_MACHINE_SECRET_KEY' ||
            /^EXPLORER_CLUB_[A-Z0-9_]+_CLERK_SECRET_KEY$/.test(name)
          )
            delete captured[name];
        for (const name of names) {
          const value = loaded.mappings[name];
          if (
            !value ||
            value.length > 4096 ||
            (name === 'CLERK_ENCRYPTION_KEY'
              ? !isEncryptionKey(value)
              : name === 'CLERK_MACHINE_SECRET_KEY'
                ? !/^[\x21-\x7e]{1,4096}$/.test(value)
                : !/^sk_(?:test|live)_[A-Za-z0-9]+$/.test(value))
          )
            throw unavailable();
          captured[name] = value;
        }
        return Object.freeze(captured);
      } catch {
        runtime?.close();
        throw unavailable();
      }
    })());
}

/** Clerk captures these process-owned defaults when its server SDK is imported. */
export function installClerkProcessSecrets(
  environment: Readonly<Record<string, string | undefined>>,
  target: Record<string, string | undefined>,
) {
  if (environment.SECRETS_KEYS_STRATEGY !== 'LOCAL_KEYVAULT') return;
  for (const name of [
    'CLERK_SECRET_KEY',
    'CLERK_ENCRYPTION_KEY',
    'CLERK_MACHINE_SECRET_KEY',
  ]) {
    const value = environment[name];
    if (value === undefined) delete target[name];
    else target[name] = value;
  }
}
