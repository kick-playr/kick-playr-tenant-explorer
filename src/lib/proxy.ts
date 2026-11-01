import { BEXIO_MAPPING_GROUPS } from './bexio-tag-mappings';
/** Server-side, fixed-upstream bridge. Browser input never selects the upstream API destination. */
export async function proxyRequest(
  request: Request,
  segments: string[],
  token: string | null,
  origin: string,
  transport: typeof fetch = fetch,
): Promise<Response> {
  const fail = (status: number, message: string) =>
    Response.json(
      { message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  if (!token) return fail(401, 'Sign in to the tenant explorer');
  const path = segments.join('/');
  const club =
    /^clubs(?:\/(development|test|preview|production)\/[a-z0-9][a-z0-9-]{0,63}\/(?:catalog\/(?:categories|branches)(?:\/flags\/[A-Za-z][A-Za-z0-9]{0,63})?|branding|settings|integrations(?:\/[a-z0-9][a-z0-9-]{0,63}(?:\/connect)?)?))?$/.test(
      path,
    );
  if (
    segments.some((x) => !/^[A-Za-z0-9_-]{1,128}$/.test(x)) ||
    !(
      club ||
      path === 'access' ||
      /^tenants(?:\/(development|test|preview|production)\/[a-z0-9][a-z0-9-]{0,63}(?:\/(?:audit|keys|deletion(?:\/(?:recover|purge))?|onboarding(?:\/(?:save|verify|mongo-url|configure-keys))?|invitations(?:\/[A-Za-z0-9_-]{1,128}\/(?:resend|revoke|deliver|revoke-access))?|(?:users|credentials|integrations)\/[A-Za-z0-9_-]{1,128}))?)?$/.test(
        path,
      )
    )
  )
    return fail(400, 'Invalid explorer route');
  const catalogFlag =
    /^clubs\/[^/]+\/[^/]+\/catalog\/(categories|branches)\/flags\/([^/]+)$/.exec(
      path,
    );
  if (
    catalogFlag &&
    !BEXIO_MAPPING_GROUPS.some(
      (group) =>
        group.collection === catalogFlag[1] &&
        group.fields.some((field) => field.key === catalogFlag[2]),
    )
  )
    return fail(400, 'Invalid Bexio label mapping');
  let upstream: URL;
  try {
    upstream = new URL(origin);
    if (
      upstream.origin !== origin ||
      upstream.username ||
      upstream.password ||
      (upstream.protocol !== 'https:' &&
        !(
          upstream.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(upstream.hostname)
        ))
    )
      throw new Error();
  } catch {
    return fail(503, 'Configure EXPLORER_API_ORIGIN on the explorer server');
  }
  const incoming = new URL(request.url);
  const mutation = !['GET', 'HEAD'].includes(request.method);
  if (mutation) {
    // Next can use its internal listener address in request.url. The browser's
    // authority is Host; never take it from client-supplied forwarded headers.
    const host = request.headers.get('host') ?? incoming.host;
    let publicOrigin: string;
    try {
      const publicUrl = new URL(`${incoming.protocol}//${host}`);
      if (publicUrl.host !== host.toLowerCase()) throw Error();
      publicOrigin = publicUrl.origin;
    } catch {
      return fail(403, 'Write requests must come from this explorer');
    }
    if (request.headers.get('origin') !== publicOrigin)
      return fail(403, 'Write requests must come from this explorer');
  }
  if (
    mutation &&
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return fail(415, 'Use application/json');
  const bytes = mutation ? await request.arrayBuffer() : undefined;
  if (bytes && bytes.byteLength > 65536)
    return fail(413, 'Request exceeds 64KB');
  try {
    const response = await transport(
      `${upstream.origin}${path === 'access' ? '/api/explorer/access' : club ? '/api/club/tenants' + path.slice(5) : '/api/platform/' + path}${incoming.search}`,
      {
        method: request.method,
        body: bytes,
        redirect: 'error',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
      },
    );
    if (!response.headers.get('content-type')?.includes('application/json'))
      return fail(502, 'Explorer API returned an unexpected response');
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return fail(
      502,
      'Explorer API is unavailable. Check its configuration and connection.',
    );
  }
}
