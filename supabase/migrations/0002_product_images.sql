-- ============================================================================
-- 0002_product_images.sql — multi-image product galleries (STEP 2).
--
-- Extends the STEP 1 catalog (0001_init.sql) with an ordered gallery table for
-- products. One client store per Supabase project; applied via the project's
-- SQL editor or `supabase db push` alongside 0001 (which is never edited).
--
-- Scope: product galleries ONLY. Variant-specific images (color/size) arrive
-- with the variants step (STEP 3) — this table stays color-agnostic on
-- purpose, so STEP 3 can add a `variant_id` column without a redesign.
-- NOTE: Row Level Security and policies are intentionally NOT added here —
-- they arrive with the auth/roles step. Until then the tables remain
-- accessible via the anon key; do not expose them publicly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- product_images — ordered gallery shots for a product
-- ----------------------------------------------------------------------------
create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  url         text not null,
  alt         text,                                  -- optional alt text (a11y)
  position    int not null default 0,                -- 0 = main image, then 1, 2, …
  created_at  timestamptz not null default now()
);

comment on table public.product_images is
  'Ordered gallery images for a product. STEP 3 adds variant-specific images (color/size).';
comment on column public.product_images.product_id is
  'Owning product; rows are removed automatically when the product is deleted (on delete cascade).';
comment on column public.product_images.position is
  'Gallery order — 0 is the main image shown on cards and on top of the detail gallery.';
comment on column public.product_images.alt is
  'Accessibility text for the image (e.g. "تیشرت کلاسیک مشکی — نمای جلو").';

-- Look up the gallery of a product in position order (used by every listing,
-- including the shop page — a single request, no N+1).
create index product_images_product_id_position_idx
  on public.product_images (product_id, position);

-- A product cannot have two images in the same position.
create unique index product_images_product_id_position_key
  on public.product_images (product_id, position);

-- ----------------------------------------------------------------------------
-- LATER (not this step):
--   • variant_id column + variant-specific images (STEP 3)
--   • RLS enable + policies (auth step)
-- ============================================================================