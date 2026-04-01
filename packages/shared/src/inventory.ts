export type ProductStatus = 'active' | 'archived';
export type TrackingMode = 'none' | 'lot' | 'serial';

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
