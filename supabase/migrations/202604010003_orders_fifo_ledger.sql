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

comment on table public.purchase_orders is
    'Server-owned purchase order headers. Tenant members can read; writes flow through trusted server-side paths.';
comment on table public.purchase_order_lines is
    'Server-owned purchase order lines. Receiving updates happen through apply_purchase_order_receipt.';
comment on table public.sales_orders is
    'Server-owned sales order headers. Tenant members can read; writes flow through trusted server-side paths.';
comment on table public.sales_order_lines is
    'Server-owned sales order lines. Shipment updates happen through apply_sales_order_shipment.';
comment on table public.stock_ledger_entries is
    'Immutable stock ledger. Appends happen through trusted server-side receipt/shipment workflows.';

create or replace function public.enforce_purchase_order_lineage()
returns trigger
language plpgsql
as $$
declare
    purchase_order_tenant_id uuid;
    purchase_order_warehouse_id uuid;
    warehouse_tenant_id uuid;
begin
    select purchase_order.tenant_id, purchase_order.warehouse_id
    into purchase_order_tenant_id, purchase_order_warehouse_id
    from public.purchase_orders purchase_order
    where purchase_order.id = new.purchase_order_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        purchase_order_tenant_id,
        'purchase_order_lines.purchase_order_id'
    );

    select warehouse.tenant_id
    into warehouse_tenant_id
    from public.warehouses warehouse
    where warehouse.id = purchase_order_warehouse_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        warehouse_tenant_id,
        'purchase_orders.warehouse_id'
    );

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        (
            select product.tenant_id
            from public.products product
            where product.id = new.product_id
        ),
        'purchase_order_lines.product_id'
    );

    return new;
end;
$$;

create or replace function public.enforce_sales_order_lineage()
returns trigger
language plpgsql
as $$
declare
    sales_order_tenant_id uuid;
    sales_order_warehouse_id uuid;
    warehouse_tenant_id uuid;
begin
    select sales_order.tenant_id, sales_order.warehouse_id
    into sales_order_tenant_id, sales_order_warehouse_id
    from public.sales_orders sales_order
    where sales_order.id = new.sales_order_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        sales_order_tenant_id,
        'sales_order_lines.sales_order_id'
    );

    select warehouse.tenant_id
    into warehouse_tenant_id
    from public.warehouses warehouse
    where warehouse.id = sales_order_warehouse_id;

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        warehouse_tenant_id,
        'sales_orders.warehouse_id'
    );

    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        (
            select product.tenant_id
            from public.products product
            where product.id = new.product_id
        ),
        'sales_order_lines.product_id'
    );

    return new;
end;
$$;

create or replace function public.enforce_stock_ledger_entry_lineage()
returns trigger
language plpgsql
as $$
declare
    stock_lot_tenant_id uuid;
    stock_lot_product_id uuid;
    stock_lot_shelf_id uuid;
    linked_purchase_order_id uuid;
    linked_sales_order_id uuid;
