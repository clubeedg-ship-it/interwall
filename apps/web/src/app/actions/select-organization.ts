'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireUserSession } from '@/lib/server/auth';
import {
    getMembershipByTenant,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import { createServerSupabaseClient } from '@/lib/server/supabase';
import { ACTIVE_TENANT_COOKIE_NAME } from '@/lib/server/tenant-context';

export interface SelectOrganizationState {
    error: string | null;
}

export async function selectOrganization(
    _previousState: SelectOrganizationState,
    formData: FormData,
): Promise<SelectOrganizationState> {
    const tenantId = String(formData.get('tenantId') ?? '').trim();

    if (!tenantId) {
        return {
            error: 'Select a valid organization to continue.',
        };
    }

    const supabase = createServerSupabaseClient();
    const user = await requireUserSession({ supabase });
    const membership = await getMembershipByTenant(
        supabase as unknown as MembershipRepositoryClient,
        {
            user,
            tenantId,
        },
    );

    if (!membership?.isActive) {
        return {
            error: 'Select a valid organization to continue.',
        };
    }

    cookies().set({
        name: ACTIVE_TENANT_COOKIE_NAME,
        value: membership.tenantId,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
    });

    redirect('/workspace');
}
