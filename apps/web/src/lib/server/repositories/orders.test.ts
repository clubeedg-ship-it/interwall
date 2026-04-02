import { describe, expect, it } from 'vitest';

import type {
    ProductRow,
    PurchaseOrderLineRow,
    PurchaseOrderRow,
    ShelfRow,
    StockLotRow,
    WarehouseRow,
} from '@interwall/shared';

import {
    getPurchaseOrderDetail,
    getSalesOrderDetail,
    getShipmentPreview,
    listOrders,
} from './orders';

type SalesOrderLineRow = {
    id: string;
    tenant_id: string;
    sales_order_id: string;
    product_id: string;
    quantity_ordered: number;
    quantity_shipped: number;
    unit_price: number | null;
    cost_basis_total: number | null;
    note: string | null;
    created_at: string;
    updated_at: string;
};

type SalesOrderRow = {
    id: string;
    tenant_id: string;
    order_number: string;
    warehouse_id: string;
    customer_name: string | null;
    customer_reference: string | null;
    status: 'draft' | 'confirmed' | 'partially_shipped' | 'shipped' | 'cancelled';
    order_date: string;
    expected_date: string | null;
    shipped_date: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
};

type StockLedgerEntryRow = {
    id: string;
    tenant_id: string;
    stock_lot_id: string | null;
    product_id: string;
    shelf_id: string | null;
    entry_type: 'receipt' | 'shipment' | 'adjustment' | 'relocation';
    quantity_delta: number;
    unit_cost_at_time: number | null;
    purchase_order_id: string | null;
    purchase_order_line_id: string | null;
    sales_order_id: string | null;
    sales_order_line_id: string | null;
    reason: string;
    note: string | null;
    created_at: string;
};

type TableName =
    | 'products'
    | 'warehouses'
    | 'shelves'
    | 'stock_lots'
    | 'purchase_orders'
    | 'purchase_order_lines'
    | 'sales_orders'
    | 'sales_order_lines'
    | 'stock_ledger_entries';

type RowMap = {
    products: ProductRow;
    warehouses: WarehouseRow;
    shelves: ShelfRow;
    stock_lots: StockLotRow;
    purchase_orders: PurchaseOrderRow;
    purchase_order_lines: PurchaseOrderLineRow;
    sales_orders: SalesOrderRow;
    sales_order_lines: SalesOrderLineRow;
    stock_ledger_entries: StockLedgerEntryRow;
};

function compareValues(actual: unknown, expected: unknown): boolean {
    if (actual instanceof Date && expected instanceof Date) {
        return actual.getTime() === expected.getTime();
    }

    return actual === expected;
}

function createOrdersClient(fixtures: Partial<{ [Key in TableName]: RowMap[Key][] }>) {
    const rows: { [Key in TableName]: RowMap[Key][] } = {
        products: fixtures.products ?? [],
        warehouses: fixtures.warehouses ?? [],
        shelves: fixtures.shelves ?? [],
        stock_lots: fixtures.stock_lots ?? [],
        purchase_orders: fixtures.purchase_orders ?? [],
        purchase_order_lines: fixtures.purchase_order_lines ?? [],
        sales_orders: fixtures.sales_orders ?? [],
        sales_order_lines: fixtures.sales_order_lines ?? [],
        stock_ledger_entries: fixtures.stock_ledger_entries ?? [],
    };

    return {
        from<Table extends TableName>(table: Table) {
            const filters: Array<{ column: string; value: unknown }> = [];
            const orderBys: Array<{ column: string; ascending: boolean }> = [];

            return {
                select() {
                    const builder = {
                        eq(column: string, value: unknown) {
                            filters.push({ column, value });
                            return builder;
                        },
                        in(column: string, values: unknown[]) {
                            filters.push({ column, value: values });
                            return builder;
                        },
                        order(column: string, options?: { ascending?: boolean }) {
                            orderBys.push({
                                column,
                                ascending: options?.ascending ?? true,
                            });
                            return Promise.resolve({
                                data: runSelect(),
                                error: null,
                            });
                        },
                        single() {
                            return Promise.resolve({
                                data: runSelect()[0] ?? null,
                                error: null,
                            });
                        },
                        maybeSingle() {
                            return Promise.resolve({
                                data: runSelect()[0] ?? null,
                                error: null,
                            });
                        },
                    };

                    const runSelect = () => {
                        const filtered = rows[table].filter((row) =>
                            filters.every(({ column, value }) =>
                                Array.isArray(value)
                                    ? value.includes(row[column as keyof RowMap[Table]])
                                    : compareValues(
                                          row[column as keyof RowMap[Table]],
                                          value,
                                      ),
                            ),
                        );

                        return [...filtered].sort((left, right) => {
                            for (const { column, ascending } of orderBys) {
                                const leftValue = left[column as keyof RowMap[Table]];
                                const rightValue = right[column as keyof RowMap[Table]];

                                if (leftValue === rightValue) {
                                    continue;
                                }

                                if (leftValue == null) {
                                    return ascending ? -1 : 1;
                                }

                                if (rightValue == null) {
                                    return ascending ? 1 : -1;
                                }

                                if (leftValue < rightValue) {
                                    return ascending ? -1 : 1;
                                }

                                if (leftValue > rightValue) {
                                    return ascending ? 1 : -1;
                                }
                            }

                            return 0;
                        });
                    };

                    return builder;
                },
            };
        },
    };
}

