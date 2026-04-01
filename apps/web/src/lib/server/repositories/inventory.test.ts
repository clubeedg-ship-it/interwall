import { describe, expect, it } from 'vitest';

import type {
    InventoryZoneRow,
    ProductRow,
    ProductUpsertInput,
    ShelfRow,
    ShelfUpsertInput,
    StockLotRow,
    WarehouseRow,
    WarehouseUpsertInput,
} from '@interwall/shared';

import {
    getProductByBarcodeOrSku,
    listProducts,
    listStockLotsByShelf,
    upsertWarehouseTree,
} from './inventory';

type TableName =
    | 'products'
    | 'warehouses'
    | 'inventory_zones'
    | 'shelves'
    | 'stock_lots';

type RowMap = {
    products: ProductRow;
    warehouses: WarehouseRow;
    inventory_zones: InventoryZoneRow;
    shelves: ShelfRow;
    stock_lots: StockLotRow;
};

type RecordedUpsert = {
    table: TableName;
    values: unknown[];
    onConflict?: string;
};

function compareValues(
    actual: unknown,
    expected: unknown,
): boolean {
    if (actual instanceof Date && expected instanceof Date) {
        return actual.getTime() === expected.getTime();
    }

    return actual === expected;
}

function createInventoryClient(fixtures: {
    products?: ProductRow[];
    warehouses?: WarehouseRow[];
    inventory_zones?: InventoryZoneRow[];
    shelves?: ShelfRow[];
    stock_lots?: StockLotRow[];
}) {
    const rows: {
        [Key in TableName]: RowMap[Key][];
    } = {
        products: fixtures.products ?? [],
        warehouses: fixtures.warehouses ?? [],
        inventory_zones: fixtures.inventory_zones ?? [],
        shelves: fixtures.shelves ?? [],
        stock_lots: fixtures.stock_lots ?? [],
    };

    const recordedUpserts: RecordedUpsert[] = [];

    return {
        recordedUpserts,
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
                        in(column: string, values: unknown[]) {
                            filters.push({
                                column,
                                value: values,
                            });
                            return builder;
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
                upsert(values: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
                    const normalizedValues = (
                        Array.isArray(values) ? values : [values]
                    ) as unknown as RowMap[Table][];

                    recordedUpserts.push({
                        table,
                        values: normalizedValues,
                        onConflict: options?.onConflict,
                    });

                    return {
                        select() {
                            return Promise.resolve({
                                data: normalizedValues,
                                error: null,
                            });
                        },
                    };
                },
            };
        },
    };
}

