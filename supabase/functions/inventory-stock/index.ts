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

type StockLotRecord = {
    id: string;
    tenant_id: string;
    product_id: string;
    shelf_id: string;
    original_quantity: number;
    quantity_on_hand: number;
    received_at: string;
    unit_cost: number | null;
    lot_reference: string | null;
    supplier_reference: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

type CreateStockLotInput = {
    product_id: string;
    shelf_id: string;
    original_quantity: number;
    quantity_on_hand: number;
    received_at: string;
    unit_cost: number | null;
    lot_reference: string | null;
    supplier_reference: string | null;
    notes: string | null;
};

type UpdateStockLotInput = {
    stockLotId: string;
    shelf_id: string;
    quantity_on_hand: number;
    notes: string | null;
};

type AdjustStockLotInput = {
    stockLotId: string;
    quantity_delta: number;
    reason: string;
    note: string | null;
};

type RelocateStockLotInput = {
    stockLotId: string;
    destination_shelf_id: string;
    reason: string;
    note: string | null;
};

type InventoryStockActionRequest =
    | {
        action: 'createStockLot';
        input: CreateStockLotInput;
    }
    | {
        action: 'updateStockLot';
        input: UpdateStockLotInput;
    }
    | {
        action: 'adjustStockLot';
        input: AdjustStockLotInput;
    }
    | {
        action: 'relocateStockLot';
        input: RelocateStockLotInput;
    };

type CallerContext = Awaited<ReturnType<typeof requireBackendUser>>;

function createAdminClient(): SupabaseClient {
    return createFunctionClient({ useServiceRole: true });
}

async function getStockLotForTenant(
    client: SupabaseClient,
    input: {
        tenantId: string;
        stockLotId: string;
    },
): Promise<StockLotRecord> {
    const { data, error } = await client
        .from('stock_lots')
        .select(
            'id, tenant_id, product_id, shelf_id, original_quantity, quantity_on_hand, received_at, unit_cost, lot_reference, supplier_reference, notes, created_at, updated_at',
        )
        .eq('tenant_id', input.tenantId)
        .eq('id', input.stockLotId)
        .maybeSingle<StockLotRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'stock_lot_lookup_failed',
            'Unable to load the requested stock lot.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            404,
            'stock_lot_not_found',
            'The requested stock lot was not found for the active tenant.',
            input,
        );
    }

    return data;
}

async function assertShelfInTenant(
    client: SupabaseClient,
    input: {
        tenantId: string;
        shelfId: string;
    },
): Promise<void> {
    const { data, error } = await client
        .from('shelves')
        .select('id')
        .eq('tenant_id', input.tenantId)
        .eq('id', input.shelfId)
        .maybeSingle<{ id: string }>();

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
            403,
            'shelf_outside_active_tenant',
            'The requested shelf is not available in the active tenant.',
            input,
        );
    }
}

async function createStockLot(
    tenantId: string,
    input: CreateStockLotInput,
): Promise<StockLotRecord> {
    const adminClient = createAdminClient();

    await assertShelfInTenant(adminClient, {
        tenantId,
        shelfId: input.shelf_id,
    });

    const { data, error } = await adminClient
        .from('stock_lots')
        .insert({
            tenant_id: tenantId,
            ...input,
        })
        .select(
            'id, tenant_id, product_id, shelf_id, original_quantity, quantity_on_hand, received_at, unit_cost, lot_reference, supplier_reference, notes, created_at, updated_at',
        )
        .maybeSingle<StockLotRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'create_stock_lot_failed',
            'Unable to create the stock lot.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            500,
            'stock_lot_create_empty',
            'Stock lot creation completed without a returned record.',
        );
    }

    return data;
}

async function updateStockLot(
    tenantId: string,
    input: UpdateStockLotInput,
): Promise<StockLotRecord> {
    const adminClient = createAdminClient();
    const existing = await getStockLotForTenant(adminClient, {
        tenantId,
        stockLotId: input.stockLotId,
    });

    await assertShelfInTenant(adminClient, {
        tenantId,
        shelfId: input.shelf_id,
    });

    const { data, error } = await adminClient
        .from('stock_lots')
        .update({
            shelf_id: input.shelf_id,
            quantity_on_hand: input.quantity_on_hand,
            notes: input.notes,
            original_quantity: existing.original_quantity,
            received_at: existing.received_at,
            unit_cost: existing.unit_cost,
            lot_reference: existing.lot_reference,
            supplier_reference: existing.supplier_reference,
        })
        .eq('tenant_id', tenantId)
        .eq('id', input.stockLotId)
        .select(
            'id, tenant_id, product_id, shelf_id, original_quantity, quantity_on_hand, received_at, unit_cost, lot_reference, supplier_reference, notes, created_at, updated_at',
        )
        .maybeSingle<StockLotRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'update_stock_lot_failed',
            'Unable to update the stock lot.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            500,
            'stock_lot_update_empty',
            'Stock lot update completed without a returned record.',
            { stockLotId: input.stockLotId, tenantId },
        );
    }

    return data;
}

