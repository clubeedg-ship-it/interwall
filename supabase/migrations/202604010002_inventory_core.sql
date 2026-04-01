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

create or replace function public.assert_inventory_parent_tenant(
    expected_tenant_id uuid,
    parent_tenant_id uuid,
    relation_name text
)
returns void
language plpgsql
as $$
begin
    if parent_tenant_id is null then
        raise exception '% references a missing parent record', relation_name;
    end if;

    if expected_tenant_id <> parent_tenant_id then
        raise exception '% tenant mismatch for tenant %', relation_name, expected_tenant_id;
    end if;
end;
$$;

create or replace function public.inventory_make_shelf_display_code(
    zone_label text,
    shelf_column integer,
    shelf_level integer
)
returns text
language sql
immutable
as $$
    select upper(trim(zone_label))
        || '-'
        || lpad(shelf_column::text, 2, '0')
        || '-'
        || lpad(shelf_level::text, 2, '0');
$$;

create or replace function public.apply_inventory_warehouse_defaults()
returns trigger
language plpgsql
as $$
begin
    new.code = upper(trim(new.code));
    new.display_code = new.code;
    return new;
end;
$$;

create or replace function public.enforce_inventory_zone_lineage()
returns trigger
language plpgsql
as $$
declare
    warehouse_tenant_id uuid;
begin
    select warehouse.tenant_id
    into warehouse_tenant_id
    from public.warehouses warehouse
    where warehouse.id = new.warehouse_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        warehouse_tenant_id,
        'inventory_zones.warehouse_id'
    );

    new.label = upper(trim(new.label));
    new.display_code = new.label;

    return new;
end;
$$;

create or replace function public.enforce_inventory_shelf_lineage()
returns trigger
language plpgsql
as $$
declare
    warehouse_tenant_id uuid;
    zone_tenant_id uuid;
    zone_warehouse_id uuid;
    zone_label text;
begin
    select warehouse.tenant_id
    into warehouse_tenant_id
    from public.warehouses warehouse
    where warehouse.id = new.warehouse_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        warehouse_tenant_id,
        'shelves.warehouse_id'
    );

    select zone.tenant_id, zone.warehouse_id, zone.label
    into zone_tenant_id, zone_warehouse_id, zone_label
    from public.inventory_zones zone
    where zone.id = new.zone_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        zone_tenant_id,
        'shelves.zone_id'
    );

    if zone_warehouse_id <> new.warehouse_id then
        raise exception 'shelves.zone_id must belong to shelves.warehouse_id';
    end if;

    new.display_code = public.inventory_make_shelf_display_code(
        zone_label,
        new.column_position,
        new.level_position
    );
    new.label = coalesce(nullif(trim(new.label), ''), new.display_code);

    return new;
end;
$$;

create or replace function public.enforce_inventory_stock_lot_lineage()
returns trigger
language plpgsql
as $$
declare
    product_tenant_id uuid;
    shelf_tenant_id uuid;
begin
    select product.tenant_id
    into product_tenant_id
    from public.products product
    where product.id = new.product_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        product_tenant_id,
        'stock_lots.product_id'
    );

    select shelf.tenant_id
    into shelf_tenant_id
    from public.shelves shelf
    where shelf.id = new.shelf_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        shelf_tenant_id,
        'stock_lots.shelf_id'
    );

    return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists set_warehouses_updated_at on public.warehouses;
create trigger set_warehouses_updated_at
before update on public.warehouses
for each row
execute function public.set_updated_at();

drop trigger if exists set_inventory_zones_updated_at on public.inventory_zones;
create trigger set_inventory_zones_updated_at
before update on public.inventory_zones
for each row
execute function public.set_updated_at();

drop trigger if exists set_shelves_updated_at on public.shelves;
create trigger set_shelves_updated_at
before update on public.shelves
for each row
execute function public.set_updated_at();

drop trigger if exists set_stock_lots_updated_at on public.stock_lots;
create trigger set_stock_lots_updated_at
before update on public.stock_lots
for each row
execute function public.set_updated_at();

drop trigger if exists apply_inventory_warehouse_defaults on public.warehouses;
create trigger apply_inventory_warehouse_defaults
before insert or update on public.warehouses
for each row
execute function public.apply_inventory_warehouse_defaults();

drop trigger if exists enforce_inventory_zone_lineage on public.inventory_zones;
create trigger enforce_inventory_zone_lineage
before insert or update on public.inventory_zones
for each row
execute function public.enforce_inventory_zone_lineage();

drop trigger if exists enforce_inventory_shelf_lineage on public.shelves;
create trigger enforce_inventory_shelf_lineage
before insert or update on public.shelves
for each row
execute function public.enforce_inventory_shelf_lineage();

drop trigger if exists enforce_inventory_stock_lot_lineage on public.stock_lots;
create trigger enforce_inventory_stock_lot_lineage
before insert or update on public.stock_lots
for each row
execute function public.enforce_inventory_stock_lot_lineage();

alter table public.products enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory_zones enable row level security;
alter table public.shelves enable row level security;
alter table public.stock_lots enable row level security;

drop policy if exists "products_select_member" on public.products;
create policy "products_select_member"
on public.products
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "products_insert_member" on public.products;
create policy "products_insert_member"
on public.products
for insert
to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "products_update_member" on public.products;
create policy "products_update_member"
on public.products
for update
to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "products_delete_member" on public.products;
create policy "products_delete_member"
on public.products
for delete
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "warehouses_select_member" on public.warehouses;
create policy "warehouses_select_member"
on public.warehouses
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "warehouses_insert_member" on public.warehouses;
create policy "warehouses_insert_member"
on public.warehouses
for insert
to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "warehouses_update_member" on public.warehouses;
create policy "warehouses_update_member"
on public.warehouses
for update
to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "warehouses_delete_member" on public.warehouses;
create policy "warehouses_delete_member"
on public.warehouses
for delete
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "inventory_zones_select_member" on public.inventory_zones;
create policy "inventory_zones_select_member"
on public.inventory_zones
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "inventory_zones_insert_member" on public.inventory_zones;
create policy "inventory_zones_insert_member"
on public.inventory_zones
for insert
to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "inventory_zones_update_member" on public.inventory_zones;
create policy "inventory_zones_update_member"
on public.inventory_zones
for update
to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "inventory_zones_delete_member" on public.inventory_zones;
create policy "inventory_zones_delete_member"
on public.inventory_zones
for delete
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "shelves_select_member" on public.shelves;
create policy "shelves_select_member"
on public.shelves
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "shelves_insert_member" on public.shelves;
create policy "shelves_insert_member"
on public.shelves
for insert
to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "shelves_update_member" on public.shelves;
create policy "shelves_update_member"
on public.shelves
for update
to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "shelves_delete_member" on public.shelves;
create policy "shelves_delete_member"
on public.shelves
for delete
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "stock_lots_select_member" on public.stock_lots;
create policy "stock_lots_select_member"
on public.stock_lots
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "stock_lots_insert_member" on public.stock_lots;
create policy "stock_lots_insert_member"
on public.stock_lots
for insert
to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "stock_lots_update_member" on public.stock_lots;
create policy "stock_lots_update_member"
on public.stock_lots
for update
to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "stock_lots_delete_member" on public.stock_lots;
create policy "stock_lots_delete_member"
on public.stock_lots
for delete
to authenticated
using (public.is_tenant_member(tenant_id));
