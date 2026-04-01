export type WallShelfHealth = 'healthy' | 'warning' | 'critical' | 'empty';
export type WallScannerStatus = 'ready' | 'matched' | 'create';
export type WallScannerMatchType = 'product' | 'shelf' | 'lot';

export interface WallShelfState {
    id: string;
    label: string;
    displayCode: string;
    health: WallShelfHealth;
    productName: string | null;
    quantityOnHand: number;
    capacityUnits: number | null;
    reorderCount: number;
    lotCount: number;
    notes: string | null;
}

export interface WallZoneState {
    id: string;
    label: string;
    displayCode: string;
    shelfCount: number;
    shelves: WallShelfState[];
}

export interface WallShelfLotState {
    id: string;
    productName: string;
    quantityOnHand: number;
    receivedAt: string;
    unitCost: number | null;
    lotReference: string | null;
    supplierReference: string | null;
    notes: string | null;
}

export interface WallShelfDetailState {
    shelfId: string;
    shelfLabel: string;
    shelfDisplayCode: string;
    health: WallShelfHealth;
    quantityOnHand: number;
    capacityUnits: number | null;
    reorderThreshold: number | null;
    stockValue: number | null;
    primaryProductName: string | null;
    lots: WallShelfLotState[];
}

export interface WallScannerMatch {
    id: string;
    type: WallScannerMatchType;
    title: string;
    subtitle: string | null;
    barcode: string;
    shelfLabel: string | null;
}

export interface WallStockActionDraft {
    barcode: string;
    sku: string | null;
    quantity: number | null;
    unitCost: number | null;
    lotReference: string | null;
    supplierReference: string | null;
    shelfId: string | null;
}

export interface WallScannerState {
    query: string;
    status: WallScannerStatus;
    activeModeLabel: string;
    pendingDraft: WallStockActionDraft | null;
    matches: WallScannerMatch[];
}

export interface WallInventoryViewModel {
    warehouseName: string;
    zones: WallZoneState[];
    selectedZoneId: string | null;
    selectedShelfId: string | null;
    detail: WallShelfDetailState | null;
}
