export type ProductStatus = 'active' | 'archived';
export type TrackingMode = 'none' | 'lot' | 'serial';
export type PurchaseOrderStatus =
    | 'draft'
    | 'confirmed'
    | 'partially_received'
    | 'received'
    | 'cancelled';
export type SalesOrderStatus =
    | 'draft'
    | 'confirmed'
    | 'partially_shipped'
    | 'shipped'
    | 'cancelled';
export type StockLedgerEntryType =
    | 'receipt'
    | 'shipment'
    | 'adjustment'
    | 'relocation';

export interface ProductRow {
    id: string;
    tenant_id: string;
    sku: string;
    barcode: string | null;
    name: string;
    description: string | null;
    unit_of_measure: string;
    reorder_point: number;
    safety_stock: number;
    lead_time_days: number;
    reorder_enabled: boolean;
    preferred_storage_note: string | null;
    default_cost_basis: number | null;
    tracking_mode: TrackingMode;
    status: ProductStatus;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface WarehouseRow {
    id: string;
    tenant_id: string;
    name: string;
    display_code: string;
    sort_order: number;
    is_active: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface InventoryZoneRow {
    id: string;
    tenant_id: string;
    warehouse_id: string;
    label: string;
    display_code: string;
    sort_order: number;
    is_active: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface ShelfRow {
    id: string;
    tenant_id: string;
    warehouse_id: string;
    zone_id: string;
    label: string;
    column_position: number;
    level_position: number;
    display_code: string;
    sort_order: number;
    capacity_units: number | null;
    reorder_display_threshold: number | null;
    is_active: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface StockLotRow {
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
}

export interface PurchaseOrderRow {
    id: string;
    tenant_id: string;
    order_number: string;
    warehouse_id: string;
    supplier_name: string | null;
    supplier_reference: string | null;
    status: PurchaseOrderStatus;
    order_date: string;
    expected_date: string | null;
    received_date: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface PurchaseOrderLineRow {
    id: string;
    tenant_id: string;
    purchase_order_id: string;
    product_id: string;
    quantity_ordered: number;
    quantity_received: number;
    unit_cost: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface SalesOrderRow {
    id: string;
    tenant_id: string;
    order_number: string;
    warehouse_id: string;
    customer_name: string | null;
    customer_reference: string | null;
    status: SalesOrderStatus;
    order_date: string;
    shipped_date: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface SalesOrderLineRow {
    id: string;
    tenant_id: string;
    sales_order_id: string;
    product_id: string;
    quantity_ordered: number;
    quantity_shipped: number;
    unit_price: number | null;
    cost_basis_total: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface StockLedgerEntryRow {
    id: string;
    tenant_id: string;
    stock_lot_id: string | null;
    product_id: string;
    shelf_id: string | null;
    entry_type: StockLedgerEntryType;
    quantity_delta: number;
    unit_cost_at_time: number | null;
    purchase_order_id: string | null;
    purchase_order_line_id: string | null;
    sales_order_id: string | null;
    sales_order_line_id: string | null;
    reason: string;
    note: string | null;
    created_at: string;
}

export interface ProductUpsertInput {
    sku: string;
    barcode: string | null;
    name: string;
    description: string | null;
    unit_of_measure: string;
    reorder_point: number;
    safety_stock: number;
    lead_time_days: number;
    reorder_enabled: boolean;
    preferred_storage_note: string | null;
    default_cost_basis: number | null;
    tracking_mode: TrackingMode;
    status: ProductStatus;
}

export interface WarehouseUpsertInput {
    name: string;
    display_code: string;
    sort_order: number;
    is_active: boolean;
    notes: string | null;
}

export interface InventoryZoneUpsertInput {
    warehouse_id: string;
    label: string;
    display_code: string;
    sort_order: number;
    is_active: boolean;
    notes: string | null;
}

export interface ShelfUpsertInput {
    warehouse_id: string;
    zone_id: string;
    label: string;
    column_position: number;
    level_position: number;
    display_code: string;
    sort_order: number;
    capacity_units: number | null;
    reorder_display_threshold: number | null;
    is_active: boolean;
    notes: string | null;
}

export interface StockLotCreateInput {
    product_id: string;
    shelf_id: string;
    original_quantity: number;
    quantity_on_hand: number;
    received_at: string;
    unit_cost: number | null;
    lot_reference: string | null;
    supplier_reference: string | null;
    notes: string | null;
}

export interface StockLotUpdateInput {
    shelf_id: string;
    quantity_on_hand: number;
    notes: string | null;
}

export interface StockAdjustmentInput {
    quantity_delta: number;
    reason: string;
    note: string | null;
}

export interface StockRelocationInput {
    destination_shelf_id: string;
    reason: string;
    note: string | null;
}

export interface PurchaseOrderLineInput {
    product_id: string;
    quantity_ordered: number;
    unit_cost: number | null;
    note: string | null;
}

export interface SalesOrderLineInput {
    product_id: string;
    quantity_ordered: number;
    unit_price: number | null;
    note: string | null;
}

export interface CreatePurchaseOrderInput {
    order_number: string;
    warehouse_id: string;
    supplier_name: string | null;
    supplier_reference: string | null;
    order_date: string;
    expected_date: string | null;
    note: string | null;
    lines: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderInput {
    purchase_order_id: string;
    order_number: string;
    warehouse_id: string;
    supplier_name: string | null;
    supplier_reference: string | null;
    order_date: string;
    expected_date: string | null;
    note: string | null;
    lines: PurchaseOrderLineInput[];
}

export interface ConfirmPurchaseOrderInput {
    purchase_order_id: string;
}

export interface ReceivePurchaseOrderLineInput {
    purchase_order_line_id: string;
    quantity_received: number;
    shelf_id: string;
    received_at: string;
    lot_reference: string | null;
    supplier_reference: string | null;
    note: string | null;
}

export interface CreateSalesOrderInput {
    order_number: string;
    warehouse_id: string;
    customer_name: string | null;
    customer_reference: string | null;
    order_date: string;
    expected_date: string | null;
    note: string | null;
    lines: SalesOrderLineInput[];
}

export interface UpdateSalesOrderInput {
    sales_order_id: string;
    order_number: string;
    warehouse_id: string;
    customer_name: string | null;
    customer_reference: string | null;
    order_date: string;
    expected_date: string | null;
    note: string | null;
    lines: SalesOrderLineInput[];
}

export interface ConfirmSalesOrderInput {
    sales_order_id: string;
}

export interface PreviewSalesOrderShipmentInput {
    sales_order_line_id: string;
    quantity_shipped: number;
}

export interface ShipSalesOrderLineInput {
    sales_order_line_id: string;
    quantity_shipped: number;
    note: string | null;
}

export interface CancelPurchaseOrderInput {
    purchase_order_id: string;
    reason: string;
    note: string | null;
}

export interface CancelSalesOrderInput {
    sales_order_id: string;
    reason: string;
    note: string | null;
}
