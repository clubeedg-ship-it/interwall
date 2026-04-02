'use server';

import { revalidatePath } from 'next/cache';

import type {
    CancelPurchaseOrderInput,
    CancelSalesOrderInput,
    PurchaseOrderLineInput,
    SalesOrderLineInput,
} from '@interwall/shared';

import { requireUserSession } from '@/lib/server/auth';
import {
    cancelPurchaseOrder,
    cancelSalesOrder,
    confirmPurchaseOrder,
    confirmSalesOrder,
    createPurchaseOrder,
    createSalesOrder,
    receivePurchaseOrderLine,
    shipSalesOrderLine,
    updatePurchaseOrder,
    updateSalesOrder,
} from '@/lib/server/order-mutations';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import type { OrdersRepositoryClient } from '@/lib/server/repositories/orders';
import { createServerSupabaseClient } from '@/lib/server/supabase';
import { requireActiveTenant, resolveActiveTenant } from '@/lib/server/tenant-context';
import { getShipmentPreview, type ShipmentPreviewResult } from '@/lib/server/repositories/orders';

type PurchaseOrderDraftInput = {
    purchaseOrderId?: string;
    orderNumber: string;
    supplierName: string;
    supplierReference: string;
    warehouseId: string;
    orderDate: string;
    expectedDate: string | null;
    note: string | null;
    lines: PurchaseOrderLineInput[];
};

type SalesOrderDraftInput = {
    salesOrderId?: string;
    orderNumber: string;
    customerName: string;
    customerReference: string;
    warehouseId: string;
    orderDate: string;
    expectedDate: string | null;
    note: string | null;
    lines: SalesOrderLineInput[];
};

async function resolveTenantId(): Promise<string> {
    const supabase = createServerSupabaseClient();
    const user = await requireUserSession({ supabase });
    const resolved = await resolveActiveTenant({
        user,
        listMemberships: (authenticatedUser) =>
            listMembershipsForUser(
                supabase as unknown as MembershipRepositoryClient,
                authenticatedUser,
            ),
    });

    return requireActiveTenant({ resolved }).tenantId;
}

function revalidateOrdersPaths(orderId?: string) {
    revalidatePath('/orders');

    if (orderId) {
        revalidatePath(`/orders/${orderId}`);
    }
}

export async function createPurchaseOrderAction(
    input: PurchaseOrderDraftInput,
): Promise<void> {
    const tenantId = await resolveTenantId();

    await createPurchaseOrder({
        tenantId,
        input: {
            order_number: input.orderNumber,
            supplier_name: input.supplierName || null,
            supplier_reference: input.supplierReference || null,
            warehouse_id: input.warehouseId,
            order_date: input.orderDate,
            expected_date: input.expectedDate,
            note: input.note,
            lines: input.lines,
        },
    });

    revalidateOrdersPaths();
}

export async function updatePurchaseOrderAction(
    input: PurchaseOrderDraftInput & { purchaseOrderId: string },
): Promise<void> {
    const tenantId = await resolveTenantId();

    await updatePurchaseOrder({
        tenantId,
        input: {
            purchase_order_id: input.purchaseOrderId,
            order_number: input.orderNumber,
            supplier_name: input.supplierName || null,
            supplier_reference: input.supplierReference || null,
            warehouse_id: input.warehouseId,
            order_date: input.orderDate,
            expected_date: input.expectedDate,
            note: input.note,
            lines: input.lines,
        },
    });

    revalidateOrdersPaths(input.purchaseOrderId);
}

export async function confirmPurchaseOrderAction(input: {
    purchaseOrderId: string;
}): Promise<void> {
    const tenantId = await resolveTenantId();

    await confirmPurchaseOrder({
        tenantId,
        input: {
            purchase_order_id: input.purchaseOrderId,
        },
    });

    revalidateOrdersPaths(input.purchaseOrderId);
}

