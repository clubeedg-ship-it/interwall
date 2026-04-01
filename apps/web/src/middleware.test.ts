import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import type { AuthenticatedUserSummary } from '@interwall/shared';

import { UserSessionRequiredError } from './lib/server/auth';
import { createProtectedAppMiddleware } from './middleware';

const user: AuthenticatedUserSummary = {
    id: 'user-1',
    email: 'user@example.com',
};

describe('protected app middleware', () => {
    it('redirects unauthenticated requests to /sign-in', async () => {
        const middleware = createProtectedAppMiddleware({
            requireUserSession: async () => {
                throw new UserSessionRequiredError();
            },
            resolveActiveTenant: async () => {
                throw new Error('should not run');
            },
        });

        const response = await middleware(
            new NextRequest('http://localhost:3000/workspace'),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('http://localhost:3000/sign-in');
    });

    it('redirects authenticated users without an active tenant to /select-organization', async () => {
        const middleware = createProtectedAppMiddleware({
            requireUserSession: async () => user,
            resolveActiveTenant: async () => ({
                status: 'none',
                tenantId: null,
                reason: 'missing',
                memberships: [],
            }),
        });

        const response = await middleware(
            new NextRequest('http://localhost:3000/workspace'),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
            'http://localhost:3000/select-organization',
        );
    });

    it('allows authenticated users with an active tenant to continue into protected routes', async () => {
        const middleware = createProtectedAppMiddleware({
            requireUserSession: async () => user,
            resolveActiveTenant: async () => ({
                status: 'active',
                tenantId: 'tenant-1',
                membership: {
                    tenantId: 'tenant-1',
                    tenantSlug: 'alpha',
                    tenantName: 'Alpha Industries',
                    role: 'owner',
                    isActive: true,
                },
                memberships: [],
            }),
        });

        const response = await middleware(
            new NextRequest('http://localhost:3000/workspace'),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });
});
