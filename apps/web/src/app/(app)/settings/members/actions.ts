'use server';

import { revalidatePath } from 'next/cache';

import type { AppRole, MembershipSummary, TenantMembershipRow } from '@interwall/shared';

import { requireUserSession } from '@/lib/server/auth';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import {
    createServerSupabaseClient,
    type ServerSupabaseClient,
} from '@/lib/server/supabase';
import {
    requireActiveTenant,
    resolveActiveTenant,
} from '@/lib/server/tenant-context';

type MembershipActionState = {
    error: string | null;
};

type TenantMembershipActionName =
    | 'listMemberships'
    | 'updateMembershipRole'
    | 'removeMembership'
    | 'createMembershipForExistingUser';

type TenantMembershipFunctionResponse = {
    data?: {
        memberships?: TenantMembershipRow[];
        membership?: TenantMembershipRow;
        tenantId: string;
    };
};

const MEMBERS_PAGE_PATH = '/settings/members';

function assertAdminMembership(membership: MembershipSummary): void {
    if (membership.role !== 'owner' && membership.role !== 'admin') {
        throw new Error('Tenant admin privileges are required for this request.');
    }
}

function parseRole(value: FormDataEntryValue | null): AppRole | null {
    if (value === 'owner' || value === 'admin' || value === 'member') {
        return value;
    }

    return null;
}

async function resolveAdminContext(
    supabase: ServerSupabaseClient,
): Promise<{
    membership: MembershipSummary;
    tenantId: string;
}> {
    const user = await requireUserSession({ supabase });
    const resolved = await resolveActiveTenant({
        user,
        listMemberships: (authenticatedUser) =>
            listMembershipsForUser(
                supabase as unknown as MembershipRepositoryClient,
                authenticatedUser,
            ),
    });
    const { membership, tenantId } = requireActiveTenant({ resolved });

    assertAdminMembership(membership);

    return {
        membership,
        tenantId,
    };
}

async function invokeTenantMembershipAction(
    supabase: ServerSupabaseClient,
    input: {
        action: TenantMembershipActionName;
        tenantId: string;
        bodyInput?: Record<string, string>;
    },
): Promise<TenantMembershipFunctionResponse> {
    const { data, error } = await supabase.functions.invoke<TenantMembershipFunctionResponse>(
        'tenant-memberships',
        {
            body: {
                action: input.action,
                input: input.bodyInput,
            },
            headers: {
                'x-active-tenant': input.tenantId,
            },
        },
    );

    if (error) {
        throw new Error(`Unable to complete tenant membership action: ${error.message}`);
    }

    if (!data?.data) {
        throw new Error('Tenant membership action completed without returning data.');
    }

    return data;
}

async function runMembershipMutation(
    callback: (input: {
        supabase: ServerSupabaseClient;
        tenantId: string;
    }) => Promise<void>,
): Promise<MembershipActionState> {
    try {
        const supabase = createServerSupabaseClient();
        const { tenantId } = await resolveAdminContext(supabase);

        await callback({
            supabase,
            tenantId,
        });
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : 'Unable to update tenant members.',
        };
    }

    revalidatePath(MEMBERS_PAGE_PATH);

    return {
        error: null,
    };
}

export async function listMembershipsForActiveTenant(): Promise<TenantMembershipRow[]> {
    const supabase = createServerSupabaseClient();
    const { tenantId } = await resolveAdminContext(supabase);
    const response = await invokeTenantMembershipAction(supabase, {
        action: 'listMemberships',
        tenantId,
    });

    return response.data?.memberships ?? [];
}

export async function updateMembershipRole(
    formData: FormData,
): Promise<MembershipActionState> {
    const membershipId = String(formData.get('membershipId') ?? '').trim();
    const role = parseRole(formData.get('role'));

    if (!membershipId || !role) {
        return {
            error: 'Provide a valid membership and role.',
        };
    }

    return runMembershipMutation(async ({ supabase, tenantId }) => {
        await invokeTenantMembershipAction(supabase, {
            action: 'updateMembershipRole',
            tenantId,
            bodyInput: {
                membershipId,
                role,
            },
        });
    });
}

export async function removeMembership(
    formData: FormData,
): Promise<MembershipActionState> {
    const membershipId = String(formData.get('membershipId') ?? '').trim();

    if (!membershipId) {
        return {
            error: 'Provide a valid membership to remove.',
        };
    }

    return runMembershipMutation(async ({ supabase, tenantId }) => {
        await invokeTenantMembershipAction(supabase, {
            action: 'removeMembership',
            tenantId,
            bodyInput: {
                membershipId,
            },
        });
    });
}

export async function createMembershipForExistingUser(
    formData: FormData,
): Promise<MembershipActionState> {
    const userId = String(formData.get('userId') ?? '').trim();
    const role = parseRole(formData.get('role')) ?? 'member';

    if (!userId) {
        return {
            error: 'Provide a valid user to add to this organization.',
        };
    }

    return runMembershipMutation(async ({ supabase, tenantId }) => {
        await invokeTenantMembershipAction(supabase, {
            action: 'createMembershipForExistingUser',
            tenantId,
            bodyInput: {
                userId,
                role,
            },
        });
    });
}
