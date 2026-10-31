import { createHash } from 'node:crypto';
/** Only the bounded raster formats accepted by the club runtime are served. */
export function brandingAssetResponse(asset: unknown): Response {
  const data = (asset as { dataUrl?: unknown } | null)?.dataUrl;
  const match =
    typeof data === 'string'
      ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
          data,
        )
      : null;
  if (!match) return new Response(null, { status: 404 });
  const bytes = Buffer.from(match[2]!, 'base64');
  if (
    !bytes.length ||
    bytes.length > 8192 ||
    bytes.toString('base64') !== match[2]
  )
    return new Response(null, { status: 404 });
  return new Response(bytes, {
    headers: {
      'Content-Type': match[1]!,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      ETag: '"' + createHash('sha256').update(bytes).digest('hex') + '"',
    },
  });
}
