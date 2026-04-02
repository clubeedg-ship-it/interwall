import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import {
    createFunctionClient,
    requireBackendUser,
} from '../_shared/auth.ts';
import {
    errorResponse,
    FunctionError,
    json,
    readJson,
    requireMethod,
} from '../_shared/errors.ts';
import {
    requireActiveTenant,
    requireTenantMembership,
} from '../_shared/tenant-context.ts';

type PurchaseOrderStatus =
    | 'draft'
    | 'confirmed'
    | 'partially_received'
    | 'received'
    | 'cancelled';

type SalesOrderStatus =
    | 'draft'
    | 'confirmed'
    | 'partially_shipped'
    | 'shipped'
    | 'cancelled';

type PurchaseOrderRecord = {
    id: string;
    tenant_id: string;
    order_number: string;
    warehouse_id: string;
    supplier_name: string | null;
    supplier_reference: string | null;
    status: PurchaseOrderStatus;
    order_date: string;
    expected_date: string | null;
    received_date: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

type PurchaseOrderLineRecord = {
    id: string;
    tenant_id: string;
    purchase_order_id: string;
    product_id: string;
    quantity_ordered: number;
    quantity_received: number;
    unit_cost: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

type SalesOrderRecord = {
    id: string;
    tenant_id: string;
    order_number: string;
    warehouse_id: string;
    customer_name: string | null;
    customer_reference: string | null;
    status: SalesOrderStatus;
    order_date: string;
    shipped_date: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

type SalesOrderLineRecord = {
    id: string;
    tenant_id: string;
    sales_order_id: string;
    product_id: string;
    quantity_ordered: number;
    quantity_shipped: number;
    unit_price: number | null;
    cost_basis_total: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

type ProductRecord = {
    id: string;
    tenant_id: string;
    name: string;
};

type ShelfRecord = {
    id: string;
    tenant_id: string;
    warehouse_id: string;
};

type StockLotRecord = {
    id: string;
    tenant_id: string;
    product_id: string;
    shelf_id: string;
    quantity_on_hand: number;
    received_at: string;
    unit_cost: number | null;
    lot_reference: string | null;
};

type PurchaseOrderLineInput = {
    product_id: string;
    quantity_ordered: number;
    unit_cost: number | null;
    note: string | null;
};

type SalesOrderLineInput = {
    product_id: string;
    quantity_ordered: number;
    unit_price: number | null;
    note: string | null;
};

type CreatePurchaseOrderInput = {
    order_number: string;
    warehouse_id: string;
    supplier_name: string | null;
    supplier_reference: string | null;
    order_date: string;
    expected_date: string | null;
    note: string | null;
    lines: PurchaseOrderLineInput[];
};

type UpdatePurchaseOrderInput = CreatePurchaseOrderInput & {
    purchase_order_id: string;
};

type ConfirmPurchaseOrderInput = {
    purchase_order_id: string;
};

type ReceivePurchaseOrderLineInput = {
    purchase_order_line_id: string;
    quantity_received: number;
    shelf_id: string;
    received_at: string;
    lot_reference: string | null;
    supplier_reference: string | null;
    note: string | null;
};

type CreateSalesOrderInput = {
    order_number: string;
    warehouse_id: string;
    customer_name: string | null;
    customer_reference: string | null;
    order_date: string;
    expected_date: string | null;
    note: string | null;
    lines: SalesOrderLineInput[];
};

type UpdateSalesOrderInput = CreateSalesOrderInput & {
    sales_order_id: string;
};

type ConfirmSalesOrderInput = {
    sales_order_id: string;
};

type ShipSalesOrderLineInput = {
    sales_order_line_id: string;
    quantity_shipped: number;
    note: string | null;
};

type CancelPurchaseOrderInput = {
    purchase_order_id: string;
    reason: string;
    note: string | null;
};

type CancelSalesOrderInput = {
    sales_order_id: string;
    reason: string;
    note: string | null;
};

type InventoryOrdersActionRequest =
    | {
          action: 'createPurchaseOrder';
          input: CreatePurchaseOrderInput;
      }
    | {
          action: 'updatePurchaseOrder';
          input: UpdatePurchaseOrderInput;
      }
    | {
          action: 'confirmPurchaseOrder';
          input: ConfirmPurchaseOrderInput;
      }
    | {
          action: 'receivePurchaseOrderLine';
          input: ReceivePurchaseOrderLineInput;
      }
    | {
          action: 'createSalesOrder';
          input: CreateSalesOrderInput;
      }
    | {
          action: 'updateSalesOrder';
          input: UpdateSalesOrderInput;
      }
    | {
          action: 'confirmSalesOrder';
          input: ConfirmSalesOrderInput;
      }
    | {
          action: 'shipSalesOrderLine';
          input: ShipSalesOrderLineInput;
      }
    | {
          action: 'cancelPurchaseOrder';
          input: CancelPurchaseOrderInput;
      }
    | {
          action: 'cancelSalesOrder';
          input: CancelSalesOrderInput;
      };

type FifoCandidateLot = {
    id: string;
    quantity_on_hand: number;
    received_at: string;
    unit_cost: number | null;
    lot_reference: string | null;
};

type FifoConsumptionSlice = {
    stockLotId: string;
    quantityConsumed: number;
    unitCost: number | null;
};

type FifoConsumptionResult = {
    consumed: FifoConsumptionSlice[];
    totalCost: number | null;
    remainingDemand: number;
};

function computeFifoConsumption(
    lots: FifoCandidateLot[],
    demandQuantity: number,
): FifoConsumptionResult {
    const sortedLots = [...lots].sort((left, right) =>
        left.received_at.localeCompare(right.received_at),
    );
    const consumed: FifoConsumptionSlice[] = [];
    let remainingDemand = Math.max(demandQuantity, 0);
    let totalCost: number | null = null;

    for (const lot of sortedLots) {
        if (remainingDemand <= 0) {
            break;
        }

        if (lot.quantity_on_hand <= 0) {
            continue;
        }

        const quantityConsumed = Math.min(remainingDemand, lot.quantity_on_hand);
        consumed.push({
            stockLotId: lot.id,
            quantityConsumed,
            unitCost: lot.unit_cost,
        });

        if (lot.unit_cost !== null) {
            totalCost = (totalCost ?? 0) + lot.unit_cost * quantityConsumed;
        }

        remainingDemand -= quantityConsumed;
    }

    return {
        consumed,
        totalCost,
        remainingDemand,
    };
}

function createAdminClient(): SupabaseClient {
    return createFunctionClient({ useServiceRole: true });
}

function ensurePositiveQuantity(value: number, code: string, message: string): void {
    if (value <= 0) {
        throw new FunctionError(400, code, message, { value });
    }
}

async function assertWarehouseInTenant(
    client: SupabaseClient,
    input: { tenantId: string; warehouseId: string },
): Promise<void> {
    const { data, error } = await client
        .from('warehouses')
        .select('id')
        .eq('tenant_id', input.tenantId)
        .eq('id', input.warehouseId)
        .maybeSingle<{ id: string }>();

    if (error) {
        throw new FunctionError(
            500,
            'warehouse_lookup_failed',
            'Unable to validate the requested warehouse.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            403,
            'warehouse_outside_active_tenant',
            'The requested warehouse is not available in the active tenant.',
            input,
        );
    }
}

async function getShelfForTenant(
    client: SupabaseClient,
    input: { tenantId: string; shelfId: string },
): Promise<ShelfRecord> {
    const { data, error } = await client
        .from('shelves')
        .select('id, tenant_id, warehouse_id')
        .eq('tenant_id', input.tenantId)
        .eq('id', input.shelfId)
        .maybeSingle<ShelfRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'shelf_lookup_failed',
            'Unable to validate the requested shelf.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'shelf_not_found',
            'The requested shelf was not found for the active tenant.',
            input,
        );
    }

    return data;
}

async function getProductForTenant(
    client: SupabaseClient,
    input: { tenantId: string; productId: string },
): Promise<ProductRecord> {
    const { data, error } = await client
        .from('products')
        .select('id, tenant_id, name')
        .eq('tenant_id', input.tenantId)
        .eq('id', input.productId)
        .maybeSingle<ProductRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'product_lookup_failed',
            'Unable to load the requested product.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'product_not_found',
            'The requested product was not found for the active tenant.',
            input,
        );
    }

    return data;
}