describe('listOrders', () => {
    it('returns purchase and sales orders for the active tenant sorted by updated_at desc with workspace fields', async () => {
        const tenantId = 'tenant-1';
        const client = createOrdersClient({
            warehouses: [
                {
                    id: 'warehouse-1',
                    tenant_id: tenantId,
                    name: 'Main Warehouse',
                    display_code: 'MAIN',
                    sort_order: 1,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            purchase_orders: [
                {
                    id: 'purchase-1',
                    tenant_id: tenantId,
                    order_number: 'PO-001',
                    warehouse_id: 'warehouse-1',
                    supplier_name: 'Supplier A',
                    supplier_reference: 'SUP-A',
                    status: 'confirmed',
                    order_date: '2026-04-01',
                    expected_date: null,
                    received_date: null,
                    note: 'restock',
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-04T09:00:00.000Z',
                },
                {
                    id: 'purchase-other',
                    tenant_id: 'tenant-2',
                    order_number: 'PO-999',
                    warehouse_id: 'warehouse-1',
                    supplier_name: 'Other Supplier',
                    supplier_reference: null,
                    status: 'confirmed',
                    order_date: '2026-04-01',
                    expected_date: null,
                    received_date: null,
                    note: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-05T00:00:00.000Z',
                },
            ],
            purchase_order_lines: [
                {
                    id: 'purchase-line-1',
                    tenant_id: tenantId,
                    purchase_order_id: 'purchase-1',
                    product_id: 'product-1',
                    quantity_ordered: 10,
                    quantity_received: 4,
                    unit_cost: 2.5,
                    note: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            sales_orders: [
                {
                    id: 'sales-1',
                    tenant_id: tenantId,
                    order_number: 'SO-010',
                    warehouse_id: 'warehouse-1',
                    customer_name: 'Customer Z',
                    customer_reference: 'CUST-Z',
                    status: 'partially_shipped',
                    order_date: '2026-04-02',
                    expected_date: null,
                    shipped_date: null,
                    note: 'priority',
                    created_at: '2026-04-02T00:00:00.000Z',
                    updated_at: '2026-04-03T09:00:00.000Z',
                },
            ],
            sales_order_lines: [
                {
                    id: 'sales-line-1',
                    tenant_id: tenantId,
                    sales_order_id: 'sales-1',
                    product_id: 'product-1',
                    quantity_ordered: 8,
                    quantity_shipped: 3,
                    unit_price: 5,
                    cost_basis_total: 7.5,
                    note: null,
                    created_at: '2026-04-02T00:00:00.000Z',
                    updated_at: '2026-04-02T00:00:00.000Z',
                },
            ],
        });

        await expect(listOrders(client as never, { tenantId })).resolves.toEqual([
            {
                id: 'purchase-1',
                orderType: 'purchase',
                orderNumber: 'PO-001',
                counterpartyName: 'Supplier A',
                warehouseName: 'Main Warehouse',
                status: 'confirmed',
                orderDate: '2026-04-01',
                outstandingQuantity: 6,
                valueSummary: '$25.00 ordered',
                nextAction: 'Receive stock',
            },
            {
                id: 'sales-1',
                orderType: 'sales',
                orderNumber: 'SO-010',
                counterpartyName: 'Customer Z',
                warehouseName: 'Main Warehouse',
                status: 'partially_shipped',
                orderDate: '2026-04-02',
                outstandingQuantity: 5,
                valueSummary: '$40.00 ordered',
                nextAction: 'Ship items',
            },
        ]);
    });
});

describe('getOrderDetail', () => {
    it('returns purchase order line items and ledger entries without leaking another tenant row', async () => {
        const tenantId = 'tenant-1';
        const client = createOrdersClient({
            products: [
                {
                    id: 'product-1',
                    tenant_id: tenantId,
                    sku: 'SKU-1',
                    barcode: null,
                    name: 'Widget',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 10,
                    safety_stock: 2,
                    lead_time_days: 7,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: 2.5,
                    tracking_mode: 'lot',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            warehouses: [
                {
                    id: 'warehouse-1',
                    tenant_id: tenantId,
                    name: 'Main Warehouse',
                    display_code: 'MAIN',
                    sort_order: 1,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            purchase_orders: [
                {
                    id: 'purchase-1',
                    tenant_id: tenantId,
                    order_number: 'PO-001',
                    warehouse_id: 'warehouse-1',
                    supplier_name: 'Supplier A',
                    supplier_reference: 'SUP-A',
                    status: 'partially_received',
                    order_date: '2026-04-01',
                    expected_date: '2026-04-05',
                    received_date: null,
                    note: 'restock',
                    created_at: '2026-04-01T08:00:00.000Z',
                    updated_at: '2026-04-04T09:00:00.000Z',
                },
            ],
            purchase_order_lines: [
                {
                    id: 'purchase-line-1',
                    tenant_id: tenantId,
                    purchase_order_id: 'purchase-1',
                    product_id: 'product-1',
                    quantity_ordered: 10,
                    quantity_received: 4,
                    unit_cost: 2.5,
                    note: 'blue batch',
                    created_at: '2026-04-01T08:00:00.000Z',
                    updated_at: '2026-04-04T09:00:00.000Z',
                },
            ],
            stock_lots: [
                {
                    id: 'lot-1',
                    tenant_id: tenantId,
                    product_id: 'product-1',
                    shelf_id: 'shelf-1',
                    original_quantity: 4,
                    quantity_on_hand: 4,
                    received_at: '2026-04-03T10:00:00.000Z',
                    unit_cost: 2.5,
                    lot_reference: 'LOT-001',
                    supplier_reference: 'SUP-A',
                    notes: null,
                    created_at: '2026-04-03T10:00:00.000Z',
                    updated_at: '2026-04-03T10:00:00.000Z',
                },
            ],
            stock_ledger_entries: [
                {
                    id: 'ledger-1',
                    tenant_id: tenantId,
                    stock_lot_id: 'lot-1',
                    product_id: 'product-1',
                    shelf_id: 'shelf-1',
                    entry_type: 'receipt',
                    quantity_delta: 4,
                    unit_cost_at_time: 2.5,
                    purchase_order_id: 'purchase-1',
                    purchase_order_line_id: 'purchase-line-1',
                    sales_order_id: null,
                    sales_order_line_id: null,
                    reason: 'purchase_order_receipt',
                    note: 'received',
                    created_at: '2026-04-03T10:00:00.000Z',
                },
                {
                    id: 'ledger-other',
                    tenant_id: 'tenant-2',
                    stock_lot_id: 'lot-2',
                    product_id: 'product-1',
                    shelf_id: 'shelf-1',
                    entry_type: 'receipt',
                    quantity_delta: 99,
                    unit_cost_at_time: 1,
                    purchase_order_id: 'purchase-other',
                    purchase_order_line_id: 'purchase-line-other',
                    sales_order_id: null,
                    sales_order_line_id: null,
                    reason: 'foreign',
                    note: null,
                    created_at: '2026-04-04T10:00:00.000Z',
                },
            ],
        });

        await expect(
            getPurchaseOrderDetail(client as never, {
                tenantId,
                purchaseOrderId: 'purchase-1',
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                id: 'purchase-1',
                orderType: 'purchase',
                orderNumber: 'PO-001',
                warehouseName: 'Main Warehouse',
                lines: [
                    expect.objectContaining({
                        id: 'purchase-line-1',
                        productName: 'Widget',
                        quantityOrdered: 10,
                        quantityReceived: 4,
                        quantityShipped: 0,
                        outstandingQuantity: 6,
                        unitCost: 2.5,
                        unitPrice: null,
                    }),
                ],
                ledgerEntries: [
                    expect.objectContaining({
                        id: 'ledger-1',
                        entryType: 'receipt',
                        quantityDelta: 4,
                        lotReference: 'LOT-001',
                        orderNumber: 'PO-001',
                    }),
                ],
            }),
        );
    });

    it('returns sales order line items with chronological ledger entries for the active tenant only', async () => {
        const tenantId = 'tenant-1';
        const client = createOrdersClient({
            products: [
                {
                    id: 'product-1',
                    tenant_id: tenantId,
                    sku: 'SKU-1',
                    barcode: null,
                    name: 'Widget',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 10,
                    safety_stock: 2,
                    lead_time_days: 7,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: 2.5,
                    tracking_mode: 'lot',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            warehouses: [
                {
                    id: 'warehouse-1',
                    tenant_id: tenantId,
                    name: 'Main Warehouse',
                    display_code: 'MAIN',
                    sort_order: 1,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            sales_orders: [
                {
                    id: 'sales-1',
                    tenant_id: tenantId,
                    order_number: 'SO-001',
                    warehouse_id: 'warehouse-1',
                    customer_name: 'Customer A',
                    customer_reference: 'CUST-A',
                    status: 'confirmed',
                    order_date: '2026-04-02',
                    expected_date: null,
                    shipped_date: null,
                    note: 'rush',
                    created_at: '2026-04-02T08:00:00.000Z',
                    updated_at: '2026-04-02T09:00:00.000Z',
                },
            ],
            sales_order_lines: [
                {
                    id: 'sales-line-1',
                    tenant_id: tenantId,
                    sales_order_id: 'sales-1',
                    product_id: 'product-1',
                    quantity_ordered: 8,
                    quantity_shipped: 3,
                    unit_price: 5,
                    cost_basis_total: 7.5,
                    note: 'ship partial',
                    created_at: '2026-04-02T08:00:00.000Z',
                    updated_at: '2026-04-03T09:00:00.000Z',
                },
            ],
            stock_lots: [
                {
                    id: 'lot-1',
                    tenant_id: tenantId,
                    product_id: 'product-1',
                    shelf_id: 'shelf-1',
                    original_quantity: 10,
                    quantity_on_hand: 7,
                    received_at: '2026-04-01T08:00:00.000Z',
                    unit_cost: 2.5,
                    lot_reference: 'LOT-001',
                    supplier_reference: null,
                    notes: null,
                    created_at: '2026-04-01T08:00:00.000Z',
                    updated_at: '2026-04-03T09:00:00.000Z',
                },
            ],
            stock_ledger_entries: [
                {
                    id: 'ledger-2',
                    tenant_id: tenantId,
                    stock_lot_id: 'lot-1',
                    product_id: 'product-1',
                    shelf_id: 'shelf-1',
                    entry_type: 'shipment',
                    quantity_delta: -2,
                    unit_cost_at_time: 2.5,
                    purchase_order_id: null,
                    purchase_order_line_id: null,
                    sales_order_id: 'sales-1',
                    sales_order_line_id: 'sales-line-1',
                    reason: 'sales_order_shipment',
                    note: 'picked',
                    created_at: '2026-04-03T11:00:00.000Z',
                },
                {
                    id: 'ledger-1',
                    tenant_id: tenantId,
                    stock_lot_id: 'lot-1',
                    product_id: 'product-1',
                    shelf_id: 'shelf-1',
                    entry_type: 'shipment',
                    quantity_delta: -1,
                    unit_cost_at_time: 2.5,
                    purchase_order_id: null,
                    purchase_order_line_id: null,
                    sales_order_id: 'sales-1',
                    sales_order_line_id: 'sales-line-1',
                    reason: 'sales_order_shipment',
                    note: 'picked',
                    created_at: '2026-04-03T10:00:00.000Z',
                },
            ],
        });

        await expect(
            getSalesOrderDetail(client as never, {
                tenantId,
                salesOrderId: 'sales-1',
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                id: 'sales-1',
                orderType: 'sales',
                orderNumber: 'SO-001',
                lines: [
                    expect.objectContaining({
                        id: 'sales-line-1',
                        quantityOrdered: 8,
                        quantityShipped: 3,
                        outstandingQuantity: 5,
                        unitPrice: 5,
                    }),
                ],
                ledgerEntries: [
                    expect.objectContaining({ id: 'ledger-1' }),
                    expect.objectContaining({ id: 'ledger-2' }),
                ],
            }),
        );
    });
});

describe('getShipmentPreview', () => {
    it('limits candidate lots to the sales order warehouse, applies deterministic fifo order, and maps lotReference', async () => {
        const tenantId = 'tenant-1';
        const client = createOrdersClient({
            products: [
                {
                    id: 'product-1',
                    tenant_id: tenantId,
                    sku: 'SKU-1',
                    barcode: null,
                    name: 'Widget',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 10,
                    safety_stock: 2,
                    lead_time_days: 7,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: 2.5,
                    tracking_mode: 'lot',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            warehouses: [
                {
                    id: 'warehouse-1',
                    tenant_id: tenantId,
                    name: 'Main Warehouse',
                    display_code: 'MAIN',
                    sort_order: 1,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
                {
                    id: 'warehouse-2',
                    tenant_id: tenantId,
                    name: 'Overflow',
                    display_code: 'OVR',
                    sort_order: 2,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            shelves: [
                {
                    id: 'shelf-main',
                    tenant_id: tenantId,
                    warehouse_id: 'warehouse-1',
                    zone_id: 'zone-1',
                    label: 'A-01',
                    column_position: 1,
                    level_position: 1,
                    display_code: 'A-01',
                    sort_order: 1,
                    capacity_units: null,
                    reorder_display_threshold: null,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
                {
                    id: 'shelf-overflow',
                    tenant_id: tenantId,
                    warehouse_id: 'warehouse-2',
                    zone_id: 'zone-2',
                    label: 'B-01',
                    column_position: 1,
                    level_position: 1,
                    display_code: 'B-01',
                    sort_order: 1,
                    capacity_units: null,
                    reorder_display_threshold: null,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            sales_orders: [
                {
                    id: 'sales-1',
                    tenant_id: tenantId,
                    order_number: 'SO-001',
                    warehouse_id: 'warehouse-1',
                    customer_name: 'Customer A',
                    customer_reference: 'CUST-A',
                    status: 'confirmed',
                    order_date: '2026-04-02',
                    expected_date: null,
                    shipped_date: null,
                    note: null,
                    created_at: '2026-04-02T08:00:00.000Z',
                    updated_at: '2026-04-02T08:00:00.000Z',
                },
            ],
            sales_order_lines: [
                {
                    id: 'sales-line-1',
                    tenant_id: tenantId,
                    sales_order_id: 'sales-1',
                    product_id: 'product-1',
                    quantity_ordered: 8,
                    quantity_shipped: 0,
                    unit_price: 5,
                    cost_basis_total: null,
                    note: null,
                    created_at: '2026-04-02T08:00:00.000Z',
                    updated_at: '2026-04-02T08:00:00.000Z',
                },
            ],
            stock_lots: [
                {
                    id: 'lot-newest',
                    tenant_id: tenantId,
                    product_id: 'product-1',
                    shelf_id: 'shelf-main',
                    original_quantity: 8,
                    quantity_on_hand: 8,
                    received_at: '2026-04-03T10:00:00.000Z',
                    unit_cost: 3,
                    lot_reference: 'LOT-NEW',
                    supplier_reference: null,
                    notes: null,
                    created_at: '2026-04-03T10:00:00.000Z',
                    updated_at: '2026-04-03T10:00:00.000Z',
                },
                {
                    id: 'lot-oldest',
                    tenant_id: tenantId,
                    product_id: 'product-1',
                    shelf_id: 'shelf-main',
                    original_quantity: 5,
                    quantity_on_hand: 5,
                    received_at: '2026-04-01T08:00:00.000Z',
                    unit_cost: 2,
                    lot_reference: 'LOT-OLD',
                    supplier_reference: null,
                    notes: null,
                    created_at: '2026-04-01T08:00:00.000Z',
                    updated_at: '2026-04-01T08:00:00.000Z',
                },
                {
                    id: 'lot-other-warehouse',
                    tenant_id: tenantId,
                    product_id: 'product-1',
                    shelf_id: 'shelf-overflow',
                    original_quantity: 20,
                    quantity_on_hand: 20,
                    received_at: '2026-03-30T08:00:00.000Z',
                    unit_cost: 1,
                    lot_reference: 'LOT-OTHER',
                    supplier_reference: null,
                    notes: null,
                    created_at: '2026-03-30T08:00:00.000Z',
                    updated_at: '2026-03-30T08:00:00.000Z',
                },
            ],
        });

        await expect(
            getShipmentPreview(client as never, {
                tenantId,
                salesOrderLineId: 'sales-line-1',
                quantityShipped: 7,
            }),
        ).resolves.toEqual({
            lineItemId: 'sales-line-1',
            productId: 'product-1',
            requestedQuantity: 7,
            productName: 'Widget',
            totalCost: 16,
            remainingDemand: 0,
            shortfallMessage: null,
            lots: [
                {
                    stockLotId: 'lot-oldest',
                    lotReference: 'LOT-OLD',
                    receivedAt: '2026-04-01T08:00:00.000Z',
                    quantityAvailable: 5,
                    quantityConsumed: 5,
                    unitCost: 2,
                },
                {
                    stockLotId: 'lot-newest',
                    lotReference: 'LOT-NEW',
                    receivedAt: '2026-04-03T10:00:00.000Z',
                    quantityAvailable: 8,
                    quantityConsumed: 2,
                    unitCost: 3,
                },
            ],
        });
    });

    it('names the product and shortfall when the warehouse-scoped fifo pool cannot satisfy demand', async () => {
        const tenantId = 'tenant-1';
        const client = createOrdersClient({
            products: [
                {
                    id: 'product-1',
                    tenant_id: tenantId,
                    sku: 'SKU-1',
                    barcode: null,
                    name: 'Widget',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 10,
                    safety_stock: 2,
                    lead_time_days: 7,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: 2.5,
                    tracking_mode: 'lot',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            warehouses: [
                {
                    id: 'warehouse-1',
                    tenant_id: tenantId,
                    name: 'Main Warehouse',
                    display_code: 'MAIN',
                    sort_order: 1,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            shelves: [
                {
                    id: 'shelf-main',
                    tenant_id: tenantId,
                    warehouse_id: 'warehouse-1',
                    zone_id: 'zone-1',
                    label: 'A-01',
                    column_position: 1,
                    level_position: 1,
                    display_code: 'A-01',
                    sort_order: 1,
                    capacity_units: null,
                    reorder_display_threshold: null,
                    is_active: true,
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
            sales_orders: [
                {
                    id: 'sales-1',
                    tenant_id: tenantId,
                    order_number: 'SO-001',
                    warehouse_id: 'warehouse-1',
                    customer_name: 'Customer A',
                    customer_reference: 'CUST-A',
                    status: 'confirmed',
                    order_date: '2026-04-02',
                    expected_date: null,
                    shipped_date: null,
                    note: null,
                    created_at: '2026-04-02T08:00:00.000Z',
                    updated_at: '2026-04-02T08:00:00.000Z',
                },
            ],
            sales_order_lines: [
                {
                    id: 'sales-line-1',
                    tenant_id: tenantId,
                    sales_order_id: 'sales-1',
                    product_id: 'product-1',
                    quantity_ordered: 8,
                    quantity_shipped: 0,
                    unit_price: 5,
                    cost_basis_total: null,
                    note: null,
                    created_at: '2026-04-02T08:00:00.000Z',
                    updated_at: '2026-04-02T08:00:00.000Z',
                },
            ],
            stock_lots: [
                {
                    id: 'lot-1',
                    tenant_id: tenantId,
                    product_id: 'product-1',
                    shelf_id: 'shelf-main',
                    original_quantity: 3,
                    quantity_on_hand: 3,
                    received_at: '2026-04-01T08:00:00.000Z',
                    unit_cost: 2,
                    lot_reference: 'LOT-001',
                    supplier_reference: null,
                    notes: null,
                    created_at: '2026-04-01T08:00:00.000Z',
                    updated_at: '2026-04-01T08:00:00.000Z',
                },
            ],
        });

        await expect(
            getShipmentPreview(client as never, {
                tenantId,
                salesOrderLineId: 'sales-line-1',
                quantityShipped: 5,
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                productName: 'Widget',
                remainingDemand: 2,
                shortfallMessage: 'Insufficient stock for Widget. Short by 2 units.',
            }),
        );
    });
});
