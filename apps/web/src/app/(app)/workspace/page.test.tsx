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
    mockGetWallExperienceData,
} = vi.hoisted(() => ({
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockListMembershipsForUser: vi.fn(),
    mockCookieStore: {
        get: vi.fn(),
    },
    mockGetWallExperienceData: vi.fn(),
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

vi.mock('@/lib/server/wall-data', () => ({
    getWallExperienceData: mockGetWallExperienceData,
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => mockCookieStore),
}));

describe('WorkspacePage', () => {
    beforeEach(() => {
        mockRequireUserSession.mockReset();
        mockCreateServerSupabaseClient.mockReset();
        mockListMembershipsForUser.mockReset();
        mockGetWallExperienceData.mockReset();
        mockCookieStore.get.mockReset();

        mockRequireUserSession.mockResolvedValue({
            id: 'user-1',
            email: 'owner@example.com',
        });
        mockCreateServerSupabaseClient.mockReturnValue({});
        mockGetWallExperienceData.mockResolvedValue({
            warehouseName: 'Alpha Industries main warehouse',
            zones: [
                {
                    id: 'zone-receiving',
                    label: 'Receiving',
                    displayCode: 'RCV',
                    shelfCount: 1,
                    shelves: [
                        {
                            id: 'shelf-rcv-01',
                            label: 'Inbound 01',
                            displayCode: 'RCV-01',
                            health: 'healthy',
                            productName: 'Anchor Bracket',
                            quantityOnHand: 18,
                            capacityUnits: 24,
                            reorderCount: 0,
                            lotCount: 2,
                            notes: null,
                        },
                    ],
                },
            ],
            selectedZoneId: null,
            selectedShelfId: null,
            detail: null,
        });
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
            screen.getAllByRole('navigation', { name: /workspace sections/i }).length,
        ).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByRole('link', { name: /wall/i }).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByRole('link', { name: /scan/i }).length).toBeGreaterThanOrEqual(1);
        expect(
            screen.getByRole('region', { name: /wall canvas section/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('complementary', { name: /scanner command surface/i }),
        ).toBeInTheDocument();
        expect(screen.getAllByText('Alpha Industries').length).toBeGreaterThanOrEqual(1);
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
