import type { AppRole } from './tenancy';
export type {
    InventoryZoneRow,
    ProductRow,
    ProductStatus,
    ShelfRow,
    StockLotRow,
    TrackingMode,
    WarehouseRow,
} from './inventory';

export type TenantMembershipStatus = 'active' | 'invited' | 'inactive';

export interface TenantRow {
    id: string;
    slug: string;
    name: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface TenantMembershipRow {
    id: string;
    tenant_id: string;
    user_id: string;
    role: AppRole;
    status: TenantMembershipStatus;
    created_at: string;
    updated_at: string;
}

export interface TenantSettingsRow {
    tenant_id: string;
    timezone: string;
    currency_code: string;
    settings: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
