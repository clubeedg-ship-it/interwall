import type {
    OrderDetailLineItem,
    OrderType,
    PurchaseOrderStatus,
    PurchaseOrderLineInput,
    SalesOrderStatus,
    SalesOrderLineInput,
} from '@interwall/shared';

type DraftLineValue = {
    id: string;
    productId: string;
    quantityOrdered: string;
    quantityReceived: number;
    quantityShipped: number;
    unitValue: string;
    note: string;
};

export interface OrderLineEditorProps {
    orderType: OrderType;
    status: PurchaseOrderStatus | SalesOrderStatus;
    lines: DraftLineValue[];
    onAddLine: () => void;
    onRemoveLine: (lineId: string) => void;
    onChangeLine: (lineId: string, patch: Partial<DraftLineValue>) => void;
}

let draftLineCounter = 0;

function isEditable(status: OrderLineEditorProps['status']): boolean {
    return status === 'draft';
}

function fulfilledQuantity(line: DraftLineValue): number {
    return line.quantityReceived > 0 ? line.quantityReceived : line.quantityShipped;
}

export function toDraftLineValue(line: OrderDetailLineItem): DraftLineValue {
    return {
        id: line.id,
        productId: line.productId,
        quantityOrdered: String(line.quantityOrdered),
        quantityReceived: line.quantityReceived,
        quantityShipped: line.quantityShipped,
        unitValue: String(
            line.unitCost ?? line.unitPrice ?? '',
        ),
        note: line.note ?? '',
    };
}

export function toPurchaseOrderLines(lines: DraftLineValue[]): PurchaseOrderLineInput[] {
    return lines.map((line) => ({
        product_id: line.productId,
        quantity_ordered: Number(line.quantityOrdered || 0),
        unit_cost: line.unitValue ? Number(line.unitValue) : null,
        note: line.note || null,
    }));
}

export function toSalesOrderLines(lines: DraftLineValue[]): SalesOrderLineInput[] {
    return lines.map((line) => ({
        product_id: line.productId,
        quantity_ordered: Number(line.quantityOrdered || 0),
        unit_price: line.unitValue ? Number(line.unitValue) : null,
        note: line.note || null,
    }));
}

export function createDraftLine(): DraftLineValue {
    draftLineCounter += 1;

    return {
        id: `draft-line-${draftLineCounter}`,
        productId: '',
        quantityOrdered: '',
        quantityReceived: 0,
        quantityShipped: 0,
        unitValue: '',
        note: '',
    };
}

export function OrderLineEditor({
    orderType,
    status,
    lines,
    onAddLine,
    onRemoveLine,
    onChangeLine,
}: OrderLineEditorProps): JSX.Element {
    const editable = isEditable(status);

    return (
        <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-white">Line items</h2>
                {editable ? (
                    <button
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#14b8a6]/40 bg-[#14b8a6]/10 px-4 text-sm font-semibold text-[#99f6e4]"
                        onClick={onAddLine}
                        type="button"
                    >
                        Add line item
                    </button>
                ) : null}
            </div>
            <div className="mt-4 space-y-4">
                {lines.length === 0 ? (
                    <p className="text-sm leading-6 text-slate-300">
                        No line items yet.
                    </p>
                ) : (
                    lines.map((line, index) => {
                        const canRemove =
                            editable &&
                            line.quantityReceived === 0 &&
                            line.quantityShipped === 0;

                        return (
                            <div
                                key={line.id}
                                className="rounded-[1.25rem] border border-white/10 bg-[#09111f] p-4"
                            >
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="space-y-2 text-sm font-semibold text-slate-100">
                                        <span>{`Product ID ${index + 1}`}</span>
                                        <input
                                            className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#102131] px-4 text-base text-white"
                                            disabled={!editable}
                                            onChange={(event) =>
                                                onChangeLine(line.id, {
                                                    productId: event.target.value,
                                                })
                                            }
                                            value={line.productId}
                                        />
                                    </label>
                                    <label className="space-y-2 text-sm font-semibold text-slate-100">
                                        <span>Ordered quantity</span>
                                        <input
                                            className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#102131] px-4 text-base text-white"
                                            disabled={!editable}
                                            onChange={(event) =>
                                                onChangeLine(line.id, {
                                                    quantityOrdered: event.target.value,
                                                })
                                            }
                                            value={line.quantityOrdered}
                                        />
                                    </label>
                                    <label className="space-y-2 text-sm font-semibold text-slate-100">
                                        <span>
                                            {orderType === 'purchase'
                                                ? 'Unit cost'
                                                : 'Unit price'}
                                        </span>
                                        <input
                                            className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#102131] px-4 text-base text-white"
                                            disabled={!editable}
                                            onChange={(event) =>
                                                onChangeLine(line.id, {
                                                    unitValue: event.target.value,
                                                })
                                            }
                                            value={line.unitValue}
                                        />
                                    </label>
                                    <label className="space-y-2 text-sm font-semibold text-slate-100">
                                        <span>Line note</span>
                                        <input
                                            className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#102131] px-4 text-base text-white"
                                            disabled={!editable}
                                            onChange={(event) =>
                                                onChangeLine(line.id, {
                                                    note: event.target.value,
                                                })
                                            }
                                            value={line.note}
                                        />
                                    </label>
                                </div>
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                                    <div className="text-sm text-slate-300">
                                        <span className="font-semibold text-slate-100">
                                            Fulfilled quantity
                                        </span>{' '}
                                        {fulfilledQuantity(line)}
                                    </div>
                                    {canRemove ? (
                                        <button
                                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#dc2626]/40 bg-[#dc2626]/10 px-4 text-sm font-semibold text-[#fecaca]"
                                            onClick={() => onRemoveLine(line.id)}
                                            type="button"
                                        >
                                            {`Remove line item ${index + 1}`}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}
