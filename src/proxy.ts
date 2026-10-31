import { clerkMiddleware } from '@clerk/nextjs/server';
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server';
import { realmForHost } from './lib/server-realms';
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const realm = await realmForHost(request.headers.get('host') ?? '');
  if (!realm.publishableKey || !realm.secretKey)
    return new NextResponse('Explorer authentication unavailable', {
      status: 503,
    });
  return clerkMiddleware(
    () => NextResponse.next(),
    () => ({
      publishableKey: realm.publishableKey,
      secretKey: realm.secretKey,
    }),
  )(request, event);
}
export const config = { matcher: ['/', '/sign-in(.*)', '/api/explorer(.*)'] };
