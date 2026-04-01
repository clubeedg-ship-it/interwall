export interface FifoCandidateLot {
    id: string;
    quantity_on_hand: number;
    received_at: string;
    unit_cost: number | null;
    lot_reference: string | null;
}

export interface FifoConsumptionSlice {
    stockLotId: string;
    quantityConsumed: number;
    unitCost: number | null;
}

export interface FifoConsumptionResult {
    consumed: FifoConsumptionSlice[];
    totalCost: number | null;
    remainingDemand: number;
}

export function computeFifoConsumption(
    lots: FifoCandidateLot[],
    demandQuantity: number,
): FifoConsumptionResult {
    const sortedLots = [...lots].sort((left, right) =>
        left.received_at.localeCompare(right.received_at),
    );
    const consumed: FifoConsumptionSlice[] = [];
    let remainingDemand = Math.max(demandQuantity, 0);
    let totalCost: number | null = null;

    for (const lot of sortedLots) {
        if (remainingDemand <= 0) {
            break;
        }

        if (lot.quantity_on_hand <= 0) {
            continue;
        }

        const quantityConsumed = Math.min(remainingDemand, lot.quantity_on_hand);
        consumed.push({
            stockLotId: lot.id,
            quantityConsumed,
            unitCost: lot.unit_cost,
        });

        if (lot.unit_cost !== null) {
            totalCost = (totalCost ?? 0) + lot.unit_cost * quantityConsumed;
        }

        remainingDemand -= quantityConsumed;
    }

    return {
        consumed,
        totalCost,
        remainingDemand,
    };
}
