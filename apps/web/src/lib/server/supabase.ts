import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type CookieStoreLike = {
    get(name: string): { value: string } | undefined;
    set?(input: { name: string; value: string } & CookieOptions): void;
};

export type ServerSupabaseClient = SupabaseClient;

export function getSupabaseEnv() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
        throw new Error(
            'NEXT_PUBLIC_SUPABASE_URL is required for authenticated Supabase requests.',
        );
    }

    if (!anonKey) {
        throw new Error(
            'NEXT_PUBLIC_SUPABASE_ANON_KEY is required for authenticated Supabase requests.',
        );
    }

    return {
        url,
        anonKey,
        serviceRoleKey: serviceRoleKey ?? null,
    };
}

export function createServerSupabaseClient(
    cookieStore: CookieStoreLike = cookies(),
): ServerSupabaseClient {
    const { url, anonKey } = getSupabaseEnv();

    return createServerClient(url, anonKey, {
        cookies: {
            get(name) {
                return cookieStore.get(name)?.value;
            },
            set(name, value, options) {
                cookieStore.set?.({ name, value, ...options });
            },
            remove(name, options) {
                cookieStore.set?.({
                    name,
                    value: '',
                    ...options,
                    maxAge: 0,
                });
            },
        },
    });
}