async function getPurchaseOrderForTenant(
    client: SupabaseClient,
    input: { tenantId: string; purchaseOrderId: string },
): Promise<PurchaseOrderRecord> {
    const { data, error } = await client
        .from('purchase_orders')
        .select(
            'id, tenant_id, order_number, warehouse_id, supplier_name, supplier_reference, status, order_date, expected_date, received_date, notes, created_at, updated_at',
        )
        .eq('tenant_id', input.tenantId)
        .eq('id', input.purchaseOrderId)
        .maybeSingle<PurchaseOrderRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'purchase_order_lookup_failed',
            'Unable to load the requested purchase order.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'purchase_order_not_found',
            'The requested purchase order was not found for the active tenant.',
            input,
        );
    }

    return data;
}

async function getSalesOrderForTenant(
    client: SupabaseClient,
    input: { tenantId: string; salesOrderId: string },
): Promise<SalesOrderRecord> {
    const { data, error } = await client
        .from('sales_orders')
        .select(
            'id, tenant_id, order_number, warehouse_id, customer_name, customer_reference, status, order_date, shipped_date, notes, created_at, updated_at',
        )
        .eq('tenant_id', input.tenantId)
        .eq('id', input.salesOrderId)
        .maybeSingle<SalesOrderRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'sales_order_lookup_failed',
            'Unable to load the requested sales order.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'sales_order_not_found',
            'The requested sales order was not found for the active tenant.',
            input,
        );
    }

    return data;
}

