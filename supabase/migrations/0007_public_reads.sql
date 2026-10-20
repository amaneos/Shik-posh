-- ============================================================================
-- 0007_public_reads.sql — make the catalog readable by the browser (anon key).
--
-- WHY: 0001–0003 deliberately deferred access rules for the catalog, and 0005
-- only enabled RLS on the account tables (customer_profiles / orders /
-- order_items). That left the catalog tables without an explicit public-read
-- grant, so the deployed storefront's anon key could not read them — the shop
-- rendered empty even though the rows existed.
--
-- SCOPE: read-only, catalog only. Writes stay with the service role and the
-- SECURITY DEFINER RPC; nothing here touches orders or customer data.
-- Idempotent: grants are repeatable and the policy block only fires if RLS was
-- enabled on a catalog table (it is not, today — this keeps the migration safe
-- if a future step turns RLS on).
-- ============================================================================

grant select on public.categories     to anon, authenticated;
grant select on public.products       to anon, authenticated;
grant select on public.product_images to anon, authenticated;
grant select on public.variants       to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'products', 'product_images', 'variants'] loop
    if (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass) then
      execute format('drop policy if exists %I on public.%I', t || '_select_public', t);
      execute format(
        'create policy %I on public.%I for select to anon, authenticated using (true)',
        t || '_select_public', t
      );
    end if;
  end loop;
end $$;
