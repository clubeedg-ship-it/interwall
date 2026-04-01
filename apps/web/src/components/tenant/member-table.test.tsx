import '@testing-library/jest-dom/vitest';

import { describe, expect, it, vi } from 'vitest';

import { renderApp, screen } from '@/test/render';

const {
    mockUpdateMembershipRole,
    mockRemoveMembership,
    mockCreateMembershipForExistingUser,
} = vi.hoisted(() => ({
    mockUpdateMembershipRole: vi.fn(),
    mockRemoveMembership: vi.fn(),
    mockCreateMembershipForExistingUser: vi.fn(),
}));

vi.mock('@/app/(app)/settings/members/actions', () => ({
    updateMembershipRole: mockUpdateMembershipRole,
    removeMembership: mockRemoveMembership,
    createMembershipForExistingUser: mockCreateMembershipForExistingUser,
}));

import { MemberTable } from './member-table';

describe('MemberTable', () => {
    it('renders concrete membership controls for role changes, removals, and adding existing users', () => {
        renderApp(
            <MemberTable
                memberships={[
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
                ]}
            />,
        );

        const roleForms = screen.getAllByTestId('update-membership-role-form');
        const removeForms = screen.getAllByTestId('remove-membership-form');

        expect(roleForms).toHaveLength(2);
        expect(removeForms).toHaveLength(2);
        expect(screen.getByTestId('create-membership-form')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /save role/i })).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2);
        expect(screen.getByRole('button', { name: /add member/i })).toBeInTheDocument();
        expect(screen.getByLabelText('Existing user id')).toBeInTheDocument();
    });

    it('limits rendered role values to owner, admin, and member', () => {
        renderApp(
            <MemberTable
                memberships={[
                    {
                        id: 'membership-1',
                        tenant_id: 'tenant-a',
                        user_id: 'user-1',
                        role: 'owner',
                        status: 'active',
                        created_at: '2026-04-01T00:00:00.000Z',
                        updated_at: '2026-04-01T00:00:00.000Z',
                    },
                ]}
            />,
        );

        const renderedValues = screen
            .getAllByRole('option')
            .map((option) => option.getAttribute('value'));

        expect([...new Set(renderedValues)]).toEqual(['owner', 'admin', 'member']);
    });
});