export async function receivePurchaseOrderLineAction(input: {
    purchaseOrderId: string;
    purchaseOrderLineId: string;
    quantityReceived: number;
    shelfId: string;
    receivedAt: string;
    lotReference: string | null;
    supplierReference: string | null;
    note: string | null;
}): Promise<void> {
    const tenantId = await resolveTenantId();

    await receivePurchaseOrderLine({
        tenantId,
        input: {
            purchase_order_line_id: input.purchaseOrderLineId,
            quantity_received: input.quantityReceived,
            shelf_id: input.shelfId,
            received_at: input.receivedAt,
            lot_reference: input.lotReference,
            supplier_reference: input.supplierReference,
            note: input.note,
        },
    });

    revalidateOrdersPaths(input.purchaseOrderId);
}

export async function createSalesOrderAction(
    input: SalesOrderDraftInput,
): Promise<void> {
    const tenantId = await resolveTenantId();

    await createSalesOrder({
        tenantId,
        input: {
            order_number: input.orderNumber,
            customer_name: input.customerName || null,
            customer_reference: input.customerReference || null,
            warehouse_id: input.warehouseId,
            order_date: input.orderDate,
            expected_date: input.expectedDate,
            note: input.note,
            lines: input.lines,
        },
    });

    revalidateOrdersPaths();
}

export async function updateSalesOrderAction(
    input: SalesOrderDraftInput & { salesOrderId: string },
): Promise<void> {
    const tenantId = await resolveTenantId();

    await updateSalesOrder({
        tenantId,
        input: {
            sales_order_id: input.salesOrderId,
            order_number: input.orderNumber,
            customer_name: input.customerName || null,
            customer_reference: input.customerReference || null,
            warehouse_id: input.warehouseId,
            order_date: input.orderDate,
            expected_date: input.expectedDate,
            note: input.note,
            lines: input.lines,
        },
    });

    revalidateOrdersPaths(input.salesOrderId);
}

export async function confirmSalesOrderAction(input: {
    salesOrderId: string;
}): Promise<void> {
    const tenantId = await resolveTenantId();

    await confirmSalesOrder({
        tenantId,
        input: {
            sales_order_id: input.salesOrderId,
        },
    });

    revalidateOrdersPaths(input.salesOrderId);
}

export async function loadShipmentPreviewAction(input: {
    salesOrderId: string;
    salesOrderLineId: string;
    quantityShipped: number;
}): Promise<ShipmentPreviewResult> {
    const tenantId = await resolveTenantId();
    const supabase = createServerSupabaseClient();

    return await getShipmentPreview(supabase as unknown as OrdersRepositoryClient, {
        tenantId,
        salesOrderLineId: input.salesOrderLineId,
        quantityShipped: input.quantityShipped,
    });
}

export async function shipSalesOrderLineAction(input: {
    salesOrderId: string;
    salesOrderLineId: string;
    quantityShipped: number;
    note: string | null;
}): Promise<void> {
    const tenantId = await resolveTenantId();

    await shipSalesOrderLine({
        tenantId,
        input: {
            sales_order_line_id: input.salesOrderLineId,
            quantity_shipped: input.quantityShipped,
            note: input.note,
        },
    });

    revalidateOrdersPaths(input.salesOrderId);
}

export async function cancelPurchaseOrderAction(
    input: {
        purchaseOrderId: string;
    } & Omit<CancelPurchaseOrderInput, 'purchase_order_id'>,
): Promise<void> {
    const tenantId = await resolveTenantId();

    await cancelPurchaseOrder({
        tenantId,
        input: {
            purchase_order_id: input.purchaseOrderId,
            reason: input.reason,
            note: input.note,
        },
    });

    revalidateOrdersPaths(input.purchaseOrderId);
}

export async function cancelSalesOrderAction(
    input: {
        salesOrderId: string;
    } & Omit<CancelSalesOrderInput, 'sales_order_id'>,
): Promise<void> {
    const tenantId = await resolveTenantId();

    await cancelSalesOrder({
        tenantId,
        input: {
            sales_order_id: input.salesOrderId,
            reason: input.reason,
            note: input.note,
        },
    });

    revalidateOrdersPaths(input.salesOrderId);
}
