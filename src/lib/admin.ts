/**
 * Store admin panel data layer (STEP 7).
 *
 * The admin role lives in `public.store_admins` and is checked with
 * `public.is_store_admin()` (supabase/migrations/0008_store_admin.sql). Two
 * rules shape this module:
 *
 *  1. THE DATABASE IS THE BOUNDARY. `isStoreAdmin()` below decides only what the
 *     UI may RENDER. Every admin read/write is additionally gated by RLS policies
 *     that call the same SQL function, so a non-admin who edits the bundle and
 *     forces the panel open still sees nothing and can write nothing.
 *  2. NO FABRICATED NUMBERS. Every value here comes from a real query, and an
 *     empty store reports zeros / empty lists rather than sample data. A failure
 *     returns `ok: false` so the panel can say «خطا در دریافت اطلاعات» and offer a
 *     retry instead of showing a plausible-looking zero.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { useAuth } from "~/lib/auth";
import { getSupabaseClient } from "~/lib/supabase";

/* ── Constants ─────────────────────────────────────────────────────────────── */

/**
 * A variant is "low stock" at or below this many units.
 *
 * Why 5: the store ships in single units (one colour/size row per physical
 * stock), so five units is roughly "one more order and it is gone" — low enough
 * to stay a short, actionable list, high enough to notice before selling out.
 * Change it here only; nothing else hard-codes the number.
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * The order_status values that still need work from the shop.
 *
 * The schema (0004_orders.sql) has exactly six values on the fulfilment axis.
 * «تحویل داده شده» (delivered) and «لغو شده» (cancelled) are finished; everything
 * else is still open. Payment state is NOT part of this count — an admin cannot
 * change payment_status at all (column grant), so it must not drive a work queue.
 */
export const PENDING_ORDER_STATUSES = ["در انتظار پرداخت", "پردازش سفارش", "آماده ارسال"] as const;

/** The payment label that means "money actually arrived" (the only sales basis). */
export const PAID_PAYMENT_STATUS = "پرداخت شده" as const;

export const ADMIN_LOAD_ERROR = "خطا در دریافت اطلاعات";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface LowStockVariant {
  id: string;
  productTitle: string;
  color: string;
  size: string;
  sku: string;
  stock: number;
}

export interface AdminOverview {
  productsTotal: number;
  productsActive: number;
  ordersTotal: number;
  ordersPending: number;
  /** SUM of total_amount over orders whose payment_status is «پرداخت شده». */
  salesTotal: number;
  /** How many orders that sum is built from (0 ⇒ show the honest empty state). */
  salesOrders: number;
  lowStock: LowStockVariant[];
}

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/* ── Access check ──────────────────────────────────────────────────────────── */

/**
 * Ask the database whether the signed-in user is a store admin.
 *
 * Uses the SECURITY DEFINER RPC, so a `false` here is authoritative — the same
 * function every admin RLS policy calls. Any error (no session, function not
 * deployed yet, network) resolves to `false`: the panel must fail closed.
 */
export async function isStoreAdmin(client?: SupabaseClient | null): Promise<boolean> {
  const db = client ?? getSupabaseClient();
  if (!db) return false;
  try {
    const { data, error } = await db.rpc("is_store_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/* ── React hook (used by the account nav to reveal the panel entry) ────────── */

/**
 * `true` only when the signed-in user is a store admin. Starts `false` and stays
 * `false` for guests, unconfigured deployments and errors — the «پنل مدیریت»
 * link must never appear for someone who cannot use it.
 */
export function useIsStoreAdmin(): boolean {
  const { status, user } = useAuth();
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (status !== "signedIn" || !user) {
      setAdmin(false);
      return;
    }
    let active = true;
    void isStoreAdmin().then((value) => {
      if (active) setAdmin(value);
    });
    return () => {
      active = false;
    };
  }, [status, user?.id]);

  return admin;
}

/* ── Dashboard overview ────────────────────────────────────────────────────── */

/**
 * `select count(*)` for one table, optionally narrowed by `filter`.
 * The filter callback is loosely typed on purpose: supabase-js rebuilds the
 * builder type on every chained call, which is not worth threading through here.
 */
async function countOf(
  db: SupabaseClient,
  table: string,
  filter?: (query: any) => any
): Promise<{ count: number; error: unknown }> {
  let query: any = db.from(table).select("id", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  return { count: count ?? 0, error };
}

/**
 * Read the dashboard numbers. Runs as the signed-in admin, so RLS already
 * restricts the rows to what this admin may see (for an admin: everything).
 */
export async function fetchAdminOverview(): Promise<AdminResult<AdminOverview>> {
  const db = getSupabaseClient();
  if (!db) return { ok: false, message: ADMIN_LOAD_ERROR };

  try {
    const [productsTotal, productsActive, ordersTotal, ordersPending, sales, lowStock] =
      await Promise.all([
        countOf(db, "products"),
        countOf(db, "products", (q: any) => q.eq("status", "active")),
        countOf(db, "orders"),
        countOf(db, "orders", (q: any) => q.in("order_status", [...PENDING_ORDER_STATUSES])),
        db.from("orders").select("total_amount").eq("payment_status", PAID_PAYMENT_STATUS),
        db
          .from("variants")
          .select("id, color, size, sku, stock_quantity, products(title)")
          .lte("stock_quantity", LOW_STOCK_THRESHOLD)
          .order("stock_quantity", { ascending: true }),
      ]);

    if (
      productsTotal.error ||
      productsActive.error ||
      ordersTotal.error ||
      ordersPending.error ||
      sales.error ||
      lowStock.error
    ) {
      return { ok: false, message: ADMIN_LOAD_ERROR };
    }

    const paidRows = (sales.data ?? []) as { total_amount: number | string | null }[];
    const salesTotal = paidRows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);

    const rows = (lowStock.data ?? []) as unknown as {
      id: string;
      color: string;
      size: string;
      sku: string;
      stock_quantity: number;
      products: { title: string } | { title: string }[] | null;
    }[];

    return {
      ok: true,
      data: {
        productsTotal: productsTotal.count,
        productsActive: productsActive.count,
        ordersTotal: ordersTotal.count,
        ordersPending: ordersPending.count,
        salesTotal,
        salesOrders: paidRows.length,
        lowStock: rows.map((row) => {
          // PostgREST returns an embedded to-one relation as an object, but a
          // to-many shape (array) is also possible depending on the FK metadata.
          const product = Array.isArray(row.products) ? row.products[0] : row.products;
          return {
            id: row.id,
            productTitle: product?.title ?? "—",
            color: row.color,
            size: row.size,
            sku: row.sku,
            stock: row.stock_quantity,
          };
        }),
      },
    };
  } catch {
    return { ok: false, message: ADMIN_LOAD_ERROR };
  }
}
