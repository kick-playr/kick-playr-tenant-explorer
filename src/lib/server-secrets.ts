import 'server-only';
import { createLiveServerSecretsSource } from './server-secrets-live';
import { installClerkProcessSecrets } from './server-secrets-core';
const key = Symbol.for('kick-playr.explorer.server-secret-source');
const globals = globalThis as typeof globalThis & Record<symbol, unknown>;
type Holder = {
  source: ReturnType<typeof createLiveServerSecretsSource>;
  installed: boolean;
};
const holder = (globals[key] ??= {
  source: createLiveServerSecretsSource(process.env),
  installed: false,
}) as Holder;
/** SDK bootstrap is installed once; per-request realm credentials come from the current generation. */
export async function serverSecrets() {
  const environment = await holder.source.load();
  if (!holder.installed) {
    installClerkProcessSecrets(environment, process.env);
    holder.installed = true;
  }
  return environment;
}

export function tenantServerSecrets(tenantId: string) {
  return holder.source.tenant(tenantId);
}