async function getPurchaseOrderLineForTenant(
    client: SupabaseClient,
    input: { tenantId: string; purchaseOrderLineId: string },
): Promise<PurchaseOrderLineRecord> {
    const { data, error } = await client
        .from('purchase_order_lines')
        .select(
            'id, tenant_id, purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost, notes, created_at, updated_at',
        )
        .eq('tenant_id', input.tenantId)
        .eq('id', input.purchaseOrderLineId)
        .maybeSingle<PurchaseOrderLineRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'purchase_order_line_lookup_failed',
            'Unable to load the requested purchase order line.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'purchase_order_line_not_found',
            'The requested purchase order line was not found for the active tenant.',
            input,
        );
    }

    return data;
}

async function getSalesOrderLineForTenant(
    client: SupabaseClient,
    input: { tenantId: string; salesOrderLineId: string },
): Promise<SalesOrderLineRecord> {
    const { data, error } = await client
        .from('sales_order_lines')
        .select(
            'id, tenant_id, sales_order_id, product_id, quantity_ordered, quantity_shipped, unit_price, cost_basis_total, notes, created_at, updated_at',
        )
        .eq('tenant_id', input.tenantId)
        .eq('id', input.salesOrderLineId)
        .maybeSingle<SalesOrderLineRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'sales_order_line_lookup_failed',
            'Unable to load the requested sales order line.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'sales_order_line_not_found',
            'The requested sales order line was not found for the active tenant.',
            input,
        );
    }

    return data;
}

async function listPurchaseOrderLinesForOrder(
    client: SupabaseClient,
    input: { tenantId: string; purchaseOrderId: string },
): Promise<PurchaseOrderLineRecord[]> {
    const { data, error } = await client
        .from('purchase_order_lines')
        .select(
            'id, tenant_id, purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost, notes, created_at, updated_at',
        )
        .eq('tenant_id', input.tenantId)
        .eq('purchase_order_id', input.purchaseOrderId)
        .order('created_at', { ascending: true });

    if (error) {
        throw new FunctionError(
            500,
            'purchase_order_lines_lookup_failed',
            'Unable to load purchase order lines.',
            error.message,
        );
    }

    return data ?? [];
}

async function listSalesOrderLinesForOrder(
    client: SupabaseClient,
    input: { tenantId: string; salesOrderId: string },
): Promise<SalesOrderLineRecord[]> {
    const { data, error } = await client
        .from('sales_order_lines')
        .select(
            'id, tenant_id, sales_order_id, product_id, quantity_ordered, quantity_shipped, unit_price, cost_basis_total, notes, created_at, updated_at',
        )
        .eq('tenant_id', input.tenantId)
        .eq('sales_order_id', input.salesOrderId)
        .order('created_at', { ascending: true });

    if (error) {
        throw new FunctionError(
            500,
            'sales_order_lines_lookup_failed',
            'Unable to load sales order lines.',
            error.message,
        );
    }

    return data ?? [];
}

function purchaseLineSignature(line: {
    product_id: string;
    quantity_ordered: number;
    unit_cost: number | null;
    note: string | null;
}): string {
    return JSON.stringify([
        line.product_id,
        line.quantity_ordered,
        line.unit_cost,
        line.note,
    ]);
}

function salesLineSignature(line: {
    product_id: string;
    quantity_ordered: number;
    unit_price: number | null;
    note: string | null;
}): string {
    return JSON.stringify([
        line.product_id,
        line.quantity_ordered,
        line.unit_price,
        line.note,
    ]);
}

