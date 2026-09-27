-- ============================================================================
-- 0001_init.sql — Storefront foundation for ONE white-label client store.
--
-- Each client store gets its OWN Supabase project; this migration is applied
-- there (SQL editor or `supabase db push`) BEFORE the store's
-- SUPABASE_URL / SUPABASE_ANON_KEY are connected to the app.
--
-- Scope: catalog (categories, products) + single-row store settings.
-- NOTE: Row Level Security (RLS) and policies are intentionally NOT included
-- in this step — they arrive with the auth/roles step. Until then the tables
-- remain accessible via the anon key; do not expose them publicly.
-- ============================================================================

-- gen_random_uuid() is provided by pgcrypto (enabled by default on Supabase).
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Categories
-- ----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  image       text,
  description text,
  status      text not null default 'active', -- 'active' | 'inactive'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.categories is
  'Catalog categories for one client store.';

-- ----------------------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  slug           text not null unique,
  description    text,
  base_price     numeric not null check (base_price >= 0),
  discount_price numeric check (discount_price >= 0 and discount_price <= base_price),
  category_id    uuid not null references public.categories (id) on delete cascade,
  status         text not null default 'active', -- 'active' | 'inactive'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.products is
  'Catalog products for one client store. Variants/inventory arrive in a later step.';

-- Fast listing queries filtered/grouped by category.
create index products_category_id_idx on public.products (category_id);

-- ----------------------------------------------------------------------------
-- updated_at maintenance (shared trigger function)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- store_settings — single-row foundation (no UI yet)
-- ----------------------------------------------------------------------------
create table public.store_settings (
  id              smallint primary key default 1 check (id = 1), -- enforces single row
  store_name      text not null default 'فروشگاه پوشاک',
  logo_url        text,
  favicon_url     text,
  primary_color   text,
  secondary_color text,
  phone           text,
  email           text,
  address         text,
  instagram_url   text,
  telegram_url    text,
  footer_text     text,
  updated_at      timestamptz not null default now()
);

comment on table public.store_settings is
  'Single-row store identity + contact settings (foundation only; no editing UI yet).';

create trigger store_settings_set_updated_at
  before update on public.store_settings
  for each row execute function public.set_updated_at();

-- Ensure the single row exists so `maybeSingle()` reads never come back empty
-- by default in a freshly migrated project.
insert into public.store_settings (id)
values (1)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- LATER (not this step):
--   • RLS enable + policies on all three tables
--   • auth.users integration, staff roles
--   • variants/inventory, orders, carts
-- ============================================================================