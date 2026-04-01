import {
    createClient,
    type SupabaseClient,
    type User,
} from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { FunctionError } from './errors.ts';

const DEFAULT_SCHEMA = 'public';

type CreateFunctionClientOptions = {
    authHeader?: string | null;
    useServiceRole?: boolean;
};

export function createFunctionClient(
    options: CreateFunctionClientOptions = {},
): SupabaseClient {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl) {
        throw new FunctionError(
            500,
            'missing_supabase_url',
            'SUPABASE_URL is required for edge functions.',
        );
    }

    const apiKey = options.useServiceRole ? serviceRoleKey : anonKey;

    if (!apiKey) {
        throw new FunctionError(
            500,
            options.useServiceRole
                ? 'missing_supabase_service_role_key'
                : 'missing_supabase_anon_key',
            options.useServiceRole
                ? 'SUPABASE_SERVICE_ROLE_KEY is required for privileged mutations.'
                : 'SUPABASE_ANON_KEY is required for request-scoped auth resolution.',
        );
    }

    return createClient(supabaseUrl, apiKey, {
        db: { schema: DEFAULT_SCHEMA },
        global: {
            headers: options.authHeader
                ? { Authorization: options.authHeader }
                : {},
        },
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

export function getAuthorizationHeader(request: Request): string {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
        throw new FunctionError(
            401,
            'missing_authorization',
            'Authorization header is required.',
        );
    }

    return authHeader;
}

export async function requireBackendUser(request: Request): Promise<{
    authHeader: string;
    user: User;
    client: SupabaseClient;
}> {
    const authHeader = getAuthorizationHeader(request);
    const client = createFunctionClient({ authHeader });
    const { data, error } = await client.auth.getUser();

    if (error) {
        throw new FunctionError(
            401,
            'user_lookup_failed',
            'Unable to resolve the authenticated backend user.',
            error.message,
        );
    }

    if (!data.user) {
        throw new FunctionError(
            401,
            'user_not_authenticated',
            'A signed-in user is required.',
        );
    }

    return {
        authHeader,
        user: data.user,
        client,
    };
}