function validatePurchaseLineMutation(
    existingLines: PurchaseOrderLineRecord[],
    nextLines: PurchaseOrderLineInput[],
): void {
    const nextSignatures = new Set(nextLines.map((line) => purchaseLineSignature(line)));

    for (const line of existingLines) {
        if (line.quantity_received <= 0) {
            continue;
        }

        if (!nextSignatures.has(purchaseLineSignature({
            product_id: line.product_id,
            quantity_ordered: line.quantity_ordered,
            unit_cost: line.unit_cost,
            note: line.notes,
        }))) {
            throw new FunctionError(
                409,
                'purchase_order_line_locked_after_receipt',
                'Received purchase order lines cannot be deleted or changed.',
                {
                    purchase_order_line_id: line.id,
                    quantity_received: line.quantity_received,
                },
            );
        }
    }
}

function validateSalesLineMutation(
    existingLines: SalesOrderLineRecord[],
    nextLines: SalesOrderLineInput[],
): void {
    const nextSignatures = new Set(nextLines.map((line) => salesLineSignature(line)));

    for (const line of existingLines) {
        if (line.quantity_shipped <= 0) {
            continue;
        }

        if (!nextSignatures.has(salesLineSignature({
            product_id: line.product_id,
            quantity_ordered: line.quantity_ordered,
            unit_price: line.unit_price,
            note: line.notes,
        }))) {
            throw new FunctionError(
                409,
                'sales_order_line_locked_after_shipment',
                'Shipped sales order lines cannot be deleted or changed.',
                {
                    sales_order_line_id: line.id,
                    quantity_shipped: line.quantity_shipped,
                },
            );
        }
    }
}

async function replacePurchaseOrderLines(
    client: SupabaseClient,
    input: {
        tenantId: string;
        purchaseOrderId: string;
        existingLines: PurchaseOrderLineRecord[];
        lines: PurchaseOrderLineInput[];
    },
): Promise<void> {
    validatePurchaseLineMutation(input.existingLines, input.lines);

    if (input.existingLines.some((line) => line.quantity_received > 0)) {
        return;
    }

    const existingIds = input.existingLines.map((line) => line.id);

    if (existingIds.length > 0) {
        const { error } = await client
            .from('purchase_order_lines')
            .delete()
            .eq('tenant_id', input.tenantId)
            .eq('purchase_order_id', input.purchaseOrderId);

        if (error) {
            throw new FunctionError(
                500,
                'purchase_order_line_delete_failed',
                'Unable to replace purchase order lines.',
                error.message,
            );
        }
    }

    if (input.lines.length === 0) {
        return;
    }

    const { error } = await client.from('purchase_order_lines').insert(
        input.lines.map((line) => ({
            tenant_id: input.tenantId,
            purchase_order_id: input.purchaseOrderId,
            product_id: line.product_id,
            quantity_ordered: line.quantity_ordered,
            unit_cost: line.unit_cost,
            notes: line.note,
        })),
    );

    if (error) {
        throw new FunctionError(
            500,
            'purchase_order_line_insert_failed',
            'Unable to write purchase order lines.',
            error.message,
        );
    }
}

async function replaceSalesOrderLines(
    client: SupabaseClient,
    input: {
        tenantId: string;
        salesOrderId: string;
        existingLines: SalesOrderLineRecord[];
        lines: SalesOrderLineInput[];
    },
): Promise<void> {
    validateSalesLineMutation(input.existingLines, input.lines);

    if (input.existingLines.some((line) => line.quantity_shipped > 0)) {
        return;
    }

    if (input.existingLines.length > 0) {
        const { error } = await client
            .from('sales_order_lines')
            .delete()
            .eq('tenant_id', input.tenantId)
            .eq('sales_order_id', input.salesOrderId);

        if (error) {
            throw new FunctionError(
                500,
                'sales_order_line_delete_failed',
                'Unable to replace sales order lines.',
                error.message,
            );
        }
    }

    if (input.lines.length === 0) {
        return;
    }

    const { error } = await client.from('sales_order_lines').insert(
        input.lines.map((line) => ({
            tenant_id: input.tenantId,
            sales_order_id: input.salesOrderId,
            product_id: line.product_id,
            quantity_ordered: line.quantity_ordered,
            unit_price: line.unit_price,
            notes: line.note,
        })),
    );

    if (error) {
        throw new FunctionError(
            500,
            'sales_order_line_insert_failed',
            'Unable to write sales order lines.',
            error.message,
        );
    }
}

