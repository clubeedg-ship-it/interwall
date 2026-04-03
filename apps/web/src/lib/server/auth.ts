import type { AuthenticatedUserSummary } from '@interwall/shared';

import { createServerSupabaseClient, type ServerSupabaseClient } from './supabase';

type SessionDependencyInput = {
    supabase?: Pick<ServerSupabaseClient, 'auth'>;
};

export class UserSessionRequiredError extends Error {
    constructor() {
        super('An authenticated user session is required for this request.');
    }
}

export async function getUserSession(
    input: SessionDependencyInput = {},
): Promise<AuthenticatedUserSummary | null> {
    const supabase = input.supabase ?? createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        if (error.message === 'Auth session missing!') {
            return null;
        }

        throw new Error(`Unable to resolve the authenticated user session: ${error.message}`);
    }

    if (!data.user) {
        return null;
    }

    return {
        id: data.user.id,
        email: data.user.email ?? null,
    };
}

export async function requireUserSession(
    input: SessionDependencyInput = {},
): Promise<AuthenticatedUserSummary> {
    const user = await getUserSession(input);

    if (!user) {
        throw new UserSessionRequiredError();
    }

    return user;
}
