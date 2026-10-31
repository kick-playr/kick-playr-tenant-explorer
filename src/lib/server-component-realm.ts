import { cache } from 'react';
import { resolveRealm } from './server-realms';

// React cache is scoped to one Server Component request. Proxy/route handlers
// call resolveRealm directly; no authorization result survives into a new request.
export const serverComponentRealm = cache((host: string) => resolveRealm(host));
