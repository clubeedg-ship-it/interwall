import type {
    StockAdjustmentInput,
    StockLotCreateInput,
    StockLotRow,
    StockLotUpdateInput,
    StockRelocationInput,
} from '@interwall/shared';

import {
    createServerSupabaseClient,
    type ServerSupabaseClient,
} from './supabase';

type InventoryStockActionName =
    | 'createStockLot'
    | 'updateStockLot'
    | 'adjustStockLot'
    | 'relocateStockLot';

type InventoryStockActionResponse = {
    data?: {
        stockLot: StockLotRow;
        tenantId: string;
    };
};

type FunctionClient = Pick<ServerSupabaseClient, 'functions'>;

export async function invokeInventoryStockAction(
    supabase: FunctionClient,
    input: {
        tenantId: string;
        action: InventoryStockActionName;
        input: object;
    },
): Promise<{
    stockLot: StockLotRow;
    tenantId: string;
}> {
    const { data, error } = await supabase.functions.invoke<InventoryStockActionResponse>(
        'inventory-stock',
        {
            body: {
                action: input.action,
                input: input.input,
            },
            headers: {
                'x-active-tenant': input.tenantId,
            },
        },
    );

    if (error) {
        throw new Error(`Unable to complete inventory stock action: ${error.message}`);
    }

    if (!data?.data) {
        throw new Error('Inventory stock action completed without returning data.');
    }

    return data.data;
}

export async function createStockLot(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: StockLotCreateInput;
    },
    maybeInput?: {
        tenantId: string;
        input: StockLotCreateInput;
    },
): Promise<{
    stockLot: StockLotRow;
    tenantId: string;
}> {
    const supabase =
        maybeInput === undefined ? createServerSupabaseClient() : supabaseOrInput as FunctionClient;
    const input = maybeInput ?? supabaseOrInput as {
        tenantId: string;
        input: StockLotCreateInput;
    };

    return await invokeInventoryStockAction(supabase, {
        tenantId: input.tenantId,
        action: 'createStockLot',
        input: input.input,
    });
}

export async function updateStockLot(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        stockLotId: string;
        input: StockLotUpdateInput;
    },
    maybeInput?: {
        tenantId: string;
        stockLotId: string;
        input: StockLotUpdateInput;
    },
): Promise<{
    stockLot: StockLotRow;
    tenantId: string;
}> {
    const supabase =
        maybeInput === undefined ? createServerSupabaseClient() : supabaseOrInput as FunctionClient;
    const input = maybeInput ?? supabaseOrInput as {
        tenantId: string;
        stockLotId: string;
        input: StockLotUpdateInput;
    };

    return await invokeInventoryStockAction(supabase, {
        tenantId: input.tenantId,
        action: 'updateStockLot',
        input: {
            stockLotId: input.stockLotId,
            ...input.input,
        },
    });
}

export async function adjustStockLot(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        stockLotId: string;
        input: StockAdjustmentInput;
    },
    maybeInput?: {
        tenantId: string;
        stockLotId: string;
        input: StockAdjustmentInput;
    },
): Promise<{
    stockLot: StockLotRow;
    tenantId: string;
}> {
    const supabase =
        maybeInput === undefined ? createServerSupabaseClient() : supabaseOrInput as FunctionClient;
    const input = maybeInput ?? supabaseOrInput as {
        tenantId: string;
        stockLotId: string;
        input: StockAdjustmentInput;
    };

    return await invokeInventoryStockAction(supabase, {
        tenantId: input.tenantId,
        action: 'adjustStockLot',
        input: {
            stockLotId: input.stockLotId,
            ...input.input,
        },
    });
}

export async function relocateStockLot(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        stockLotId: string;
        input: StockRelocationInput;
    },
    maybeInput?: {
        tenantId: string;
        stockLotId: string;
        input: StockRelocationInput;
    },
): Promise<{
    stockLot: StockLotRow;
    tenantId: string;
}> {
    const supabase =
        maybeInput === undefined ? createServerSupabaseClient() : supabaseOrInput as FunctionClient;
    const input = maybeInput ?? supabaseOrInput as {
        tenantId: string;
        stockLotId: string;
        input: StockRelocationInput;
    };

    return await invokeInventoryStockAction(supabase, {
        tenantId: input.tenantId,
        action: 'relocateStockLot',
        input: {
            stockLotId: input.stockLotId,
            ...input.input,
        },
    });
}
