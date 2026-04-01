import type { WallScannerState } from '@interwall/shared';

export interface ScannerCommandSurfaceProps {
    scanner: WallScannerState;
}

function renderStatusLabel(status: WallScannerState['status']): string {
    if (status === 'matched') {
        return 'Match ready';
    }

    if (status === 'create') {
        return 'Create stock';
    }

    return 'Scanner ready';
}

export function ScannerCommandSurface({
    scanner,
}: ScannerCommandSurfaceProps): JSX.Element {
    return (
        <aside
            aria-label="Scanner command surface"
            className="flex w-full flex-col rounded-[2rem] border border-white/10 bg-[#102131] p-6 shadow-[var(--shadow-shell)] lg:max-w-sm"
        >
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.32em] text-[#14b8a6]">
                        Scanner
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-white">
                        {scanner.activeModeLabel}
                    </h2>
                </div>
                <span className="rounded-full border border-[#14b8a6]/50 bg-[#14b8a6]/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[#9ff3e9]">
                    {renderStatusLabel(scanner.status)}
                </span>
            </div>
            <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    Captured barcode
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[0.08em] text-white">
                    {scanner.query || 'Ready for next scan'}
                </p>
            </div>
            <div className="mt-6 space-y-3">
                {scanner.matches.map((match) => (
                    <article
                        key={match.id}
                        className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4"
                    >
                        <p className="text-xs uppercase tracking-[0.22em] text-[#14b8a6]">
                            {match.type}
                        </p>
                        <h3 className="mt-2 text-base font-semibold text-white">
                            {match.title}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {match.subtitle ?? match.barcode}
                        </p>
                    </article>
                ))}
            </div>
        </aside>
    );
}
