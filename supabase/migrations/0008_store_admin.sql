-- ============================================================================
-- 0008_store_admin.sql — The store admin role, admin reads, admin writes (STEP 7)
--
-- Extends 0001–0007 (which are never edited). One client store per Supabase
-- project; applied via the project's SQL editor or `supabase db push` alongside
-- the earlier migrations.
--
-- WHAT THIS MIGRATION ADDS
--   • public.store_admins — the ONE AND ONLY source of truth for "is this user
--     a store admin?". One row per admin (user_id = auth.users.id).
--   • public.is_store_admin() — a STABLE, SECURITY DEFINER boolean helper the
--     policies (and the app, via RPC) ask.
--   • Admin READ policies on orders / order_items / customer_profiles. The
--     existing own-row policies are left exactly as 0005 wrote them; policies
--     are permissive and OR together, so a customer keeps seeing their own rows
--     and an admin additionally sees everything.
--   • Admin WRITE access on orders limited to the operational status column
--     (column-level GRANT — see the long note below).
--   • Row Level Security on the four catalog tables (products, product_images,
--     categories, variants) + a public read policy + an admin write policy.
--     Until now those tables were protected only by grants (0007), so this is
--     the migration that actually turns RLS on for the catalog.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   • No Super Admin / multi-store features, no store-identity editing
--     (store_settings stays read-only for admins), no coupons, no analytics.
--   • No way for an admin to touch money or payment state (see below).
--   • No seed admin row: an admin is created deliberately, by hand, through the
--     service role (never by the app), so a deployment never ships with a
--     surprise privileged account.
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY THE ROLE LIVES IN ITS OWN TABLE — AND MUST NEVER LIVE ON A PROFILE ROW
--
-- 0005 gives a customer an UPDATE policy on their OWN customer_profiles row
-- (`auth.uid() = id`). If a boolean `is_admin` column lived there, any customer
-- could PATCH their own profile with `{"is_admin": true}` and promote
-- themselves to store admin — with the anon key that ships in the browser
-- bundle. That is a privilege-escalation hole, not a theoretical one.
--
-- So the role is kept in a separate table that the customer cannot write at
-- all: no INSERT/UPDATE/DELETE policy for authenticated, and the write grants
-- are REVOKED below. Only the service role (server-side, never in the browser)
-- can add or remove an admin. A customer's only interaction with the table is
-- the self-select policy, which answers exactly one question: "is this row me?"
-- ────────────────────────────────────────────────────────────────────────────
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY AN ADMIN CAN NEVER MARK AN ORDER PAID OR EDIT AN AMOUNT
--
-- The admin UPDATE policy on orders says WHO may update a row; it says nothing
-- about WHICH COLUMNS. Postgres answers the second question with COLUMN-LEVEL
-- GRANTS, and that is what protects the money:
--
--     grant update (order_status) on public.orders to authenticated;
--
-- …and nothing else. payment_status, subtotal_amount, total_amount, the
-- customer snapshot columns, id, order_number, created_at and updated_at are
-- NOT in that grant, so a PATCH that tries to write them fails in the database
-- with "permission denied for table orders" — before any policy is consulted.
-- The admin UI (parts 2–3 of STEP 7) will simply not offer those controls, but
-- the UI is NOT the boundary: an admin holding the anon key and a curl command
-- still cannot move money. Payment state belongs to a real gateway callback,
-- never to a human clicking a button.
--
-- The operational axis in this schema is `order_status` (0004: «در انتظار
-- پرداخت» / «پردازش سفارش» / «آماده ارسال» / «ارسال شده» / «تحویل داده شده» /
-- «لغو شده»). There is NO separate fulfilment column — order_status IS the
-- fulfilment axis, so it is the only column granted.
-- ────────────────────────────────────────────────────────────────────────────
-- ============================================================================

-- ----------------------------------------------------------------------------
-- store_admins — the only source of truth for the admin role
-- ----------------------------------------------------------------------------
create table if not exists public.store_admins (
  -- The Auth user IS the admin: no surrogate key, so an admin row can never
  -- point at a user that does not exist, and deleting the user removes it.
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- Optional human label for the panel («مدیر فروشگاه»). Purely cosmetic; it is
  -- NOT a role and carries no permission.
  display_name text,
  created_at   timestamptz not null default now()
);

