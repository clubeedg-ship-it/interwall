import { cookies } from 'next/headers';

import type {
    AuthenticatedUserSummary,
    MembershipSummary,
} from '@interwall/shared';

export const ACTIVE_TENANT_COOKIE_NAME = 'interwall_active_tenant';

type CookieStoreLike = {
    get(name: string): { value: string } | undefined;
};

export type ActiveTenantResolution =
    | {
        status: 'active';
        tenantId: string;
        membership: MembershipSummary;
        memberships: MembershipSummary[];
    }
    | {
        status: 'none';
        tenantId: null;
        reason: 'missing' | 'invalid';
        memberships: MembershipSummary[];
    };

type ResolveActiveTenantInput = {
    user: AuthenticatedUserSummary;
    cookieValue?: string | null;
    cookieStore?: CookieStoreLike;
    listMemberships: (
        user: AuthenticatedUserSummary,
    ) => Promise<MembershipSummary[]>;
};

export function readActiveTenantCookie(
    cookieStore: CookieStoreLike = cookies(),
): string | null {
    return cookieStore.get(ACTIVE_TENANT_COOKIE_NAME)?.value ?? null;
}

export async function resolveActiveTenant(
    input: ResolveActiveTenantInput,
): Promise<ActiveTenantResolution> {
    const memberships = await input.listMemberships(input.user);
    const activeMemberships = memberships.filter((membership) => membership.isActive);
    const cookieValue =
        input.cookieValue === undefined
            ? readActiveTenantCookie(input.cookieStore)
            : input.cookieValue;

    if (!cookieValue) {
        return {
            status: 'none',
            tenantId: null,
            reason: 'missing',
            memberships: activeMemberships,
        };
    }

    const membership = activeMemberships.find(
        (candidate) => candidate.tenantId === cookieValue,
    );

    if (!membership) {
        return {
            status: 'none',
            tenantId: null,
            reason: 'invalid',
            memberships: activeMemberships,
        };
    }

    return {
        status: 'active',
        tenantId: membership.tenantId,
        membership,
        memberships: activeMemberships,
    };
}

export function requireActiveTenant(input: {
    resolved: ActiveTenantResolution;
    requestedTenantId?: string | null;
}): {
    tenantId: string;
    membership: MembershipSummary;
} {
    const { resolved, requestedTenantId } = input;

    if (resolved.status !== 'active') {
        throw new Error('An active tenant must be selected for this request.');
    }

    if (requestedTenantId && requestedTenantId !== resolved.tenantId) {
        throw new Error(
            'The requested tenant does not match the validated active tenant for this request.',
        );
    }

    return {
        tenantId: resolved.tenantId,
        membership: resolved.membership,
    };
}