async function createPurchaseOrder(
    client: SupabaseClient,
    tenantId: string,
    input: CreatePurchaseOrderInput,
): Promise<Record<string, unknown>> {
    await assertWarehouseInTenant(client, {
        tenantId,
        warehouseId: input.warehouse_id,
    });

    const { data, error } = await client
        .from('purchase_orders')
        .insert({
            tenant_id: tenantId,
            order_number: input.order_number,
            warehouse_id: input.warehouse_id,
            supplier_name: input.supplier_name,
            supplier_reference: input.supplier_reference,
            order_date: input.order_date,
            expected_date: input.expected_date,
            notes: input.note,
        })
        .select(
            'id, tenant_id, order_number, warehouse_id, supplier_name, supplier_reference, status, order_date, expected_date, received_date, notes, created_at, updated_at',
        )
        .maybeSingle<PurchaseOrderRecord>();

    if (error || !data) {
        throw new FunctionError(
            500,
            'create_purchase_order_failed',
            'Unable to create the purchase order.',
            error?.message ?? null,
        );
    }

    await replacePurchaseOrderLines(client, {
        tenantId,
        purchaseOrderId: data.id,
        existingLines: [],
        lines: input.lines,
    });

    return {
        purchaseOrderId: data.id,
        status: data.status,
        lineCount: input.lines.length,
    };
}

async function updatePurchaseOrder(
    client: SupabaseClient,
    tenantId: string,
    input: UpdatePurchaseOrderInput,
): Promise<Record<string, unknown>> {
    const order = await getPurchaseOrderForTenant(client, {
        tenantId,
        purchaseOrderId: input.purchase_order_id,
    });

    if (order.status === 'cancelled') {
        throw new FunctionError(
            409,
            'purchase_order_cancelled',
            'Cancelled purchase orders cannot be updated.',
            { purchase_order_id: order.id },
        );
    }

    await assertWarehouseInTenant(client, {
        tenantId,
        warehouseId: input.warehouse_id,
    });

    const existingLines = await listPurchaseOrderLinesForOrder(client, {
        tenantId,
        purchaseOrderId: order.id,
    });

    const { error } = await client
        .from('purchase_orders')
        .update({
            order_number: input.order_number,
            warehouse_id: input.warehouse_id,
            supplier_name: input.supplier_name,
            supplier_reference: input.supplier_reference,
            order_date: input.order_date,
            expected_date: input.expected_date,
            notes: input.note,
        })
        .eq('tenant_id', tenantId)
        .eq('id', order.id);

    if (error) {
        throw new FunctionError(
            500,
            'update_purchase_order_failed',
            'Unable to update the purchase order.',
            error.message,
        );
    }

    await replacePurchaseOrderLines(client, {
        tenantId,
        purchaseOrderId: order.id,
        existingLines,
        lines: input.lines,
    });

    return {
        purchaseOrderId: order.id,
        updated: true,
    };
}

async function confirmPurchaseOrder(
    client: SupabaseClient,
    tenantId: string,
    input: ConfirmPurchaseOrderInput,
): Promise<Record<string, unknown>> {
    const order = await getPurchaseOrderForTenant(client, {
        tenantId,
        purchaseOrderId: input.purchase_order_id,
    });

    if (order.status === 'cancelled') {
        throw new FunctionError(
            409,
            'purchase_order_cancelled',
            'Cancelled purchase orders cannot be confirmed.',
            { purchase_order_id: order.id },
        );
    }

    const { error } = await client
        .from('purchase_orders')
        .update({
            status: 'confirmed',
        })
        .eq('tenant_id', tenantId)
        .eq('id', order.id);

    if (error) {
        throw new FunctionError(
            500,
            'confirm_purchase_order_failed',
            'Unable to confirm the purchase order.',
            error.message,
        );
    }

    return {
        purchaseOrderId: order.id,
        status: 'confirmed',
    };
}

async function receivePurchaseOrderLine(
    client: SupabaseClient,
    tenantId: string,
    input: ReceivePurchaseOrderLineInput,
): Promise<Record<string, unknown>> {
    ensurePositiveQuantity(
        input.quantity_received,
        'invalid_purchase_receipt_quantity',
        'quantity_received must be greater than zero.',
    );

    const line = await getPurchaseOrderLineForTenant(client, {
        tenantId,
        purchaseOrderLineId: input.purchase_order_line_id,
    });
    const order = await getPurchaseOrderForTenant(client, {
        tenantId,
        purchaseOrderId: line.purchase_order_id,
    });
    const shelf = await getShelfForTenant(client, {
        tenantId,
        shelfId: input.shelf_id,
    });

    if (shelf.warehouse_id !== order.warehouse_id) {
        throw new FunctionError(
            400,
            'purchase_receipt_shelf_warehouse_mismatch',
            'The destination shelf must belong to the purchase order warehouse.',
            {
                shelf_id: shelf.id,
                purchase_order_id: order.id,
                warehouse_id: order.warehouse_id,
            },
        );
    }

    const { data, error } = await client.rpc('apply_purchase_order_receipt', {
        p_purchase_order_line_id: input.purchase_order_line_id,
        p_shelf_id: input.shelf_id,
        p_quantity_received: input.quantity_received,
        p_received_at: input.received_at,
        p_lot_reference: input.lot_reference,
        p_supplier_reference: input.supplier_reference,
        p_reason: 'receipt',
        p_note: input.note,
    });

    if (error) {
        throw new FunctionError(
            500,
            'apply_purchase_order_receipt_failed',
            'Unable to receive stock for the purchase order line.',
            error.message,
        );
    }

    return {
        purchaseOrderLineId: input.purchase_order_line_id,
        entry_type: 'receipt',
        receipt: data,
    };
}

