'use client';

import { useEffect, useState } from 'react';

import type {
    OrderDetailViewModel,
    OrderType,
    OrderWorkspaceListItem,
} from '@interwall/shared';

import {
    cancelPurchaseOrderAction,
    cancelSalesOrderAction,
    confirmPurchaseOrderAction,
    confirmSalesOrderAction,
    createPurchaseOrderAction,
    createSalesOrderAction,
    loadShipmentPreviewAction,
    receivePurchaseOrderLineAction,
    shipSalesOrderLineAction,
    updatePurchaseOrderAction,
    updateSalesOrderAction,
} from '@/app/(app)/orders/actions';

import type { OrderHeaderFormValue } from './order-header-form';
import { OrderDetailPanel } from './order-detail-panel';
import {
    createDraftLine,
    toDraftLineValue,
    toPurchaseOrderLines,
    toSalesOrderLines,
    type OrderLineEditorProps,
} from './order-line-editor';
import { OrderList } from './order-list';
import { OrderTaskSurface } from './order-task-surface';

export interface OrderWorkspaceScreenProps {
    orders: OrderWorkspaceListItem[];
    selectedOrder: OrderDetailViewModel | null;
}

type EditorMode = 'view' | 'edit' | 'create';
type TaskSurfaceMode = 'receive' | 'ship' | null;

type DraftLine = OrderLineEditorProps['lines'][number];

function createHeaderValue(orderType: OrderType): OrderHeaderFormValue {
    return {
        orderType,
        orderNumber: '',
        supplierName: '',
        supplierReference: '',
        customerName: '',
        customerReference: '',
        warehouseId: '',
        orderDate: '',
        expectedDate: '',
        note: '',
    };
}

function createHeaderValueFromOrder(order: OrderDetailViewModel): OrderHeaderFormValue {
    return {
        orderType: order.orderType,
        orderNumber: order.orderNumber,
        supplierName: order.orderType === 'purchase' ? order.counterpartyName ?? '' : '',
        supplierReference:
            order.orderType === 'purchase' ? order.counterpartyReference ?? '' : '',
        customerName: order.orderType === 'sales' ? order.counterpartyName ?? '' : '',
        customerReference:
            order.orderType === 'sales' ? order.counterpartyReference ?? '' : '',
        warehouseId: order.warehouseId,
        orderDate: order.linkedDates.orderDate,
        expectedDate: order.linkedDates.expectedDate ?? '',
        note: order.note ?? '',
    };
}

function resetToSelectedOrderState(
    selectedOrder: OrderDetailViewModel | null,
    setMode: (mode: EditorMode) => void,
    setHeaderValue: (value: OrderHeaderFormValue) => void,
    setLines: (lines: DraftLine[]) => void,
) {
    if (!selectedOrder) {
        setMode('view');
        setHeaderValue(createHeaderValue('purchase'));
        setLines([]);
        return;
    }

    setMode(selectedOrder.status === 'draft' ? 'edit' : 'view');
    setHeaderValue(createHeaderValueFromOrder(selectedOrder));
    setLines(selectedOrder.lines.map(toDraftLineValue));
}

