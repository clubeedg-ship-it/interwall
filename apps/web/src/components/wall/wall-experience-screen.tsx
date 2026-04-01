'use client';

import { useCallback, useState } from 'react';

import type {
    ProductRow,
    StockLotRow,
    WallInventoryViewModel,
    WallScannerState,
    WallShelfDetailState,
} from '@interwall/shared';

import type {
    ScanBarcodeResult,
    ScanDraftResult,
} from '@/app/(app)/workspace/actions';

import { ScanMatchSheet } from './scan-match-sheet';
import {
    ScannerCommandSurface,
    type ScannerCommandSurfaceProps,
} from './scanner-command-surface';
import { ShelfDetailPanel } from './shelf-detail-panel';
import {
    StockActionDialog,
    type StockActionMode,
} from './stock-action-dialog';
import {
    WallCanvasSection,
    type WallCanvasSectionProps,
} from './wall-canvas-section';

export interface WallExperienceScreenProps {
    wall: WallInventoryViewModel;
    scanner: WallScannerState;
    onScanBarcode?: (code: string) => Promise<ScanBarcodeResult>;
    onCreateStockLot?: (data: Record<string, string>) => void;
    onAdjustStockLot?: (data: Record<string, string>) => void;
    onRelocateStockLot?: (data: Record<string, string>) => void;
    onGetShelfDetail?: (shelfId: string) => Promise<WallShelfDetailState>;
}

export function WallExperienceScreen({
    wall,
    scanner,
    onScanBarcode,
    onCreateStockLot,
    onAdjustStockLot,
    onRelocateStockLot,
    onGetShelfDetail,
}: WallExperienceScreenProps): JSX.Element {
    const [scanMatch, setScanMatch] = useState<{
        product: ProductRow;
        lots: StockLotRow[];
    } | null>(null);

    const [stockDialog, setStockDialog] = useState<{
        mode: StockActionMode;
        open: boolean;
        draft: ScanDraftResult['draft'] | null;
    }>({
        mode: 'create',
        open: false,
        draft: null,
    });

    const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);
    const [shelfDetail, setShelfDetail] = useState<WallShelfDetailState | null>(null);

    const handleScan = useCallback(
        async (code: string) => {
            if (!onScanBarcode) {
                return;
            }

            const result = await onScanBarcode(code);

            if (result.outcome === 'match') {
                setScanMatch({
                    product: result.product,
                    lots: result.lots,
                });
            } else if (result.outcome === 'draft') {
                setStockDialog({
                    mode: 'create',
                    open: true,
                    draft: result.draft,
                });
            }
        },
        [onScanBarcode],
    );

    const handleCloseMatch = useCallback(() => {
        setScanMatch(null);
    }, []);

    const handleMatchCreateStockLot = useCallback(() => {
        setScanMatch(null);
        setStockDialog({
            mode: 'create',
            open: true,
            draft: scanMatch
                ? {
                      barcode: scanMatch.product.barcode ?? '',
                      sku: scanMatch.product.sku,
                      ean: null,
                      quantity: null,
                      unitCost: null,
                      lotReference: null,
                      supplierReference: null,
                      marketplaceName: null,
                      marketplaceReference: null,
                      shelfId: null,
                  }
                : null,
        });
    }, [scanMatch]);

    const handleShelfCreate = useCallback(
        (shelfId: string) => {
            setStockDialog({
                mode: 'create',
                open: true,
                draft: {
                    barcode: '',
                    sku: null,
                    ean: null,
                    quantity: null,
                    unitCost: null,
                    lotReference: null,
                    supplierReference: null,
                    marketplaceName: null,
                    marketplaceReference: null,
                    shelfId,
                },
            });
        },
        [],
    );

    const handleShelfAdjust = useCallback(() => {
        setStockDialog({
            mode: 'adjust',
            open: true,
            draft: null,
        });
    }, []);

    const handleShelfRelocate = useCallback(() => {
        setStockDialog({
            mode: 'relocate',
            open: true,
            draft: null,
        });
    }, []);

    const handleSelectShelf = useCallback(
        async (shelfId: string) => {
            setSelectedShelfId(shelfId);
            if (onGetShelfDetail) {
                const detail = await onGetShelfDetail(shelfId);
                setShelfDetail(detail);
            }
        },
        [onGetShelfDetail],
    );

    const handleCloseShelfDetail = useCallback(() => {
        setSelectedShelfId(null);
        setShelfDetail(null);
    }, []);

    const handleDialogClose = useCallback(() => {
        setStockDialog((prev) => ({ ...prev, open: false }));
    }, []);

    const handleDialogSubmit = useCallback(
        (data: Record<string, string>) => {
            if (stockDialog.mode === 'create') {
                onCreateStockLot?.(data);
            } else if (stockDialog.mode === 'adjust') {
                onAdjustStockLot?.(data);
            } else if (stockDialog.mode === 'relocate') {
                onRelocateStockLot?.(data);
            }

            setStockDialog((prev) => ({ ...prev, open: false }));
        },
        [stockDialog.mode, onCreateStockLot, onAdjustStockLot, onRelocateStockLot],
    );

    const wallCanvasProps: WallCanvasSectionProps = {
        wall,
        onSelectShelf: handleSelectShelf,
    };
    const scannerSurfaceProps: ScannerCommandSurfaceProps = {
        scanner,
        onScan: handleScan,
    };

    const renderRightColumn = (): JSX.Element => {
        if (shelfDetail) {
            return (
                <ShelfDetailPanel
                    detail={shelfDetail}
                    onClose={handleCloseShelfDetail}
                    onCreateStockLot={() => handleShelfCreate(shelfDetail.shelfId)}
                    onAdjustLot={handleShelfAdjust}
                    onRelocateLot={handleShelfRelocate}
                />
            );
        }

        if (scanMatch) {
            return (
                <ScanMatchSheet
                    product={scanMatch.product}
                    lots={scanMatch.lots}
                    onClose={handleCloseMatch}
                    onCreateStockLot={handleMatchCreateStockLot}
                />
            );
        }

        return <ScannerCommandSurface {...scannerSurfaceProps} />;
    };

    return (
        <>
            <div className="flex w-full flex-col gap-6 xl:flex-row">
                <WallCanvasSection {...wallCanvasProps} />
                {renderRightColumn()}
            </div>
            <StockActionDialog
                mode={stockDialog.mode}
                open={stockDialog.open}
                onClose={handleDialogClose}
                onSubmit={handleDialogSubmit}
                draft={stockDialog.draft}
            />
        </>
    );
}