async function createSalesOrder(
    client: SupabaseClient,
    tenantId: string,
    input: CreateSalesOrderInput,
): Promise<Record<string, unknown>> {
    await assertWarehouseInTenant(client, {
        tenantId,
        warehouseId: input.warehouse_id,
    });

    const { data, error } = await client
        .from('sales_orders')
        .insert({
            tenant_id: tenantId,
            order_number: input.order_number,
            warehouse_id: input.warehouse_id,
            customer_name: input.customer_name,
            customer_reference: input.customer_reference,
            order_date: input.order_date,
            notes: input.note,
        })
        .select(
            'id, tenant_id, order_number, warehouse_id, customer_name, customer_reference, status, order_date, shipped_date, notes, created_at, updated_at',
        )
        .maybeSingle<SalesOrderRecord>();

    if (error || !data) {
        throw new FunctionError(
            500,
            'create_sales_order_failed',
            'Unable to create the sales order.',
            error?.message ?? null,
        );
    }

    await replaceSalesOrderLines(client, {
        tenantId,
        salesOrderId: data.id,
        existingLines: [],
        lines: input.lines,
    });

    return {
        salesOrderId: data.id,
        status: data.status,
        lineCount: input.lines.length,
    };
}

async function updateSalesOrder(
    client: SupabaseClient,
    tenantId: string,
    input: UpdateSalesOrderInput,
): Promise<Record<string, unknown>> {
    const order = await getSalesOrderForTenant(client, {
        tenantId,
        salesOrderId: input.sales_order_id,
    });

    if (order.status === 'cancelled') {
        throw new FunctionError(
            409,
            'sales_order_cancelled',
            'Cancelled sales orders cannot be updated.',
            { sales_order_id: order.id },
        );
    }

    await assertWarehouseInTenant(client, {
        tenantId,
        warehouseId: input.warehouse_id,
    });

    const existingLines = await listSalesOrderLinesForOrder(client, {
        tenantId,
        salesOrderId: order.id,
    });

    const { error } = await client
        .from('sales_orders')
        .update({
            order_number: input.order_number,
            warehouse_id: input.warehouse_id,
            customer_name: input.customer_name,
            customer_reference: input.customer_reference,
            order_date: input.order_date,
            notes: input.note,
        })
        .eq('tenant_id', tenantId)
        .eq('id', order.id);

    if (error) {
        throw new FunctionError(
            500,
            'update_sales_order_failed',
            'Unable to update the sales order.',
            error.message,
        );
    }

    await replaceSalesOrderLines(client, {
        tenantId,
        salesOrderId: order.id,
        existingLines,
        lines: input.lines,
    });

    return {
        salesOrderId: order.id,
        updated: true,
    };
}

async function confirmSalesOrder(
    client: SupabaseClient,
    tenantId: string,
    input: ConfirmSalesOrderInput,
): Promise<Record<string, unknown>> {
    const order = await getSalesOrderForTenant(client, {
        tenantId,
        salesOrderId: input.sales_order_id,
    });

    if (order.status === 'cancelled') {
        throw new FunctionError(
            409,
            'sales_order_cancelled',
            'Cancelled sales orders cannot be confirmed.',
            { sales_order_id: order.id },
        );
    }

    const { error } = await client
        .from('sales_orders')
        .update({
            status: 'confirmed',
        })
        .eq('tenant_id', tenantId)
        .eq('id', order.id);

    if (error) {
        throw new FunctionError(
            500,
            'confirm_sales_order_failed',
            'Unable to confirm the sales order.',
            error.message,
        );
    }

    return {
        salesOrderId: order.id,
        status: 'confirmed',
    };
}

