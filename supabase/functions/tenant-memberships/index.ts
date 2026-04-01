import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import {
    createFunctionClient,
    requireBackendUser,
} from '../_shared/auth.ts';
import {
    errorResponse,
    FunctionError,
    json,
    readJson,
    requireMethod,
} from '../_shared/errors.ts';
import {
    requireActiveTenant,
    requireTenantAdmin,
    requireTenantMembership,
    type MembershipRole,
} from '../_shared/tenant-context.ts';

type MembershipRecord = {
    id: string;
    tenant_id: string;
    user_id: string;
    role: MembershipRole;
    status?: string | null;
    created_at?: string;
};

type ListMembershipsInput = {
    tenantId?: string;
};

type UpdateMembershipRoleInput = {
    tenantId?: string;
    membershipId: string;
    role: MembershipRole;
};

type RemoveMembershipInput = {
    tenantId?: string;
    membershipId: string;
};

type CreateMembershipForExistingUserInput = {
    tenantId?: string;
    userId: string;
    role?: MembershipRole;
};

type MembershipActionRequest =
    | {
        action: 'listMemberships';
        input?: ListMembershipsInput;
    }
    | {
        action: 'updateMembershipRole';
        input: UpdateMembershipRoleInput;
    }
    | {
        action: 'removeMembership';
        input: RemoveMembershipInput;
    }
    | {
        action: 'createMembershipForExistingUser';
        input: CreateMembershipForExistingUserInput;
    };

function createAdminClient(): SupabaseClient {
    return createFunctionClient({ useServiceRole: true });
}

function assertMembershipRole(role: string): MembershipRole {
    if (role === 'owner' || role === 'admin' || role === 'member') {
        return role;
    }

    throw new FunctionError(
        400,
        'invalid_membership_role',
        'Role must be one of owner, admin, or member.',
    );
}

async function listMemberships(
    request: Request,
    caller: Awaited<ReturnType<typeof requireBackendUser>>,
    input: ListMembershipsInput = {},
): Promise<Response> {
    const tenantId = requireActiveTenant({
        headers: request.headers,
        tenantId: input.tenantId,
    });

    await requireTenantMembership(caller.client, {
        tenantId,
        userId: caller.user.id,
    });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
        .from('memberships')
        .select('id, tenant_id, user_id, role, status, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

    if (error) {
        throw new FunctionError(
            500,
            'list_memberships_failed',
            'Unable to list memberships for the active tenant.',
            error.message,
        );
    }

    return json({
        data: {
            memberships: (data ?? []) as MembershipRecord[],
            tenantId,
        },
    });
}

async function updateMembershipRole(
    request: Request,
    caller: Awaited<ReturnType<typeof requireBackendUser>>,
    input: UpdateMembershipRoleInput,
): Promise<Response> {
    const tenantId = requireActiveTenant({
        headers: request.headers,
        tenantId: input.tenantId,
    });

    const role = assertMembershipRole(input.role);

    await requireTenantAdmin(caller.client, {
        tenantId,
        userId: caller.user.id,
    });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
        .from('memberships')
        .update({ role })
        .eq('tenant_id', tenantId)
        .eq('id', input.membershipId)
        .select('id, tenant_id, user_id, role, status, created_at')
        .maybeSingle<MembershipRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'update_membership_role_failed',
            'Unable to update membership role.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'membership_not_found',
            'Membership was not found for the active tenant.',
            { membershipId: input.membershipId, tenantId },
        );
    }

    return json({
        data: {
            membership: data,
            tenantId,
        },
    });
}

async function removeMembership(
    request: Request,
    caller: Awaited<ReturnType<typeof requireBackendUser>>,
    input: RemoveMembershipInput,
): Promise<Response> {
    const tenantId = requireActiveTenant({
        headers: request.headers,
        tenantId: input.tenantId,
    });

    await requireTenantAdmin(caller.client, {
        tenantId,
        userId: caller.user.id,
    });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
        .from('memberships')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', input.membershipId)
        .select('id, tenant_id, user_id, role, status, created_at')
        .maybeSingle<MembershipRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'remove_membership_failed',
            'Unable to remove membership.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'membership_not_found',
            'Membership was not found for the active tenant.',
            { membershipId: input.membershipId, tenantId },
        );
    }

    return json({
        data: {
            membership: data,
            tenantId,
            removed: true,
        },
    });
}

async function createMembershipForExistingUser(
    request: Request,
    caller: Awaited<ReturnType<typeof requireBackendUser>>,
    input: CreateMembershipForExistingUserInput,
): Promise<Response> {
    const tenantId = requireActiveTenant({
        headers: request.headers,
        tenantId: input.tenantId,
    });

    await requireTenantAdmin(caller.client, {
        tenantId,
        userId: caller.user.id,
    });

    const adminClient = createAdminClient();
    const role = assertMembershipRole(input.role ?? 'member');
    const payload = {
        tenant_id: tenantId,
        user_id: input.userId,
        role,
        status: 'active',
    };

    const { data, error } = await adminClient
        .from('memberships')
        .insert(payload)
        .select('id, tenant_id, user_id, role, status, created_at')
        .maybeSingle<MembershipRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'create_membership_failed',
            'Unable to create membership for the existing user.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            500,
            'membership_create_empty',
            'Membership creation completed without a returned record.',
            payload,
        );
    }

    return json(
        {
            data: {
                membership: data,
                tenantId,
            },
        },
        { status: 201 },
    );
}

async function routeMembershipAction(request: Request): Promise<Response> {
    const caller = await requireBackendUser(request);

    if (request.method === 'GET') {
        const action = new URL(request.url).searchParams.get('action') ??
            'listMemberships';

        if (action !== 'listMemberships') {
            throw new FunctionError(
                400,
                'invalid_action',
                'GET requests only support the listMemberships action.',
                { action },
            );
        }

        const tenantId = new URL(request.url).searchParams.get('tenantId') ??
            undefined;

        return await listMemberships(request, caller, { tenantId });
    }

    requireMethod(request, ['POST']);

    const body = await readJson<MembershipActionRequest>(request);

    switch (body.action) {
        case 'listMemberships':
            return await listMemberships(request, caller, body.input);
        case 'updateMembershipRole':
            return await updateMembershipRole(request, caller, body.input);
        case 'removeMembership':
            return await removeMembership(request, caller, body.input);
        case 'createMembershipForExistingUser':
            return await createMembershipForExistingUser(
                request,
                caller,
                body.input,
            );
        default:
            throw new FunctionError(
                400,
                'invalid_action',
                'Unsupported tenant membership action.',
                body,
            );
    }
}

Deno.serve(async (request: Request) => {
    try {
        return await routeMembershipAction(request);
    } catch (error) {
        return errorResponse(error);
    }
});
