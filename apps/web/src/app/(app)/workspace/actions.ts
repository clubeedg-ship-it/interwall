'use server';

import type {
    ProductRow,
    StockAdjustmentInput,
    StockLotCreateInput,
    StockLotRow,
    StockRelocationInput,
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
