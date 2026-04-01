import { describe, expect, it } from 'vitest';

import { computeFifoConsumption } from './fifo';

describe('computeFifoConsumption', () => {
    it('consumes the oldest lots first across multiple lots', () => {
        const result = computeFifoConsumption(
            [
                {
                    id: 'lot-newer',
                    quantity_on_hand: 4,
                    received_at: '2026-03-05T10:00:00Z',
                    unit_cost: 3.1,
                    lot_reference: 'LOT-NEW',
                },
                {
                    id: 'lot-oldest',
                    quantity_on_hand: 3,
                    received_at: '2026-03-01T10:00:00Z',
                    unit_cost: 2.5,
                    lot_reference: 'LOT-OLD',
                },
                {
                    id: 'lot-middle',
                    quantity_on_hand: 5,
                    received_at: '2026-03-03T10:00:00Z',
                    unit_cost: 2.8,
                    lot_reference: 'LOT-MID',
                },
            ],
            9,
        );

        expect(result.consumed).toEqual([
            {
                stockLotId: 'lot-oldest',
                quantityConsumed: 3,
                unitCost: 2.5,
            },
            {
                stockLotId: 'lot-middle',
                quantityConsumed: 5,
                unitCost: 2.8,
            },
            {
                stockLotId: 'lot-newer',
                quantityConsumed: 1,
                unitCost: 3.1,
            },
        ]);
        expect(result.remainingDemand).toBe(0);
    });

    it('skips depleted lots and preserves remaining demand when stock is insufficient', () => {
        const result = computeFifoConsumption(
            [
                {
                    id: 'lot-empty',
                    quantity_on_hand: 0,
                    received_at: '2026-03-01T10:00:00Z',
                    unit_cost: 1.5,
                    lot_reference: 'LOT-000',
                },
                {
                    id: 'lot-available',
                    quantity_on_hand: 2,
                    received_at: '2026-03-02T10:00:00Z',
                    unit_cost: 1.8,
                    lot_reference: 'LOT-002',
                },
            ],
            5,
        );

        expect(result.consumed).toEqual([
            {
                stockLotId: 'lot-available',
                quantityConsumed: 2,
                unitCost: 1.8,
            },
        ]);
        expect(result.remainingDemand).toBe(3);
    });

    it('returns total cost from the consumed lot slices with known costs', () => {
        const result = computeFifoConsumption(
            [
                {
                    id: 'lot-a',
                    quantity_on_hand: 2,
                    received_at: '2026-03-01T10:00:00Z',
                    unit_cost: 1.5,
                    lot_reference: 'LOT-A',
                },
                {
                    id: 'lot-b',
                    quantity_on_hand: 5,
                    received_at: '2026-03-02T10:00:00Z',
                    unit_cost: null,
                    lot_reference: 'LOT-B',
                },
                {
                    id: 'lot-c',
                    quantity_on_hand: 4,
                    received_at: '2026-03-03T10:00:00Z',
                    unit_cost: 2.25,
                    lot_reference: 'LOT-C',
                },
            ],
            8,
        );

        expect(result.totalCost).toBe(5.25);
    });

    it('returns exact shipment-preview lot slices', () => {
        const result = computeFifoConsumption(
            [
                {
                    id: 'lot-preview-a',
                    quantity_on_hand: 7,
                    received_at: '2026-03-01T10:00:00Z',
                    unit_cost: 4.2,
                    lot_reference: 'PO-1001',
                },
                {
                    id: 'lot-preview-b',
                    quantity_on_hand: 2,
                    received_at: '2026-03-04T10:00:00Z',
                    unit_cost: 4.5,
                    lot_reference: 'PO-1002',
                },
            ],
            6,
        );

        expect(result.consumed[0]).toEqual({
            stockLotId: 'lot-preview-a',
            quantityConsumed: 6,
            unitCost: 4.2,
        });
        expect(result.remainingDemand).toBe(0);
    });
});
