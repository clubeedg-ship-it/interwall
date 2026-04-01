export type AppRole = 'owner' | 'admin' | 'member';

export interface MembershipSummary {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    role: AppRole;
    isActive: boolean;
}

export interface ActiveTenantSummary {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    membership: MembershipSummary;
}