async function buildShipmentPreview(
    client: SupabaseClient,
    tenantId: string,
    input: ShipSalesOrderLineInput,
): Promise<{
    productName: string;
    line: SalesOrderLineRecord;
    order: SalesOrderRecord;
    lots: Array<{
        stockLotId: string;
        lotReference: string | null;
        receivedAt: string;
        quantityAvailable: number;
        quantityConsumed: number;
        unitCost: number | null;
    }>;
    totalCost: number | null;
    remainingDemand: number;
}> {
    const line = await getSalesOrderLineForTenant(client, {
        tenantId,
        salesOrderLineId: input.sales_order_line_id,
    });
    const order = await getSalesOrderForTenant(client, {
        tenantId,
        salesOrderId: line.sales_order_id,
    });
    const product = await getProductForTenant(client, {
        tenantId,
        productId: line.product_id,
    });
    const { data: stockLots, error: stockLotsError } = await client
        .from('stock_lots')
        .select(
            'id, tenant_id, product_id, shelf_id, quantity_on_hand, received_at, unit_cost, lot_reference',
        )
        .eq('tenant_id', tenantId)
        .eq('product_id', line.product_id)
        .order('received_at', { ascending: true });

    if (stockLotsError) {
        throw new FunctionError(
            500,
            'shipment_stock_lot_lookup_failed',
            'Unable to load shipment candidate lots.',
            stockLotsError.message,
        );
    }

    const { data: shelves, error: shelvesError } = await client
        .from('shelves')
        .select('id, tenant_id, warehouse_id')
        .eq('tenant_id', tenantId)
        .eq('warehouse_id', order.warehouse_id);

    if (shelvesError) {
        throw new FunctionError(
            500,
            'shipment_shelf_lookup_failed',
            'Unable to load warehouse shelves for shipment.',
            shelvesError.message,
        );
    }

    const shelfIds = new Set((shelves ?? []).map((shelf) => shelf.id));
    const candidateLots = (stockLots ?? [])
        .filter((stockLot) => stockLot.quantity_on_hand > 0)
        .filter((stockLot) => shelfIds.has(stockLot.shelf_id))
        .sort((left, right) => left.received_at.localeCompare(right.received_at));
    const fifoResult = computeFifoConsumption(candidateLots, input.quantity_shipped);
    const candidateLotsById = new Map(candidateLots.map((lot) => [lot.id, lot]));

    return {
        productName: product.name,
        line,
        order,
        lots: fifoResult.consumed.map((slice) => {
            const lot = candidateLotsById.get(slice.stockLotId)!;

            return {
                stockLotId: lot.id,
                lotReference: lot.lot_reference,
                receivedAt: lot.received_at,
                quantityAvailable: lot.quantity_on_hand,
                quantityConsumed: slice.quantityConsumed,
                unitCost: slice.unitCost,
            };
        }),
        totalCost: fifoResult.totalCost,
        remainingDemand: fifoResult.remainingDemand,
    };
}

async function shipSalesOrderLine(
    client: SupabaseClient,
    tenantId: string,
    input: ShipSalesOrderLineInput,
): Promise<Record<string, unknown>> {
    ensurePositiveQuantity(
        input.quantity_shipped,
        'invalid_sales_shipment_quantity',
        'quantity_to_ship must be greater than zero.',
    );

    const preview = await buildShipmentPreview(client, tenantId, input);

    if (preview.remainingDemand > 0) {
        throw new FunctionError(
            400,
            'insufficient_stock_for_sales_order_line',
            `Insufficient stock for ${preview.productName}. Short by ${preview.remainingDemand} units.`,
            {
                productName: preview.productName,
                remainingDemand: preview.remainingDemand,
                lots: preview.lots,
            },
        );
    }

    const { data, error } = await client.rpc('apply_sales_order_shipment', {
        p_sales_order_line_id: input.sales_order_line_id,
        p_quantity_shipped: input.quantity_shipped,
        p_reason: 'shipment',
        p_note: input.note,
    });

    if (error) {
        throw new FunctionError(
            500,
            'apply_sales_order_shipment_failed',
            'Unable to ship stock for the sales order line.',
            error.message,
        );
    }

    return {
        salesOrderLineId: input.sales_order_line_id,
        entry_type: 'shipment',
        preview: {
            productName: preview.productName,
            lots: preview.lots,
            totalCost: preview.totalCost,
            remainingDemand: preview.remainingDemand,
        },
        shipment: data,
    };
}

