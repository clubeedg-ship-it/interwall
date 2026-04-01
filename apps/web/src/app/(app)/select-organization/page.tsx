import { requireUserSession } from '@/lib/server/auth';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import { createServerSupabaseClient } from '@/lib/server/supabase';

import { selectOrganization } from '@/app/actions/select-organization';

export default async function SelectOrganizationPage(): Promise<JSX.Element> {
    const supabase = createServerSupabaseClient();
    const user = await requireUserSession({ supabase });
    const memberships = (await listMembershipsForUser(
        supabase as unknown as MembershipRepositoryClient,
        user,
    )).filter((membership) => membership.isActive);

    async function submitSelection(formData: FormData) {
        'use server';

        await selectOrganization({ error: null }, formData);
    }

    return (
        <section className="mx-auto flex min-h-[70vh] w-full max-w-5xl items-center px-6 py-16">
            <div className="w-full rounded-[2rem] border border-white/10 bg-[var(--surface-panel)] p-8 shadow-[var(--shadow-shell)]">
                <p className="text-sm uppercase tracking-[0.32em] text-[var(--accent-amber)]">
                    Select organization
                </p>
                <h1 className="mt-4 font-serif text-4xl text-white sm:text-5xl">
                    Choose the organization you want to work in.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)]">
                    Each authenticated session must enter the app through an
                    explicit tenant selection. This keeps the Phase 1 shell
                    tenant-safe before warehouse workflows unlock.
                </p>

                <div className="mt-10 grid gap-4">
                    {memberships.length ? (
                        memberships.map((membership) => (
                            <form
                                key={membership.tenantId}
                                action={submitSelection}
                                className="flex flex-col gap-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-5 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <input
                                    type="hidden"
                                    name="tenantId"
                                    value={membership.tenantId}
                                />
                                <div>
                                    <h2 className="text-xl font-semibold text-white">
                                        {membership.tenantName}
                                    </h2>
                                    <p className="mt-1 text-sm uppercase tracking-[0.2em] text-[var(--accent-teal)]">
                                        {membership.role}
                                    </p>
                                </div>
                                <button
                                    type="submit"
                                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent-teal)] px-5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                                >
                                    Continue to workspace
                                </button>
                            </form>
                        ))
                    ) : (
                        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm text-[var(--text-secondary)]">
                            No active organization memberships are available for
                            this account yet.
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
