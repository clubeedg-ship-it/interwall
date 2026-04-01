import { describe, expect, it } from 'vitest';

import type {
    StockAdjustmentInput,
    StockLotCreateInput,
    StockLotRow,
    StockLotUpdateInput,
    StockRelocationInput,
} from '@interwall/shared';

import {
    adjustStockLot,
    createStockLot,
    invokeInventoryStockAction,
    relocateStockLot,
    updateStockLot,
} from './inventory-mutations';

type InventoryMutationResponse = {
    data?: {
        stockLot: StockLotRow;
        tenantId: string;
    };
};

function createFunctionsClient(response: InventoryMutationResponse) {
    const calls: Array<{
        name: string;
        options: unknown;
    }> = [];

    return {
        calls,
        functions: {
            invoke(name: string, options: unknown) {
                calls.push({ name, options });

                return Promise.resolve({
                    data: response,
                    error: null,
                });
            },
        },
    };
}

describe('inventory stock mutation invoker', () => {
    const tenantId = 'tenant-1';
    const stockLot: StockLotRow = {
        id: 'lot-1',
        tenant_id: tenantId,
        product_id: 'product-1',
        shelf_id: 'shelf-1',
        original_quantity: 10,
        quantity_on_hand: 8,
        received_at: '2026-04-01T00:00:00.000Z',
        unit_cost: 2.5,
        lot_reference: 'LOT-001',
        supplier_reference: 'SUP-001',
        notes: 'received',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
    };

    it('sends the validated active-tenant header and exact action payload to the edge function', async () => {
        const client = createFunctionsClient({
            data: {
                stockLot,
                tenantId,
            },
        });

        await expect(
            invokeInventoryStockAction(client as never, {
                tenantId,
                action: 'adjustStockLot',
                input: {
                    stockLotId: 'lot-1',
                    quantity_delta: -2,
                    reason: 'cycle_count',
                    note: 'Counted short',
                },
            }),
        ).resolves.toEqual({
            stockLot,
            tenantId,
        });

        expect(client.calls).toEqual([
            {
                name: 'inventory-stock',
                options: {
                    body: {
                        action: 'adjustStockLot',
                        input: {
                            stockLotId: 'lot-1',
                            quantity_delta: -2,
                            reason: 'cycle_count',
                            note: 'Counted short',
                        },
                    },
                    headers: {
                        'x-active-tenant': tenantId,
                    },
                },
            },
        ]);
    });

    it('createStockLot forwards the create payload without reshaping shared fields', async () => {
        const client = createFunctionsClient({
            data: {
                stockLot,
                tenantId,
            },
        });
        const input: StockLotCreateInput = {
            product_id: 'product-1',
            shelf_id: 'shelf-1',
            original_quantity: 10,
            quantity_on_hand: 10,
            received_at: '2026-04-01T00:00:00.000Z',
            unit_cost: 2.5,
            lot_reference: 'LOT-001',
            supplier_reference: 'SUP-001',
            notes: 'received',
        };

        await createStockLot(client as never, {
            tenantId,
            input,
        });

        expect(client.calls[0]?.options).toMatchObject({
            body: {
                action: 'createStockLot',
                input,
            },
        });
    });

    it('updateStockLot forwards the mutable stock-lot fields and stock lot id', async () => {
        const client = createFunctionsClient({
            data: {
                stockLot,
                tenantId,
            },
        });
        const input: StockLotUpdateInput = {
            shelf_id: 'shelf-2',
            quantity_on_hand: 6,
            notes: 'repacked',
        };

        await updateStockLot(client as never, {
            tenantId,
            stockLotId: 'lot-1',
            input,
        });

        expect(client.calls[0]?.options).toMatchObject({
            body: {
                action: 'updateStockLot',
                input: {
                    stockLotId: 'lot-1',
                    ...input,
                },
            },
        });
    });

    it('adjustStockLot and relocateStockLot use the shared payload contracts', async () => {
        const client = createFunctionsClient({
            data: {
                stockLot,
                tenantId,
            },
        });
        const adjustment: StockAdjustmentInput = {
            quantity_delta: 4,
            reason: 'found_stock',
            note: 'Added after recount',
        };
        const relocation: StockRelocationInput = {
            destination_shelf_id: 'shelf-9',
            reason: 're-slot',
            note: 'Moved closer to packing',
        };

        await adjustStockLot(client as never, {
            tenantId,
            stockLotId: 'lot-1',
            input: adjustment,
        });
        await relocateStockLot(client as never, {
            tenantId,
            stockLotId: 'lot-1',
            input: relocation,
        });

        expect(client.calls).toHaveLength(2);
        expect(client.calls[0]?.options).toMatchObject({
            body: {
                action: 'adjustStockLot',
                input: {
                    stockLotId: 'lot-1',
                    ...adjustment,
                },
            },
        });
        expect(client.calls[1]?.options).toMatchObject({
            body: {
                action: 'relocateStockLot',
                input: {
                    stockLotId: 'lot-1',
                    ...relocation,
                },
            },
        });
    });
});
