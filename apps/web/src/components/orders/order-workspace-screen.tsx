'use client';

import type {
    OrderDetailViewModel,
    OrderWorkspaceListItem,
} from '@interwall/shared';

import { OrderDetailPanel } from './order-detail-panel';
import { OrderList } from './order-list';

export interface OrderWorkspaceScreenProps {
    orders: OrderWorkspaceListItem[];
    selectedOrder: OrderDetailViewModel | null;
}

export function OrderWorkspaceScreen({
    orders,
    selectedOrder,
}: OrderWorkspaceScreenProps): JSX.Element {
    return (
        <div
            className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]"
            data-testid="orders-workspace-layout"
        >
            <section
                aria-label="Orders list"
                className="rounded-[2rem] border border-white/10 bg-[#102131]/85 p-4 shadow-[0_28px_80px_rgba(8,15,31,0.32)]"
            >
                <div className="mb-4 flex items-center justify-between gap-4 px-2">
                    <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-[#14b8a6]">
                            Orders
                        </p>
                        <h2 className="mt-2 text-xl font-semibold text-white">
                            Active workflow
                        </h2>
                    </div>
                    <p className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                        {orders.length} open
                    </p>
                </div>
                <OrderList
                    orders={orders}
                    selectedOrderId={selectedOrder?.id ?? orders[0]?.id ?? null}
                />
            </section>
            <aside aria-label="Order detail" className="min-w-0">
                <OrderDetailPanel order={selectedOrder} />
            </aside>
        </div>
    );
}
