export const environments = [
  'development',
  'test',
  'preview',
  'production',
] as const;
export const statuses = [
  'provisioning',
  'active',
  'suspended',
  'disabled',
] as const;
export const providers = [
  'bexio',
  'matrix',
  'smtp',
  'dropbox',
  'pingen',
  'imap',
] as const;
export type Environment = (typeof environments)[number];
export type Status = (typeof statuses)[number];
export interface TenantSummary {
  deletionId?: string;
  id: string;
  environment: Environment;
  hostname: string;
  aliases: string[];
  status: Status;
  configRevision: number;
  public: { name: string; locale: string };
  secretReferences: { mongoUri: string; key: string };
}
export interface UserGrant {
  issuer: string;
  subject: string;
  revision: number;
  status: 'active' | 'disabled' | 'revoked';
  contactId: number;
  permissions: string[];
}
export interface Credential {
  id: string;
  label: string;
  revision: number;
  status: 'active' | 'revoked';
  updatedAt: string;
}
export interface Integration {
  id: string;
  label: string;
  provider: (typeof providers)[number];
  accountReference: string;
  credentialId: string;
  capabilities: string[];
  enabled: boolean;
  updatedAt: string;
}
export interface Tenant extends TenantSummary {
  identityRealm: string;
  authorityRevision: number;
  configuration: Record<string, unknown>;
  users: UserGrant[];
  credentials: Credential[];
  integrations: Integration[];
}
export interface TenantList {
  items: TenantSummary[];
  total: number;
  page: number;
  pageSize: number;
}
export interface AuditEvent {
  id: string;
  environment: string;
  tenantId: string;
  action: string;
  actor: string;
  revision: number;
  resource?: string;
  at: string;
}
export interface TenantKeyFiles {
  reference: string;
  status: 'connected' | 'unavailable' | 'unbound';
  profile?: string;
  version?: string;
  files: {
    kind: 'wrapping' | 'index' | 'control';
    source?: 'file' | 'environment';
    filename?: string;
    path?: string;
    variable?: string;
    status: 'available' | 'missing' | 'insecure' | 'invalid' | 'unreadable';
    bytes?: number;
    fingerprint?: string;
  }[];
}
