import { describe, expect, it } from 'vitest';

import type {
    CancelPurchaseOrderInput,
    CancelSalesOrderInput,
    ConfirmPurchaseOrderInput,
    ConfirmSalesOrderInput,
    CreatePurchaseOrderInput,
    CreateSalesOrderInput,
    ReceivePurchaseOrderLineInput,
    ShipSalesOrderLineInput,
    UpdatePurchaseOrderInput,
    UpdateSalesOrderInput,
} from '@interwall/shared';

import {
    cancelPurchaseOrder,
    cancelSalesOrder,
    confirmPurchaseOrder,
    confirmSalesOrder,
    createPurchaseOrder,
    createSalesOrder,
    invokeInventoryOrdersAction,
    receivePurchaseOrderLine,
    shipSalesOrderLine,
    updatePurchaseOrder,
    updateSalesOrder,
} from './order-mutations';

type InventoryOrdersResponse = {
    data?: {
        tenantId: string;
        action: string;
        result: Record<string, unknown>;
    };
};

function createFunctionsClient(response: InventoryOrdersResponse) {
    const calls: Array<{
        name: string;
        options: unknown;
    }> = [];

    return {
        calls,
        functions: {
            invoke(name: string, options: unknown) {
                calls.push({ name, options });

                return Promise.resolve({
                    data: response,
                    error: null,
                });
            },
        },
    };
}

describe('inventory order mutation invoker', () => {
    const tenantId = 'tenant-1';

    it('forwards the exact action body and x-active-tenant header to inventory-orders', async () => {
        const client = createFunctionsClient({
            data: {
                tenantId,
                action: 'shipSalesOrderLine',
                result: { quantityShipped: 2 },
            },
        });

        await expect(
            invokeInventoryOrdersAction(client as never, {
                tenantId,
                action: 'shipSalesOrderLine',
                input: {
                    sales_order_line_id: 'line-1',
                    quantity_shipped: 2,
                    note: 'picked',
                },
            }),
        ).resolves.toEqual({
            tenantId,
            action: 'shipSalesOrderLine',
            result: { quantityShipped: 2 },
        });

        expect(client.calls).toEqual([
            {
                name: 'inventory-orders',
                options: {
                    body: {
                        action: 'shipSalesOrderLine',
                        input: {
                            sales_order_line_id: 'line-1',
                            quantity_shipped: 2,
                            note: 'picked',
                        },
                    },
                    headers: {
                        'x-active-tenant': tenantId,
                    },
                },
            },
        ]);
    });

    it('uses the exact action names for purchase and sales order wrappers', async () => {
        const client = createFunctionsClient({
            data: {
                tenantId,
                action: 'noop',
                result: {},
            },
        });
        const purchaseCreate: CreatePurchaseOrderInput = {
            order_number: 'PO-001',
            warehouse_id: 'warehouse-1',
            supplier_name: 'Supplier A',
            supplier_reference: 'SUP-A',
            order_date: '2026-04-02',
            expected_date: '2026-04-03',
            note: 'restock',
            lines: [],
        };
        const purchaseUpdate: UpdatePurchaseOrderInput = {
            purchase_order_id: 'po-1',
            ...purchaseCreate,
        };
        const purchaseConfirm: ConfirmPurchaseOrderInput = {
            purchase_order_id: 'po-1',
        };
        const purchaseReceive: ReceivePurchaseOrderLineInput = {
            purchase_order_line_id: 'po-line-1',
            quantity_received: 5,
            shelf_id: 'shelf-1',
            received_at: '2026-04-02T09:00:00.000Z',
            lot_reference: 'LOT-001',
            supplier_reference: 'SUP-A',
            note: 'received',
        };
        const salesCreate: CreateSalesOrderInput = {
            order_number: 'SO-001',
            warehouse_id: 'warehouse-1',
            customer_name: 'Customer A',
            customer_reference: 'CUST-A',
            order_date: '2026-04-02',
            expected_date: '2026-04-04',
            note: 'ship soon',
            lines: [],
        };
        const salesUpdate: UpdateSalesOrderInput = {
            sales_order_id: 'so-1',
            ...salesCreate,
        };
        const salesConfirm: ConfirmSalesOrderInput = {
            sales_order_id: 'so-1',
        };
        const salesShip: ShipSalesOrderLineInput = {
            sales_order_line_id: 'so-line-1',
            quantity_shipped: 3,
            note: 'picked',
        };
        const purchaseCancel: CancelPurchaseOrderInput = {
            purchase_order_id: 'po-1',
            reason: 'duplicate',
            note: 'cancelled before receipt',
        };
        const salesCancel: CancelSalesOrderInput = {
            sales_order_id: 'so-1',
            reason: 'customer_changed_mind',
            note: 'cancelled before shipment',
        };

        await createPurchaseOrder(client as never, { tenantId, input: purchaseCreate });
        await updatePurchaseOrder(client as never, { tenantId, input: purchaseUpdate });
        await confirmPurchaseOrder(client as never, { tenantId, input: purchaseConfirm });
        await receivePurchaseOrderLine(client as never, { tenantId, input: purchaseReceive });
        await createSalesOrder(client as never, { tenantId, input: salesCreate });
        await updateSalesOrder(client as never, { tenantId, input: salesUpdate });
        await confirmSalesOrder(client as never, { tenantId, input: salesConfirm });
        await shipSalesOrderLine(client as never, { tenantId, input: salesShip });
        await cancelPurchaseOrder(client as never, { tenantId, input: purchaseCancel });
        await cancelSalesOrder(client as never, { tenantId, input: salesCancel });

        expect(client.calls.map((call) => (call.options as { body: { action: string } }).body.action)).toEqual([
            'createPurchaseOrder',
            'updatePurchaseOrder',
            'confirmPurchaseOrder',
            'receivePurchaseOrderLine',
            'createSalesOrder',
            'updateSalesOrder',
            'confirmSalesOrder',
            'shipSalesOrderLine',
            'cancelPurchaseOrder',
            'cancelSalesOrder',
        ]);
        expect(client.calls.every((call) =>
            (call.options as { headers: { 'x-active-tenant': string } }).headers['x-active-tenant'] === tenantId,
        )).toBe(true);
    });
});