describe('inventory repositories', () => {
    const tenantId = 'tenant-1';

    it('listProducts scopes queries by tenant and returns deterministically sorted rows', async () => {
        const client = createInventoryClient({
            products: [
                {
                    id: 'product-z',
                    tenant_id: tenantId,
                    sku: 'SKU-200',
                    barcode: null,
                    name: 'Zulu',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 10,
                    safety_stock: 2,
                    lead_time_days: 7,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: null,
                    tracking_mode: 'none',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
                {
                    id: 'product-a',
                    tenant_id: tenantId,
                    sku: 'SKU-100',
                    barcode: null,
                    name: 'Alpha',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 4,
                    safety_stock: 1,
                    lead_time_days: 3,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: null,
                    tracking_mode: 'lot',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
                {
                    id: 'product-other',
                    tenant_id: 'tenant-2',
                    sku: 'SKU-001',
                    barcode: null,
                    name: 'Other',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 1,
                    safety_stock: 0,
                    lead_time_days: 1,
                    reorder_enabled: false,
                    preferred_storage_note: null,
                    default_cost_basis: null,
                    tracking_mode: 'none',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
        });

        await expect(listProducts(client, { tenantId })).resolves.toEqual([
            expect.objectContaining({ id: 'product-a', sku: 'SKU-100' }),
            expect.objectContaining({ id: 'product-z', sku: 'SKU-200' }),
        ]);
    });

    it('upsertWarehouseTree writes warehouses, zones, and shelves with parent ids and sort fields', async () => {
        const client = createInventoryClient({});
        const warehouse: WarehouseUpsertInput = {
            name: 'Main Warehouse',
            display_code: 'MAIN',
            sort_order: 10,
            is_active: true,
            notes: 'Primary location',
        };
        const zone = {
            label: 'A',
            display_code: 'A',
            sort_order: 20,
            is_active: true,
            notes: null,
        };
        const shelf: Omit<ShelfUpsertInput, 'warehouse_id' | 'zone_id'> = {
            label: 'A-01-01',
            column_position: 1,
            level_position: 1,
            display_code: 'A-01-01',
            sort_order: 30,
            capacity_units: 100,
            reorder_display_threshold: 15,
            is_active: true,
            notes: 'Fast pick shelf',
        };

        await upsertWarehouseTree(client, {
            tenantId,
            warehouseId: 'warehouse-1',
            warehouse,
            zones: [
                {
                    zoneId: 'zone-1',
                    zone,
                    shelves: [
                        {
                            shelfId: 'shelf-1',
                            shelf,
                        },
                    ],
                },
            ],
        });

        expect(client.recordedUpserts).toEqual([
            {
                table: 'warehouses',
                values: [
                    expect.objectContaining({
                        id: 'warehouse-1',
                        tenant_id: tenantId,
                        name: 'Main Warehouse',
                        sort_order: 10,
                    }),
                ],
                onConflict: 'id',
            },
            {
                table: 'inventory_zones',
                values: [
                    expect.objectContaining({
                        id: 'zone-1',
                        tenant_id: tenantId,
                        warehouse_id: 'warehouse-1',
                        label: 'A',
                        sort_order: 20,
                    }),
                ],
                onConflict: 'id',
            },
            {
                table: 'shelves',
                values: [
                    expect.objectContaining({
                        id: 'shelf-1',
                        tenant_id: tenantId,
                        warehouse_id: 'warehouse-1',
                        zone_id: 'zone-1',
                        display_code: 'A-01-01',
                        sort_order: 30,
                    }),
                ],
                onConflict: 'id',
            },
        ]);
    });

    it('listStockLotsByShelf only returns rows for the active tenant and selected shelf', async () => {
        const client = createInventoryClient({
            stock_lots: [
                {
                    id: 'lot-1',
                    tenant_id: tenantId,
                    product_id: 'product-1',
                    shelf_id: 'shelf-1',
                    original_quantity: 10,
                    quantity_on_hand: 8,
                    received_at: '2026-04-01T00:00:00.000Z',
                    unit_cost: 1.25,
                    lot_reference: 'LOT-001',
                    supplier_reference: 'SUP-001',
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
                {
                    id: 'lot-2',
                    tenant_id: tenantId,
                    product_id: 'product-2',
                    shelf_id: 'shelf-2',
                    original_quantity: 10,
                    quantity_on_hand: 10,
                    received_at: '2026-04-01T00:00:00.000Z',
                    unit_cost: 1.25,
                    lot_reference: 'LOT-002',
                    supplier_reference: 'SUP-001',
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
                {
                    id: 'lot-3',
                    tenant_id: 'tenant-2',
                    product_id: 'product-3',
                    shelf_id: 'shelf-1',
                    original_quantity: 10,
                    quantity_on_hand: 10,
                    received_at: '2026-04-01T00:00:00.000Z',
                    unit_cost: 1.25,
                    lot_reference: 'LOT-003',
                    supplier_reference: 'SUP-001',
                    notes: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
        });

        await expect(
            listStockLotsByShelf(client, {
                tenantId,
                shelfId: 'shelf-1',
            }),
        ).resolves.toEqual([
            expect.objectContaining({
                id: 'lot-1',
                shelf_id: 'shelf-1',
                tenant_id: tenantId,
            }),
        ]);
    });

    it('getProductByBarcodeOrSku finds a product by exact barcode match first', async () => {
        const client = createInventoryClient({
            products: [
                {
                    id: 'product-bc',
                    tenant_id: tenantId,
                    sku: 'SKU-300',
                    barcode: '9876543210',
                    name: 'Barcode Match',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 5,
                    safety_stock: 1,
                    lead_time_days: 3,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: null,
                    tracking_mode: 'lot',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
                {
                    id: 'product-sku',
                    tenant_id: tenantId,
                    sku: '9876543210',
                    barcode: null,
                    name: 'SKU Match',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 5,
                    safety_stock: 1,
                    lead_time_days: 3,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: null,
                    tracking_mode: 'none',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
        });

        const result = await getProductByBarcodeOrSku(client, {
            tenantId,
            code: '9876543210',
        });

        expect(result).toEqual(
            expect.objectContaining({ id: 'product-bc', name: 'Barcode Match' }),
        );
    });

    it('getProductByBarcodeOrSku falls back to SKU when no barcode match exists', async () => {
        const client = createInventoryClient({
            products: [
                {
                    id: 'product-sku-only',
                    tenant_id: tenantId,
                    sku: 'UNIQUE-SKU',
                    barcode: null,
                    name: 'SKU Only Product',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 5,
                    safety_stock: 1,
                    lead_time_days: 3,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: null,
                    tracking_mode: 'none',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
        });

        const result = await getProductByBarcodeOrSku(client, {
            tenantId,
            code: 'UNIQUE-SKU',
        });

        expect(result).toEqual(
            expect.objectContaining({ id: 'product-sku-only', name: 'SKU Only Product' }),
        );
    });

    it('getProductByBarcodeOrSku returns null when no match is found', async () => {
        const client = createInventoryClient({
            products: [
                {
                    id: 'product-nope',
                    tenant_id: tenantId,
                    sku: 'OTHER-SKU',
                    barcode: 'OTHER-BC',
                    name: 'Not a Match',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 5,
                    safety_stock: 1,
                    lead_time_days: 3,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: null,
                    tracking_mode: 'none',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
        });

        const result = await getProductByBarcodeOrSku(client, {
            tenantId,
            code: 'NO-MATCH',
        });

        expect(result).toBeNull();
    });

    it('getProductByBarcodeOrSku isolates results to the active tenant', async () => {
        const client = createInventoryClient({
            products: [
                {
                    id: 'product-other-tenant',
                    tenant_id: 'tenant-2',
                    sku: 'CROSS-TENANT',
                    barcode: 'CROSS-TENANT',
                    name: 'Other Tenant Product',
                    description: null,
                    unit_of_measure: 'ea',
                    reorder_point: 5,
                    safety_stock: 1,
                    lead_time_days: 3,
                    reorder_enabled: true,
                    preferred_storage_note: null,
                    default_cost_basis: null,
                    tracking_mode: 'none',
                    status: 'active',
                    archived_at: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                },
            ],
        });

        const result = await getProductByBarcodeOrSku(client, {
            tenantId,
            code: 'CROSS-TENANT',
        });

        expect(result).toBeNull();
    });

    it('repository helpers accept typed shared inventory payloads', async () => {
        const warehouse: WarehouseUpsertInput = {
            name: 'Overflow',
            display_code: 'OVR',
            sort_order: 1,
            is_active: true,
            notes: null,
        };
        const product: ProductUpsertInput = {
            sku: 'SKU-900',
            barcode: null,
            name: 'Bracket',
            description: null,
            unit_of_measure: 'ea',
            reorder_point: 12,
            safety_stock: 4,
            lead_time_days: 9,
            reorder_enabled: true,
            preferred_storage_note: null,
            default_cost_basis: 5.75,
            tracking_mode: 'lot',
            status: 'active',
        };

        expect(warehouse.display_code).toBe('OVR');
        expect(product.tracking_mode).toBe('lot');
    });
});
