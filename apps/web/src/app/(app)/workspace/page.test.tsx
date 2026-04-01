import '@testing-library/jest-dom/vitest';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async () => import('@/test/mocks/next-navigation'));

import { renderApp, screen } from '@/test/render';

import WorkspacePage from './page';

const {
    mockRequireUserSession,
    mockCreateServerSupabaseClient,
    mockListMembershipsForUser,
    mockCookieStore,
} = vi.hoisted(() => ({
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockListMembershipsForUser: vi.fn(),
    mockCookieStore: {
        get: vi.fn(),
    },
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

describe('WorkspacePage', () => {
    beforeEach(() => {
        mockRequireUserSession.mockReset();
        mockCreateServerSupabaseClient.mockReset();
        mockListMembershipsForUser.mockReset();
        mockCookieStore.get.mockReset();

        mockRequireUserSession.mockResolvedValue({
            id: 'user-1',
            email: 'owner@example.com',
        });
        mockCreateServerSupabaseClient.mockReturnValue({});
    });

    it('renders the wall-first workspace shell after the authenticated user selects an active tenant', async () => {
        mockListMembershipsForUser.mockResolvedValue([
            {
                tenantId: 'tenant-a',
                tenantSlug: 'alpha',
                tenantName: 'Alpha Industries',
                role: 'owner',
                isActive: true,
            },
        ]);
        mockCookieStore.get.mockReturnValue({
            value: 'tenant-a',
        });

        const page = await WorkspacePage();

        renderApp(page);

        expect(
            screen.getByRole('navigation', { name: /workspace sections/i }),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /wall/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /scan/i })).toBeInTheDocument();
        expect(
            screen.getByRole('region', { name: /wall canvas section/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('complementary', { name: /scanner command surface/i }),
        ).toBeInTheDocument();
        expect(screen.getByText('Alpha Industries')).toBeInTheDocument();
        expect(
            screen.queryByText(/tenant-safe inventory surfaces are ready/i),
        ).not.toBeInTheDocument();
    });

    it('redirects back to organization selection when no active tenant has been chosen', async () => {
        mockListMembershipsForUser.mockResolvedValue([
            {
                tenantId: 'tenant-a',
                tenantSlug: 'alpha',
                tenantName: 'Alpha Industries',
                role: 'owner',
                isActive: true,
            },
        ]);
        mockCookieStore.get.mockReturnValue(undefined);

        await expect(WorkspacePage()).rejects.toThrow('NEXT_REDIRECT:/select-organization');
    });
});
