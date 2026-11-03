// Server-only. The public server-secrets entry point enforces the server-only import boundary.
import {
  createApplicationRuntime,
  createSecretsRuntime,
  applicationSnapshotFromLegacy,
  applicationDescriptorFromLegacy,
  type ApplicationRuntime,
  type RuntimeSnapshot,
  type SecretsRuntime,
} from '@kick-playr/local-key-vault/runtime-client';
import {
  createServerSecretsLoader,
  explorerSecretEnvironment,
  isExplorerSecretMapping,
} from './server-secrets-core';
type Environment = Readonly<Record<string, string | undefined>>;
type RuntimeOptions = Parameters<
  typeof createApplicationRuntime<Environment>
>[0];
type Options = {
  legacyFactory?: () => SecretsRuntime | Promise<SecretsRuntime>;
  runtimeFactory?: (options: RuntimeOptions) => ApplicationRuntime<Environment>;
};
const unavailable = () => Error('Explorer server secrets unavailable');
export function createLiveServerSecretsSource(
  input: Record<string, string | undefined>,
  options: Options = {},
) {
  const environment = { ...input },
    strategy = environment.SECRETS_KEYS_STRATEGY ?? 'ENV_VARIABLES';
  let closed = false,
    liveRequested = false,
    liveStarted = false,
    pending: Promise<Environment> | undefined,
    probe: ApplicationRuntime<Environment> | undefined,
    live: ApplicationRuntime<Environment> | undefined;
  let legacyRuntime: SecretsRuntime | undefined,
    legacySnapshot: RuntimeSnapshot | undefined,
    legacyEnvironment: Environment | undefined;
  let legacy: ReturnType<typeof createServerSecretsLoader> | undefined =
    createServerSecretsLoader(environment, async () => {
      const runtime = await openLegacyRuntime();
      return {
        ...runtime,
        loadProcess: async (application, policy) => {
          const loaded = await runtime.loadProcess(application, policy);
          legacySnapshot = loaded.snapshot;
          return loaded;
        },
      };
    });
  let mode: 'legacy' | 'live' | undefined,
    modeUntil = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  let warning = false;
  async function openLegacyRuntime() {
    if (!legacyRuntime)
      legacyRuntime = options.legacyFactory
        ? await options.legacyFactory()
        : createSecretsRuntime({ environment });
    return legacyRuntime;
  }
  function releaseLegacy() {
    legacyRuntime?.close();
    legacyRuntime = undefined;
    legacySnapshot = undefined;
    legacyEnvironment = undefined;
    legacy = undefined;
  }
  function configuration(): RuntimeOptions {
    return {
      application: 'explorer',
      scope: {
        environment: environment.LOCAL_KEYVAULT_ENVIRONMENT ?? 'development',
        tenant: '_shared',
      },
      environment,
      allowedMappings: isExplorerSecretMapping,
      requiredMappings: ['CLERK_SECRET_KEY', 'CLERK_ENCRYPTION_KEY'],
      prepare: async (snapshot) => ({
        value: explorerSecretEnvironment(
          environment,
          Object.fromEntries(
            snapshot.resources.map((r) => [r.mapping, r.value]),
          ),
        ),
      }),
    };
  }
  function construct(config: RuntimeOptions) {
    return options.runtimeFactory
      ? options.runtimeFactory(config)
      : createApplicationRuntime(config);
  }
  function validLegacy() {
    return (
      !!legacySnapshot &&
      legacySnapshot.secrets.every(
        (s) =>
          s.attributes.enabled &&
          (s.attributes.exp === undefined ||
            s.attributes.exp * 1000 > Date.now()) &&
          (s.attributes.nbf === undefined ||
            s.attributes.nbf * 1000 <= Date.now()),
      )
    );
  }
  async function perform(force: boolean): Promise<Environment> {
    if (closed) throw unavailable();
    if (strategy !== 'LOCAL_KEYVAULT') return legacy!();
    if (
      typeof window !== 'undefined' ||
      !['development', 'test'].includes(environment.NODE_ENV ?? '') ||
      environment.VERCEL !== undefined ||
      environment.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
      ['production', 'PROD'].includes(environment.STAGE ?? '')
    )
      throw unavailable();
    if (!liveRequested) {
      probe ??= construct(configuration());
      try {
        if (force || !mode || Date.now() >= modeUntil) {
          mode = await probe.mode();
          modeUntil = Date.now() + 1000;
        }
        warning = false;
      } catch {
        if (
          legacyEnvironment &&
          validLegacy() &&
          probe.status().reason !== 'AccessDenied'
        ) {
          warning = true;
          return legacyEnvironment;
        }
        throw unavailable();
      }
      if (mode === 'legacy') {
        legacyEnvironment = await legacy!();
        if (!validLegacy()) throw unavailable();
        return legacyEnvironment;
      }
      liveRequested = true;
      clearTimeout(timer);
      timer = undefined;
    }
    if (!live) {
      const initial =
        legacyEnvironment && legacySnapshot
          ? {
              snapshot: applicationSnapshotFromLegacy(
                'explorer',
                legacySnapshot,
              ),
              prepared: { value: legacyEnvironment, dispose: releaseLegacy },
            }
          : undefined;
      // A cold process still compares against immutable legacy pins. Reading this
      // descriptor requires no obsolete values, so ordinary revocation can recover.
      let baseline;
      if (!initial) {
        try {
          const binding = await (
            await openLegacyRuntime()
          ).loadApplication('explorer');
          baseline = applicationDescriptorFromLegacy(
            'explorer',
            binding.scope,
            binding.request,
          );
        } catch {
          legacyRuntime?.close();
          legacyRuntime = undefined;
          throw unavailable();
        }
      }
      live = construct({
        ...configuration(),
        ...(initial ? { initial } : { baseline }),
      });
    }
    await live.start();
    liveStarted = true;
    if (force) await live.refresh();
    const result = await live.withValue((value) => value);
    probe?.close();
    probe = undefined;
    // The v2 holder now owns the working environment and snapshot, including any seeded prior generation.
    releaseLegacy();
    return result;
  }
  function schedule() {
    if (
      !closed &&
      !liveStarted &&
      (legacyEnvironment || liveRequested) &&
      strategy === 'LOCAL_KEYVAULT' &&
      !timer
    ) {
      timer = setTimeout(() => {
        timer = undefined;
        void read(false).catch(() => {});
      }, 1000);
      timer.unref?.();
    }
  }
  function read(force: boolean): Promise<Environment> {
    if (!pending)
      pending = perform(force)
        .catch(() => {
          throw unavailable();
        })
        .finally(() => {
          pending = undefined;
          schedule();
        });
    return pending;
  }
  return {
    load: () => read(false),
    refresh: () => read(true),
    status: () =>
      live?.status() ?? {
        state: warning ? 'warning' : 'legacy',
        ...(warning ? { reason: 'DiscoveryUnavailable' } : {}),
      },
    close: () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      probe?.close();
      live?.close();
      releaseLegacy();
    },
  };
}
