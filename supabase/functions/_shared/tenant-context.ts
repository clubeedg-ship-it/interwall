import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { FunctionError } from './errors.ts';

export type MembershipRole = 'owner' | 'admin' | 'member';

export type TenantMembership = {
    id: string;
    tenant_id: string;
    user_id: string;
    role: MembershipRole;
    status?: string | null;
};

type ActiveTenantSource = {
    headers?: Headers;
    tenantId?: string | null;
};

export function requireActiveTenant(source: ActiveTenantSource): string {
    const headerTenantId = source.headers?.get('x-active-tenant');
    const tenantId = source.tenantId ?? headerTenantId;

    if (!tenantId) {
        throw new FunctionError(
            400,
            'missing_active_tenant',
            'An active tenant identifier is required.',
        );
    }

    return tenantId;
}

export async function requireTenantMembership(
    client: SupabaseClient,
    options: {
        tenantId: string;
        userId: string;
    },
): Promise<TenantMembership> {
    const { data, error } = await client
        .from('tenant_memberships')
        .select('id, tenant_id, user_id, role, status')
        .eq('tenant_id', options.tenantId)
        .eq('user_id', options.userId)
        .maybeSingle<TenantMembership>();

    if (error) {
        throw new FunctionError(
            500,
            'membership_lookup_failed',
            'Unable to validate tenant membership.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            403,
            'membership_required',
            'The authenticated user is not a member of the active tenant.',
        );
    }

    if (data.status && data.status !== 'active') {
        throw new FunctionError(
            403,
            'membership_inactive',
            'The authenticated user does not have an active membership for this tenant.',
            { membershipId: data.id, status: data.status },
        );
    }

    return data;
}

export async function requireTenantAdmin(
    client: SupabaseClient,
    options: {
        tenantId: string;
        userId: string;
    },
): Promise<TenantMembership> {
    const membership = await requireTenantMembership(client, options);

    if (membership.role !== 'owner' && membership.role !== 'admin') {
        throw new FunctionError(
            403,
            'tenant_admin_required',
            'Tenant admin privileges are required for this operation.',
            { role: membership.role },
        );
    }

    return membership;
}
