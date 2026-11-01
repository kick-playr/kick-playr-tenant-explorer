import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server';
import { resolveRealm } from './lib/server-realms';
import { realmUnavailableResponse } from './lib/realm-unavailable';
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const result = await resolveRealm(request.headers.get('host') ?? '');
  if (!result.ok)
    return realmUnavailableResponse(
      request.nextUrl.pathname.startsWith('/api/') ? 'json' : 'html',
      result.error,
    );
  const realm = result.realm;
  const { clerkMiddleware } = await import('@clerk/nextjs/server');
  return clerkMiddleware(
    () => NextResponse.next(),
    () => ({
      publishableKey: realm.publishableKey,
      secretKey: realm.secretKey,
    }),
  )(request, event);
}
export const config = { matcher: ['/', '/sign-in(.*)', '/api/explorer(.*)'] };
