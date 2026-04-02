import type {
    PurchaseOrderStatus,
    SalesOrderStatus,
    StockLedgerEntryType,
} from './inventory';

export type OrderType = 'purchase' | 'sales';

export interface OrderWorkspaceListItem {
    id: string;
    orderType: OrderType;
    orderNumber: string;
    counterpartyName: string | null;
    warehouseName: string;
    status: PurchaseOrderStatus | SalesOrderStatus;
    orderDate: string;
    outstandingQuantity: number;
    valueSummary: string;
    nextAction: string | null;
}

export interface OrderDetailLineItem {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    quantityOrdered: number;
    quantityReceived: number;
    quantityShipped: number;
    outstandingQuantity: number;
    unitCost: number | null;
    unitPrice: number | null;
    note: string | null;
}

export interface ShipmentFifoPreviewLot {
    stockLotId: string;
    lotReference: string | null;
    receivedAt: string;
    quantityAvailable: number;
    quantityConsumed: number;
    unitCost: number | null;
}

export interface ShipmentFifoPreview {
    lineItemId: string;
    productId: string;
    productName: string;
    requestedQuantity: number;
    remainingDemand: number;
    totalCost: number | null;
    shortfallMessage: string | null;
    lots: ShipmentFifoPreviewLot[];
}

export interface OrderLedgerEntryView {
    id: string;
    entryType: StockLedgerEntryType;
    createdAt: string;
    quantityDelta: number;
    unitCost: number | null;
    costBasisTotal: number | null;
    lotReference: string | null;
    reason: string;
    note: string | null;
    orderNumber: string | null;
}

export interface OrderDetailViewModel {
    id: string;
    orderType: OrderType;
    orderNumber: string;
    counterpartyName: string | null;
    counterpartyReference: string | null;
    warehouseId: string;
    warehouseName: string;
    status: PurchaseOrderStatus | SalesOrderStatus;
    linkedDates: {
        orderDate: string;
        expectedDate: string | null;
        receivedDate: string | null;
        shippedDate: string | null;
        createdAt: string;
    };
    valueSummary: string;
    nextAction: string | null;
    note: string | null;
    lines: OrderDetailLineItem[];
    fifoPreview: ShipmentFifoPreview | null;
    ledgerEntries: OrderLedgerEntryView[];
}
