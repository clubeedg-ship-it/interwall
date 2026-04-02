import type {
    OrderDetailViewModel,
    OrderType,
    PurchaseOrderStatus,
    SalesOrderStatus,
} from '@interwall/shared';

import type { OrderHeaderFormValue } from './order-header-form';
import { OrderHeaderForm } from './order-header-form';
import type { OrderLineEditorProps } from './order-line-editor';
import { OrderLineEditor } from './order-line-editor';
import { OrderStatusBadge } from './order-status-badge';

export interface OrderDetailPanelProps {
    order: OrderDetailViewModel | null;
    mode: 'view' | 'edit' | 'create';
    suppressPrimaryAction?: boolean;
    headerValue: OrderHeaderFormValue;
    lineEditorProps: OrderLineEditorProps;
    onHeaderChange: (nextValue: OrderHeaderFormValue) => void;
    onSaveDraft: () => void | Promise<void>;
    onPrimaryAction: () => void | Promise<void>;
    onCancelOrder: () => void | Promise<void>;
}

function renderOrderTypeLabel(orderType: OrderDetailViewModel['orderType']): string {
    return orderType === 'purchase' ? 'Purchase order' : 'Sales order';
}

export function OrderDetailPanel({
    order,
    mode,
    suppressPrimaryAction = false,
    headerValue,
    lineEditorProps,
    onHeaderChange,
    onSaveDraft,
    onPrimaryAction,
    onCancelOrder,
}: OrderDetailPanelProps): JSX.Element {
    if (!order && mode !== 'create') {
        return (
            <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/5 p-6 text-slate-300">
                Select an order to review its status, warehouse context, and next action.
            </div>
        );
    }

    const activeStatus: PurchaseOrderStatus | SalesOrderStatus =
        mode === 'create' ? 'draft' : order!.status;
    const detailOrder = order;
    const primaryActionLabel =
        mode === 'create'
            ? 'Create order'
            : detailOrder?.nextAction ?? (activeStatus === 'draft' ? 'Confirm order' : null);
    const orderTitle =
        mode === 'create' ? 'New order draft' : order!.orderNumber;
    const orderType: OrderType =
        mode === 'create' ? headerValue.orderType : order!.orderType;

    return (
        <div className="rounded-[2rem] border border-white/10 bg-[#102131]/90 p-6 shadow-[0_28px_80px_rgba(8,15,31,0.36)]">
            <div className="sticky top-4 z-10 -mx-2 rounded-[1.5rem] border border-white/10 bg-[#102131]/95 px-2 py-4 backdrop-blur">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="text-[28px] font-semibold leading-none text-white">
                                {orderTitle}
                            </p>
                            <OrderStatusBadge status={activeStatus} />
                        </div>
                        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#99f6e4]">
                            {renderOrderTypeLabel(orderType)}
                        </p>
                        <p className="text-sm text-slate-300">
                            {mode === 'create'
                                ? 'Complete the header and draft lines before confirming.'
                                : `${detailOrder?.counterpartyName ?? 'Counterparty pending'} • ${detailOrder?.warehouseName}`}
                        </p>
                    </div>
                    {primaryActionLabel && !suppressPrimaryAction ? (
                        <button
                            data-testid="primary-order-action"
                            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#14b8a6] px-5 text-sm font-semibold text-[#09111f]"
                            onClick={() => {
                                void onPrimaryAction();
                            }}
                            type="button"
                        >
                            {primaryActionLabel}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <h2 className="text-xl font-semibold text-white">Header summary</h2>
                    {mode === 'view' && detailOrder ? (
                        <dl className="mt-4 grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                    Order date
                                </dt>
                                <dd className="mt-1 text-base text-slate-100">
                                    {detailOrder.linkedDates.orderDate}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                    Expected date
                                </dt>
                                <dd className="mt-1 text-base text-slate-100">
                                    {detailOrder.linkedDates.expectedDate ?? 'Not set'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                    Created
                                </dt>
                                <dd className="mt-1 text-base text-slate-100">
                                    {detailOrder.linkedDates.createdAt}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                    Value summary
                                </dt>
                                <dd className="mt-1 text-base text-slate-100">
                                    {detailOrder.valueSummary}
                                </dd>
                            </div>
                        </dl>
                    ) : (
                        <>
                            <div className="mt-4">
                                <OrderHeaderForm
                                    onChange={onHeaderChange}
                                    value={headerValue}
                                />
                            </div>
                            <div className="mt-4 flex flex-wrap gap-4">
                                <button
                                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white"
                                    onClick={() => {
                                        void onSaveDraft();
                                    }}
                                    type="button"
                                >
                                    Save draft
                                </button>
                                {mode !== 'create' ? (
                                    <button
                                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#dc2626]/40 bg-[#dc2626]/10 px-4 text-sm font-semibold text-[#fecaca]"
                                        onClick={() => {
                                            void onCancelOrder();
                                        }}
                                        type="button"
                                    >
                                        Cancel order
                                    </button>
                                ) : null}
                            </div>
                        </>
                    )}
                </section>
                <OrderLineEditor {...lineEditorProps} />
            </div>
        </div>
    );
}