comment on table public.store_admins is
  'Store admins (STEP 7): the ONLY source of truth for the admin role. One row per auth.users row. Written exclusively by the service role (server-side); customers can only SELECT their own row to ask "am I an admin?". A role flag must never live on customer_profiles, because 0005 lets a customer update their own profile row — that would be self-promotion.';

comment on column public.store_admins.user_id is
  'Primary key AND foreign key to auth.users(id): the Auth user IS the admin. Deleting the Auth user cascades here, so a removed account cannot keep admin rights.';

comment on column public.store_admins.display_name is
  'Optional cosmetic label shown in the admin panel. Carries no permission — being in this table is the whole role.';

-- ----------------------------------------------------------------------------
-- RLS on store_admins — self-select only, and no write path for API roles
-- ----------------------------------------------------------------------------
alter table public.store_admins enable row level security;

-- Exactly ONE policy: a signed-in user may read their OWN row, which is how the
-- app answers "am I an admin?" with the anon key. There is deliberately no
-- policy that lets anyone read the whole table (the admin list is not customer
-- data), and none for INSERT/UPDATE/DELETE — with RLS on, no policy means no
-- rows are visible/writable for that command.
drop policy if exists store_admins_select_self on public.store_admins;
create policy store_admins_select_self
  on public.store_admins for select
  to authenticated
  using (user_id = auth.uid());

-- Defence in depth on top of RLS: even if a future policy were added by
-- mistake, the API roles hold no write privilege on this table at all.
revoke insert, update, delete, truncate, references, trigger
  on public.store_admins from anon, authenticated;
grant select on public.store_admins to authenticated;

-- ----------------------------------------------------------------------------
-- is_store_admin() — the helper every admin policy calls
--
--   • SECURITY DEFINER is REQUIRED, not decorative: the function reads
--     store_admins, which itself has RLS. Called from inside a policy on another
--     table, a SECURITY INVOKER function would be subject to store_admins' own
--     policies and could recurse / return the wrong answer. Running as the
--     function owner (postgres, which bypasses RLS) makes the lookup reliable.
--   • search_path is pinned (public, pg_temp) so the body cannot be hijacked by
--     a caller-controlled schema — the standard hardening for SECURITY DEFINER.
--   • STABLE: within one statement the answer cannot change, so the planner may
--     cache it per row-batch instead of re-running it for every row.
--   • EXECUTE is granted to `authenticated` only — anon has no admin policies
--     anyway, and an anonymous caller has nothing to ask.
-- ----------------------------------------------------------------------------
create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.store_admins
     where user_id = auth.uid()
  );
$$;

comment on function public.is_store_admin() is
  'True when the caller (auth.uid()) has a row in public.store_admins. STABLE + SECURITY DEFINER with a pinned search_path, so it can be called from RLS policies without recursing into store_admins'' own policies. The app also calls it via RPC to decide whether to render the admin panel — but that is UX only; these policies are the real boundary.';

revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- Admin READS — added next to the existing own-row policies, never replacing
-- them. Permissive policies OR together: a customer still sees their own rows,
-- an admin sees all of them.
-- ----------------------------------------------------------------------------

-- orders: an admin sees every order, including guest orders (customer_id IS
-- NULL), which match no own-row policy and stay invisible to customers.
drop policy if exists orders_select_store_admin on public.orders;
create policy orders_select_store_admin
  on public.orders for select
  to authenticated
  using (public.is_store_admin());

comment on policy orders_select_store_admin on public.orders is
  'STEP 7: a store admin reads every order, guest orders (customer_id IS NULL) included. 0005''s orders_select_own is untouched, so a non-admin customer keeps seeing only their own rows.';

-- order_items: same rule, keyed off the parent order being visible.
drop policy if exists order_items_select_store_admin on public.order_items;
create policy order_items_select_store_admin
  on public.order_items for select
  to authenticated
  using (public.is_store_admin());

comment on policy order_items_select_store_admin on public.order_items is
  'STEP 7: a store admin reads the lines of every order. 0005''s order_items_select_own is untouched.';

-- customer_profiles: the customers list in the admin panel. Read-only — the
-- customer keeps their own UPDATE policy; an admin gets no write access here.
drop policy if exists customer_profiles_select_store_admin on public.customer_profiles;
create policy customer_profiles_select_store_admin
  on public.customer_profiles for select
  to authenticated
  using (public.is_store_admin());

