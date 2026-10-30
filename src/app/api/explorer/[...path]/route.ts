import { auth } from '@clerk/nextjs/server';
import { proxyRequest } from '@/lib/proxy';
import { clerkConfigured, isPlatformAdmin } from '@/lib/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!clerkConfigured())
    return Response.json(
      { message: 'Configure Clerk on the explorer server' },
      { status: 503 },
    );
  const session = await auth();
  if (!session.userId)
    return Response.json(
      { message: 'Sign in to the tenant explorer' },
      { status: 401 },
    );
  if (!isPlatformAdmin(session.userId))
    return Response.json(
      { message: 'Platform administrator access is required' },
      { status: 403 },
    );
  return proxyRequest(
    request,
    (await context.params).path,
    await session.getToken(),
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
