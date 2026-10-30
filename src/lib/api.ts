export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export type Transport = (
  path: string,
  options?: RequestInit,
) => Promise<unknown>;
export const apiRequest: Transport = async (path, options) => {
  const response = await fetch(`/api/explorer/${path}`, {
    ...options,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...options?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message;
    throw new ApiError(
      response.status,
      typeof message === 'string'
        ? message
        : Array.isArray(message)
          ? message.join('; ')
          : 'The request failed. Please try again.',
    );
  }
  return body;
};
export function tenantPath(environment: string, id: string) {
  return `tenants/${encodeURIComponent(environment)}/${encodeURIComponent(id)}`;
}
