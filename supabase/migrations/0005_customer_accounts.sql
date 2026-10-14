-- ============================================================================
-- 0005_customer_accounts.sql — Customer accounts + "my orders" (STEP 6)
--
-- Extends the STEP 1 catalog, STEP 2 galleries, STEP 3 inventory and STEP 5
-- orders. One client store per Supabase project; applied via the project's SQL
-- editor or `supabase db push` alongside 0001–0004 (which are never edited).
--
-- WHAT THIS MIGRATION ADDS
--   • public.customer_profiles — one profile row per Supabase Auth user
--     (id = auth.users.id, ON DELETE CASCADE). Name is required; phone/email are
--     optional (a store may sign customers up with an email only).
--   • orders.customer_id — nullable FK to auth.users(id). NULL means a GUEST
--     order placed without an account (still supported, still valid); the
--     client-side localStorage confirmation keeps working for guests.
--   • public.create_order_with_items(..., p_customer_id uuid DEFAULT NULL) —
--     the same atomic order/stock function as 0004, now able to stamp the order
--     with the signed-in customer. Dropped + recreated so there is exactly ONE
--     function (an 8-arg overload next to the old 7-arg one would be ambiguous
--     for callers and double the surface).
--   • Row Level Security on orders / order_items / customer_profiles with
--     own-row-only policies — a signed-in customer can read their own orders and
--     nobody else's, at the DATABASE level (the app check is only a second belt).
--   • No direct write grants: INSERT/UPDATE/DELETE on orders + order_items are
--     REVOKED from anon and authenticated. The single sanctioned write path is
--     the SECURITY DEFINER function, which keeps pricing/reservation atomic and
--     un-spoofable.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   • No admin/staff policies (an admin panel is a later step; today only
--     own-row reads exist, plus the service_role which bypasses RLS).
--   • No status transitions, no payment gateway, no coupons, no analytics.
--   • No email/SMS confirmation. Auth method is email + password (phone-OTP
--     would require an SMS provider, which is not configured).
--
-- HOW A CUSTOMER'S ORDER GETS ITS customer_id
--   The client sends only ids + quantities. `p_customer_id` is passed by the
--   browser client from its own Supabase session (never from user input) — and
--   because the column is only writable through the SECURITY DEFINER function,
--   a customer cannot attach an order to somebody else's account by hand.
--   The UI additionally checks `order.customer_id === user.id` before rendering
--   a detail page, and RLS refuses the read in the first place.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- customer_profiles — the store-side profile of a Supabase Auth user
-- ----------------------------------------------------------------------------
create table public.customer_profiles (
  -- The Auth user IS the profile: no separate surrogate key, so a profile can
  -- never point at a user that does not exist, and deleting the user removes it.
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  phone      text,                               -- optional (null = not given)
  email      text,                               -- optional; mirrored from Auth
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A blank name would render as an empty «سلام» in the account header — reject.
  constraint customer_profiles_name_not_blank check (btrim(name) <> '')
);

comment on table public.customer_profiles is
  'Customer account profile (STEP 6), one row per auth.users row. Readable and editable ONLY by its own user (RLS: auth.uid() = id); created automatically on sign-up by the on_auth_user_created trigger, with a client-side "ensure profile exists" fallback.';
comment on column public.customer_profiles.id is
  'Primary key AND foreign key to auth.users(id): the Auth user is the profile. Deleting the Auth user cascades here.';
comment on column public.customer_profiles.name is
  'Display name. NOT NULL and non-blank: it is shown in the account area and pre-filled into checkout.';
comment on column public.customer_profiles.phone is
  'Optional contact phone. NULL when the customer has not provided one.';
comment on column public.customer_profiles.email is
  'Optional email, normally mirrored from Auth. Kept here because a profile edit is a single row write.';
comment on column public.customer_profiles.updated_at is
  'Maintained by the shared public.set_updated_at() trigger function created in 0001_init.sql (no second copy is defined here).';

-- updated_at maintenance — reuses the SHARED trigger function from 0001_init.sql.
create trigger customer_profiles_set_updated_at
  before update on public.customer_profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- orders.customer_id — who placed the order (NULL = guest)
-- ----------------------------------------------------------------------------
alter table public.orders
  add column customer_id uuid references auth.users (id) on delete set null;

comment on column public.orders.customer_id is
  'Signed-in customer who placed the order, or NULL for a guest order (guest checkout keeps working and stays visible only on the device that placed it). ON DELETE SET NULL: deleting an Auth user keeps the order history for accounting but detaches it. Only writable through public.create_order_with_items().';

-- "my orders, newest first" — the single query every account screen runs.
create index orders_customer_id_created_at_idx
  on public.orders (customer_id, created_at desc);

