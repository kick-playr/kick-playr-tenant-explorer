import 'server-only';
import {
  createServerSecretsLoader,
  installClerkProcessSecrets,
} from './server-secrets-core';
const load = createServerSecretsLoader(process.env);
/** Process-owned SDK bootstrap only; realm-specific secrets never enter env. */
export async function serverSecrets() {
  const environment = await load();
  installClerkProcessSecrets(environment, process.env);
  return environment;
}
