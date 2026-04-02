import type { ShipmentFifoPreview } from '@interwall/shared';

function formatMoney(value: number | null): string {
    if (value === null) {
        return 'Pending';
    }

    return `$${value.toFixed(2)}`;
}

export interface FifoBreakdownPanelProps {
    preview: ShipmentFifoPreview;
}

export function FifoBreakdownPanel({
    preview,
}: FifoBreakdownPanelProps): JSX.Element {
    return (
        <section className="rounded-[1.5rem] border border-white/10 bg-[#09111f]/80 p-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#14b8a6]">
                        FIFO preview
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                        {preview.productName}
                    </h3>
                </div>
                <p className="text-sm text-slate-300">
                    Requested {preview.requestedQuantity}
                </p>
            </div>
            <div className="mt-4 space-y-3">
                {preview.lots.map((lot) => (
                    <div
                        key={lot.stockLotId}
                        className="grid gap-3 rounded-[1.25rem] border border-white/10 bg-[#102131] p-3 md:grid-cols-4"
                    >
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Lot
                            </p>
                            <p className="mt-1 text-sm font-semibold text-white">
                                {lot.lotReference ?? 'Unassigned'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Received
                            </p>
                            <p className="mt-1 text-sm text-slate-100">{lot.receivedAt}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Quantity consumed
                            </p>
                            <p className="mt-1 text-sm text-slate-100">{lot.quantityConsumed}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Unit cost
                            </p>
                            <p className="mt-1 text-sm text-slate-100">
                                {formatMoney(lot.unitCost)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-sm font-semibold text-white">Total cost basis</span>
                <span className="text-base font-semibold text-[#99f6e4]">
                    {formatMoney(preview.totalCost)}
                </span>
            </div>
        </section>
    );
}
