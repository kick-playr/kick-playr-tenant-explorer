import { auth } from '@clerk/nextjs/server';
import { proxyRequest } from '@/lib/proxy';
import { resolveRealm } from '@/lib/server-realms';
import { realmUnavailableResponse } from '@/lib/realm-unavailable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const result = await resolveRealm(request.headers.get('host') ?? '');
  if (!result.ok) return realmUnavailableResponse('json', result.error);
  const session = await auth();
  if (!session.userId)
    return Response.json(
      { message: 'Sign in to the tenant explorer' },
      { status: 401 },
    );
  const path = (await context.params).path;
  let token: string | null;
  try {
    // The runtime requires a session-bound token with sid and custom aud.
    token = await session.getToken();
  } catch {
    return Response.json(
      {
        message:
          'Club sign-in token is unavailable; check its Clerk configuration',
      },
      { status: 503 },
    );
  }
  return proxyRequest(
    request,
    path,
    token,
    process.env.EXPLORER_API_ORIGIN ?? '',
  );
}
export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as PUT,
  handle as DELETE,
};