-- ----------------------------------------------------------------------------
-- create_order_with_items — same atomic contract as 0004, now customer-aware.
--
-- The 7-argument version from 0004 is DROPPED and replaced by this 8-argument
-- one; the new argument is last and DEFAULT NULL, so every existing call style
-- (7 positional args = guest order) keeps working unchanged.
-- ----------------------------------------------------------------------------
drop function if exists public.create_order_with_items(
  text, text, text, text, text, text, jsonb
);

create or replace function public.create_order_with_items(
  p_order_number     text,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text,
  p_shipping_address text,
  p_notes            text,
  p_items            jsonb,
  -- The authenticated customer, or NULL for a guest. Passing NULL explicitly is
  -- identical to omitting it: guests are a first-class case, not a hack.
  p_customer_id      uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order          public.orders;
  v_item           jsonb;
  v_product_id     uuid;
  v_variant_id     uuid;
  v_quantity       integer;
  v_price          bigint;
  v_title          text;
  v_product_status text;
  v_variant        public.variants;
  v_subtotal       bigint := 0;
  v_updated        integer;
  v_seen           uuid[] := '{}';
begin
  -- ── 1) Shape of the request ────────────────────────────────────────────────
  if btrim(coalesce(p_order_number, '')) = ''
     or btrim(coalesce(p_customer_name, '')) = ''
     or btrim(coalesce(p_customer_phone, '')) = ''
     or btrim(coalesce(p_shipping_address, '')) = '' then
    raise exception 'اطلاعات سفارش کامل نیست'
      using errcode = 'P0001', hint = 'invalid-input';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'سبد خرید شما خالی است'
      using errcode = 'P0001', hint = 'empty-cart';
  end if;

  -- ── 2) Order header first — amounts are filled in at the end, once every
  --      line has been priced and reserved. A raised error discards this row. ──
  insert into public.orders (
    order_number, customer_name, customer_phone, customer_email,
    shipping_address, notes, subtotal_amount, total_amount,
    payment_status, order_status, customer_id
  )
  values (
    btrim(p_order_number),
    btrim(p_customer_name),
    btrim(p_customer_phone),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    btrim(p_shipping_address),
    nullif(btrim(coalesce(p_notes, '')), ''),
    0, 0,
    'در انتظار پرداخت', 'در انتظار پرداخت',
    p_customer_id
  )
  returning * into v_order;

  -- ── 3) Price + reserve every line from the DATABASE ────────────────────────
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_quantity   := (v_item ->> 'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'موجودی کافی نیست'
        using errcode = 'P0001', hint = 'invalid-quantity';
    end if;

    -- Same variant twice → the unique (order_id, variant_id) index would fail
    -- anyway; fail early with an explicit reason.
    if v_variant_id = any (v_seen) then
      raise exception 'سفارش تکراری'
        using errcode = 'P0001', hint = 'duplicate-variant';
    end if;
    v_seen := v_seen || v_variant_id;

    -- Product must exist and be sellable.
    select p.status, p.title, (coalesce(p.discount_price, p.base_price))::bigint
      into v_product_status, v_title, v_price
      from public.products p
     where p.id = v_product_id;
    if not found then
      raise exception 'این محصول موجود نیست'
        using errcode = 'P0001', hint = 'product-missing';
    end if;
    if v_product_status <> 'active' then
      raise exception 'این محصول موجود نیست'
        using errcode = 'P0001', hint = 'inactive';
    end if;

    -- Variant must belong to that product and be sellable.
    select * into v_variant
      from public.variants v
     where v.id = v_variant_id
       and v.product_id = v_product_id;
    if not found then
      raise exception 'این محصول موجود نیست'
        using errcode = 'P0001', hint = 'variant-missing';
    end if;
    if v_variant.status <> 'active' then
      raise exception 'این محصول موجود نیست'
        using errcode = 'P0001', hint = 'inactive';
    end if;

    -- THE overselling guard (unchanged from 0004). Guarded update: it only fires
    -- when enough stock is actually on hand, and takes a row lock, so concurrent
    -- orders serialise and the second one re-reads the committed value.
    update public.variants
       set stock_quantity = stock_quantity - v_quantity
     where id = v_variant_id
       and stock_quantity >= v_quantity;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'موجودی کافی نیست'
        using errcode = 'P0001', hint = 'insufficient-stock';
    end if;

    insert into public.order_items (
      order_id, product_id, variant_id,
      product_title_snapshot, variant_snapshot,
      unit_price, quantity, line_total
    )
    values (
      v_order.id, v_product_id, v_variant_id,
      v_title,
      jsonb_build_object('color', v_variant.color, 'size', v_variant.size, 'sku', v_variant.sku),
      v_price, v_quantity, v_price * v_quantity
    );

    v_subtotal := v_subtotal + (v_price * v_quantity);
  end loop;

  -- ── 4) Totals, computed from the lines just written (no shipping/taxes). ───
  update public.orders
     set subtotal_amount = v_subtotal,
         total_amount    = v_subtotal
   where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

