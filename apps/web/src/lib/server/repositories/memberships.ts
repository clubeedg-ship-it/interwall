import type {
    AuthenticatedUserSummary,
    MembershipSummary,
    TenantMembershipRow,
    TenantRow,
} from '@interwall/shared';

type MembershipRowWithTenant = TenantMembershipRow & {
    tenant: TenantRow | null;
};

type QueryResult<T> = PromiseLike<{
    data: T;
    error: { message: string } | null;
}>;

type MembershipQueryBuilder = {
    eq(column: string, value: string): MembershipQueryBuilder;
    order(column: string, options?: { ascending?: boolean }): QueryResult<
        MembershipRowWithTenant[] | null
    >;
    maybeSingle(): QueryResult<MembershipRowWithTenant | null>;
};

export type MembershipRepositoryClient = {
    from(table: 'tenant_memberships'): {
        select(columns: string): MembershipQueryBuilder;
    };
};

function createMembershipQuery(
    client: MembershipRepositoryClient,
    userId: string,
): MembershipQueryBuilder {
    return client
        .from('tenant_memberships')
        .select(
            'id, tenant_id, user_id, role, status, created_at, updated_at, tenant:tenants!inner(id, slug, name, created_by, created_at, updated_at)',
        )
        .eq('user_id', userId);
}

function toMembershipSummary(
    row: MembershipRowWithTenant,
): MembershipSummary {
    if (!row.tenant) {
        throw new Error('Tenant membership rows must include tenant details.');
    }

    return {
        tenantId: row.tenant_id,
        tenantSlug: row.tenant.slug,
        tenantName: row.tenant.name,
        role: row.role,
        isActive: row.status === 'active',
    };
}

export async function listMembershipsForUser(
    client: MembershipRepositoryClient,
    user: AuthenticatedUserSummary,
): Promise<MembershipSummary[]> {
    const { data, error } = await createMembershipQuery(client, user.id).order(
        'created_at',
        { ascending: true },
    );

    if (error) {
        throw new Error(`Unable to load memberships for the authenticated user: ${error.message}`);
    }

    return (data ?? []).map(toMembershipSummary);
}

export async function getMembershipByTenant(
    client: MembershipRepositoryClient,
    input: {
        user: AuthenticatedUserSummary;
        tenantId: string;
    },
): Promise<MembershipSummary | null> {
    const { data, error } = await createMembershipQuery(client, input.user.id)
        .eq('tenant_id', input.tenantId)
        .maybeSingle();

    if (error) {
        throw new Error(
            `Unable to load the authenticated user membership for tenant ${input.tenantId}: ${error.message}`,
        );
    }

    return data ? toMembershipSummary(data) : null;
}

export async function assertTenantAdmin(
    client: MembershipRepositoryClient,
    input: {
        user: AuthenticatedUserSummary;
        tenantId: string;
    },
): Promise<MembershipSummary> {
    const membership = await getMembershipByTenant(client, input);

    if (!membership || !membership.isActive) {
        throw new Error('An active tenant membership is required for this request.');
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
        throw new Error('Tenant admin privileges are required for this request.');
    }

    return membership;
}
