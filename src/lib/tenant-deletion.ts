export interface DeletionStatus {
  purgeInProgress?: boolean;
  operation: null | {
    id: string;
    phase: 'retained' | 'purging' | 'failed' | 'purged' | 'recovered';
    revision: number;
    deletedAt: string;
    recoverUntil: string;
    targets: { id: string; label: string; done: boolean }[];
    error?: string;
    leaseUntil?: number;
  };
  expectedRevision: number;
  expectedAuthorityRevision: number;
  expectedInvitationRevision: number;
  identity: { name: string; hostname: string; aliases: string[] };
  impact: { users: number; pendingInvitations: number };
  checklist: { id: string; label: string }[];
  recoveryAvailable: boolean;
  inventory: {
    complete: boolean;
    controlOnly?: boolean;
    revision: string;
    targets: { id: string; label: string }[];
    reason?: string;
  };
}
