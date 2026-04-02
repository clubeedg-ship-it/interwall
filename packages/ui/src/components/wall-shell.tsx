import type { ReactNode } from 'react';

interface WallShellProps {
    children: ReactNode;
    tenantName: string;
    activeItem?: 'wall' | 'orders' | 'scan' | 'catalog' | 'insights' | 'settings';
}

interface WallNavItem {
    id: 'wall' | 'orders' | 'scan' | 'catalog' | 'insights' | 'settings';
    label: string;
    href: string;
    icon: JSX.Element;
}

const NAV_ITEMS: WallNavItem[] = [
    {
        id: 'wall',
        label: 'Wall',
        href: '/workspace',
        icon: (
            <svg
                aria-hidden="true"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
            >
                <path d="M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z" />
            </svg>
        ),
    },
    {
        id: 'orders',
        label: 'Orders',
        href: '/orders',
        icon: (
            <svg
                aria-hidden="true"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
            >
                <path d="M7 5h10M7 9h10M7 13h6M6 4h12a2 2 0 0 1 2 2v12l-3-2-3 2-3-2-3 2-3-2V6a2 2 0 0 1 2-2Z" />
            </svg>
        ),
    },
    {
        id: 'scan',
        label: 'Scan',
        href: '/workspace#scan',
        icon: (
            <svg
                aria-hidden="true"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
            >
                <path d="M5 7V5h4M15 5h4v2M19 17v2h-4M9 19H5v-2M8 12h8" />
            </svg>
        ),
    },
    {
        id: 'catalog',
        label: 'Catalog',
        href: '/workspace#catalog',
        icon: (
            <svg
                aria-hidden="true"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
            >
                <path d="M6 5h12v14H6zM9 9h6M9 13h6" />
            </svg>
        ),
    },
    {
        id: 'insights',
        label: 'Insights',
        href: '/workspace#insights',
        icon: (
            <svg
                aria-hidden="true"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
            >
                <path d="M5 17l4-4 3 3 7-7M5 19h14" />
            </svg>
        ),
    },
    {
        id: 'settings',
        label: 'Settings',
        href: '/workspace#settings',
        icon: (
            <svg
                aria-hidden="true"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
            >
                <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" />
                <path d="M19 12l2-1-2-3-2 .5-.8-1.4.8-2.1-3-1-1 1.7h-1.6L10 4l-3 1 .8 2.1L7 8.5 5 8 3 11l2 1v1l-2 1 2 3 2-.5.8 1.4-.8 2.1 3 1 1.4-1.7H13.8l1.2 1.7 3-1-.8-2.1.8-1.4 2 .5 2-3-2-1z" />
            </svg>
        ),
    },
];

function navItemClasses(isActive: boolean): string {
    if (isActive) {
        return 'border-[#14b8a6] bg-[#14b8a6] text-[#09111f] shadow-[0_0_0_1px_rgba(20,184,166,0.25),0_16px_32px_rgba(20,184,166,0.25)]';
    }

    return 'border-white/10 bg-white/5 text-white/80';
}

export function WallShell({
    children,
    tenantName,
    activeItem = 'wall',
}: WallShellProps): JSX.Element {
    const activeNavItem =
        NAV_ITEMS.find((item) => item.id === activeItem) ??
        ({
            id: 'wall',
            label: 'Wall',
            href: '/workspace',
            icon: <></>,
        } satisfies WallNavItem);

    return (
        <div className="min-h-screen bg-[#09111f] text-white">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.16),_transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(16,33,49,0.9),_transparent_45%)]" />
            <div className="mx-auto flex min-h-screen w-full max-w-[96rem] gap-6 px-4 pb-28 pt-6 md:px-6 md:pb-8 lg:px-8">
                <nav
                    aria-label="Workspace sections"
                    className="sticky top-6 hidden h-[calc(100vh-3rem)] w-24 flex-col items-center justify-between rounded-[2rem] border border-white/10 bg-[#102131]/90 px-3 py-5 shadow-[0_28px_80px_rgba(8,15,31,0.48)] backdrop-blur md:flex"
                >
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#14b8a6]/60 bg-[#14b8a6]/10 text-xs font-semibold uppercase tracking-[0.24em] text-[#99f6e4]">
                            IW
                        </div>
                        {NAV_ITEMS.map((item) => {
                            const isActive = item.id === activeItem;

                            return (
                                <a
                                    key={item.id}
                                    aria-current={isActive ? 'page' : undefined}
                                    aria-label={item.label}
                                    className={[
                                        'flex h-14 w-14 items-center justify-center rounded-full border transition-colors',
                                        navItemClasses(isActive),
                                    ].join(' ')}
                                    href={item.href}
                                    title={item.label}
                                >
                                    {item.icon}
                                    <span className="sr-only">{item.label}</span>
                                </a>
                            );
                        })}
                    </div>
                    <p className="text-center text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">
                        {tenantName}
                    </p>
                </nav>
                <div className="flex flex-1 flex-col gap-6">
                    <header className="rounded-[2rem] border border-white/10 bg-[#102131]/85 px-6 py-5 shadow-[0_28px_80px_rgba(8,15,31,0.42)] backdrop-blur">
                        <p className="text-xs uppercase tracking-[0.32em] text-[#14b8a6]">
                            Workspace
                        </p>
                        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <h1 className="font-serif text-3xl text-white lg:text-4xl">
                                    {tenantName}
                                </h1>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                                    Wall-first inventory control for scanning, stock movement,
                                    and shelf visibility.
                                </p>
                            </div>
                            <div className="inline-flex min-h-11 items-center rounded-full border border-[#14b8a6]/40 bg-[#14b8a6]/10 px-4 text-sm font-medium text-[#99f6e4]">
                                {activeNavItem.label} active
                            </div>
                        </div>
                    </header>
                    <main>{children}</main>
                </div>
            </div>
            <nav
                aria-label="Workspace sections"
                className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#102131]/95 px-4 py-3 backdrop-blur md:hidden"
            >
                <div className="mx-auto grid max-w-3xl grid-cols-6 gap-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = item.id === activeItem;

                        return (
                            <a
                                key={item.id}
                                aria-current={isActive ? 'page' : undefined}
                                className={[
                                    'flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] font-medium uppercase tracking-[0.16em]',
                                    navItemClasses(isActive),
                                ].join(' ')}
                                href={item.href}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </a>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