comment on policy customer_profiles_select_store_admin on public.customer_profiles is
  'STEP 7: a store admin can read the customer list. SELECT only — an admin can never edit or delete a customer profile.';

-- ----------------------------------------------------------------------------
-- Admin WRITE on orders — operational status ONLY (column-level grant)
-- ----------------------------------------------------------------------------
-- 0005 revoked table-level UPDATE on orders from anon/authenticated; that stays.
-- This grant adds exactly one column back, for authenticated (the policy below
-- narrows it to admins). Nothing about money, the customer snapshot, the order
-- number or the timestamps is writable — see the header note.
grant update (order_status) on public.orders to authenticated;

drop policy if exists orders_update_store_admin on public.orders;
create policy orders_update_store_admin
  on public.orders for update
  to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

comment on policy orders_update_store_admin on public.orders is
  'STEP 7: a store admin may move the operational axis (order_status). Combined with `grant update (order_status)`, Postgres refuses any attempt to write payment_status or an amount: an admin can never mark an order paid or change a total. Enforced by column grants, not by the UI.';

-- ----------------------------------------------------------------------------
-- Catalog: turn RLS ON, keep public reads, give admins the write path
--
-- 0007 granted SELECT on the four catalog tables to anon/authenticated and left
-- a guard loop that only creates the public policy if RLS was already enabled —
-- a no-op, because it was not. This block enables RLS for real and creates the
-- same-named `_select_public` policies, so 0007's loop stays idempotent if it is
-- ever re-run.
--
-- Read stays exactly as today: every visitor (anonymous included) reads the
-- whole catalog. Write was previously possible for any authenticated user via
-- the default grants; from here it is RLS-narrowed to store admins.
-- ----------------------------------------------------------------------------
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.variants       enable row level security;

comment on table public.products is
  'Catalog products (STEP 1/2/3). STEP 7: RLS is ON — the public storefront reads through products_select_public (anon + authenticated, using true); only a store admin (public.is_store_admin()) may insert/update/delete.';

-- Public read — the storefront's anon key. Same name 0007's loop uses.
drop policy if exists categories_select_public on public.categories;
create policy categories_select_public
  on public.categories for select
  to anon, authenticated
  using (true);

drop policy if exists products_select_public on public.products;
create policy products_select_public
  on public.products for select
  to anon, authenticated
  using (true);

drop policy if exists product_images_select_public on public.product_images;
create policy product_images_select_public
  on public.product_images for select
  to anon, authenticated
  using (true);

drop policy if exists variants_select_public on public.variants;
create policy variants_select_public
  on public.variants for select
  to anon, authenticated
  using (true);

-- Admin write — one FOR ALL policy per table. The USING clause covers
-- SELECT/UPDATE/DELETE, WITH CHECK covers INSERT/UPDATE, so an admin can never
-- write a row and then be unable to see it.
drop policy if exists categories_store_admin on public.categories;
create policy categories_store_admin
  on public.categories for all
  to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

drop policy if exists products_store_admin on public.products;
create policy products_store_admin
  on public.products for all
  to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

drop policy if exists product_images_store_admin on public.product_images;
create policy product_images_store_admin
  on public.product_images for all
  to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

drop policy if exists variants_store_admin on public.variants;
create policy variants_store_admin
  on public.variants for all
  to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

-- Table-level write grants for authenticated; RLS above narrows them to admins.
-- (0007's SELECT grants stay as they are.)
grant insert, update, delete on public.categories     to authenticated;
grant insert, update, delete on public.products       to authenticated;
grant insert, update, delete on public.product_images to authenticated;
grant insert, update, delete on public.variants       to authenticated;

comment on policy products_store_admin on public.products is
  'STEP 7: only a store admin may create/update/delete a product. Paired with products_select_public, which keeps the storefront readable for everyone.';

-- ----------------------------------------------------------------------------
-- LATER (not this step):
--   • Super Admin / multi-store management, store identity + branding settings
--   • Admin screens: product/SKU/stock editing, order fulfilment actions,
--     customer list UI (parts 2–3 of STEP 7 — the policies above already allow
--     them, which is why they need no further migration)
--   • Payment gateway callback → payment_status (the ONLY writer of that column)
--   • Coupons, shipping, taxes, analytics
-- ============================================================================
