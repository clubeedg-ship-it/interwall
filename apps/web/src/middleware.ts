import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { AuthenticatedUserSummary } from '@interwall/shared';

import { requireUserSession, UserSessionRequiredError } from './lib/server/auth';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from './lib/server/repositories/memberships';
import {
    ACTIVE_TENANT_COOKIE_NAME,
    type ActiveTenantResolution,
    resolveActiveTenant,
} from './lib/server/tenant-context';
import { createServerSupabaseClient } from './lib/server/supabase';

const SIGN_IN_PATH = '/sign-in';
const SELECT_ORGANIZATION_PATH = '/select-organization';
const WORKSPACE_PATH = '/workspace';

type MiddlewareDependencies = {
    requireUserSession: (
        input: { request: NextRequest; response: NextResponse },
    ) => Promise<AuthenticatedUserSummary>;
    resolveActiveTenant: (
        input: { user: AuthenticatedUserSummary; request: NextRequest; response: NextResponse },
    ) => Promise<ActiveTenantResolution>;
};

function isSelectOrganizationPath(pathname: string): boolean {
    return pathname === SELECT_ORGANIZATION_PATH;
}

function isWorkspacePath(pathname: string): boolean {
    return pathname === WORKSPACE_PATH || pathname.startsWith(`${WORKSPACE_PATH}/`);
}

function buildRedirectUrl(request: NextRequest, pathname: string): URL {
    return new URL(pathname, request.url);
}

export function createProtectedAppMiddleware(
    dependencies: MiddlewareDependencies,
) {
    return async function protectedAppMiddleware(request: NextRequest) {
        const response = NextResponse.next();

        try {
            const user = await dependencies.requireUserSession({ request, response });
            const activeTenant = await dependencies.resolveActiveTenant({
                user,
                request,
                response,
            });

            if (
                activeTenant.status !== 'active' &&
                !isSelectOrganizationPath(request.nextUrl.pathname)
            ) {
                return NextResponse.redirect(
                    buildRedirectUrl(request, SELECT_ORGANIZATION_PATH),
                );
            }

            if (
                activeTenant.status === 'active' &&
                isSelectOrganizationPath(request.nextUrl.pathname)
            ) {
                return NextResponse.redirect(buildRedirectUrl(request, WORKSPACE_PATH));
            }

            return response;
        } catch (error) {
            if (error instanceof UserSessionRequiredError) {
                return NextResponse.redirect(buildRedirectUrl(request, SIGN_IN_PATH));
            }

            throw error;
        }
    };
}

export const middleware = createProtectedAppMiddleware({
    async requireUserSession({ request, response }) {
        const supabase = createServerSupabaseClient({
            get(name) {
                return request.cookies.get(name);
            },
            set(input) {
                response.cookies.set(input);
            },
        });

        return requireUserSession({ supabase });
    },
    async resolveActiveTenant({ user, request, response }) {
        const supabase = createServerSupabaseClient({
            get(name) {
                return request.cookies.get(name);
            },
            set(input) {
                response.cookies.set(input);
            },
        });

        return resolveActiveTenant({
            user,
            cookieValue: request.cookies.get(ACTIVE_TENANT_COOKIE_NAME)?.value ?? null,
            listMemberships: (authenticatedUser) =>
                listMembershipsForUser(
                    supabase as unknown as MembershipRepositoryClient,
                    authenticatedUser,
                ),
        });
    },
});

export const config = {
    matcher: ['/workspace/:path*', '/select-organization'],
};

export default middleware;
