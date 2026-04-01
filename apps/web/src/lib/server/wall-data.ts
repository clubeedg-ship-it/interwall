import type {
    ProductRow,
    StockLotRow,
    WallInventoryViewModel,
    WallShelfHealth,
    WallShelfState,
    WallZoneState,
} from '@interwall/shared';

import {
    getWarehouseTree,
    listProducts,
    type InventoryRepositoryClient,
} from './repositories/inventory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ShelfLotAggregate = {
    totalOnHand: number;
    lotCount: number;
    stockValue: number | null;
    /** Map from product_id to total on-hand for that product on this shelf. */
    productQuantities: Map<string, { total: number; earliestReceivedAt: string }>;
    lots: StockLotRow[];
};

function aggregateLots(lots: StockLotRow[]): ShelfLotAggregate {
    let totalOnHand = 0;
    let stockValue: number | null = null;
    const productQuantities = new Map<
        string,
        { total: number; earliestReceivedAt: string }
    >();

    for (const lot of lots) {
        totalOnHand += lot.quantity_on_hand;

        if (lot.unit_cost !== null) {
            stockValue =
                (stockValue ?? 0) + lot.unit_cost * lot.quantity_on_hand;
        }

        const existing = productQuantities.get(lot.product_id);
        if (existing) {
            existing.total += lot.quantity_on_hand;
            if (lot.received_at < existing.earliestReceivedAt) {
                existing.earliestReceivedAt = lot.received_at;
            }
        } else {
            productQuantities.set(lot.product_id, {
                total: lot.quantity_on_hand,
                earliestReceivedAt: lot.received_at,
            });
        }
    }

    return {
        totalOnHand,
        lotCount: lots.length,
        stockValue,
        productQuantities,
        lots,
    };
}

function resolvePrimaryProduct(
    aggregate: ShelfLotAggregate,
    productsMap: Map<string, ProductRow>,
): ProductRow | null {
    if (aggregate.productQuantities.size === 0) {
        return null;
    }

    let bestProductId: string | null = null;
    let bestTotal = -1;
    let bestReceivedAt = '';

    for (const [productId, info] of aggregate.productQuantities) {
        if (
            info.total > bestTotal ||
            (info.total === bestTotal &&
                info.earliestReceivedAt < bestReceivedAt)
        ) {
            bestProductId = productId;
            bestTotal = info.total;
            bestReceivedAt = info.earliestReceivedAt;
        }
    }

    return bestProductId ? (productsMap.get(bestProductId) ?? null) : null;
}

function classifyHealth(
    totalOnHand: number,
    criticalThreshold: number,
    safetyStock: number,
): WallShelfHealth {
    if (totalOnHand === 0) {
        return 'empty';
    }

    if (totalOnHand <= criticalThreshold) {
        return 'critical';
    }

    const warningCeiling = criticalThreshold + Math.max(safetyStock, 1);
    if (totalOnHand <= warningCeiling) {
        return 'warning';
    }

    return 'healthy';
}

function computeReorderCount(
    totalOnHand: number,
    criticalThreshold: number,
): number {
    if (totalOnHand <= criticalThreshold) {
        return 1;
    }
    return 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getWallExperienceData(
    client: InventoryRepositoryClient,
    input: { tenantId: string },
): Promise<WallInventoryViewModel> {
    const [warehouseTrees, products, allStockLots] = await Promise.all([
        getWarehouseTree(client, input),
        listProducts(client, input),
        loadAllStockLots(client, input),
    ]);

    const productsMap = new Map<string, ProductRow>();
    for (const product of products) {
        productsMap.set(product.id, product);
    }

    const lotsByShelf = new Map<string, StockLotRow[]>();
    for (const lot of allStockLots) {
        const list = lotsByShelf.get(lot.shelf_id) ?? [];
        list.push(lot);
        lotsByShelf.set(lot.shelf_id, list);
    }

    const firstWarehouse = warehouseTrees[0];
    if (!firstWarehouse) {
        return {
            warehouseName: 'No warehouse',
            zones: [],
            selectedZoneId: null,
            selectedShelfId: null,
            detail: null,
        };
    }

    const zones: WallZoneState[] = firstWarehouse.zones.map((zone) => {
        const shelves: WallShelfState[] = zone.shelves.map((shelf) => {
            const shelfLots = lotsByShelf.get(shelf.id) ?? [];
            const aggregate = aggregateLots(shelfLots);
            const primaryProduct = resolvePrimaryProduct(
                aggregate,
                productsMap,
            );

            const criticalThreshold =
                shelf.reorder_display_threshold ??
                (primaryProduct?.reorder_point ?? 0);
            const safetyStock = primaryProduct?.safety_stock ?? 1;

            const health = classifyHealth(
                aggregate.totalOnHand,
                criticalThreshold,
                safetyStock,
            );
            const reorderCount = computeReorderCount(
                aggregate.totalOnHand,
                criticalThreshold,
            );

            return {
                id: shelf.id,
                label: shelf.label,
                displayCode: shelf.display_code,
                health,
                productName: primaryProduct?.name ?? null,
                quantityOnHand: aggregate.totalOnHand,
                capacityUnits: shelf.capacity_units,
                reorderCount,
                lotCount: aggregate.lotCount,
                notes: shelf.notes,
            };
        });

        return {
            id: zone.id,
            label: zone.label,
            displayCode: zone.display_code,
            shelfCount: shelves.length,
            shelves,
        };
    });

    return {
        warehouseName: firstWarehouse.name,
        zones,
        selectedZoneId: null,
        selectedShelfId: null,
        detail: null,
    };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadAllStockLots(
    client: InventoryRepositoryClient,
    input: { tenantId: string },
): Promise<StockLotRow[]> {
    const result = await client
        .from('stock_lots')
        .select('*')
        .eq('tenant_id', input.tenantId)
        .order('received_at', { ascending: true });

    if ('error' in result && (result as { error: { message: string } | null }).error) {
        throw new Error(
            `Unable to list stock lots: ${(result as { error: { message: string } }).error.message}`,
        );
    }

    return (result as { data: StockLotRow[] | null }).data ?? [];
}
