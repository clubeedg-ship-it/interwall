import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderApp, screen } from '@/test/render';

const {
    mockRequireUserSession,
    mockCreateServerSupabaseClient,
    mockListMembershipsForUser,
    mockListMembershipsForActiveTenant,
    mockCookieStore,
} = vi.hoisted(() => ({
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockListMembershipsForUser: vi.fn(),
    mockListMembershipsForActiveTenant: vi.fn(),
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

vi.mock('./actions', async () => {
    const actual = await vi.importActual<typeof import('./actions')>('./actions');

    return {
        ...actual,
        listMembershipsForActiveTenant: mockListMembershipsForActiveTenant,
    };
});

import MembersPage from './page';

describe('MembersPage', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        mockRequireUserSession.mockReset();
        mockCreateServerSupabaseClient.mockReset();
        mockListMembershipsForUser.mockReset();
        mockListMembershipsForActiveTenant.mockReset();
        mockCookieStore.get.mockReset();

        mockRequireUserSession.mockResolvedValue({
            id: 'user-1',
            email: 'owner@example.com',
        });
        mockCreateServerSupabaseClient.mockReturnValue({});
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
                role: 'admin',
                isActive: true,
            },
        ]);
        mockListMembershipsForActiveTenant.mockResolvedValue([
            {
                id: 'membership-1',
                tenant_id: 'tenant-a',
                user_id: 'user-1',
                role: 'owner',
                status: 'active',
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-01T00:00:00.000Z',
            },
            {
                id: 'membership-2',
                tenant_id: 'tenant-a',
                user_id: 'user-2',
                role: 'member',
                status: 'active',
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-01T00:00:00.000Z',
            },
        ]);
        mockCookieStore.get.mockReturnValue({
            value: 'tenant-a',
        });
    });

    it('renders only memberships for the active tenant', async () => {
        const page = await MembersPage();

        renderApp(page);

        expect(screen.getByText('Alpha Industries')).toBeInTheDocument();
        expect(screen.getByDisplayValue('user-1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('user-2')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('user-3')).not.toBeInTheDocument();
    });

    it('renders the member table and organization switcher when the user can access multiple organizations', async () => {
        const page = await MembersPage();

        renderApp(page);

        expect(screen.getByRole('heading', { name: /organization members/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /switch organization/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /switch to beta works/i })).toBeInTheDocument();
    });
});
