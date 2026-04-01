import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

interface AppShellFrameProps {
    children: ReactNode;
    className?: string;
}

export function AppShellFrame({
    children,
    className,
}: AppShellFrameProps): JSX.Element {
    return (
        <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(15,118,110,0.18),_transparent_30%),linear-gradient(180deg,_rgba(255,255,255,0.03),_transparent)]" />
            <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
                <header className="flex items-center justify-between border-b border-white/10 pb-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-[var(--text-muted)]">
                            Interwall
                        </p>
                        <h1 className="mt-2 font-serif text-3xl text-white sm:text-4xl">
                            Tenant-safe foundation
                        </h1>
                    </div>
                    <div className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                        Phase 1 shell
                    </div>
                </header>
                <main
                    className={cn(
                        'flex flex-1 flex-col justify-center py-10',
                        className,
                    )}
                >
                    {children}
                </main>
            </div>
        </div>
    );
}
