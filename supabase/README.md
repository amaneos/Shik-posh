# Supabase migrations — per client store

This product is white-label: **every client store runs on its own Supabase
project**. Migrations in this directory are the shared schema that each store's
project applies.

## Applying to a client store's project

1. Create the client's Supabase project.
2. Open the SQL editor (or run `supabase db push` against that project) and
   apply `migrations/0001_init.sql` — or all `00XX_*.sql` files, in order.
3. Copy the project's `Project URL` and `anon public` key into the deployed
   store's environment as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The application **never seeds the database from code** — data is entered per
store (via the admin tooling that arrives in a later step) or manually.

## Current step (STEP 1)

`0001_init.sql` — foundation only:

- `categories`, `products` (with relationships, indexes, updated_at trigger)
- `store_settings` (single-row, `id = 1` constrained)
- Row Level Security is intentionally **not** included yet — it ships with the
  auth/roles step.

## Style notes

- All tables in `public`, lowercase snake_case columns, `uuid` primary keys
  defaulting to `gen_random_uuid()`.
- Timestamps are `timestamptz` with `now()` defaults and a shared
  `set_updated_at()` trigger.
- Prices are `numeric` (toman) with positivity/consistency checks.