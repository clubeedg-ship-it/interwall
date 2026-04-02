import type { OrderWorkspaceListItem } from '@interwall/shared';
import { cn } from '@interwall/ui';

import { OrderStatusBadge } from './order-status-badge';

export interface OrderListProps {
    orders: OrderWorkspaceListItem[];
    selectedOrderId?: string | null;
}

export function OrderList({
    orders,
    selectedOrderId,
}: OrderListProps): JSX.Element {
    if (orders.length === 0) {
        return (
            <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold text-white">No orders yet</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
                    Create a purchase or sales order to start receiving, shipping, and
                    tracking FIFO-backed stock movement.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {orders.map((order) => {
                const isSelected = order.id === selectedOrderId;

                return (
                    <a
                        key={order.id}
                        aria-current={isSelected ? 'page' : undefined}
                        className={cn(
                            'block rounded-[1.5rem] border px-4 py-4 transition-colors',
                            isSelected
                                ? 'border-[#14b8a6]/80 bg-[#14b8a6]/12 shadow-[0_0_0_1px_rgba(20,184,166,0.28)]'
                                : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
                        )}
                        href={`/orders/${order.id}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-[28px] font-semibold leading-none text-white">
                                        {order.orderNumber}
                                    </p>
                                    <OrderStatusBadge status={order.status} />
                                </div>
                                <p className="text-sm font-medium text-slate-100">
                                    {order.counterpartyName ?? 'Counterparty pending'}
                                </p>
                            </div>
                            <p className="rounded-full border border-white/10 bg-[#102131] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#99f6e4]">
                                {order.orderType}
                            </p>
                        </div>
                        <dl className="mt-4 grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                    Order date
                                </dt>
                                <dd className="mt-1 text-base text-slate-100">{order.orderDate}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                    Warehouse
                                </dt>
                                <dd className="mt-1 text-base text-slate-100">
                                    {order.warehouseName}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                    Outstanding
                                </dt>
                                <dd className="mt-1 text-base text-slate-100">
                                    {order.outstandingQuantity} open
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                    Value
                                </dt>
                                <dd className="mt-1 text-base text-slate-100">
                                    {order.valueSummary}
                                </dd>
                            </div>
                        </dl>
                    </a>
                );
            })}
        </div>
    );
}
