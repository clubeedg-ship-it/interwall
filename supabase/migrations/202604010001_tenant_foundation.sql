create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
    if not exists (
        select 1
        from pg_type
        where typname = 'app_role'
          and typnamespace = 'public'::regnamespace
    ) then
        create type public.app_role as enum ('owner', 'admin', 'member');
    end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text,
    full_name text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tenants (
    id uuid primary key default gen_random_uuid(),
    slug extensions.citext not null unique,
    name text not null,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tenant_memberships (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    role public.app_role not null default 'member',
    status text not null default 'active',
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint tenant_memberships_status_check
        check (status in ('active', 'invited', 'inactive')),
    constraint tenant_memberships_tenant_user_key unique (tenant_id, user_id)
);

create table if not exists public.tenant_settings (
    tenant_id uuid primary key references public.tenants (id) on delete cascade,
    timezone text not null default 'UTC',
    currency_code text not null default 'EUR',
    settings jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists tenant_memberships_user_id_idx
    on public.tenant_memberships (user_id);

create index if not exists tenant_memberships_tenant_id_idx
    on public.tenant_memberships (tenant_id);

create index if not exists tenant_memberships_role_idx
    on public.tenant_memberships (tenant_id, role);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger set_tenants_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at();

create trigger set_tenant_memberships_updated_at
before update on public.tenant_memberships
for each row
execute function public.set_updated_at();

create trigger set_tenant_settings_updated_at
before update on public.tenant_settings
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
    )
    on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = timezone('utc', now());

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.tenant_memberships membership
        where membership.tenant_id = target_tenant_id
          and membership.user_id = auth.uid()
          and membership.status = 'active'
    );
$$;

create or replace function public.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.tenant_memberships membership
        where membership.tenant_id = target_tenant_id
          and membership.user_id = auth.uid()
          and membership.status = 'active'
          and membership.role in ('owner', 'admin')
    );
$$;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_settings enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "tenants_select_member" on public.tenants;
create policy "tenants_select_member"
on public.tenants
for select
to authenticated
using (public.is_tenant_member(id));

drop policy if exists "tenant_memberships_select_self" on public.tenant_memberships;
create policy "tenant_memberships_select_self"
on public.tenant_memberships
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "tenant_memberships_select_admin_same_tenant" on public.tenant_memberships;
create policy "tenant_memberships_select_admin_same_tenant"
on public.tenant_memberships
for select
to authenticated
using (public.is_tenant_admin(tenant_id));

drop policy if exists "tenant_memberships_insert_admin" on public.tenant_memberships;
create policy "tenant_memberships_insert_admin"
on public.tenant_memberships
for insert
to authenticated
with check (public.is_tenant_admin(tenant_id));

drop policy if exists "tenant_memberships_update_admin" on public.tenant_memberships;
create policy "tenant_memberships_update_admin"
on public.tenant_memberships
for update
to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

drop policy if exists "tenant_memberships_delete_admin" on public.tenant_memberships;
create policy "tenant_memberships_delete_admin"
on public.tenant_memberships
for delete
to authenticated
using (public.is_tenant_admin(tenant_id));

drop policy if exists "tenant_settings_select_member" on public.tenant_settings;
create policy "tenant_settings_select_member"
on public.tenant_settings
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "tenant_settings_insert_admin" on public.tenant_settings;
create policy "tenant_settings_insert_admin"
on public.tenant_settings
for insert
to authenticated
with check (public.is_tenant_admin(tenant_id));

drop policy if exists "tenant_settings_update_admin" on public.tenant_settings;
create policy "tenant_settings_update_admin"
on public.tenant_settings
for update
to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

drop policy if exists "tenant_settings_delete_admin" on public.tenant_settings;
create policy "tenant_settings_delete_admin"
on public.tenant_settings
for delete
to authenticated
using (public.is_tenant_admin(tenant_id));
