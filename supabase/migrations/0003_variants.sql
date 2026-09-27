-- ============================================================================
-- 0003_variants.sql — Product → Color → Size → Inventory (STEP 3, part A).
--
-- Extends the STEP 1 catalog (0001_init.sql) and the STEP 2 galleries
-- (0002_product_images.sql) with the inventory table. One client store per
-- Supabase project; applied via the project's SQL editor or `supabase db push`
-- alongside 0001 + 0002 (which are never edited).
--
-- Model: a product does NOT own stock. Each PURCHASABLE THING is one row here,
-- identified by (product_id, color, size) — i.e. every colour/size combination
-- is its own variant with its own SKU and its own stock_quantity.
--
--   product ─┬─ variant (مشکی / S)  → sku TS-BLK-S, stock 5
--            ├─ variant (مشکی / M)  → sku TS-BLK-M, stock 8
--            └─ variant (سفید / L)  → sku TS-WHT-L, stock 6
--
-- WHY THIS SHAPE (future-proofing, nothing else implemented in this step):
--   • Inventory lives ONLY here. Any product-level "stock" is derived by
--     summing its variants, so there is never a second source of truth.
--   • `stock_quantity >= 0` is a DB CHECK: negative stock is impossible, which
--     is the foundation overselling prevention is built on later. Reservation
--     and checkout-validation logic (STEP 4+) will read and decrement these
--     rows through guarded update paths — no rewrite of the catalog needed.
--   • SKU is globally unique per client store, so an admin SKU management UI
--     (deferred) can be added on top of this table unchanged.
--   • status ('active' | 'inactive') lets a store owner retire a colour/size
--     without deleting its history; public queries only ever show active rows.
-- NOTE: Row Level Security and policies are intentionally NOT added here — they
-- arrive with the auth/roles step. Until then the tables remain accessible via
-- the anon key; do not expose them publicly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- variants — one row per colour + size combination of a product
-- ----------------------------------------------------------------------------
create table public.variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  color          text not null,
  size           text not null,
  sku            text not null,
  -- Inventory lives HERE and nowhere else; never at product level.
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  status         text not null default 'active' check (status in ('active', 'inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Blank colour/size would create meaningless combinations — reject at the DB.
  constraint variants_color_not_blank check (btrim(color) <> ''),
  constraint variants_size_not_blank check (btrim(size) <> '')
);

comment on table public.variants is
  'Product → colour → size → inventory. Each row is ONE purchasable colour/size combination of a product and is the ONLY place stock_quantity is stored (never on products).';
comment on column public.variants.product_id is
  'Owning product; rows are removed automatically when the product is deleted (on delete cascade).';
comment on column public.variants.color is
  'Colour name as shown to the customer (e.g. مشکی / سفید / سرمه‌ای).';
comment on column public.variants.size is
  'Size label as shown to the customer (e.g. S / M / L / XL).';
comment on column public.variants.sku is
  'Stock-keeping unit, globally unique per client store (e.g. TS-BLK-S). Uppercase latin; base for the deferred admin SKU management UI.';
comment on column public.variants.stock_quantity is
  'Units on hand for THIS colour/size. CHECK (>= 0) makes negative stock impossible — the foundation for overselling prevention; reservations and checkout validation (later step) build on top of it.';
comment on column public.variants.status is
  'active = sellable and publicly visible; inactive = retired, hidden from every public query (its stock stops counting).';
comment on column public.variants.updated_at is
  'Maintained by the shared public.set_updated_at() trigger function created in 0001_init.sql.';

-- Variant list of one product (product page + any future admin screen).
-- (The unique (product_id, color, size) index below also covers this lookup by
-- prefix; this narrower index keeps the FK / delete-cascade path cheap.)
create index variants_product_id_idx on public.variants (product_id);

-- One colour/size combination per product — no duplicate variants.
create unique index variants_product_id_color_size_key
  on public.variants (product_id, color, size);

-- SKUs are unique across the whole store (safe for admin SKU search later).
create unique index variants_sku_key on public.variants (sku);

-- updated_at maintenance — reuses the SHARED trigger function defined once in
-- 0001_init.sql (public.set_updated_at); no second function is created here.
create trigger variants_set_updated_at
  before update on public.variants
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- LATER (not this step):
--   • stock reduction / reservations / checkout validation (reads & guarded
--     updates of stock_quantity — no schema rewrite required)
--   • RLS enable + policies (auth step); staff-only writes
--   • admin UI for variants + SKU management, variant-specific images
--     (product_images.variant_id)
-- ============================================================================
