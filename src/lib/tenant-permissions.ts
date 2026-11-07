/** Permissions used by the club settings UI and its runtime authorization checks. */
export const tenantAdministratorPermissions = [
  'club:settings:read',
  'club:settings:write',
  'club:catalog:read',
  'club:contacts:read',
  'club:teams:read',
  'club:integrations:read',
  'club:integrations:write',
  'club:integrations:use',
  'club:integration-connections:manage',
  'club:actions:oauth:state',
  'club:audit:append',
] as const;

export function hasTenantAdministratorPermissions(
  permissions: readonly string[],
): boolean {
  return (
    permissions.includes('club:*:*') ||
    tenantAdministratorPermissions.every((p) => permissions.includes(p))
  );
}
