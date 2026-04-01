import { redirect } from 'next/navigation';

import { type MembershipSummary } from '@interwall/shared';

import { selectOrganization } from '@/app/actions/select-organization';
import { MemberTable } from '@/components/tenant/member-table';
import { OrganizationSwitcher } from '@/components/tenant/organization-switcher';
import { requireUserSession } from '@/lib/server/auth';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import { createServerSupabaseClient } from '@/lib/server/supabase';
import { resolveActiveTenant } from '@/lib/server/tenant-context';

import { listMembershipsForActiveTenant } from './actions';

export default async function MembersPage(): Promise<JSX.Element> {
    const supabase = createServerSupabaseClient();
    const user = await requireUserSession({ supabase });
    const activeTenant = await resolveActiveTenant({
        user,
        listMemberships: (authenticatedUser) =>
            listMembershipsForUser(
                supabase as unknown as MembershipRepositoryClient,
                authenticatedUser,
            ),
    });

    if (activeTenant.status !== 'active') {
        redirect('/select-organization');
    }

    const memberships = await listMembershipsForActiveTenant();
    const switchableMemberships = activeTenant.memberships.filter(
        (membership: MembershipSummary) =>
            membership.tenantId !== activeTenant.tenantId,
    );

    async function submitSelection(formData: FormData) {
        'use server';

        await selectOrganization({ error: null }, formData);
    }

    return (
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16">
            <header className="rounded-[2rem] border border-white/10 bg-[var(--surface-panel)] p-8 shadow-[var(--shadow-shell)]">
                <p className="text-sm uppercase tracking-[0.32em] text-[var(--accent-amber)]">
                    Tenant membership admin
                </p>
                <h1 className="mt-4 font-serif text-4xl text-white sm:text-5xl">
                    {activeTenant.membership.tenantName}
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--text-secondary)]">
                    Membership changes stay scoped to the active organization
                    and reuse the guarded tenant-selection path for context
                    switching.
                </p>
            </header>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1.8fr),minmax(18rem,1fr)]">
                <MemberTable memberships={memberships} />
                <OrganizationSwitcher
                    memberships={switchableMemberships}
                    submitSelection={submitSelection}
                />
            </div>
        </section>
    );
}
