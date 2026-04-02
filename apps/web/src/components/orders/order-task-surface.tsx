'use client';

import { useEffect, useState } from 'react';

import type {
    OrderDetailLineItem,
    OrderDetailViewModel,
    ShipmentFifoPreview,
} from '@interwall/shared';

import { FifoBreakdownPanel } from './fifo-breakdown-panel';

type ReceiveSubmission = {
    purchaseOrderId: string;
    purchaseOrderLineId: string;
    quantityReceived: number;
    shelfId: string;
    receivedAt: string;
    lotReference: string | null;
    supplierReference: string | null;
    note: string | null;
};

type ShipSubmission = {
    salesOrderId: string;
    salesOrderLineId: string;
    quantityShipped: number;
    note: string | null;
};

export interface OrderTaskSurfaceProps {
    mode: 'receive' | 'ship';
    order: OrderDetailViewModel;
    open: boolean;
    onClose: () => void;
    onLoadShipmentPreview: (input: {
        salesOrderId: string;
        salesOrderLineId: string;
        quantityShipped: number;
    }) => Promise<ShipmentFifoPreview>;
    onReceive: (input: ReceiveSubmission) => Promise<void>;
    onShip: (input: ShipSubmission) => Promise<void>;
}

function toDateTimeLocalValue(value: string): string {
    return value.slice(0, 16);
}

function actionableLine(lines: OrderDetailLineItem[]): OrderDetailLineItem | null {
    return lines.find((line) => line.outstandingQuantity > 0) ?? lines[0] ?? null;
}

