'use client';

import type {
    WallShelfDetailState,
    WallShelfHealth,
    WallShelfLotState,
} from '@interwall/shared';

const HEALTH_BADGE_STYLES: Record<WallShelfHealth, string> = {
    healthy: 'border-[#166534]/40 bg-[#166534]/15 text-emerald-200',
    warning: 'border-[#d97706]/40 bg-[#d97706]/15 text-amber-200',
    critical: 'border-[#dc2626]/40 bg-[#dc2626]/15 text-red-200',
    empty: 'border-[#475569]/40 bg-[#475569]/15 text-slate-200',
};

export interface ShelfDetailPanelProps {
    detail: WallShelfDetailState;
    onClose: () => void;
    onCreateStockLot?: () => void;
    onAdjustLot?: () => void;
    onRelocateLot?: () => void;
}

function formatDate(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatCurrency(value: number): string {
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function LotRow({ lot }: { lot: WallShelfLotState }): JSX.Element {
    return (
        <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-white">
                        {lot.productName}
                    </p>
                    {lot.lotReference && (
                        <p className="mt-1 text-xs text-white/60">
                            {lot.lotReference}
                        </p>
                    )}
                </div>
                <span className="text-lg font-semibold text-white">
                    {lot.quantityOnHand}
                </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                <span>{formatDate(lot.receivedAt)}</span>
                {lot.unitCost !== null && (
                    <span>${formatCurrency(lot.unitCost)}/unit</span>
                )}
                {lot.supplierReference && (
                    <span>{lot.supplierReference}</span>
                )}
            </div>
        </div>
    );
}

export function ShelfDetailPanel({
    detail,
    onClose,
    onCreateStockLot,
    onAdjustLot,
    onRelocateLot,
}: ShelfDetailPanelProps): JSX.Element {
    return (
        <aside
            aria-label="Shelf detail panel"
            className="flex w-full flex-col rounded-[2rem] border border-white/10 bg-[#102131] p-6 shadow-[var(--shadow-shell)] lg:max-w-md"
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-white/60">
                        {detail.shelfDisplayCode}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                        {detail.shelfLabel}
                    </h2>
                    {detail.primaryProductName && (
                        <p className="mt-1 text-sm text-white/70">
                            {detail.primaryProductName}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={[
                            'rounded-full border px-3 py-1 text-xs uppercase tracking-[0.22em]',
                            HEALTH_BADGE_STYLES[detail.health],
                        ].join(' ')}
                    >
                        {detail.health}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors duration-150 hover:bg-white/10 hover:text-white"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        >
                            <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Summary stats */}
            <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/50">
                        On hand
                    </p>
                    <p className="mt-1 text-xl font-semibold text-white">
                        {detail.quantityOnHand}
                    </p>
                </div>
                {detail.stockValue !== null && (
                    <div className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/50">
                            Stock value
                        </p>
                        <p className="mt-1 text-xl font-semibold text-white">
                            ${formatCurrency(detail.stockValue)}
                        </p>
                    </div>
                )}
            </div>

            {/* Lot list */}
            <div className="mt-6 space-y-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/50">
                    Stock lots ({detail.lots.length})
                </p>
                {detail.lots.map((lot) => (
                    <LotRow key={lot.id} lot={lot} />
                ))}
                {detail.lots.length === 0 && (
                    <p className="py-6 text-center text-sm text-white/40">
                        No stock lots on this shelf
                    </p>
                )}
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex flex-col gap-2">
                <button
                    type="button"
                    onClick={onCreateStockLot}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#14b8a6] bg-[#14b8a6]/15 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#14b8a6]/25"
                >
                    Create stock lot
                </button>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onAdjustLot}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/80 transition-colors duration-150 hover:bg-white/10"
                    >
                        Adjust lot
                    </button>
                    <button
                        type="button"
                        onClick={onRelocateLot}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/80 transition-colors duration-150 hover:bg-white/10"
                    >
                        Relocate lot
                    </button>
                </div>
            </div>
        </aside>
    );
}
