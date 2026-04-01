import { describe, expect, it } from 'vitest';

import type {
    InventoryZoneRow,
    ProductRow,
    ShelfRow,
    StockLotRow,
    WarehouseRow,
} from '@interwall/shared';

import type { InventoryRepositoryClient } from './repositories/inventory';

import { getWallExperienceData } from './wall-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWarehouse(overrides?: Partial<WarehouseRow>): WarehouseRow {
    return {
        id: 'wh-1',
        tenant_id: 'tenant-1',
        name: 'Main Warehouse',
        display_code: 'MAIN',
        sort_order: 0,
        is_active: true,
        notes: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeZone(overrides?: Partial<InventoryZoneRow>): InventoryZoneRow {
    return {
        id: 'zone-a',
        tenant_id: 'tenant-1',
        warehouse_id: 'wh-1',
        label: 'Zone A',
        display_code: 'A',
        sort_order: 0,
        is_active: true,
        notes: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeShelf(overrides?: Partial<ShelfRow>): ShelfRow {
    return {
        id: 'shelf-1',
        tenant_id: 'tenant-1',
        warehouse_id: 'wh-1',
        zone_id: 'zone-a',
        label: 'Shelf 1',
        column_position: 1,
        level_position: 1,
        display_code: 'A-01',
        sort_order: 0,
        capacity_units: 20,
        reorder_display_threshold: null,
        is_active: true,
        notes: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeProduct(overrides?: Partial<ProductRow>): ProductRow {
    return {
        id: 'prod-1',
        tenant_id: 'tenant-1',
        sku: 'BOLT-100',
        barcode: null,
        name: 'Hex Bolt M10',
        description: null,
        unit_of_measure: 'pcs',
        reorder_point: 5,
        safety_stock: 2,
        lead_time_days: 7,
        reorder_enabled: true,
        preferred_storage_note: null,
        default_cost_basis: null,
        tracking_mode: 'lot',
        status: 'active',
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeLot(overrides?: Partial<StockLotRow>): StockLotRow {
    return {
        id: 'lot-1',
        tenant_id: 'tenant-1',
        product_id: 'prod-1',
        shelf_id: 'shelf-1',
        original_quantity: 20,
        quantity_on_hand: 20,
        received_at: '2026-03-01T10:00:00Z',
        unit_cost: 1.5,
        lot_reference: 'LOT-001',
        supplier_reference: 'SUP-001',
        notes: null,
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
        ...overrides,
    };
}

type MockQueryData = {
    warehouses: WarehouseRow[];
    zones: InventoryZoneRow[];
    shelves: ShelfRow[];
    products: ProductRow[];
    stockLots: StockLotRow[];
};

function createMockClient(data: MockQueryData): InventoryRepositoryClient {
    return {
        from(table: string) {
            return {
                select(_columns?: string) {
                    return {
                        eq(_col: string, _val: string) {
                            return this;
                        },
                        order(_col: string, _opts?: { ascending?: boolean }) {
                            const tableData =
                                table === 'warehouses'
                                    ? data.warehouses
                                    : table === 'inventory_zones'
                                      ? data.zones
                                      : table === 'shelves'
                                        ? data.shelves
                                        : table === 'products'
                                          ? data.products
                                          : table === 'stock_lots'
                                            ? data.stockLots
                                            : [];
                            return Promise.resolve({
                                data: tableData,
                                error: null,
                            });
                        },
                        maybeSingle() {
                            return Promise.resolve({
                                data: null,
                                error: null,
                            });
                        },
                    } as ReturnType<
                        ReturnType<
                            InventoryRepositoryClient['from']
                        >['select']
                    >;
                },
                upsert() {
                    return {
                        select() {
                            return Promise.resolve({
                                data: [],
                                error: null,
                            });
                        },
                    };
                },
            } as ReturnType<InventoryRepositoryClient['from']>;
        },
    } as InventoryRepositoryClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getWallExperienceData', () => {
    it('returns zone-grouped shelves from the warehouse tree', async () => {
        const shelf = makeShelf();
        const lot = makeLot({ quantity_on_hand: 20 });
        const product = makeProduct();

        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [shelf],
            products: [product],
            stockLots: [lot],
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        expect(result.warehouseName).toBe('Main Warehouse');
        expect(result.zones).toHaveLength(1);
        expect(result.zones[0]!.label).toBe('Zone A');
        expect(result.zones[0]!.shelves).toHaveLength(1);
        expect(result.zones[0]!.shelves[0]!.quantityOnHand).toBe(20);
    });

    it('classifies shelf health as empty when on-hand is zero', async () => {
        const lot = makeLot({ quantity_on_hand: 0 });
        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [makeShelf()],
            products: [makeProduct()],
            stockLots: [lot],
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        expect(result.zones[0]!.shelves[0]!.health).toBe('empty');
    });

    it('classifies shelf health as critical when on-hand is at or below the reorder threshold', async () => {
        // product.reorder_point = 5, shelf has no reorder_display_threshold
        const lot = makeLot({ quantity_on_hand: 5 });
        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [makeShelf({ reorder_display_threshold: null })],
            products: [makeProduct({ reorder_point: 5 })],
            stockLots: [lot],
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        expect(result.zones[0]!.shelves[0]!.health).toBe('critical');
    });

    it('uses shelf.reorder_display_threshold over product.reorder_point when set', async () => {
        const lot = makeLot({ quantity_on_hand: 8 });
        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [makeShelf({ reorder_display_threshold: 10 })],
            products: [makeProduct({ reorder_point: 3 })],
            stockLots: [lot],
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        // on-hand (8) <= threshold (10), so critical
        expect(result.zones[0]!.shelves[0]!.health).toBe('critical');
    });

    it('classifies shelf health as warning when on-hand is above critical but within the safety buffer', async () => {
        // product.reorder_point = 5, product.safety_stock = 2
        // critical threshold = 5, warning ceiling = 5 + max(2, 1) = 7
        // on-hand = 7 -> warning
        const lot = makeLot({ quantity_on_hand: 7 });
        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [makeShelf()],
            products: [makeProduct({ reorder_point: 5, safety_stock: 2 })],
            stockLots: [lot],
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        expect(result.zones[0]!.shelves[0]!.health).toBe('warning');
    });

    it('classifies shelf health as healthy when on-hand is above the warning ceiling', async () => {
        // product.reorder_point = 5, product.safety_stock = 2
        // warning ceiling = 5 + 2 = 7, on-hand = 8 -> healthy
        const lot = makeLot({ quantity_on_hand: 8 });
        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [makeShelf()],
            products: [makeProduct({ reorder_point: 5, safety_stock: 2 })],
            stockLots: [lot],
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        expect(result.zones[0]!.shelves[0]!.health).toBe('healthy');
    });

    it('determines primary product as the one with highest total on-hand', async () => {
        const product1 = makeProduct({ id: 'prod-1', name: 'Hex Bolt M10' });
        const product2 = makeProduct({ id: 'prod-2', name: 'Flat Washer M10' });

        const lots = [
            makeLot({ id: 'lot-1', product_id: 'prod-1', quantity_on_hand: 3, received_at: '2026-03-01T10:00:00Z' }),
            makeLot({ id: 'lot-2', product_id: 'prod-2', quantity_on_hand: 12, received_at: '2026-03-02T10:00:00Z' }),
        ];

        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [makeShelf()],
            products: [product1, product2],
            stockLots: lots,
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        expect(result.zones[0]!.shelves[0]!.productName).toBe('Flat Washer M10');
    });

    it('exposes shelf code, lot count, and reorder count on each shelf', async () => {
        const lots = [
            makeLot({ id: 'lot-1', quantity_on_hand: 3 }),
            makeLot({ id: 'lot-2', quantity_on_hand: 1, received_at: '2026-03-15T10:00:00Z' }),
        ];

        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [makeShelf()],
            products: [makeProduct({ reorder_point: 5, safety_stock: 2 })],
            stockLots: lots,
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        const shelf = result.zones[0]!.shelves[0]!;
        expect(shelf.displayCode).toBe('A-01');
        expect(shelf.lotCount).toBe(2);
        // total on-hand = 4, below reorder_point of 5, so reorderCount = 1
        expect(shelf.reorderCount).toBeGreaterThanOrEqual(1);
    });

    it('returns an empty wall model when the warehouse tree has no shelves', async () => {
        const client = createMockClient({
            warehouses: [makeWarehouse()],
            zones: [makeZone()],
            shelves: [],
            products: [],
            stockLots: [],
        });

        const result = await getWallExperienceData(client, {
            tenantId: 'tenant-1',
        });

        expect(result.zones[0]!.shelves).toHaveLength(0);
    });
});