export function OrderTaskSurface({
    mode,
    order,
    open,
    onClose,
    onLoadShipmentPreview,
    onReceive,
    onShip,
}: OrderTaskSurfaceProps): JSX.Element | null {
    const line = actionableLine(order.lines);
    const [quantityValue, setQuantityValue] = useState('');
    const [shelfId, setShelfId] = useState('');
    const [receivedAt, setReceivedAt] = useState(toDateTimeLocalValue(new Date().toISOString()));
    const [lotReference, setLotReference] = useState('');
    const [supplierReference, setSupplierReference] = useState('');
    const [note, setNote] = useState('');
    const [preview, setPreview] = useState<ShipmentFifoPreview | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        setQuantityValue('');
        setShelfId('');
        setReceivedAt(toDateTimeLocalValue(new Date().toISOString()));
        setLotReference('');
        setSupplierReference('');
        setNote('');
        setPreview(null);
        setLoadingPreview(false);
    }, [line, open, mode]);

    if (!open || !line) {
        return null;
    }

    const quantity = Number(quantityValue || 0);
    const quantityInvalid =
        Number.isNaN(quantity) || quantity <= 0 || quantity > line.outstandingQuantity;
    const receiveDisabled =
        quantityInvalid || shelfId.trim().length === 0 || receivedAt.trim().length === 0;
    const shipDisabled = quantityInvalid || !preview || preview.remainingDemand > 0;
    const validationMessage = quantityInvalid
        ? `Enter a quantity between 1 and ${line.outstandingQuantity}.`
        : null;

    const handleReviewShipment = async () => {
        if (quantityInvalid) {
            return;
        }

        setLoadingPreview(true);

        try {
            const nextPreview = await onLoadShipmentPreview({
                salesOrderId: order.id,
                salesOrderLineId: line.id,
                quantityShipped: quantity,
            });

            setPreview(nextPreview);
        } finally {
            setLoadingPreview(false);
        }
    };

    return (
        <div className="fixed inset-0 z-40 bg-[#09111f]/70 backdrop-blur-sm">
            <div className="flex h-full w-full justify-end">
                <aside className="h-full w-full overflow-y-auto border-l border-white/10 bg-[#102131] p-6 shadow-[0_28px_80px_rgba(8,15,31,0.5)] md:max-w-xl">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#14b8a6]">
                                {mode === 'receive' ? 'Receiving task' : 'Shipping task'}
                            </p>
                            <h2 className="mt-2 text-[28px] font-semibold leading-none text-white">
                                {line.productName}
                            </h2>
                            <p className="mt-3 text-sm text-slate-300">
                                {line.outstandingQuantity} units remaining
                            </p>
                            <p className="mt-1 text-sm text-slate-300">{order.warehouseName}</p>
                        </div>
                        <button
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white"
                            onClick={onClose}
                            type="button"
                        >
                            Close
                        </button>
                    </div>

                    <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                            SKU
                        </p>
                        <p className="mt-1 text-base text-slate-100">{line.sku}</p>
                        <p className="mt-4 text-xs uppercase tracking-[0.14em] text-slate-400">
                            Review summary
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                            Enter an explicit quantity before committing this stock movement.
                        </p>
                    </div>

                    <div className="mt-6 space-y-4">
                        <label className="space-y-2 text-sm font-semibold text-slate-100">
                            <span>
                                {mode === 'receive' ? 'Quantity to receive' : 'Quantity to ship'}
                            </span>
                            <input
                                className="min-h-14 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                onChange={(event) => setQuantityValue(event.target.value)}
                                value={quantityValue}
                            />
                        </label>

                        {mode === 'receive' ? (
                            <>
                                <label className="space-y-2 text-sm font-semibold text-slate-100">
                                    <span>Destination shelf</span>
                                    <input
                                        className="min-h-14 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                        onChange={(event) => setShelfId(event.target.value)}
                                        value={shelfId}
                                    />
                                </label>
                                <label className="space-y-2 text-sm font-semibold text-slate-100">
                                    <span>Received at</span>
                                    <input
                                        className="min-h-14 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                        onChange={(event) => setReceivedAt(event.target.value)}
                                        type="datetime-local"
                                        value={receivedAt}
                                    />
                                </label>
                                <label className="space-y-2 text-sm font-semibold text-slate-100">
                                    <span>Lot reference</span>
                                    <input
                                        className="min-h-14 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                        onChange={(event) => setLotReference(event.target.value)}
                                        value={lotReference}
                                    />
                                </label>
                                <label className="space-y-2 text-sm font-semibold text-slate-100">
                                    <span>Supplier reference</span>
                                    <input
                                        className="min-h-14 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                        onChange={(event) => setSupplierReference(event.target.value)}
                                        value={supplierReference}
                                    />
                                </label>
                            </>
                        ) : null}

                        <label className="space-y-2 text-sm font-semibold text-slate-100">
                            <span>Notes</span>
                            <textarea
                                className="min-h-24 w-full rounded-[1.5rem] border border-white/10 bg-[#09111f] px-4 py-3 text-base text-white"
                                onChange={(event) => setNote(event.target.value)}
                                value={note}
                            />
                        </label>
                    </div>

                    {validationMessage ? (
                        <p className="mt-4 text-sm font-medium text-[#fca5a5]">
                            {validationMessage}
                        </p>
                    ) : null}

                    {mode === 'ship' ? (
                        <div className="mt-6 space-y-4">
                            <button
                                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white"
                                disabled={quantityInvalid || loadingPreview}
                                onClick={() => {
                                    void handleReviewShipment();
                                }}
                                type="button"
                            >
                                {loadingPreview ? 'Reviewing shipment...' : 'Review shipment'}
                            </button>
                            {preview ? <FifoBreakdownPanel preview={preview} /> : null}
                            {preview?.shortfallMessage ? (
                                <p className="rounded-[1.25rem] border border-[#dc2626]/40 bg-[#dc2626]/10 px-4 py-3 text-sm font-semibold text-[#fecaca]">
                                    {preview.shortfallMessage}
                                </p>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap gap-4">
                        {mode === 'receive' ? (
                            <button
                                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#14b8a6] px-5 text-sm font-semibold text-[#09111f] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={receiveDisabled}
                                onClick={() => {
                                    void onReceive({
                                        purchaseOrderId: order.id,
                                        purchaseOrderLineId: line.id,
                                        quantityReceived: quantity,
                                        shelfId,
                                        receivedAt: new Date(receivedAt).toISOString(),
                                        lotReference: lotReference || null,
                                        supplierReference: supplierReference || null,
                                        note: note || null,
                                    });
                                }}
                                type="button"
                            >
                                Receive stock
                            </button>
                        ) : (
                            <button
                                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#14b8a6] px-5 text-sm font-semibold text-[#09111f] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={shipDisabled}
                                onClick={() => {
                                    void onShip({
                                        salesOrderId: order.id,
                                        salesOrderLineId: line.id,
                                        quantityShipped: quantity,
                                        note,
                                    });
                                }}
                                type="button"
                            >
                                Ship items
                            </button>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