comment on function public.create_order_with_items(text, text, text, text, text, text, jsonb, uuid) is
  'Atomic order creation (STEP 5, customer-aware in STEP 6): inserts the order + lines and decrements variants.stock_quantity in one transaction, pricing everything from the catalog. p_customer_id stamps the order with the signed-in customer (NULL = guest). Raises (rolling back) with a Persian message + hint when a product/variant is missing or inactive, or stock is insufficient — overselling is impossible. Example: select public.create_order_with_items(''ORD-20260927-0001'', ''نام'', ''09120000000'', null, ''نشانی'', null, ''[{"product_id":"…","variant_id":"…","quantity":2}]''::jsonb, null);';

-- ----------------------------------------------------------------------------
-- Auto-create a profile when an Auth user signs up.
--
-- The client ALSO ensures the profile exists after sign-in (defence in depth):
-- this trigger needs the SQL editor / CLI to have applied the migration, while
-- the client fallback works through plain RLS-protected inserts.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.customer_profiles (id, name, phone, email)
  values (
    new.id,
    -- Name: metadata from sign-up → email → a neutral placeholder. The column
    -- is NOT NULL/non-blank, and a half-created profile would block sign-in UX.
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), ''),
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(btrim(coalesce(new.email, '')), ''),
      'کاربر'
    ),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    nullif(btrim(coalesce(new.email, '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_customer() is
  'After-insert trigger on auth.users (STEP 6): creates the matching public.customer_profiles row from the sign-up metadata, so a new customer can use the account area immediately. Idempotent (ON CONFLICT DO NOTHING).';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_customer();

-- ----------------------------------------------------------------------------
-- Row Level Security — own rows only, at the database level
-- ----------------------------------------------------------------------------
alter table public.customer_profiles enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;

comment on table public.orders is
  'One row per checkout submission (STEP 5). Money is integer Toman (bigint); both statuses store the exact Persian label the customer sees. Written only through public.create_order_with_items(), which prices the order from the live catalog inside one transaction. RLS (STEP 6): a signed-in customer sees only rows where customer_id = auth.uid(); guest rows (customer_id IS NULL) are readable by nobody through the API.';

-- customer_profiles: the user owns exactly one row (id = their uid).
create policy customer_profiles_select_own
  on public.customer_profiles for select
  to authenticated
  using (auth.uid() = id);

create policy customer_profiles_insert_own
  on public.customer_profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy customer_profiles_update_own
  on public.customer_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- orders: read your own only. No insert/update/delete policy exists AT ALL —
-- every write goes through the SECURITY DEFINER function.
create policy orders_select_own
  on public.orders for select
  to authenticated
  using (auth.uid() = customer_id);

-- order_items: readable when the parent order is yours. Written as an EXISTS so
-- it stays correct if lines are ever written outside the function.
create policy order_items_select_own
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1
        from public.orders o
       where o.id = order_items.order_id
         and o.customer_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Grants — the sanctioned write path, and nothing else
--
-- Supabase's default privileges hand anon/authenticated write access on new
-- public tables; that is exactly what must NOT be possible for an order (a
-- tampered client could rewrite prices or delete history). Revoke the write
-- grants here and keep only SELECT (further narrowed by the policies above).
-- ----------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger
  on public.orders from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.order_items from anon, authenticated;

-- EXECUTE must stay available to the API roles, because that function IS the
-- write path (it runs as its owner, so it bypasses RLS safely).
revoke all on function public.create_order_with_items(text, text, text, text, text, text, jsonb, uuid) from public;
grant execute on function public.create_order_with_items(text, text, text, text, text, text, jsonb, uuid)
  to anon, authenticated;

comment on policy orders_select_own on public.orders is
  'A signed-in customer can SELECT only their own orders. Guest orders (customer_id IS NULL) match no policy and are therefore invisible to every API user — guest history lives only in the placing browser, by design.';

-- ----------------------------------------------------------------------------
-- LATER (not this step):
--   • admin/staff role + policies (read all orders, move order_status/payment_status)
--   • password reset / email confirmation templates, phone-OTP (needs an SMS provider)
--   • real payment gateway callback → payment_status, receipt email
--   • address book (a second table keyed by customer), wishlists, coupons
-- ============================================================================