export function OrderWorkspaceScreen({
    orders,
    selectedOrder,
}: OrderWorkspaceScreenProps): JSX.Element {
    const [mode, setMode] = useState<EditorMode>('view');
    const [headerValue, setHeaderValue] = useState<OrderHeaderFormValue>(
        createHeaderValue(selectedOrder?.orderType ?? 'purchase'),
    );
    const [lines, setLines] = useState<DraftLine[]>(
        selectedOrder?.lines.map(toDraftLineValue) ?? [],
    );
    const [taskSurfaceMode, setTaskSurfaceMode] = useState<TaskSurfaceMode>(null);

    useEffect(() => {
        resetToSelectedOrderState(selectedOrder, setMode, setHeaderValue, setLines);
        setTaskSurfaceMode(null);
    }, [selectedOrder]);

    const handleNewOrder = (orderType: OrderType) => {
        setMode('create');
        setHeaderValue(createHeaderValue(orderType));
        setLines([]);
    };

    const handleSaveDraft = async () => {
        if (mode === 'create') {
            if (headerValue.orderType === 'purchase') {
                await createPurchaseOrderAction({
                    orderNumber: headerValue.orderNumber,
                    supplierName: headerValue.supplierName,
                    supplierReference: headerValue.supplierReference,
                    warehouseId: headerValue.warehouseId,
                    orderDate: headerValue.orderDate,
                    expectedDate: headerValue.expectedDate || null,
                    note: headerValue.note || null,
                    lines: toPurchaseOrderLines(lines),
                });
            } else {
                await createSalesOrderAction({
                    orderNumber: headerValue.orderNumber,
                    customerName: headerValue.customerName,
                    customerReference: headerValue.customerReference,
                    warehouseId: headerValue.warehouseId,
                    orderDate: headerValue.orderDate,
                    expectedDate: headerValue.expectedDate || null,
                    note: headerValue.note || null,
                    lines: toSalesOrderLines(lines),
                });
            }

            resetToSelectedOrderState(selectedOrder, setMode, setHeaderValue, setLines);
            return;
        }

        if (!selectedOrder || selectedOrder.status !== 'draft') {
            return;
        }

        if (selectedOrder.orderType === 'purchase') {
            await updatePurchaseOrderAction({
                purchaseOrderId: selectedOrder.id,
                orderNumber: headerValue.orderNumber,
                supplierName: headerValue.supplierName,
                supplierReference: headerValue.supplierReference,
                warehouseId: headerValue.warehouseId,
                orderDate: headerValue.orderDate,
                expectedDate: headerValue.expectedDate || null,
                note: headerValue.note || null,
                lines: toPurchaseOrderLines(lines),
            });
        } else {
            await updateSalesOrderAction({
                salesOrderId: selectedOrder.id,
                orderNumber: headerValue.orderNumber,
                customerName: headerValue.customerName,
                customerReference: headerValue.customerReference,
                warehouseId: headerValue.warehouseId,
                orderDate: headerValue.orderDate,
                expectedDate: headerValue.expectedDate || null,
                note: headerValue.note || null,
                lines: toSalesOrderLines(lines),
            });
        }
    };

    const handlePrimaryAction = async () => {
        if (mode === 'create') {
            await handleSaveDraft();
            return;
        }

        if (!selectedOrder) {
            return;
        }

        if (selectedOrder.status === 'draft') {
            if (selectedOrder.orderType === 'purchase') {
                await confirmPurchaseOrderAction({
                    purchaseOrderId: selectedOrder.id,
                });
            } else {
                await confirmSalesOrderAction({
                    salesOrderId: selectedOrder.id,
                });
            }

            return;
        }

        if (selectedOrder.nextAction === 'Receive stock') {
            setTaskSurfaceMode('receive');
            return;
        }

        if (selectedOrder.nextAction === 'Ship items') {
            setTaskSurfaceMode('ship');
            return;
        }

        await handleCancelOrder();
    };

    const handleCancelOrder = async () => {
        if (!selectedOrder) {
            return;
        }

        if (selectedOrder.orderType === 'purchase') {
            await cancelPurchaseOrderAction({
                purchaseOrderId: selectedOrder.id,
                reason: 'manual_cancel',
                note: 'Cancelled from workspace',
            });
        } else {
            await cancelSalesOrderAction({
                salesOrderId: selectedOrder.id,
                reason: 'manual_cancel',
                note: 'Cancelled from workspace',
            });
        }
    };

    const lineEditorProps: OrderLineEditorProps = {
        orderType: headerValue.orderType,
        status: mode === 'create' ? 'draft' : selectedOrder?.status ?? 'draft',
        lines,
        onAddLine: () => {
            setLines((current) => [...current, createDraftLine()]);
        },
        onRemoveLine: (lineId) => {
            setLines((current) => current.filter((line) => line.id !== lineId));
        },
        onChangeLine: (lineId, patch) => {
            setLines((current) =>
                current.map((line) =>
                    line.id === lineId
                        ? {
                              ...line,
                              ...patch,
                          }
                        : line,
                ),
            );
        },
    };

    return (
        <div className="relative">
            {taskSurfaceMode === null ? (
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
                        <div className="mb-4 flex flex-wrap gap-4 px-2">
                            <button
                                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white"
                                onClick={() => handleNewOrder('purchase')}
                                type="button"
                            >
                                New purchase order
                            </button>
                            <button
                                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white"
                                onClick={() => handleNewOrder('sales')}
                                type="button"
                            >
                                New sales order
                            </button>
                        </div>
                        <OrderList
                            orders={orders}
                            selectedOrderId={selectedOrder?.id ?? orders[0]?.id ?? null}
                        />
                    </section>
                    <aside aria-label="Order detail" className="min-w-0">
                        <OrderDetailPanel
                            headerValue={headerValue}
                            lineEditorProps={lineEditorProps}
                            mode={mode}
                            onCancelOrder={handleCancelOrder}
                            onHeaderChange={setHeaderValue}
                            onPrimaryAction={handlePrimaryAction}
                            onSaveDraft={handleSaveDraft}
                            order={selectedOrder}
                        />
                    </aside>
                </div>
            ) : null}
            {selectedOrder && taskSurfaceMode ? (
                <OrderTaskSurface
                    mode={taskSurfaceMode}
                    onClose={() => setTaskSurfaceMode(null)}
                    onLoadShipmentPreview={loadShipmentPreviewAction}
                    onReceive={async (input) => {
                        await receivePurchaseOrderLineAction(input);
                        setTaskSurfaceMode(null);
                    }}
                    onShip={async (input) => {
                        await shipSalesOrderLineAction(input);
                        setTaskSurfaceMode(null);
                    }}
                    open
                    order={selectedOrder}
                />
            ) : null}
        </div>
    );
}
