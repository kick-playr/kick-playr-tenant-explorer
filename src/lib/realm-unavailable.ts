import type { RealmConfigurationError } from './server-realms';

export const realmUnavailableMessage =
  'Explorer is temporarily unavailable. Please try again.';

/** Static content: never echo host, route, upstream payload or configuration. */
export function realmUnavailableResponse(
  format: 'html' | 'json' | 'empty',
  error?: RealmConfigurationError,
): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (error?.retryAfterSeconds !== undefined)
    headers.set('Retry-After', String(error.retryAfterSeconds));
  if (format === 'json')
    return Response.json(
      { message: realmUnavailableMessage },
      { status: 503, headers },
    );
  if (format === 'empty') return new Response(null, { status: 503, headers });
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Explorer temporarily unavailable</title></head><body><main><h1>Explorer is temporarily unavailable.</h1><p>Please try again.</p><a href="">Try again</a></main></body></html>`,
    { status: 503, headers },
  );
}
