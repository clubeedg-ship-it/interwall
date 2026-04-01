import type { AppRole, TenantMembershipRow } from '@interwall/shared';

import {
    createMembershipForExistingUser,
    removeMembership,
    updateMembershipRole,
} from '@/app/(app)/settings/members/actions';

const ROLE_OPTIONS: AppRole[] = ['owner', 'admin', 'member'];

export function MemberTable(input: {
    memberships: TenantMembershipRow[];
}): JSX.Element {
    async function submitCreateMembership(formData: FormData) {
        'use server';

        await createMembershipForExistingUser(formData);
    }

    async function submitUpdateMembershipRole(formData: FormData) {
        'use server';

        await updateMembershipRole(formData);
    }

    async function submitRemoveMembership(formData: FormData) {
        'use server';

        await removeMembership(formData);
    }

    return (
        <div className="rounded-[2rem] border border-white/10 bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-shell)]">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-white">
                        Organization members
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                        Update roles, remove memberships, or add an existing
                        user to the active organization.
                    </p>
                </div>

                <form
                    action={submitCreateMembership}
                    className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:min-w-[24rem] sm:grid-cols-[1fr,auto,auto]"
                    data-testid="create-membership-form"
                >
                    <div className="space-y-2 sm:col-span-3">
                        <label
                            className="text-sm font-medium text-white"
                            htmlFor="new-membership-user-id"
                        >
                            Existing user id
                        </label>
                        <input
                            id="new-membership-user-id"
                            name="userId"
                            type="text"
                            required
                            className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none transition focus:border-[var(--accent-teal)]"
                            placeholder="user-123"
                        />
                    </div>
                    <label className="space-y-2 text-sm font-medium text-white">
                        <span>Role</span>
                        <select
                            name="role"
                            defaultValue="member"
                            className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none transition focus:border-[var(--accent-teal)]"
                        >
                            {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>
                                    {role}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="sm:col-span-2 sm:flex sm:items-end sm:justify-end">
                        <button
                            type="submit"
                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent-amber)] px-5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                        >
                            Add member
                        </button>
                    </div>
                </form>
            </div>

            <div className="mt-6 space-y-4">
                {input.memberships.map((membership) => (
                    <article
                        key={membership.id}
                        className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-5 lg:grid-cols-[minmax(0,1fr),auto,auto]"
                    >
                        <div>
                            <label
                                className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]"
                                htmlFor={`member-${membership.id}`}
                            >
                                User id
                            </label>
                            <input
                                id={`member-${membership.id}`}
                                readOnly
                                value={membership.user_id}
                                className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white"
                            />
                        </div>

                        <form
                            action={submitUpdateMembershipRole}
                            className="flex flex-col gap-3 lg:min-w-[14rem]"
                            data-testid="update-membership-role-form"
                        >
                            <input
                                type="hidden"
                                name="membershipId"
                                value={membership.id}
                            />
                            <label className="space-y-2 text-sm font-medium text-white">
                                <span>Role</span>
                                <select
                                    name="role"
                                    defaultValue={membership.role}
                                    className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none transition focus:border-[var(--accent-teal)]"
                                >
                                    {ROLE_OPTIONS.map((role) => (
                                        <option key={role} value={role}>
                                            {role}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="submit"
                                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent-teal)] px-5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                            >
                                Save role
                            </button>
                        </form>

                        <form
                            action={submitRemoveMembership}
                            className="flex flex-col justify-end"
                            data-testid="remove-membership-form"
                        >
                            <input
                                type="hidden"
                                name="membershipId"
                                value={membership.id}
                            />
                            <button
                                type="submit"
                                className="inline-flex min-h-11 items-center justify-center rounded-full border border-red-400/40 px-5 text-sm font-semibold text-red-100 transition hover:bg-red-500/10"
                            >
                                Remove
                            </button>
                        </form>
                    </article>
                ))}
            </div>
        </div>
    );
}
