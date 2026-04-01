'use client';

import type { ProductRow, StockLotRow } from '@interwall/shared';

export interface ScanMatchSheetProps {
    product: ProductRow;
    lots: StockLotRow[];
    onClose: () => void;
    onCreateStockLot: () => void;
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

export function ScanMatchSheet({
    product,
    lots,
    onClose,
    onCreateStockLot,
}: ScanMatchSheetProps): JSX.Element {
    return (
        <aside
            aria-label="Scan match detail"
            className="flex w-full flex-col rounded-[2rem] border border-white/10 bg-[#102131] p-6 shadow-[var(--shadow-shell)] lg:max-w-md"
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.32em] text-[#14b8a6]">
                        Scan match
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                        {product.name}
                    </h2>
                </div>
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

            {/* Product metadata */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/60">
                {product.barcode && (
                    <span>Barcode: {product.barcode}</span>
                )}
                <span>SKU: {product.sku}</span>
                <span>Unit: {product.unit_of_measure}</span>
                {product.tracking_mode !== 'none' && (
                    <span>Tracking: {product.tracking_mode}</span>
                )}
            </div>

            {/* Lot list */}
            <div className="mt-6 space-y-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/50">
                    Stock lots ({lots.length})
                </p>
                {lots.map((lot) => (
                    <div
                        key={lot.id}
                        className="rounded-[1rem] border border-white/10 bg-white/5 p-4"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                {lot.lot_reference && (
                                    <p className="text-xs text-white/60">
                                        {lot.lot_reference}
                                    </p>
                                )}
                            </div>
                            <span className="text-lg font-semibold text-white">
                                {lot.quantity_on_hand}
                            </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                            <span>{formatDate(lot.received_at)}</span>
                            {lot.unit_cost !== null && (
                                <span>${formatCurrency(lot.unit_cost)}/unit</span>
                            )}
                            {lot.supplier_reference && (
                                <span>{lot.supplier_reference}</span>
                            )}
                        </div>
                    </div>
                ))}
                {lots.length === 0 && (
                    <p className="py-6 text-center text-sm text-white/40">
                        No stock lots for this product
                    </p>
                )}
            </div>

            {/* Create handoff */}
            <div className="mt-6">
                <button
                    type="button"
                    onClick={onCreateStockLot}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#14b8a6] bg-[#14b8a6]/15 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#14b8a6]/25"
                >
                    Create stock lot
                </button>
            </div>
        </aside>
    );
}