begin
    if new.entry_type = 'receipt' then
        if new.purchase_order_id is null or new.purchase_order_line_id is null then
            raise exception 'receipt ledger entries require purchase order links';
        end if;

        if new.sales_order_id is not null or new.sales_order_line_id is not null then
            raise exception 'receipt ledger entries cannot include sales order links';
        end if;
    elsif new.entry_type = 'shipment' then
        if new.sales_order_id is null or new.sales_order_line_id is null then
            raise exception 'shipment ledger entries require sales order links';
        end if;

        if new.purchase_order_id is not null or new.purchase_order_line_id is not null then
            raise exception 'shipment ledger entries cannot include purchase order links';
        end if;
    end if;

    if new.stock_lot_id is not null then
        select stock_lot.tenant_id, stock_lot.product_id, stock_lot.shelf_id
        into stock_lot_tenant_id, stock_lot_product_id, stock_lot_shelf_id
        from public.stock_lots stock_lot
        where stock_lot.id = new.stock_lot_id;

        perform public.assert_inventory_parent_tenant(
            new.tenant_id,
            stock_lot_tenant_id,
            'stock_ledger_entries.stock_lot_id'
        );

        if stock_lot_product_id <> new.product_id then
            raise exception 'stock_ledger_entries.product_id must match stock_lot.product_id';
        end if;

        if new.shelf_id is not null and stock_lot_shelf_id <> new.shelf_id then
            raise exception 'stock_ledger_entries.shelf_id must match stock_lot.shelf_id';
        end if;
    end if;

    if new.purchase_order_id is not null then
        perform public.assert_inventory_parent_tenant(
            new.tenant_id,
            (
                select purchase_order.tenant_id
                from public.purchase_orders purchase_order
                where purchase_order.id = new.purchase_order_id
            ),
            'stock_ledger_entries.purchase_order_id'
        );
    end if;

    if new.purchase_order_line_id is not null then
        select purchase_order_line.purchase_order_id
        into linked_purchase_order_id
        from public.purchase_order_lines purchase_order_line
        where purchase_order_line.id = new.purchase_order_line_id;

        perform public.assert_inventory_parent_tenant(
            new.tenant_id,
            (
                select purchase_order_line.tenant_id
                from public.purchase_order_lines purchase_order_line
                where purchase_order_line.id = new.purchase_order_line_id
            ),
            'stock_ledger_entries.purchase_order_line_id'
        );

        if new.purchase_order_id is not null and linked_purchase_order_id <> new.purchase_order_id then
            raise exception 'purchase order line must belong to the referenced purchase order';
        end if;
    end if;

    if new.sales_order_id is not null then
        perform public.assert_inventory_parent_tenant(
            new.tenant_id,
            (
                select sales_order.tenant_id
                from public.sales_orders sales_order
                where sales_order.id = new.sales_order_id
            ),
            'stock_ledger_entries.sales_order_id'
        );
    end if;

    if new.sales_order_line_id is not null then
        select sales_order_line.sales_order_id
        into linked_sales_order_id
        from public.sales_order_lines sales_order_line
        where sales_order_line.id = new.sales_order_line_id;

        perform public.assert_inventory_parent_tenant(
            new.tenant_id,
            (
                select sales_order_line.tenant_id
                from public.sales_order_lines sales_order_line
                where sales_order_line.id = new.sales_order_line_id
            ),
            'stock_ledger_entries.sales_order_line_id'
        );

        if new.sales_order_id is not null and linked_sales_order_id <> new.sales_order_id then
            raise exception 'sales order line must belong to the referenced sales order';
        end if;
    end if;

    return new;
end;
$$;

create or replace function public.enforce_order_header_lineage()
returns trigger
language plpgsql
as $$
begin
    perform public.assert_inventory_parent_tenant(
        new.tenant_id,
        (
            select warehouse.tenant_id
            from public.warehouses warehouse
            where warehouse.id = new.warehouse_id
        ),
        tg_table_name || '.warehouse_id'
    );

    return new;
end;
$$;

create or replace function public.next_purchase_order_number()
returns text
language sql
set search_path = public
as $$
    select 'PO-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0');
$$;

create or replace function public.next_sales_order_number()
returns text
language sql
set search_path = public
as $$
    select 'SO-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0');
$$;

create or replace function public.sync_purchase_order_status(p_purchase_order_id uuid)
returns public.purchase_order_status
language plpgsql
set search_path = public
as $$
declare
    v_current_status public.purchase_order_status;
    v_total_ordered numeric(14,4);
    v_total_received numeric(14,4);
    v_next_status public.purchase_order_status;
begin
    select purchase_order.status
    into v_current_status
    from public.purchase_orders purchase_order
    where purchase_order.id = p_purchase_order_id
    for update;

    if not found then
        raise exception 'purchase order % not found', p_purchase_order_id;
    end if;

    if v_current_status = 'cancelled' then
        return v_current_status;
    end if;

    select
        coalesce(sum(line.quantity_ordered), 0),
        coalesce(sum(line.quantity_received), 0)
    into v_total_ordered, v_total_received
    from public.purchase_order_lines line
    where line.purchase_order_id = p_purchase_order_id;

    v_next_status = case
        when v_total_ordered = 0 then 'draft'
        when v_total_received = 0 and v_current_status = 'draft' then 'draft'
        when v_total_received = 0 then 'confirmed'
        when v_total_received < v_total_ordered then 'partially_received'
        else 'received'
    end;

    update public.purchase_orders purchase_order
    set status = v_next_status,
        received_date = case
            when v_next_status = 'received' then current_date
            else null
        end
    where purchase_order.id = p_purchase_order_id;

    return v_next_status;
end;
$$;

create or replace function public.sync_sales_order_status(p_sales_order_id uuid)
returns public.sales_order_status
language plpgsql
set search_path = public
as $$
declare
    v_current_status public.sales_order_status;
    v_total_ordered numeric(14,4);
    v_total_shipped numeric(14,4);
    v_next_status public.sales_order_status;
