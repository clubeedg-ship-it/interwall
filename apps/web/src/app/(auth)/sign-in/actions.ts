'use server';

import { redirect } from 'next/navigation';

import { createServerSupabaseClient } from '@/lib/server/supabase';

export interface SignInFormState {
    error: string | null;
}

export async function signInWithPassword(
    _previousState: SignInFormState,
    formData: FormData,
): Promise<SignInFormState> {
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
        return {
            error: 'Email and password are required.',
        };
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return {
            error: error.message,
        };
    }

    redirect('/workspace');
}
