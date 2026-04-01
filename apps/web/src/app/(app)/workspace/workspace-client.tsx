'use client';

import { useCallback } from 'react';

import type {
    WallInventoryViewModel,
    WallScannerState,
    WallShelfDetailState,
} from '@interwall/shared';

import type { ScanBarcodeResult } from '@/app/(app)/workspace/actions';
import {
    adjustStockLotAction,
    createStockLotAction,
    getShelfDetailAction,
    relocateStockLotAction,
    scanBarcodeAction,
} from '@/app/(app)/workspace/actions';
import { WallExperienceScreen } from '@/components/wall/wall-experience-screen';

export interface WorkspaceClientProps {
    wall: WallInventoryViewModel;
    scanner: WallScannerState;
}

export function WorkspaceClient({
    wall,
    scanner,
}: WorkspaceClientProps): JSX.Element {
    const handleScanBarcode = useCallback(
        async (code: string): Promise<ScanBarcodeResult> => {
            return scanBarcodeAction({ code });
        },
        [],
    );

    const handleCreateStockLot = useCallback(
        (data: Record<string, string>) => {
            const quantity = Number(data.quantity);
            const unitCost = data.unitCost ? Number(data.unitCost) : null;

            void createStockLotAction({
                product_id: data.productId || '',
                shelf_id: data.shelfId || '',
                original_quantity: quantity,
                quantity_on_hand: quantity,
                received_at: new Date().toISOString(),
                unit_cost: unitCost,
                lot_reference: data.lotReference || null,
                supplier_reference: data.supplierReference || null,
                notes: data.notes || null,
            });
        },
        [],
    );

    const handleAdjustStockLot = useCallback(
        (data: Record<string, string>) => {
            void adjustStockLotAction({
                stockLotId: data.stockLotId,
                input: {
                    quantity_delta: Number(data.quantity),
                    reason: data.reason || 'Manual adjustment',
                    note: data.notes || null,
                },
            });
        },
        [],
    );

    const handleRelocateStockLot = useCallback(
        (data: Record<string, string>) => {
            void relocateStockLotAction({
                stockLotId: data.stockLotId,
                input: {
                    destination_shelf_id: data.shelfId,
                    reason: data.reason || 'Manual relocation',
                    note: data.notes || null,
                },
            });
        },
        [],
    );

    const handleGetShelfDetail = useCallback(
        async (shelfId: string): Promise<WallShelfDetailState> => {
            return getShelfDetailAction({ shelfId });
        },
        [],
    );

    return (
        <WallExperienceScreen
            wall={wall}
            scanner={scanner}
            onScanBarcode={handleScanBarcode}
            onCreateStockLot={handleCreateStockLot}
            onAdjustStockLot={handleAdjustStockLot}
            onRelocateStockLot={handleRelocateStockLot}
            onGetShelfDetail={handleGetShelfDetail}
        />
    );
}
