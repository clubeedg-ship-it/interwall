import type {
    ActiveTenantSummary,
    AppRole,
    MembershipSummary,
} from '@interwall/shared';

const upcomingRoles: AppRole[] = ['owner', 'admin', 'member'];

const sampleMembership: MembershipSummary = {
    tenantId: 'phase-1-foundation',
    tenantSlug: 'north-ridge-assembly',
    tenantName: 'North Ridge Assembly',
    role: 'owner',
    isActive: true,
};

const sampleTenant: ActiveTenantSummary = {
    tenantId: sampleMembership.tenantId,
    tenantSlug: sampleMembership.tenantSlug,
    tenantName: sampleMembership.tenantName,
    membership: sampleMembership,
};

export default function HomePage(): JSX.Element {
    return (
        <section className="foundation-grid">
            <div className="rounded-[2rem] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-8 shadow-[var(--shadow-shell)] backdrop-blur">
                <p className="text-sm uppercase tracking-[0.35em] text-[var(--accent-amber)]">
                    Phase 1 entry surface
                </p>
                <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-tight text-white sm:text-5xl">
                    Sign-in and organization handoff land here before inventory
                    workflows open up.
                </h2>
                <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                    The shell is intentionally narrow: authenticate, confirm the
                    active organization, and then hand off to the tenant-safe
                    application surface. Warehouse, order, and automation screens
                    stay out of scope until the membership path is wired.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                    <div className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-accent)] px-4 py-2 text-sm text-white">
                        Upcoming: sign-in
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text-secondary)]">
                        Upcoming: organization selection
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <article className="rounded-[1.75rem] border border-white/10 bg-[var(--surface-panel-strong)] p-6 shadow-[var(--shadow-shell)]">
                    <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-muted)]">
                        Membership contract preview
                    </p>
                    <dl className="mt-5 space-y-4 text-sm text-[var(--text-secondary)]">
                        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                            <dt>Active tenant</dt>
                            <dd className="font-medium text-white">
                                {sampleTenant.tenantName}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                            <dt>Slug</dt>
                            <dd>{sampleTenant.tenantSlug}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <dt>Current role</dt>
                            <dd className="uppercase tracking-[0.18em] text-[var(--accent-teal)]">
                                {sampleTenant.membership.role}
                            </dd>
                        </div>
                    </dl>
                </article>

                <article className="rounded-[1.75rem] border border-white/10 bg-black/20 p-6">
                    <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-muted)]">
                        Planned access roles
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        {upcomingRoles.map((role) => (
                            <span
                                key={role}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm uppercase tracking-[0.2em] text-[var(--text-secondary)]"
                            >
                                {role}
                            </span>
                        ))}
                    </div>
                </article>
            </div>
        </section>
    );
}
