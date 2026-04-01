import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockRequireUserSession,
    mockCreateServerSupabaseClient,
    mockListMembershipsForUser,
    mockCookieStore,
    mockRevalidatePath,
    mockInvoke,
} = vi.hoisted(() => ({
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockListMembershipsForUser: vi.fn(),
    mockCookieStore: {
        get: vi.fn(),
    },
    mockRevalidatePath: vi.fn(),
    mockInvoke: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
    requireUserSession: mockRequireUserSession,
}));

vi.mock('@/lib/server/supabase', () => ({
    createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock('@/lib/server/repositories/memberships', () => ({
    listMembershipsForUser: mockListMembershipsForUser,
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => mockCookieStore),
}));

vi.mock('next/cache', () => ({
    revalidatePath: mockRevalidatePath,
}));

import {
    createMembershipForExistingUser,
    updateMembershipRole,
} from './actions';

describe('membership actions', () => {
    beforeEach(() => {
        mockRequireUserSession.mockReset();
        mockCreateServerSupabaseClient.mockReset();
        mockListMembershipsForUser.mockReset();
        mockCookieStore.get.mockReset();
        mockRevalidatePath.mockReset();
        mockInvoke.mockReset();

        mockRequireUserSession.mockResolvedValue({
            id: 'user-1',
            email: 'owner@example.com',
        });
        mockListMembershipsForUser.mockResolvedValue([
            {
                tenantId: 'tenant-a',
                tenantSlug: 'alpha',
                tenantName: 'Alpha Industries',
                role: 'owner',
                isActive: true,
            },
            {
                tenantId: 'tenant-b',
                tenantSlug: 'beta',
                tenantName: 'Beta Works',
                role: 'member',
                isActive: true,
            },
        ]);
        mockCreateServerSupabaseClient.mockReturnValue({
            functions: {
                invoke: mockInvoke,
            },
        });
        mockInvoke.mockResolvedValue({
            data: {
                data: {
                    membership: {
                        id: 'membership-2',
                        tenant_id: 'tenant-a',
                        user_id: 'user-2',
                        role: 'admin',
                        status: 'active',
                        created_at: '2026-04-01T00:00:00.000Z',
                    },
                },
            },
            error: null,
        });
    });

    it('rejects membership mutations for active-tenant users without admin or owner access', async () => {
        mockCookieStore.get.mockReturnValue({
            value: 'tenant-b',
        });

        const formData = new FormData();
        formData.set('membershipId', 'membership-2');
        formData.set('role', 'admin');

        await expect(updateMembershipRole(formData)).resolves.toEqual({
            error: 'Tenant admin privileges are required for this request.',
        });
        expect(mockInvoke).not.toHaveBeenCalled();
        expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('updates membership roles through the backend surface for the validated active tenant', async () => {
        mockCookieStore.get.mockReturnValue({
            value: 'tenant-a',
        });

        const formData = new FormData();
        formData.set('membershipId', 'membership-2');
        formData.set('role', 'admin');

        await expect(updateMembershipRole(formData)).resolves.toEqual({
            error: null,
        });

        expect(mockInvoke).toHaveBeenCalledWith('tenant-memberships', {
            body: {
                action: 'updateMembershipRole',
                input: {
                    membershipId: 'membership-2',
                    role: 'admin',
                },
            },
            headers: {
                'x-active-tenant': 'tenant-a',
            },
        });
        expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/members');
    });

    it('never trusts a tenant id submitted by the client when creating memberships', async () => {
        mockCookieStore.get.mockReturnValue({
            value: 'tenant-a',
        });

        const formData = new FormData();
        formData.set('tenantId', 'tenant-z');
        formData.set('userId', 'user-9');
        formData.set('role', 'member');

        await expect(createMembershipForExistingUser(formData)).resolves.toEqual({
            error: null,
        });

        expect(mockInvoke).toHaveBeenCalledWith('tenant-memberships', {
            body: {
                action: 'createMembershipForExistingUser',
                input: {
                    userId: 'user-9',
                    role: 'member',
                },
            },
            headers: {
                'x-active-tenant': 'tenant-a',
            },
        });
    });
});
