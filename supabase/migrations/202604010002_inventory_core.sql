do $$
begin
    if not exists (
        select 1
        from pg_type
        where typname = 'product_tracking_mode'
          and typnamespace = 'public'::regnamespace
    ) then
        create type public.product_tracking_mode as enum ('none', 'lot', 'serial');
    end if;

    if not exists (
        select 1
        from pg_type
        where typname = 'product_status'
          and typnamespace = 'public'::regnamespace
    ) then
        create type public.product_status as enum ('active', 'archived');
    end if;
end
$$;

create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    sku extensions.citext not null,
    barcode text,
    name text not null,
    description text,
    unit_of_measure text not null default 'each',
    reorder_point numeric(14, 3) not null default 0,
    safety_stock numeric(14, 3) not null default 0,
    lead_time_days integer not null default 0,
    reorder_enabled boolean not null default true,
    preferred_storage_note text,
    default_cost_basis numeric(14, 4),
    tracking_mode public.product_tracking_mode not null default 'none',
    status public.product_status not null default 'active',
    archived_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint products_reorder_point_check check (reorder_point >= 0),
    constraint products_safety_stock_check check (safety_stock >= 0),
    constraint products_lead_time_days_check check (lead_time_days >= 0),
    constraint products_default_cost_basis_check check (default_cost_basis is null or default_cost_basis >= 0),
    constraint products_archived_status_check check (
        (status = 'archived' and archived_at is not null)
        or (status = 'active' and archived_at is null)
    )
);

create table if not exists public.warehouses (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    name text not null,
    code text not null,
    display_code text not null,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory_zones (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    warehouse_id uuid not null references public.warehouses (id) on delete cascade,
    label text not null,
    display_code text not null,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.shelves (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    warehouse_id uuid not null references public.warehouses (id) on delete cascade,
    zone_id uuid not null references public.inventory_zones (id) on delete cascade,
    label text not null,
    column_position integer not null,
    level_position integer not null,
    display_code text not null,
    sort_order integer not null default 0,
    capacity_units numeric(14, 3),
    reorder_display_threshold numeric(14, 3),
    is_active boolean not null default true,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint shelves_column_position_check check (column_position > 0),
    constraint shelves_level_position_check check (level_position > 0),
    constraint shelves_capacity_units_check check (capacity_units is null or capacity_units >= 0),
    constraint shelves_reorder_display_threshold_check check (
        reorder_display_threshold is null or reorder_display_threshold >= 0
    )
);

create table if not exists public.stock_lots (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    product_id uuid not null references public.products (id) on delete cascade,
    shelf_id uuid not null references public.shelves (id) on delete restrict,
    original_quantity numeric(14, 3) not null,
    quantity_on_hand numeric(14, 3) not null,
    received_at timestamptz not null default timezone('utc', now()),
    unit_cost numeric(14, 4),
    lot_reference text,
    supplier_reference text,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint stock_lots_original_quantity_check check (original_quantity > 0),
    constraint stock_lots_quantity_on_hand_check check (quantity_on_hand >= 0),
    constraint stock_lots_unit_cost_check check (unit_cost is null or unit_cost >= 0)
);

create unique index if not exists products_tenant_sku_key
    on public.products (tenant_id, sku);

create unique index if not exists products_tenant_barcode_key
    on public.products (tenant_id, barcode)
    where barcode is not null;

create unique index if not exists warehouses_tenant_code_key
    on public.warehouses (tenant_id, code);

create unique index if not exists inventory_zones_warehouse_label_key
    on public.inventory_zones (warehouse_id, label);

create unique index if not exists shelves_zone_coordinates_key
    on public.shelves (zone_id, column_position, level_position);

create index if not exists products_tenant_id_idx
    on public.products (tenant_id);

create index if not exists products_tenant_status_idx
    on public.products (tenant_id, status, archived_at);

create index if not exists products_reorder_enabled_idx
    on public.products (tenant_id, reorder_enabled, status);

create index if not exists warehouses_tenant_id_idx
    on public.warehouses (tenant_id);

create index if not exists warehouses_active_idx
    on public.warehouses (tenant_id, is_active);

create index if not exists inventory_zones_tenant_id_idx
    on public.inventory_zones (tenant_id);

create index if not exists inventory_zones_warehouse_active_idx
    on public.inventory_zones (warehouse_id, is_active, sort_order);

create index if not exists shelves_tenant_id_idx
    on public.shelves (tenant_id);

create index if not exists shelves_zone_active_idx
    on public.shelves (zone_id, is_active, sort_order);

create index if not exists shelves_display_code_idx
    on public.shelves (tenant_id, display_code);

create index if not exists stock_lots_tenant_id_idx
    on public.stock_lots (tenant_id);

create index if not exists stock_lots_product_id_idx
    on public.stock_lots (product_id);

create index if not exists stock_lots_shelf_id_idx
    on public.stock_lots (shelf_id);

create index if not exists stock_lots_received_at_idx
    on public.stock_lots (tenant_id, received_at);

create index if not exists stock_lots_product_received_at_idx
    on public.stock_lots (product_id, received_at, quantity_on_hand);
