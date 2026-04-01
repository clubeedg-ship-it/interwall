import type {
    InventoryZoneRow,
    InventoryZoneUpsertInput,
    ProductRow,
    ProductUpsertInput,
    ShelfRow,
    ShelfUpsertInput,
    StockLotRow,
    WarehouseRow,
    WarehouseUpsertInput,
} from '@interwall/shared';

type QueryResult<T> = Promise<{
    data: T;
    error: { message: string } | null;
}>;

type SelectQueryBuilder<Row> = {
    eq(column: string, value: string): SelectQueryBuilder<Row>;
    order(
        column: string,
        options?: { ascending?: boolean },
    ): QueryResult<Row[] | null>;
    maybeSingle(): QueryResult<Row | null>;
};

type UpsertBuilder<Row> = {
    select(columns?: string): QueryResult<Row[] | null>;
};

type InventoryTableMap = {
    products: ProductRow;
    warehouses: WarehouseRow;
    inventory_zones: InventoryZoneRow;
    inventory_shelves: ShelfRow;
    stock_lots: StockLotRow;
};

export type InventoryRepositoryClient = {
    from<Table extends keyof InventoryTableMap>(table: Table): {
        select(columns?: string): SelectQueryBuilder<InventoryTableMap[Table]>;
        upsert(
            values:
                | Partial<InventoryTableMap[Table]>
                | Array<Partial<InventoryTableMap[Table]>>,
            options?: { onConflict?: string },
        ): UpsertBuilder<InventoryTableMap[Table]>;
    };
};

export type WarehouseTree = WarehouseRow & {
    zones: Array<InventoryZoneRow & { shelves: ShelfRow[] }>;
};

type WarehouseTreeUpsertInput = {
    tenantId: string;
    warehouseId: string;
    warehouse: WarehouseUpsertInput;
    zones: Array<{
        zoneId: string;
        zone: Omit<InventoryZoneUpsertInput, 'warehouse_id'>;
        shelves: Array<{
            shelfId: string;
            shelf: Omit<ShelfUpsertInput, 'warehouse_id' | 'zone_id'>;
        }>;
    }>;
};

function requireRows<T>(
    action: string,
    result: { data: T[] | null; error: { message: string } | null },
): T[] {
    if (result.error) {
        throw new Error(`${action}: ${result.error.message}`);
    }

    return result.data ?? [];
}

function requireRow<T>(
    action: string,
    result: { data: T | null; error: { message: string } | null },
): T | null {
    if (result.error) {
        throw new Error(`${action}: ${result.error.message}`);
    }

    return result.data;
}

export async function listProducts(
    client: InventoryRepositoryClient,
    input: { tenantId: string },
): Promise<ProductRow[]> {
    const result = await client
        .from('products')
        .select('*')
        .eq('tenant_id', input.tenantId)
        .order('sku', { ascending: true });

    return requireRows('Unable to list products for the active tenant', result);
}

export async function getProductById(
    client: InventoryRepositoryClient,
    input: { tenantId: string; productId: string },
): Promise<ProductRow | null> {
    const result = await client
        .from('products')
        .select('*')
        .eq('tenant_id', input.tenantId)
        .eq('id', input.productId)
        .maybeSingle();

    return requireRow('Unable to load the requested product', result);
}

export async function upsertProduct(
    client: InventoryRepositoryClient,
    input: {
        tenantId: string;
        productId: string;
        product: ProductUpsertInput;
    },
): Promise<ProductRow> {
    const result = await client
        .from('products')
        .upsert(
            [
                {
                    id: input.productId,
                    tenant_id: input.tenantId,
                    ...input.product,
                },
            ],
            { onConflict: 'id' },
        )
        .select();

    const rows = requireRows('Unable to upsert the product', result);
    const row = rows[0];

    if (!row) {
        throw new Error('Unable to upsert the product: no row was returned.');
    }

    return row;
}

export async function listWarehouses(
    client: InventoryRepositoryClient,
    input: { tenantId: string },
): Promise<WarehouseRow[]> {
    const result = await client
        .from('warehouses')
        .select('*')
        .eq('tenant_id', input.tenantId)
        .order('sort_order', { ascending: true });

    return requireRows('Unable to list warehouses for the active tenant', result);
}

export async function upsertWarehouse(
    client: InventoryRepositoryClient,
    input: {
        tenantId: string;
        warehouseId: string;
        warehouse: WarehouseUpsertInput;
    },
): Promise<WarehouseRow> {
    const result = await client
        .from('warehouses')
        .upsert(
            [
                {
                    id: input.warehouseId,
                    tenant_id: input.tenantId,
                    ...input.warehouse,
                },
            ],
            { onConflict: 'id' },
        )
        .select();

    const rows = requireRows('Unable to upsert the warehouse', result);
    const row = rows[0];

    if (!row) {
        throw new Error('Unable to upsert the warehouse: no row was returned.');
    }

    return row;
}

