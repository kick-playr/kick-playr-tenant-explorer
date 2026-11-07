/** Next's request URL can contain the internal listener. Host is the public
 * authority; forwarded headers must never select the origin for write checks. */
export function isSameOriginRequest(request: Request): boolean {
  try {
    const incoming = new URL(request.url);
    const host = request.headers.get('host') ?? incoming.host;
    const publicUrl = new URL(`${incoming.protocol}//${host}`);
    if (!['http:', 'https:'].includes(publicUrl.protocol) ||
        publicUrl.username || publicUrl.password ||
        publicUrl.host !== host.toLowerCase()) return false;
    return request.headers.get('origin') === publicUrl.origin;
  } catch {
    return false;
  }
}