function buildAdjustmentNotes(input: AdjustStockLotInput, existing: StockLotRecord): string | null {
    const reasonLine = `Adjustment reason: ${input.reason}`;
    const noteLine = input.note ? `Adjustment note: ${input.note}` : null;
    const lines = [existing.notes, reasonLine, noteLine].filter(
        (value): value is string => Boolean(value && value.trim()),
    );

    return lines.length > 0 ? lines.join('\n') : null;
}

async function adjustStockLot(
    tenantId: string,
    input: AdjustStockLotInput,
): Promise<StockLotRecord> {
    const adminClient = createAdminClient();
    const existing = await getStockLotForTenant(adminClient, {
        tenantId,
        stockLotId: input.stockLotId,
    });
    const nextQuantity = Number(existing.quantity_on_hand) + Number(input.quantity_delta);

    if (nextQuantity < 0) {
        throw new FunctionError(
            400,
            'stock_lot_quantity_negative',
            'Stock adjustments cannot reduce quantity_on_hand below zero.',
            {
                stockLotId: input.stockLotId,
                quantity_on_hand: existing.quantity_on_hand,
                quantity_delta: input.quantity_delta,
            },
        );
    }

    const { data, error } = await adminClient
        .from('stock_lots')
        .update({
            quantity_on_hand: nextQuantity,
            notes: buildAdjustmentNotes(input, existing),
        })
        .eq('tenant_id', tenantId)
        .eq('id', input.stockLotId)
        .select(
            'id, tenant_id, product_id, shelf_id, original_quantity, quantity_on_hand, received_at, unit_cost, lot_reference, supplier_reference, notes, created_at, updated_at',
        )
        .maybeSingle<StockLotRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'adjust_stock_lot_failed',
            'Unable to adjust the stock lot quantity.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            500,
            'stock_lot_adjust_empty',
            'Stock lot adjustment completed without a returned record.',
            { stockLotId: input.stockLotId, tenantId },
        );
    }

    return data;
}

function buildRelocationNotes(
    input: RelocateStockLotInput,
    existing: StockLotRecord,
): string | null {
    const reasonLine = `Relocation reason: ${input.reason}`;
    const noteLine = input.note ? `Relocation note: ${input.note}` : null;
    const lines = [existing.notes, reasonLine, noteLine].filter(
        (value): value is string => Boolean(value && value.trim()),
    );

    return lines.length > 0 ? lines.join('\n') : null;
}

async function relocateStockLot(
    tenantId: string,
    input: RelocateStockLotInput,
): Promise<StockLotRecord> {
    const adminClient = createAdminClient();

    await getStockLotForTenant(adminClient, {
        tenantId,
        stockLotId: input.stockLotId,
    });
    await assertShelfInTenant(adminClient, {
        tenantId,
        shelfId: input.destination_shelf_id,
    });

    const existing = await getStockLotForTenant(adminClient, {
        tenantId,
        stockLotId: input.stockLotId,
    });
    const { data, error } = await adminClient
        .from('stock_lots')
        .update({
            shelf_id: input.destination_shelf_id,
            notes: buildRelocationNotes(input, existing),
        })
        .eq('tenant_id', tenantId)
        .eq('id', input.stockLotId)
        .select(
            'id, tenant_id, product_id, shelf_id, original_quantity, quantity_on_hand, received_at, unit_cost, lot_reference, supplier_reference, notes, created_at, updated_at',
        )
        .maybeSingle<StockLotRecord>();

    if (error) {
        throw new FunctionError(
            500,
            'relocate_stock_lot_failed',
            'Unable to relocate the stock lot.',
            error.message,
        );
    }

    if (!data) {
        throw new FunctionError(
            500,
            'stock_lot_relocate_empty',
            'Stock lot relocation completed without a returned record.',
            { stockLotId: input.stockLotId, tenantId },
        );
    }

    return data;
}

async function routeInventoryStockAction(request: Request): Promise<Response> {
    requireMethod(request, ['POST']);

    const caller = await requireBackendUser(request);
    const tenantId = requireActiveTenant({ headers: request.headers });

    await requireTenantMembership(caller.client, {
        tenantId,
        userId: caller.user.id,
    });

    const body = await readJson<InventoryStockActionRequest>(request);

    switch (body.action) {
        case 'createStockLot':
            return json({
                data: {
                    stockLot: await createStockLot(tenantId, body.input),
                    tenantId,
                },
            }, { status: 201 });
        case 'updateStockLot':
            return json({
                data: {
                    stockLot: await updateStockLot(tenantId, body.input),
                    tenantId,
                },
            });
        case 'adjustStockLot':
            return json({
                data: {
                    stockLot: await adjustStockLot(tenantId, body.input),
                    tenantId,
                },
            });
        case 'relocateStockLot':
            return json({
                data: {
                    stockLot: await relocateStockLot(tenantId, body.input),
                    tenantId,
                },
            });
        default:
            throw new FunctionError(
                400,
                'invalid_action',
                'Unsupported inventory stock action.',
                body,
            );
    }
}

Deno.serve(async (request: Request) => {
    try {
        return await routeInventoryStockAction(request);
    } catch (error) {
        return errorResponse(error);
    }
});
