import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async () => import('@/test/mocks/next-navigation'));

import { ACTIVE_TENANT_COOKIE_NAME } from '@/lib/server/tenant-context';

import { selectOrganization } from './select-organization';

const {
    mockRequireUserSession,
    mockCreateServerSupabaseClient,
    mockGetMembershipByTenant,
    mockCookieStore,
} = vi.hoisted(() => ({
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockGetMembershipByTenant: vi.fn(),
    mockCookieStore: {
        set: vi.fn(),
    },
}));

vi.mock('@/lib/server/auth', () => ({
    requireUserSession: mockRequireUserSession,
}));

vi.mock('@/lib/server/supabase', () => ({
    createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock('@/lib/server/repositories/memberships', () => ({
    getMembershipByTenant: mockGetMembershipByTenant,
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => mockCookieStore),
}));

describe('selectOrganization', () => {
    beforeEach(() => {
        mockRequireUserSession.mockReset();
        mockCreateServerSupabaseClient.mockReset();
        mockGetMembershipByTenant.mockReset();
        mockCookieStore.set.mockReset();

        mockRequireUserSession.mockResolvedValue({
            id: 'user-1',
            email: 'owner@example.com',
        });
        mockCreateServerSupabaseClient.mockReturnValue({});
    });

    it('writes the active tenant cookie only for an allowed membership and redirects to /workspace', async () => {
        mockGetMembershipByTenant.mockResolvedValue({
            tenantId: 'tenant-a',
            tenantSlug: 'alpha',
            tenantName: 'Alpha Industries',
            role: 'owner',
            isActive: true,
        });

        const formData = new FormData();
        formData.set('tenantId', 'tenant-a');

        await expect(selectOrganization({ error: null }, formData)).rejects.toThrow(
            'NEXT_REDIRECT:/workspace',
        );

        expect(mockCookieStore.set).toHaveBeenCalledWith({
            name: ACTIVE_TENANT_COOKIE_NAME,
            value: 'tenant-a',
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: false,
        });
    });

    it('rejects selections outside the current user memberships without setting a cookie', async () => {
        mockGetMembershipByTenant.mockResolvedValue(null);

        const formData = new FormData();
        formData.set('tenantId', 'tenant-z');

        await expect(selectOrganization({ error: null }, formData)).resolves.toEqual({
            error: 'Select a valid organization to continue.',
        });
        expect(mockCookieStore.set).not.toHaveBeenCalled();
    });
});
