import type { MembershipSummary } from '@interwall/shared';

export function OrganizationSwitcher(input: {
    memberships: MembershipSummary[];
    submitSelection: (formData: FormData) => Promise<void>;
}): JSX.Element {
    if (input.memberships.length === 0) {
        return <></>;
    }

    return (
        <aside className="rounded-[2rem] border border-white/10 bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-shell)]">
            <h2 className="text-2xl font-semibold text-white">
                Switch organization
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                Changing organizations uses the same guarded selection flow as
                the initial tenant handoff.
            </p>

            <div className="mt-6 space-y-3">
                {input.memberships.map((membership) => (
                    <form
                        key={membership.tenantId}
                        action={input.submitSelection}
                        className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <input
                            type="hidden"
                            name="tenantId"
                            value={membership.tenantId}
                        />
                        <div>
                            <p className="text-base font-semibold text-white">
                                {membership.tenantName}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--accent-teal)]">
                                {membership.role}
                            </p>
                        </div>
                        <button
                            type="submit"
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-5 text-sm font-semibold text-white transition hover:border-[var(--accent-teal)] hover:text-[var(--accent-teal)]"
                        >
                            {`Switch to ${membership.tenantName}`}
                        </button>
                    </form>
                ))}
            </div>
        </aside>
    );
}
