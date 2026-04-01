import { redirect } from 'next/navigation';

import { requireUserSession } from '@/lib/server/auth';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import { createServerSupabaseClient } from '@/lib/server/supabase';
import { resolveActiveTenant } from '@/lib/server/tenant-context';

export default async function WorkspacePage(): Promise<JSX.Element> {
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

    return (
        <section className="mx-auto flex min-h-[70vh] w-full max-w-5xl items-center px-6 py-16">
            <div className="w-full rounded-[2rem] border border-white/10 bg-[var(--surface-panel)] p-8 shadow-[var(--shadow-shell)]">
                <p className="text-sm uppercase tracking-[0.32em] text-[var(--accent-amber)]">
                    Workspace
                </p>
                <h1 className="mt-4 font-serif text-4xl text-white sm:text-5xl">
                    {activeTenant.membership.tenantName}
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)]">
                    You are signed in as {user.email ?? 'an authenticated user'}.
                    The Phase 1 workspace stays intentionally narrow until
                    tenant-safe inventory surfaces are ready.
                </p>
                <dl className="mt-8 grid gap-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-6 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
                    <div>
                        <dt className="uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            Organization
                        </dt>
                        <dd className="mt-2 text-lg font-semibold text-white">
                            {activeTenant.membership.tenantName}
                        </dd>
                    </div>
                    <div>
                        <dt className="uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            Active role
                        </dt>
                        <dd className="mt-2 text-lg font-semibold uppercase text-[var(--accent-teal)]">
                            {activeTenant.membership.role}
                        </dd>
                    </div>
                </dl>
            </div>
        </section>
    );
}