begin
    select sales_order.status
    into v_current_status
    from public.sales_orders sales_order
    where sales_order.id = p_sales_order_id
    for update;

    if not found then
        raise exception 'sales order % not found', p_sales_order_id;
    end if;

    if v_current_status = 'cancelled' then
        return v_current_status;
    end if;

    select
        coalesce(sum(line.quantity_ordered), 0),
        coalesce(sum(line.quantity_shipped), 0)
    into v_total_ordered, v_total_shipped
    from public.sales_order_lines line
    where line.sales_order_id = p_sales_order_id;

    v_next_status = case
        when v_total_ordered = 0 then 'draft'
        when v_total_shipped = 0 and v_current_status = 'draft' then 'draft'
        when v_total_shipped = 0 then 'confirmed'
        when v_total_shipped < v_total_ordered then 'partially_shipped'
        else 'shipped'
    end;

    update public.sales_orders sales_order
    set status = v_next_status,
        shipped_date = case
            when v_next_status = 'shipped' then current_date
            else null
        end
    where sales_order.id = p_sales_order_id;

    return v_next_status;
end;
$$;

create or replace function public.apply_purchase_order_receipt(
    p_purchase_order_line_id uuid,
    p_shelf_id uuid,
    p_quantity_received numeric(14,4),
    p_received_at timestamptz default timezone('utc', now()),
    p_lot_reference text default null,
    p_supplier_reference text default null,
    p_reason text default 'purchase_order_receipt',
    p_note text default null
)
returns table (
    stock_lot_id uuid,
    ledger_entry_id uuid,
    purchase_order_status public.purchase_order_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_line public.purchase_order_lines%rowtype;
    v_order public.purchase_orders%rowtype;
    v_shelf public.shelves%rowtype;
    v_remaining_quantity numeric(14,4);
begin
    if p_quantity_received <= 0 then
        raise exception 'received quantity must be greater than zero';
    end if;

    select line.*
    into v_line
    from public.purchase_order_lines line
    where line.id = p_purchase_order_line_id
    for update;

    if not found then
        raise exception 'purchase order line % not found', p_purchase_order_line_id;
    end if;

    select purchase_order.*
    into v_order
    from public.purchase_orders purchase_order
    where purchase_order.id = v_line.purchase_order_id
    for update;

    if v_order.status = 'cancelled' then
        raise exception 'cannot receive stock for a cancelled purchase order';
    end if;

    if v_order.status = 'received' then
        raise exception 'purchase order % is already fully received', v_order.id;
    end if;

    select shelf.*
    into v_shelf
    from public.shelves shelf
    where shelf.id = p_shelf_id;

    if not found then
        raise exception 'destination shelf % not found', p_shelf_id;
    end if;

    if v_shelf.tenant_id <> v_order.tenant_id then
        raise exception 'destination shelf tenant mismatch';
    end if;

    if v_shelf.warehouse_id <> v_order.warehouse_id then
        raise exception 'destination shelf must belong to the purchase order warehouse';
    end if;

    v_remaining_quantity = v_line.quantity_ordered - v_line.quantity_received;

    if p_quantity_received > v_remaining_quantity then
        raise exception 'receipt quantity % exceeds remaining quantity %', p_quantity_received, v_remaining_quantity;
    end if;

    insert into public.stock_lots (
        tenant_id,
        product_id,
        shelf_id,
        original_quantity,
        quantity_on_hand,
        received_at,
        unit_cost,
        lot_reference,
        supplier_reference,
        notes
    )
    values (
        v_line.tenant_id,
        v_line.product_id,
        p_shelf_id,
        p_quantity_received,
        p_quantity_received,
        coalesce(p_received_at, timezone('utc', now())),
        v_line.unit_cost,
        p_lot_reference,
        coalesce(p_supplier_reference, v_order.supplier_reference),
        p_note
    )
    returning id into stock_lot_id;

    insert into public.stock_ledger_entries (
        tenant_id,
        stock_lot_id,
        product_id,
        shelf_id,
        entry_type,
        quantity_delta,
        unit_cost_at_time,
        purchase_order_id,
        purchase_order_line_id,
        reason,
        note,
        created_at
    )
    values (
        v_line.tenant_id,
        stock_lot_id,
        v_line.product_id,
        p_shelf_id,
        'receipt',
        p_quantity_received,
        v_line.unit_cost,
        v_order.id,
        v_line.id,
        p_reason,
        p_note,
        coalesce(p_received_at, timezone('utc', now()))
    )
    returning id into ledger_entry_id;

    update public.purchase_order_lines line
    set quantity_received = line.quantity_received + p_quantity_received
    where line.id = v_line.id;

    purchase_order_status := public.sync_purchase_order_status(v_order.id);

    return next;
end;
$$;

create or replace function public.apply_sales_order_shipment(
    p_sales_order_line_id uuid,
    p_quantity_shipped numeric(14,4),
    p_reason text default 'sales_order_shipment',
    p_note text default null
)
returns table (
    quantity_shipped numeric(14,4),
    cost_basis_total numeric(14,4),
    sales_order_status public.sales_order_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_line public.sales_order_lines%rowtype;
    v_order public.sales_orders%rowtype;
    v_remaining_quantity numeric(14,4);
    v_available_quantity numeric(14,4);
    v_total_cost numeric(14,4) := 0;
    v_cost_complete boolean := true;
    v_remaining_to_ship numeric(14,4);
    v_take numeric(14,4);
    v_cost_delta numeric(14,4);
    v_lot record;
begin
    if p_quantity_shipped <= 0 then
        raise exception 'shipment quantity must be greater than zero';
    end if;

    select line.*
    into v_line
    from public.sales_order_lines line
    where line.id = p_sales_order_line_id
    for update;

    if not found then
        raise exception 'sales order line % not found', p_sales_order_line_id;
    end if;

    select sales_order.*
    into v_order
    from public.sales_orders sales_order
    where sales_order.id = v_line.sales_order_id
    for update;

    if v_order.status = 'cancelled' then
        raise exception 'cannot ship stock for a cancelled sales order';
    end if;

    if v_order.status = 'shipped' then
        raise exception 'sales order % is already fully shipped', v_order.id;
    end if;

    v_remaining_quantity = v_line.quantity_ordered - v_line.quantity_shipped;

    if p_quantity_shipped > v_remaining_quantity then
        raise exception 'shipment quantity % exceeds remaining quantity %', p_quantity_shipped, v_remaining_quantity;
    end if;

    select coalesce(sum(locked_lots.quantity_on_hand), 0)
    into v_available_quantity
    from (
        select stock_lot.quantity_on_hand
        from public.stock_lots stock_lot
        inner join public.shelves shelf
            on shelf.id = stock_lot.shelf_id
        where stock_lot.tenant_id = v_line.tenant_id
          and stock_lot.product_id = v_line.product_id
          and stock_lot.quantity_on_hand > 0
          and shelf.warehouse_id = v_order.warehouse_id
        for update of stock_lot
    ) as locked_lots;

    if v_available_quantity < p_quantity_shipped then
        raise exception 'insufficient stock: requested %, available %', p_quantity_shipped, v_available_quantity;
    end if;

    v_remaining_to_ship = p_quantity_shipped;

    for v_lot in
        select stock_lot.id, stock_lot.shelf_id, stock_lot.quantity_on_hand, stock_lot.unit_cost, stock_lot.received_at
        from public.stock_lots stock_lot
        inner join public.shelves shelf
            on shelf.id = stock_lot.shelf_id
        where stock_lot.tenant_id = v_line.tenant_id
          and stock_lot.product_id = v_line.product_id
          and stock_lot.quantity_on_hand > 0
          and shelf.warehouse_id = v_order.warehouse_id
        order by stock_lot.received_at asc, stock_lot.id asc
        for update of stock_lot
    loop
        exit when v_remaining_to_ship <= 0;

        v_take = least(v_remaining_to_ship, v_lot.quantity_on_hand);

        update public.stock_lots stock_lot
        set quantity_on_hand = stock_lot.quantity_on_hand - v_take
        where stock_lot.id = v_lot.id;

        if v_lot.unit_cost is null then
            v_cost_delta = null;
            v_cost_complete = false;
        else
            v_cost_delta = v_lot.unit_cost * v_take;
            v_total_cost = v_total_cost + v_cost_delta;
        end if;

        insert into public.stock_ledger_entries (
            tenant_id,
            stock_lot_id,
            product_id,
            shelf_id,
            entry_type,
            quantity_delta,
            unit_cost_at_time,
            sales_order_id,
            sales_order_line_id,
            reason,
            note
        )
        values (
            v_line.tenant_id,
            v_lot.id,
            v_line.product_id,
            v_lot.shelf_id,
            'shipment',
            -v_take,
            v_lot.unit_cost,
            v_order.id,
            v_line.id,
            p_reason,
            p_note
        );

        v_remaining_to_ship = v_remaining_to_ship - v_take;
    end loop;

    if v_remaining_to_ship > 0 then
        raise exception 'insufficient stock remained after locking fifo lots';
    end if;

    update public.sales_order_lines line
    set quantity_shipped = line.quantity_shipped + p_quantity_shipped,
        cost_basis_total = case
            when v_cost_complete then coalesce(line.cost_basis_total, 0) + v_total_cost
            else null
        end
    where line.id = v_line.id;

    select line.quantity_shipped, line.cost_basis_total
    into quantity_shipped, cost_basis_total
    from public.sales_order_lines line
    where line.id = v_line.id;

    sales_order_status := public.sync_sales_order_status(v_order.id);

    return next;
end;
$$;

create or replace function public.prevent_stock_ledger_entry_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'stock_ledger_entries are immutable and cannot be %', tg_op;
end;
$$;

drop trigger if exists set_purchase_orders_updated_at on public.purchase_orders;
create trigger set_purchase_orders_updated_at
before update on public.purchase_orders
for each row
execute function public.set_updated_at();

drop trigger if exists enforce_purchase_order_header_lineage on public.purchase_orders;
create trigger enforce_purchase_order_header_lineage
before insert or update on public.purchase_orders
for each row
execute function public.enforce_order_header_lineage();

drop trigger if exists set_purchase_order_lines_updated_at on public.purchase_order_lines;
create trigger set_purchase_order_lines_updated_at
before update on public.purchase_order_lines
for each row
execute function public.set_updated_at();

drop trigger if exists set_sales_orders_updated_at on public.sales_orders;
create trigger set_sales_orders_updated_at
before update on public.sales_orders
for each row
execute function public.set_updated_at();

drop trigger if exists enforce_sales_order_header_lineage on public.sales_orders;
create trigger enforce_sales_order_header_lineage
before insert or update on public.sales_orders
for each row
execute function public.enforce_order_header_lineage();

drop trigger if exists set_sales_order_lines_updated_at on public.sales_order_lines;
create trigger set_sales_order_lines_updated_at
before update on public.sales_order_lines
for each row
execute function public.set_updated_at();

drop trigger if exists enforce_purchase_order_lineage on public.purchase_order_lines;
create trigger enforce_purchase_order_lineage
before insert or update on public.purchase_order_lines
for each row
execute function public.enforce_purchase_order_lineage();

drop trigger if exists enforce_sales_order_lineage on public.sales_order_lines;
create trigger enforce_sales_order_lineage
before insert or update on public.sales_order_lines
for each row
execute function public.enforce_sales_order_lineage();

drop trigger if exists enforce_stock_ledger_entry_lineage on public.stock_ledger_entries;
create trigger enforce_stock_ledger_entry_lineage
before insert on public.stock_ledger_entries
for each row
execute function public.enforce_stock_ledger_entry_lineage();

drop trigger if exists prevent_stock_ledger_entry_update on public.stock_ledger_entries;
create trigger prevent_stock_ledger_entry_update
before update on public.stock_ledger_entries
for each row
execute function public.prevent_stock_ledger_entry_mutation();

drop trigger if exists prevent_stock_ledger_entry_delete on public.stock_ledger_entries;
create trigger prevent_stock_ledger_entry_delete
before delete on public.stock_ledger_entries
for each row
execute function public.prevent_stock_ledger_entry_mutation();

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
alter table public.stock_ledger_entries enable row level security;

drop policy if exists "purchase_orders_select_member" on public.purchase_orders;
create policy "purchase_orders_select_member"
on public.purchase_orders
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "purchase_order_lines_select_member" on public.purchase_order_lines;
create policy "purchase_order_lines_select_member"
on public.purchase_order_lines
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "sales_orders_select_member" on public.sales_orders;
create policy "sales_orders_select_member"
on public.sales_orders
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "sales_order_lines_select_member" on public.sales_order_lines;
create policy "sales_order_lines_select_member"
on public.sales_order_lines
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "stock_ledger_entries_select_member" on public.stock_ledger_entries;
create policy "stock_ledger_entries_select_member"
on public.stock_ledger_entries
for select
to authenticated
using (public.is_tenant_member(tenant_id));

revoke insert, update, delete on public.purchase_orders from authenticated;
revoke insert, update, delete on public.purchase_order_lines from authenticated;
revoke insert, update, delete on public.sales_orders from authenticated;
revoke insert, update, delete on public.sales_order_lines from authenticated;
revoke insert, update, delete on public.stock_ledger_entries from authenticated;
