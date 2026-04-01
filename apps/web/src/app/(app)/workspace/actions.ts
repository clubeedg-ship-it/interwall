'use server';

import type {
    ProductRow,
    StockAdjustmentInput,
    StockLotCreateInput,
    StockLotRow,
    StockRelocationInput,
    WallShelfDetailState,
    WallShelfLotState,
} from '@interwall/shared';

import { requireUserSession } from '@/lib/server/auth';
import {
    adjustStockLot,
    createStockLot,
    relocateStockLot,
} from '@/lib/server/inventory-mutations';
import type { InventoryRepositoryClient } from '@/lib/server/repositories/inventory';
import {
    getProductByBarcodeOrSku,
    listStockLotsByProduct,
} from '@/lib/server/repositories/inventory';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import { createServerSupabaseClient } from '@/lib/server/supabase';
import {
    requireActiveTenant,
    resolveActiveTenant,
} from '@/lib/server/tenant-context';
import { classifyHealth } from '@/lib/server/wall-data';

export type ScanMatchResult = {
    outcome: 'match';
    product: ProductRow;
    lots: StockLotRow[];
};

export type ScanDraftResult = {
    outcome: 'draft';
    draft: {
        barcode: string;
        sku: string | null;
        ean: string | null;
        quantity: number | null;
        unitCost: number | null;
        lotReference: string | null;
        supplierReference: string | null;
        marketplaceName: string | null;
        marketplaceReference: string | null;
        shelfId: string | null;
    };
};

export type ScanErrorResult = {
    outcome: 'error';
    message: string;
};

export type ScanBarcodeResult = ScanMatchResult | ScanDraftResult | ScanErrorResult;

async function resolveTenantContext(): Promise<{
    tenantId: string;
    supabase: ReturnType<typeof createServerSupabaseClient>;
}> {
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

    const { tenantId } = requireActiveTenant({ resolved });

    return { tenantId, supabase };
}

export async function scanBarcodeAction(input: {
    code: string;
    shelfId?: string | null;
}): Promise<ScanBarcodeResult> {
    const trimmedCode = input.code.trim();

    if (!trimmedCode) {
        return {
            outcome: 'error',
            message: 'Scan input is empty. Please scan a valid barcode.',
        };
    }

    const { tenantId, supabase } = await resolveTenantContext();
    const client = supabase as unknown as InventoryRepositoryClient;

    const product = await getProductByBarcodeOrSku(client, {
        tenantId,
        code: trimmedCode,
    });

    if (product) {
        const lots = await listStockLotsByProduct(client, {
            tenantId,
            productId: product.id,
        });

        return {
            outcome: 'match',
            product,
            lots,
        };
    }

    return {
        outcome: 'draft',
        draft: {
            barcode: trimmedCode,
            sku: null,
            ean: null,
            quantity: null,
            unitCost: null,
            lotReference: null,
            supplierReference: null,
            marketplaceName: null,
            marketplaceReference: null,
            shelfId: input.shelfId ?? null,
        },
    };
}

export async function createStockLotAction(
    input: StockLotCreateInput,
): Promise<{ stockLot: StockLotRow; tenantId: string }> {
    const { tenantId } = await resolveTenantContext();

    return createStockLot({
        tenantId,
        input,
    });
}

export async function adjustStockLotAction(input: {
    stockLotId: string;
    input: StockAdjustmentInput;
}): Promise<{ stockLot: StockLotRow; tenantId: string }> {
    const { tenantId } = await resolveTenantContext();

    return adjustStockLot({
        tenantId,
        stockLotId: input.stockLotId,
        input: input.input,
    });
}

export async function relocateStockLotAction(input: {
    stockLotId: string;
    input: StockRelocationInput;
}): Promise<{ stockLot: StockLotRow; tenantId: string }> {
    const { tenantId } = await resolveTenantContext();

    return relocateStockLot({
        tenantId,
        stockLotId: input.stockLotId,
        input: input.input,
    });
}

export async function getShelfDetailAction(input: {
    shelfId: string;
}): Promise<WallShelfDetailState> {
    const { tenantId, supabase } = await resolveTenantContext();
    const client = supabase as unknown as InventoryRepositoryClient;

    const shelfResult = await client
        .from('shelves')
        .select('*')
        .eq('id', input.shelfId)
        .eq('tenant_id', tenantId)
        .single();

    if (
        'error' in shelfResult &&
        (shelfResult as { error: { message: string } | null }).error
    ) {
        throw new Error(
            `Unable to load shelf: ${(shelfResult as { error: { message: string } }).error.message}`,
        );
    }

    const shelf = (shelfResult as { data: { id: string; label: string; display_code: string; capacity_units: number | null; reorder_display_threshold: number | null; notes: string | null } }).data;

    const lotsResult = await client
        .from('stock_lots')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('shelf_id', input.shelfId)
        .order('received_at', { ascending: true });

    const lots: StockLotRow[] =
        (lotsResult as { data: StockLotRow[] | null }).data ?? [];

    const productIds = [...new Set(lots.map((lot) => lot.product_id))];

    let productsMap = new Map<string, ProductRow>();
    if (productIds.length > 0) {
        const productsResult = await client
            .from('products')
            .select('*')
            .eq('tenant_id', tenantId)
            .in('id', productIds)
            .order('name', { ascending: true });

        const products: ProductRow[] =
            (productsResult as { data: ProductRow[] | null }).data ?? [];

        productsMap = new Map(products.map((p) => [p.id, p]));
    }

    let totalOnHand = 0;
    let stockValue: number | null = null;
    let primaryProductId: string | null = null;
    let primaryProductQty = -1;
    let primaryProductReceivedAt = '';

    for (const lot of lots) {
        totalOnHand += lot.quantity_on_hand;

        if (lot.unit_cost !== null) {
            stockValue =
                (stockValue ?? 0) + lot.unit_cost * lot.quantity_on_hand;
        }

        if (
            lot.quantity_on_hand > primaryProductQty ||
            (lot.quantity_on_hand === primaryProductQty &&
                lot.received_at < primaryProductReceivedAt)
        ) {
            primaryProductId = lot.product_id;
            primaryProductQty = lot.quantity_on_hand;
            primaryProductReceivedAt = lot.received_at;
        }
    }

    const primaryProduct = primaryProductId
        ? productsMap.get(primaryProductId) ?? null
        : null;

    const criticalThreshold =
        shelf.reorder_display_threshold ??
        (primaryProduct?.reorder_point ?? 0);
    const safetyStock = primaryProduct?.safety_stock ?? 1;

    const health = classifyHealth(totalOnHand, criticalThreshold, safetyStock);

    const lotStates: WallShelfLotState[] = lots.map((lot) => {
        const product = productsMap.get(lot.product_id);
        return {
            id: lot.id,
            productName: product?.name ?? 'Unknown product',
            quantityOnHand: lot.quantity_on_hand,
            receivedAt: lot.received_at,
            unitCost: lot.unit_cost,
            lotReference: lot.lot_reference,
            supplierReference: lot.supplier_reference,
            notes: lot.notes,
        };
    });

    return {
        shelfId: shelf.id,
        shelfLabel: shelf.label,
        shelfDisplayCode: shelf.display_code,
        health,
        quantityOnHand: totalOnHand,
        capacityUnits: shelf.capacity_units,
        reorderThreshold: shelf.reorder_display_threshold,
        stockValue,
        primaryProductName: primaryProduct?.name ?? null,
        lots: lotStates,
    };
}
