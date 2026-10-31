import { auth } from '@clerk/nextjs/server';
import { resolveRealm } from '@/lib/server-realms';
import { realmUnavailableResponse } from '@/lib/realm-unavailable';
import { proxyRequest } from '@/lib/proxy';
import { brandingAssetResponse } from '@/lib/branding-asset-response';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ environment: string; id: string; variant: string }> },
) {
  const { environment, id, variant } = await params;
  if (
    !/^(development|test|preview|production)$/.test(environment) ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ||
    !['faviconLight', 'faviconDark'].includes(variant)
  )
    return new Response(null, { status: 404 });
  const result = await resolveRealm(request.headers.get('host') ?? '');
  if (!result.ok) return realmUnavailableResponse('empty', result.error);
  const session = await auth();
  if (!session.userId) return new Response(null, { status: 401 });
  let token: string | null;
  try {
    token = await session.getToken();
  } catch {
    return new Response(null, { status: 503 });
  }
  const segments = ['clubs', environment, id, 'branding'];
  // Cache-busting query values never enter the signed settings route.
  const read = new Request(
    new URL('/api/explorer/' + segments.join('/'), request.url),
    { headers: request.headers, signal: request.signal },
  );
  const response = await proxyRequest(
    read,
    segments,
    token,
    process.env.EXPLORER_API_ORIGIN ?? '',
  );
  if (!response.ok) return new Response(null, { status: response.status });
  const body = await response.json();
  return brandingAssetResponse(body?.branding?.[variant]);
}