async function cancelPurchaseOrder(
    client: SupabaseClient,
    tenantId: string,
    input: CancelPurchaseOrderInput,
): Promise<Record<string, unknown>> {
    await getPurchaseOrderForTenant(client, {
        tenantId,
        purchaseOrderId: input.purchase_order_id,
    });

    const lines = await listPurchaseOrderLinesForOrder(client, {
        tenantId,
        purchaseOrderId: input.purchase_order_id,
    });

    const progressedLine = lines.find((line) => line.quantity_received > 0);

    if (progressedLine) {
        throw new FunctionError(
            409,
            'purchase_order_has_receipts',
            'Purchase orders with received lines cannot be cancelled.',
            {
                purchase_order_line_id: progressedLine.id,
                quantity_received: progressedLine.quantity_received,
            },
        );
    }

    const note = [input.note, `Cancel reason: ${input.reason}`]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join('\n');
    const { error } = await client
        .from('purchase_orders')
        .update({
            status: 'cancelled',
            notes: note || null,
        })
        .eq('tenant_id', tenantId)
        .eq('id', input.purchase_order_id);

    if (error) {
        throw new FunctionError(
            500,
            'cancel_purchase_order_failed',
            'Unable to cancel the purchase order.',
            error.message,
        );
    }

    return {
        purchaseOrderId: input.purchase_order_id,
        status: 'cancelled',
    };
}

async function cancelSalesOrder(
    client: SupabaseClient,
    tenantId: string,
    input: CancelSalesOrderInput,
): Promise<Record<string, unknown>> {
    await getSalesOrderForTenant(client, {
        tenantId,
        salesOrderId: input.sales_order_id,
    });

    const lines = await listSalesOrderLinesForOrder(client, {
        tenantId,
        salesOrderId: input.sales_order_id,
    });

    const progressedLine = lines.find((line) => line.quantity_shipped > 0);

    if (progressedLine) {
        throw new FunctionError(
            409,
            'sales_order_has_shipments',
            'Sales orders with shipped lines cannot be cancelled.',
            {
                sales_order_line_id: progressedLine.id,
                quantity_shipped: progressedLine.quantity_shipped,
            },
        );
    }

    const note = [input.note, `Cancel reason: ${input.reason}`]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join('\n');
    const { error } = await client
        .from('sales_orders')
        .update({
            status: 'cancelled',
            notes: note || null,
        })
        .eq('tenant_id', tenantId)
        .eq('id', input.sales_order_id);

    if (error) {
        throw new FunctionError(
            500,
            'cancel_sales_order_failed',
            'Unable to cancel the sales order.',
            error.message,
        );
    }

    return {
        salesOrderId: input.sales_order_id,
        status: 'cancelled',
    };
}

async function routeInventoryOrdersAction(request: Request): Promise<Response> {
    requireMethod(request, ['POST']);

    const caller = await requireBackendUser(request);
    const tenantId = requireActiveTenant({ headers: request.headers });

    await requireTenantMembership(caller.client, {
        tenantId,
        userId: caller.user.id,
    });

    const adminClient = createAdminClient();
    const body = await readJson<InventoryOrdersActionRequest>(request);

    switch (body.action) {
        case 'createPurchaseOrder':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await createPurchaseOrder(adminClient, tenantId, body.input),
                },
            }, { status: 201 });
        case 'updatePurchaseOrder':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await updatePurchaseOrder(adminClient, tenantId, body.input),
                },
            });
        case 'confirmPurchaseOrder':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await confirmPurchaseOrder(adminClient, tenantId, body.input),
                },
            });
        case 'receivePurchaseOrderLine':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await receivePurchaseOrderLine(adminClient, tenantId, body.input),
                },
            });
        case 'createSalesOrder':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await createSalesOrder(adminClient, tenantId, body.input),
                },
            }, { status: 201 });
        case 'updateSalesOrder':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await updateSalesOrder(adminClient, tenantId, body.input),
                },
            });
        case 'confirmSalesOrder':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await confirmSalesOrder(adminClient, tenantId, body.input),
                },
            });
        case 'shipSalesOrderLine':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await shipSalesOrderLine(adminClient, tenantId, body.input),
                },
            });
        case 'cancelPurchaseOrder':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await cancelPurchaseOrder(adminClient, tenantId, body.input),
                },
            });
        case 'cancelSalesOrder':
            return json({
                data: {
                    tenantId,
                    action: body.action,
                    result: await cancelSalesOrder(adminClient, tenantId, body.input),
                },
            });
        default:
            throw new FunctionError(
                400,
                'invalid_action',
                'Unsupported inventory orders action.',
                body,
            );
    }
}

Deno.serve(async (request: Request) => {
    try {
        return await routeInventoryOrdersAction(request);
    } catch (error) {
        return errorResponse(error);
    }
});
