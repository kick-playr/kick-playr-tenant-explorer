import { saveTenantSmtpVault, SmtpVaultError } from '@/lib/tenant-smtp-vault';
import { serverApiOrigin } from '@/lib/server-api-origin';
import { auth } from '@clerk/nextjs/server';
import { isSameOriginRequest } from '@/lib/request-origin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const session = await auth();
    if (!session.userId)
      return Response.json(
        { error: { code: 'Unauthorized' } },
        { status: 401, headers },
      );
    const token = await session.getToken();
    const provisioning = process.env.VAULT_PROVISIONING_GRANT;
    if (!token || !provisioning)
      return Response.json(
        { error: { code: 'AdministrationUnavailable' } },
        { status: 503, headers },
      );
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      !isSameOriginRequest(request)
    )
      return Response.json(
        { error: { code: 'Forbidden' } },
        { status: 403, headers },
      );
    const { path } = await context.params;
    if (
      !path.length ||
      path.some(
        (part) =>
          !part ||
          part.includes('/') ||
          part === '.' ||
          part === '..' ||
          part.length > 512,
      )
    )
      throw Error();
    const allowed =
      /^(tenant-(?:smtp|imap)\/[A-Za-z0-9-]+|catalog|access|resources(?:\/[A-Za-z0-9-]+(?:\/reveal\/[A-Za-z0-9-]+|\/versions|\/rotations|\/enabled)?)?|applications(?:\/[a-z0-9-]+)?|assignments\/[a-z0-9-]+|enrollments\/[a-z0-9-]+|links\/[a-z0-9-]+|consent|schemas(?:\/[^/]+)?|rotations\/[A-Za-z0-9-]+\/activate|instances\/[A-Za-z0-9-]+\/retire)$/;
    if (!allowed.test(path.join('/')))
      return Response.json(
        { error: { code: 'NotFound' } },
        { status: 404, headers },
      );
    const origin = new URL(
      process.env.VAULT_API_ORIGIN ??
        process.env.VAULT_URL ??
        'http://127.0.0.1:4000',
    );
    if (
      origin.username ||
      origin.password ||
      (!['https:'].includes(origin.protocol) &&
        !(
          origin.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(origin.hostname)
        ))
    )
      throw Error();
    const url = new URL(
        '/v2/admin/' + path.map(encodeURIComponent).join('/'),
        origin,
      ),
      query = new URL(request.url).searchParams;
    for (const name of [
      'environment',
      'ownerType',
      'ownerId',
      'limit',
      'after',
    ])
      if (query.has(name)) url.searchParams.set(name, query.get(name)!);
    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.text();
    if (body && Buffer.byteLength(body) > 128 * 1024)
      return Response.json(
        { error: { code: 'TooLarge' } },
        { status: 413, headers },
      );
    if (path[0] === 'tenant-smtp' || path[0] === 'tenant-imap') {
      const environment = query.get('environment') ?? '';
      const tenantId = query.get('ownerId') ?? '';
      if (
        request.method !== 'PUT' ||
        query.get('ownerType') !== 'tenant' ||
        !['development', 'test', 'preview', 'production'].includes(
          environment,
        ) ||
        !/^[a-z0-9][a-z0-9-]{0,63}$/.test(tenantId)
      )
        return Response.json(
          { error: { code: 'InvalidTenantSmtpScope' } },
          { status: 400, headers },
        );
      const input = JSON.parse(body || '{}');
      const scopeQuery = new URLSearchParams({
        environment,
        ownerType: 'tenant',
        ownerId: tenantId,
      });
      const apiOrigin = await serverApiOrigin();
      const apiUrl = new URL(apiOrigin);
      if (
        apiUrl.origin !== apiOrigin ||
        apiUrl.username ||
        apiUrl.password ||
        (apiUrl.protocol !== 'https:' &&
          !(
            apiUrl.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname)
          ))
      )
        throw Error();
      try {
        const result = await saveTenantSmtpVault({
          provider: path[0] === 'tenant-imap' ? 'imap' : 'smtp',
          scope: { environment, tenantId },
          resourceId: path[1]!,
          input,
          connection: async () => {
            const response = await fetch(
              new URL(
                `/api/club/tenants/${environment}/${tenantId}/integrations`,
                apiOrigin,
              ),
              {
                headers: { authorization: 'Bearer ' + token },
                cache: 'no-store',
                redirect: 'error',
                signal: AbortSignal.timeout(15000),
              },
            );
            if (!response.ok)
              throw Error('Club SMTP configuration is unavailable.');
            const data = await response.json();
            return data.items?.find(
              (c: { id: string }) => c.id === input.connectionId,
            );
          },
          vault: async (target, method = 'GET', value) => {
            const [pathname, extra] = target.split('?');
            const scoped = new URL('/v2/admin/' + pathname, origin);
            scoped.search = scopeQuery.toString();
            if (extra)
              for (const [key, value] of new URLSearchParams(extra))
                if (['limit', 'after'].includes(key))
                  scoped.searchParams.set(key, value);
            const response = await fetch(scoped, {
              method,
              headers: {
                authorization: 'Bearer ' + token,
                'x-vault-provisioning': 'Bearer ' + provisioning,
                'content-type': 'application/json',
              },
              body: value === undefined ? undefined : JSON.stringify(value),
              cache: 'no-store',
              redirect: 'error',
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok)
              throw Error('Vault administration is unavailable.');
            const raw = await response.text();
            if (Buffer.byteLength(raw) > 2 * 1024 * 1024)
              throw Error('Vault response is unavailable.');
            return JSON.parse(raw);
          },
        });
        return Response.json(result, { headers });
      } catch (error) {
        return Response.json(
          {
            error: {
              code: path[0] === 'tenant-imap' ? 'ImapSaveFailed' : 'SmtpSaveFailed',
              message:
                error instanceof SmtpVaultError
                  ? error.message
                  : 'SMTP save could not be confirmed.',
            },
          },
          { status: 409, headers },
        );
      }
    }
    const response = await fetch(url, {
      method: request.method,
      headers: {
        authorization: 'Bearer ' + token,
        'x-vault-provisioning': 'Bearer ' + provisioning,
        'content-type': 'application/json',
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!response.ok)
      return Response.json(
        {
          error: {
            code:
              response.status === 403
                ? 'ApprovalOrPermissionRequired'
                : 'VaultUnavailable',
          },
        },
        {
          status: [400, 401, 403, 404, 409, 413].includes(response.status)
            ? response.status
            : 503,
          headers,
        },
      );
    const text = await response.text();
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw Error();
    return new Response(text, {
      status: response.status,
      headers: {
        ...headers,
        'content-type':
          response.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch {
    return Response.json(
      { error: { code: 'VaultUnavailable' } },
      { status: 503, headers },
    );
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
