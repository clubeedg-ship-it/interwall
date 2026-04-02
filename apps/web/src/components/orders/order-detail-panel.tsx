import type { OrderDetailViewModel } from '@interwall/shared';

import { OrderStatusBadge } from './order-status-badge';

export interface OrderDetailPanelProps {
    order: OrderDetailViewModel | null;
}

function renderOrderTypeLabel(orderType: OrderDetailViewModel['orderType']): string {
    return orderType === 'purchase' ? 'Purchase order' : 'Sales order';
}

export function OrderDetailPanel({
    order,
}: OrderDetailPanelProps): JSX.Element {
    if (!order) {
        return (
            <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/5 p-6 text-slate-300">
                Select an order to review its status, warehouse context, and next action.
            </div>
        );
    }

    return (
        <div className="rounded-[2rem] border border-white/10 bg-[#102131]/90 p-6 shadow-[0_28px_80px_rgba(8,15,31,0.36)]">
            <div className="sticky top-4 z-10 -mx-2 rounded-[1.5rem] border border-white/10 bg-[#102131]/95 px-2 py-4 backdrop-blur">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="text-[28px] font-semibold leading-none text-white">
                                {order.orderNumber}
                            </p>
                            <OrderStatusBadge status={order.status} />
                        </div>
                        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#99f6e4]">
                            {renderOrderTypeLabel(order.orderType)}
                        </p>
                        <p className="text-sm text-slate-300">
                            {order.counterpartyName ?? 'Counterparty pending'} •{' '}
                            {order.warehouseName}
                        </p>
                    </div>
                    {order.nextAction ? (
                        <button
                            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#14b8a6] px-5 text-sm font-semibold text-[#09111f]"
                            type="button"
                        >
                            {order.nextAction}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <h2 className="text-xl font-semibold text-white">Header summary</h2>
                    <dl className="mt-4 grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
                        <div>
                            <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Order date
                            </dt>
                            <dd className="mt-1 text-base text-slate-100">
                                {order.linkedDates.orderDate}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Expected date
                            </dt>
                            <dd className="mt-1 text-base text-slate-100">
                                {order.linkedDates.expectedDate ?? 'Not set'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Created
                            </dt>
                            <dd className="mt-1 text-base text-slate-100">
                                {order.linkedDates.createdAt}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Value summary
                            </dt>
                            <dd className="mt-1 text-base text-slate-100">
                                {order.valueSummary}
                            </dd>
                        </div>
                    </dl>
                </section>
                <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <h2 className="text-xl font-semibold text-white">Line summary</h2>
                    <div className="mt-4 space-y-3">
                        {order.lines.length === 0 ? (
                            <p className="text-sm leading-6 text-slate-300">
                                No line items yet. Draft editing is added in the next task.
                            </p>
                        ) : (
                            order.lines.map((line) => (
                                <div
                                    key={line.id}
                                    className="rounded-[1.25rem] border border-white/10 bg-[#09111f] p-4"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="text-base font-semibold text-white">
                                                {line.productName}
                                            </p>
                                            <p className="text-sm text-slate-300">{line.sku}</p>
                                        </div>
                                        <p className="text-sm font-medium text-slate-100">
                                            {line.outstandingQuantity} outstanding
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
