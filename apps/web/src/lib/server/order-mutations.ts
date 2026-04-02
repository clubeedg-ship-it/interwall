import type {
    CancelPurchaseOrderInput,
    CancelSalesOrderInput,
    ConfirmPurchaseOrderInput,
    ConfirmSalesOrderInput,
    CreatePurchaseOrderInput,
    CreateSalesOrderInput,
    ReceivePurchaseOrderLineInput,
    ShipSalesOrderLineInput,
    UpdatePurchaseOrderInput,
    UpdateSalesOrderInput,
} from '@interwall/shared';

import {
    createServerSupabaseClient,
    type ServerSupabaseClient,
} from './supabase';

type InventoryOrdersActionName =
    | 'createPurchaseOrder'
    | 'updatePurchaseOrder'
    | 'confirmPurchaseOrder'
    | 'receivePurchaseOrderLine'
    | 'createSalesOrder'
    | 'updateSalesOrder'
    | 'confirmSalesOrder'
    | 'shipSalesOrderLine'
    | 'cancelPurchaseOrder'
    | 'cancelSalesOrder';

type InventoryOrdersActionResponse = {
    data?: {
        tenantId: string;
        action: InventoryOrdersActionName;
        result: Record<string, unknown>;
    };
};

type FunctionClient = Pick<ServerSupabaseClient, 'functions'>;

export async function invokeInventoryOrdersAction(
    supabase: FunctionClient,
    input: {
        tenantId: string;
        action: InventoryOrdersActionName;
        input: object;
    },
): Promise<{
    tenantId: string;
    action: InventoryOrdersActionName;
    result: Record<string, unknown>;
}> {
    const { data, error } = await supabase.functions.invoke<InventoryOrdersActionResponse>(
        'inventory-orders',
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
        throw new Error(`Unable to complete inventory orders action: ${error.message}`);
    }

    if (!data?.data) {
        throw new Error('Inventory orders action completed without returning data.');
    }

    return data.data;
}

function resolveSupabaseClient<TInput>(
    supabaseOrInput: FunctionClient | TInput,
    maybeInput?: TInput,
): {
    supabase: FunctionClient;
    input: TInput;
} {
    return maybeInput === undefined
        ? {
              supabase: createServerSupabaseClient(),
              input: supabaseOrInput as TInput,
          }
        : {
              supabase: supabaseOrInput as FunctionClient,
              input: maybeInput,
          };
}

export async function createPurchaseOrder(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: CreatePurchaseOrderInput;
    },
    maybeInput?: {
        tenantId: string;
        input: CreatePurchaseOrderInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'createPurchaseOrder',
        input: input.input,
    });
}

export async function updatePurchaseOrder(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: UpdatePurchaseOrderInput;
    },
    maybeInput?: {
        tenantId: string;
        input: UpdatePurchaseOrderInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'updatePurchaseOrder',
        input: input.input,
    });
}

export async function confirmPurchaseOrder(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: ConfirmPurchaseOrderInput;
    },
    maybeInput?: {
        tenantId: string;
        input: ConfirmPurchaseOrderInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'confirmPurchaseOrder',
        input: input.input,
    });
}

export async function receivePurchaseOrderLine(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: ReceivePurchaseOrderLineInput;
    },
    maybeInput?: {
        tenantId: string;
        input: ReceivePurchaseOrderLineInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'receivePurchaseOrderLine',
        input: input.input,
    });
}

export async function createSalesOrder(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: CreateSalesOrderInput;
    },
    maybeInput?: {
        tenantId: string;
        input: CreateSalesOrderInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'createSalesOrder',
        input: input.input,
    });
}

export async function updateSalesOrder(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: UpdateSalesOrderInput;
    },
    maybeInput?: {
        tenantId: string;
        input: UpdateSalesOrderInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'updateSalesOrder',
        input: input.input,
    });
}

export async function confirmSalesOrder(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: ConfirmSalesOrderInput;
    },
    maybeInput?: {
        tenantId: string;
        input: ConfirmSalesOrderInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'confirmSalesOrder',
        input: input.input,
    });
}

export async function shipSalesOrderLine(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: ShipSalesOrderLineInput;
    },
    maybeInput?: {
        tenantId: string;
        input: ShipSalesOrderLineInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'shipSalesOrderLine',
        input: input.input,
    });
}

export async function cancelPurchaseOrder(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: CancelPurchaseOrderInput;
    },
    maybeInput?: {
        tenantId: string;
        input: CancelPurchaseOrderInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'cancelPurchaseOrder',
        input: input.input,
    });
}

export async function cancelSalesOrder(
    supabaseOrInput: FunctionClient | {
        tenantId: string;
        input: CancelSalesOrderInput;
    },
    maybeInput?: {
        tenantId: string;
        input: CancelSalesOrderInput;
    },
) {
    const { supabase, input } = resolveSupabaseClient(supabaseOrInput, maybeInput);

    return await invokeInventoryOrdersAction(supabase, {
        tenantId: input.tenantId,
        action: 'cancelSalesOrder',
        input: input.input,
    });
}
