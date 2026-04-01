import { describe, expect, it } from 'vitest';

import type { AuthenticatedUserSummary } from '@interwall/shared';

import {
    assertTenantAdmin,
    getMembershipByTenant,
    listMembershipsForUser,
} from './memberships';

const user: AuthenticatedUserSummary = {
    id: 'user-1',
    email: 'owner@example.com',
};

type MembershipFixture = {
    id: string;
    tenant_id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'member';
    status: 'active' | 'invited' | 'inactive';
    created_at: string;
    updated_at: string;
    tenant: {
        id: string;
        slug: string;
        name: string;
        created_by: string | null;
        created_at: string;
        updated_at: string;
    };
};

function createMembershipClient(rows: MembershipFixture[]) {
    return {
        from(table: 'tenant_memberships') {
            expect(table).toBe('tenant_memberships');

            const filters = new Map<string, string>();

            return {
                select() {
                    return {
                        eq(column: string, value: string) {
                            filters.set(column, value);
                            return this;
                        },
                        order() {
                            return Promise.resolve({
                                data: rows.filter((row) =>
                                    Array.from(filters.entries()).every(
                                        ([column, expected]) =>
                                            String(
                                                row[column as keyof MembershipFixture],
                                            ) === expected,
                                    ),
                                ),
                                error: null,
                            });
                        },
                        maybeSingle() {
                            const filtered = rows.filter((row) =>
                                Array.from(filters.entries()).every(
                                    ([column, expected]) =>
                                        String(
                                            row[column as keyof MembershipFixture],
                                        ) === expected,
                                ),
                            );

                            return Promise.resolve({
                                data: filtered[0] ?? null,
                                error: null,
                            });
                        },
                    };
                },
            };
        },
    };
}

describe('membership repositories', () => {
    const rows: MembershipFixture[] = [
        {
            id: 'membership-a',
            tenant_id: 'tenant-a',
            user_id: 'user-1',
            role: 'owner',
            status: 'active',
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
            tenant: {
                id: 'tenant-a',
                slug: 'alpha',
                name: 'Alpha Industries',
                created_by: 'user-1',
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-01T00:00:00.000Z',
            },
        },
        {
            id: 'membership-b',
            tenant_id: 'tenant-b',
            user_id: 'user-2',
            role: 'admin',
            status: 'active',
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
            tenant: {
                id: 'tenant-b',
                slug: 'beta',
                name: 'Beta Works',
                created_by: 'user-2',
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-01T00:00:00.000Z',
            },
        },
        {
            id: 'membership-c',
            tenant_id: 'tenant-c',
            user_id: 'user-1',
            role: 'member',
            status: 'active',
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
            tenant: {
                id: 'tenant-c',
                slug: 'gamma',
                name: 'Gamma Fabrication',
                created_by: 'user-1',
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-01T00:00:00.000Z',
            },
        },
    ];

    it('never returns rows outside the authenticated user memberships', async () => {
        const client = createMembershipClient(rows);

        const memberships = await listMembershipsForUser(client, user);

        expect(memberships).toEqual([
            {
                tenantId: 'tenant-a',
                tenantSlug: 'alpha',
                tenantName: 'Alpha Industries',
                role: 'owner',
                isActive: true,
            },
            {
                tenantId: 'tenant-c',
                tenantSlug: 'gamma',
                tenantName: 'Gamma Fabrication',
                role: 'member',
                isActive: true,
            },
        ]);
    });

    it('scopes single-tenant membership lookups to the authenticated user', async () => {
        const client = createMembershipClient(rows);

        await expect(
            getMembershipByTenant(client, {
                user,
                tenantId: 'tenant-b',
            }),
        ).resolves.toBeNull();
    });

    it('requires tenant admin privileges for privileged membership actions', async () => {
        const client = createMembershipClient(rows);

        await expect(
            assertTenantAdmin(client, {
                user,
                tenantId: 'tenant-a',
            }),
        ).resolves.toMatchObject({
            tenantId: 'tenant-a',
            role: 'owner',
        });

        await expect(
            assertTenantAdmin(client, {
                user,
                tenantId: 'tenant-c',
            }),
        ).rejects.toThrow(/tenant admin/i);
    });
});
