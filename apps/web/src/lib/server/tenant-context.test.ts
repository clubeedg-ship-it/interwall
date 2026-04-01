import { describe, expect, it } from 'vitest';

import type { AuthenticatedUserSummary, MembershipSummary } from '@interwall/shared';

import {
    requireActiveTenant,
    resolveActiveTenant,
} from './tenant-context';

const user: AuthenticatedUserSummary = {
    id: 'user-1',
    email: 'owner@example.com',
};

const memberships: MembershipSummary[] = [
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
];

describe('resolveActiveTenant', () => {
    it('returns the selected membership when the cookie matches one of the user memberships', async () => {
        const result = await resolveActiveTenant({
            user,
            cookieValue: 'tenant-b',
            listMemberships: async () => memberships,
        });

        expect(result.status).toBe('active');
        if (result.status !== 'active') {
            throw new Error('expected active tenant resolution');
        }

        expect(result.tenantId).toBe('tenant-b');
        expect(result.membership.tenantName).toBe('Beta Works');
    });

    it('returns an explicit no-active-tenant result when the cookie is missing or invalid', async () => {
        const missing = await resolveActiveTenant({
            user,
            cookieValue: null,
            listMemberships: async () => memberships,
        });

        expect(missing).toMatchObject({
            status: 'none',
            reason: 'missing',
            tenantId: null,
        });

        const invalid = await resolveActiveTenant({
            user,
            cookieValue: 'tenant-z',
            listMemberships: async () => memberships,
        });

        expect(invalid).toMatchObject({
            status: 'none',
            reason: 'invalid',
            tenantId: null,
        });
        expect(invalid.memberships).toHaveLength(2);
    });

    it('validates the requested tenant per request instead of assuming session context survives', async () => {
        const resolved = await resolveActiveTenant({
            user,
            cookieValue: 'tenant-a',
            listMemberships: async () => memberships,
        });

        expect(() =>
            requireActiveTenant({
                resolved,
                requestedTenantId: 'tenant-b',
            }),
        ).toThrow(/requested tenant/i);

        expect(
            requireActiveTenant({
                resolved,
                requestedTenantId: 'tenant-a',
            }).tenantId,
        ).toBe('tenant-a');
    });
});
