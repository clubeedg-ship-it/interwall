do $$
begin
    if not exists (
        select 1
        from pg_type
        where typname = 'purchase_order_status'
          and typnamespace = 'public'::regnamespace
    ) then
        create type public.purchase_order_status as enum (
            'draft',
            'confirmed',
            'partially_received',
            'received',
            'cancelled'
        );
    end if;

    if not exists (
        select 1
        from pg_type
        where typname = 'sales_order_status'
          and typnamespace = 'public'::regnamespace
    ) then
        create type public.sales_order_status as enum (
            'draft',
            'confirmed',
            'partially_shipped',
            'shipped',
            'cancelled'
        );
    end if;

    if not exists (
        select 1
        from pg_type
        where typname = 'stock_ledger_entry_type'
          and typnamespace = 'public'::regnamespace
    ) then
        create type public.stock_ledger_entry_type as enum (
            'receipt',
            'shipment',
            'adjustment',
            'relocation'
        );
    end if;
end
$$;

create sequence if not exists public.purchase_order_number_seq;
create sequence if not exists public.sales_order_number_seq;

create table if not exists public.purchase_orders (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    order_number text not null,
    warehouse_id uuid not null references public.warehouses (id) on delete restrict,
    supplier_name text,
    supplier_reference text,
    status public.purchase_order_status not null default 'draft',
    order_date date not null default current_date,
    expected_date date,
    received_date date,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_order_lines (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
    product_id uuid not null references public.products (id) on delete restrict,
    quantity_ordered numeric(14,4) not null,
    quantity_received numeric(14,4) not null default 0,
    unit_cost numeric(14,4),
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint purchase_order_lines_quantity_ordered_check check (quantity_ordered > 0),
    constraint purchase_order_lines_quantity_received_check check (
        quantity_received >= 0
        and quantity_received <= quantity_ordered
    ),
    constraint purchase_order_lines_unit_cost_check check (unit_cost is null or unit_cost >= 0)
);

create table if not exists public.sales_orders (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    order_number text not null,
    warehouse_id uuid not null references public.warehouses (id) on delete restrict,
    customer_name text,
    customer_reference text,
    status public.sales_order_status not null default 'draft',
    order_date date not null default current_date,
    shipped_date date,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sales_order_lines (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    sales_order_id uuid not null references public.sales_orders (id) on delete cascade,
    product_id uuid not null references public.products (id) on delete restrict,
    quantity_ordered numeric(14,4) not null,
    quantity_shipped numeric(14,4) not null default 0,
    unit_price numeric(14,4),
    cost_basis_total numeric(14,4),
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint sales_order_lines_quantity_ordered_check check (quantity_ordered > 0),
    constraint sales_order_lines_quantity_shipped_check check (
        quantity_shipped >= 0
        and quantity_shipped <= quantity_ordered
    ),
    constraint sales_order_lines_unit_price_check check (unit_price is null or unit_price >= 0),
    constraint sales_order_lines_cost_basis_total_check check (
        cost_basis_total is null or cost_basis_total >= 0
    )
);

create table if not exists public.stock_ledger_entries (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    stock_lot_id uuid references public.stock_lots (id) on delete restrict,
    product_id uuid not null references public.products (id) on delete restrict,
    shelf_id uuid references public.shelves (id) on delete restrict,
    entry_type public.stock_ledger_entry_type not null,
    quantity_delta numeric(14,4) not null,
    unit_cost_at_time numeric(14,4),
    purchase_order_id uuid references public.purchase_orders (id) on delete restrict,
    purchase_order_line_id uuid references public.purchase_order_lines (id) on delete restrict,
    sales_order_id uuid references public.sales_orders (id) on delete restrict,
    sales_order_line_id uuid references public.sales_order_lines (id) on delete restrict,
    reason text not null,
    note text,
    created_at timestamptz not null default timezone('utc', now()),
    constraint stock_ledger_entries_quantity_delta_nonzero_check check (quantity_delta <> 0),
    constraint stock_ledger_entries_unit_cost_at_time_check check (
        unit_cost_at_time is null or unit_cost_at_time >= 0
    )
);

create unique index if not exists purchase_orders_tenant_order_number_key
    on public.purchase_orders (tenant_id, order_number);

create unique index if not exists sales_orders_tenant_order_number_key
    on public.sales_orders (tenant_id, order_number);

create index if not exists purchase_order_lines_purchase_order_id_idx
    on public.purchase_order_lines (purchase_order_id);

create index if not exists purchase_order_lines_product_id_idx
    on public.purchase_order_lines (product_id);

create index if not exists sales_order_lines_sales_order_id_idx
    on public.sales_order_lines (sales_order_id);

create index if not exists sales_order_lines_product_id_idx
    on public.sales_order_lines (product_id);

create index if not exists stock_ledger_entries_stock_lot_id_idx
    on public.stock_ledger_entries (stock_lot_id);

create index if not exists stock_ledger_entries_product_id_idx
    on public.stock_ledger_entries (product_id);

create index if not exists stock_ledger_entries_purchase_order_line_id_idx
    on public.stock_ledger_entries (purchase_order_line_id);

create index if not exists stock_ledger_entries_sales_order_line_id_idx
    on public.stock_ledger_entries (sales_order_line_id);

create index if not exists stock_ledger_entries_tenant_created_at_idx
    on public.stock_ledger_entries (tenant_id, created_at desc);

create index if not exists stock_lots_tenant_product_received_at_idx
    on public.stock_lots (tenant_id, product_id, received_at);
