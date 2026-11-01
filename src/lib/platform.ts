import 'server-only';
import { serverSecrets } from './server-secrets';
export async function clerkConfigured() {
  const environment = await serverSecrets();
  return Boolean(
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    environment.CLERK_SECRET_KEY,
  );
}