export async function upsertZone(
    client: InventoryRepositoryClient,
    input: {
        tenantId: string;
        zoneId: string;
        zone: InventoryZoneUpsertInput;
    },
): Promise<InventoryZoneRow> {
    const result = await client
        .from('inventory_zones')
        .upsert(
            [
                {
                    id: input.zoneId,
                    tenant_id: input.tenantId,
                    ...input.zone,
                },
            ],
            { onConflict: 'id' },
        )
        .select();

    const rows = requireRows('Unable to upsert the zone', result);
    const row = rows[0];

    if (!row) {
        throw new Error('Unable to upsert the zone: no row was returned.');
    }

    return row;
}

export async function upsertShelf(
    client: InventoryRepositoryClient,
    input: {
        tenantId: string;
        shelfId: string;
        shelf: ShelfUpsertInput;
    },
): Promise<ShelfRow> {
    const result = await client
        .from('inventory_shelves')
        .upsert(
            [
                {
                    id: input.shelfId,
                    tenant_id: input.tenantId,
                    ...input.shelf,
                },
            ],
            { onConflict: 'id' },
        )
        .select();

    const rows = requireRows('Unable to upsert the shelf', result);
    const row = rows[0];

    if (!row) {
        throw new Error('Unable to upsert the shelf: no row was returned.');
    }

    return row;
}

export async function upsertWarehouseTree(
    client: InventoryRepositoryClient,
    input: WarehouseTreeUpsertInput,
): Promise<WarehouseTree> {
    const warehouse = await upsertWarehouse(client, {
        tenantId: input.tenantId,
        warehouseId: input.warehouseId,
        warehouse: input.warehouse,
    });

    const zones = await Promise.all(
        input.zones.map(async ({ zoneId, zone, shelves }) => {
            const savedZone = await upsertZone(client, {
                tenantId: input.tenantId,
                zoneId,
                zone: {
                    warehouse_id: input.warehouseId,
                    ...zone,
                },
            });

            const savedShelves = await Promise.all(
                shelves.map(({ shelfId, shelf }) =>
                    upsertShelf(client, {
                        tenantId: input.tenantId,
                        shelfId,
                        shelf: {
                            warehouse_id: input.warehouseId,
                            zone_id: zoneId,
                            ...shelf,
                        },
                    }),
                ),
            );

            return {
                ...savedZone,
                shelves: savedShelves,
            };
        }),
    );

    return {
        ...warehouse,
        zones,
    };
}

export async function getWarehouseTree(
    client: InventoryRepositoryClient,
    input: { tenantId: string },
): Promise<WarehouseTree[]> {
    const [warehouses, zones, shelves] = await Promise.all([
        listWarehouses(client, input),
        requireRows(
            'Unable to list zones for the active tenant',
            await client
                .from('inventory_zones')
                .select('*')
                .eq('tenant_id', input.tenantId)
                .order('sort_order', { ascending: true }),
        ),
        requireRows(
            'Unable to list shelves for the active tenant',
            await client
                .from('inventory_shelves')
                .select('*')
                .eq('tenant_id', input.tenantId)
                .order('sort_order', { ascending: true }),
        ),
    ]);

    return warehouses.map((warehouse) => ({
        ...warehouse,
        zones: zones
            .filter((zone) => zone.warehouse_id === warehouse.id)
            .map((zone) => ({
                ...zone,
                shelves: shelves.filter((shelf) => shelf.zone_id === zone.id),
            })),
    }));
}

export async function listStockLotsByShelf(
    client: InventoryRepositoryClient,
    input: { tenantId: string; shelfId: string },
): Promise<StockLotRow[]> {
    const result = await client
        .from('stock_lots')
        .select('*')
        .eq('tenant_id', input.tenantId)
        .eq('shelf_id', input.shelfId)
        .order('received_at', { ascending: true });

    return requireRows('Unable to list stock lots for the shelf', result);
}

export async function listStockLotsByProduct(
    client: InventoryRepositoryClient,
    input: { tenantId: string; productId: string },
): Promise<StockLotRow[]> {
    const result = await client
        .from('stock_lots')
        .select('*')
        .eq('tenant_id', input.tenantId)
        .eq('product_id', input.productId)
        .order('received_at', { ascending: true });

    return requireRows('Unable to list stock lots for the product', result);
}
