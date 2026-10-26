/**
 * Customer order history (STEP 6) — the REAL orders, read through RLS.
 *
 * Everything in this module is a thin, typed adapter over PostgREST:
 *   • reads  — `orders` joined with `order_items`, filtered by the RLS policy
 *              «a signed-in customer sees only rows where customer_id = auth.uid()»
 *              (supabase/migrations/0005_customer_accounts.sql). No client-side
 *              filter is trusted; the ownership check in the UI is a second belt.
 *   • writes — `public.create_order_with_items(...)`, the only sanctioned writer
 *              of orders (and of stock). The browser sends ids + quantities; the
 *              database prices the order.
 *
 * Guests are untouched: their orders live in the local snapshot
 * (`~/lib/orders`) and are NEVER read from here, so a signed-in customer can
 * never see a guest's order — and a guest's own history stays on their device.
 *
 * Error messages are honest Persian strings; when the database is not configured
 * the caller renders the shared "connect the database" state instead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  orderErrorToFa,
  type Order,
  type OrderErrorReason,
  type OrderItem,
  type OrderStatus,
  type PaymentStatus,
  type PlaceOrderResult,
  type VariantSnapshot,
} from "~/lib/orders";
import { getSupabaseClient, isSupabaseConfigured } from "~/lib/supabase";

/* ── Messages ──────────────────────────────────────────────────────────────── */

export const ORDERS_LOAD_ERROR = "دریافت سفارش‌ها با خطا مواجه شد؛ دوباره تلاش کنید.";
export const ORDER_FORBIDDEN_MESSAGE = "این سفارش برای شما قابل مشاهده نیست";
export const ORDERS_SIGNED_OUT_MESSAGE = "برای دیدن سفارش‌ها وارد حساب خود شوید";

/* ── Result type ───────────────────────────────────────────────────────────── */

export type OrdersResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; signedOut?: boolean };

/* ── Row shapes (snake_case, exactly what the DB returns) ──────────────────── */

interface OrderItemRow {
  product_id: string;
  variant_id: string;
  product_title_snapshot: string;
  variant_snapshot: VariantSnapshot | null;
  unit_price: number | string;
  quantity: number | string;
  line_total: number | string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  shipping_address: string;
  notes: string | null;
  subtotal_amount: number | string;
  total_amount: number | string;
  payment_status: string;
  order_status: string;
  created_at: string;
  updated_at: string | null;
  order_items?: OrderItemRow[];
}

const ORDER_COLUMNS =
  "id, order_number, customer_id, customer_name, customer_phone, customer_email, " +
  "shipping_address, notes, subtotal_amount, total_amount, payment_status, order_status, " +
  "created_at, updated_at, " +
  "order_items(product_id, variant_id, product_title_snapshot, variant_snapshot, unit_price, quantity, line_total)";

/* ── Mapping ───────────────────────────────────────────────────────────────── */

function num(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asPaymentStatus(value: string): PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value)
    ? (value as PaymentStatus)
    : "در انتظار پرداخت";
}

function asOrderStatus(value: string): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as OrderStatus)
    : "در انتظار پرداخت";
}

/** The variant snapshot is jsonb — tolerate a missing/short object. */
function asVariantSnapshot(value: VariantSnapshot | null): VariantSnapshot {
  return {
    color: typeof value?.color === "string" ? value.color : "",
    size: typeof value?.size === "string" ? value.size : "",
    sku: typeof value?.sku === "string" ? value.sku : "",
  };
}

/** DB rows → the SAME `Order` shape the demo/localStorage path uses. */
export function mapOrderRow(row: OrderRow): Order {
  const items: OrderItem[] = (row.order_items ?? []).map((item) => ({
    productId: item.product_id,
    variantId: item.variant_id,
    productTitleSnapshot: item.product_title_snapshot,
    variantSnapshot: asVariantSnapshot(item.variant_snapshot),
    unitPrice: num(item.unit_price),
    quantity: num(item.quantity),
    lineTotal: num(item.line_total),
  }));

  return {
    id: row.id,
    orderNumber: row.order_number,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      ...(row.customer_email ? { email: row.customer_email } : {}),
    },
    shippingAddress: row.shipping_address,
    ...(row.notes ? { notes: row.notes } : {}),
    items,
    subtotalAmount: num(row.subtotal_amount),
    totalAmount: num(row.total_amount),
    paymentStatus: asPaymentStatus(row.payment_status),
    orderStatus: asOrderStatus(row.order_status),
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    customerId: row.customer_id,
  };
}

/* ── Reads ─────────────────────────────────────────────────────────────────── */

function configuredClient(): SupabaseClient | null {
  return isSupabaseConfigured() ? getSupabaseClient() : null;
}

/** The signed-in customer's orders, newest first (RLS enforces "their own"). */
export async function listMyOrders(): Promise<OrdersResult<Order[]>> {
  const client = configuredClient();
  if (!client) return { ok: false, message: ORDERS_LOAD_ERROR, signedOut: true };

  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    return { ok: false, message: ORDERS_SIGNED_OUT_MESSAGE, signedOut: true };
  }

  const { data, error } = await client
    .from("orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, message: ORDERS_LOAD_ERROR };
  return { ok: true, data: ((data ?? []) as unknown as OrderRow[]).map(mapOrderRow) };
}

/**
 * One order by its id OR its human-readable reference. The lookup is a plain
 * RLS-filtered query: another customer's reference simply returns no row, so the
 * page shows a neutral not-found state and nothing leaks.
 */
export async function getMyOrder(reference: string): Promise<OrdersResult<Order | null>> {
  const client = configuredClient();
  if (!client) return { ok: false, message: ORDERS_LOAD_ERROR, signedOut: true };

  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    return { ok: false, message: ORDERS_SIGNED_OUT_MESSAGE, signedOut: true };
  }

  const wanted = reference.trim();
  if (wanted === "") return { ok: true, data: null };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wanted);
  const { data, error } = await client
    .from("orders")
    .select(ORDER_COLUMNS)
    .or(isUuid ? `id.eq.${wanted},order_number.eq.${wanted}` : `order_number.eq.${wanted}`)
    .maybeSingle();
  if (error) return { ok: false, message: ORDERS_LOAD_ERROR };
  if (!data) return { ok: true, data: null };
  const order = mapOrderRow(data as unknown as OrderRow);
  if (order.customerId == null) {
    // A guest order (customer_id IS NULL) is not addressable from an account.
    return { ok: true, data: null };
  }
  return { ok: true, data: order };
}

/* ── Writes (the RPC) ──────────────────────────────────────────────────────── */

/** Order reference for the database path: `ORD-<yyyymmdd>-<minutes of day>`. */
export function databaseOrderNumber(date: Date = new Date(), attempt = 0): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const minutes = date.getHours() * 60 + date.getMinutes() + attempt;
  return `ORD-${year}${month}${day}-${`${Math.min(minutes, 9999)}`.padStart(4, "0")}`;
}

export interface DatabaseOrderInput {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  shippingAddress: string;
  notes?: string | null;
  items: { productId: string; variantId: string; quantity: number }[];
  /** The signed-in customer's id, or null for a guest order. */
  customerId?: string | null;
}

/** Map the function's machine-readable `hint` back onto a refusal reason. */
function hintToReason(hint: string | undefined | null): OrderErrorReason {
  switch (hint) {
    case "invalid-input":
    case "empty-cart":
    case "invalid-quantity":
    case "duplicate-variant":
    case "product-missing":
    case "variant-missing":
    case "inactive":
    case "insufficient-stock":
      return hint;
    case "order-number-taken":
      // Someone (rarely) used the same reference first — the caller may retry
      // with the next sequence instead of failing the customer.
      return "duplicate-order";
    default:
      return "persistence";
  }
}

/**
 * Create the order through `public.create_order_with_items(...)`.
 *
 * Returns the same typed result as the demo engine, so checkout has ONE code
 * path for both deployments. A refused order rolls back inside PostgreSQL — no
 * order row, no stock change.
 */
export async function createOrderInDatabase(
  input: DatabaseOrderInput
): Promise<PlaceOrderResult> {
  const client = configuredClient();
  if (!client) return { ok: false, reason: "unavailable" };

  const { data: sessionData } = await client.auth.getSession();
  // A signed-in customer's order is stamped with their id; a guest's stays NULL.
  // The id comes from the SESSION, never from the form, so it cannot be forged.
  const sessionUserId = sessionData.session?.user?.id ?? null;
  const customerId = sessionUserId ?? input.customerId ?? null;

  // The RPC's `p_items` is a jsonb array whose EACH element is read with
  // SNAKE_CASE keys — `product_id`, `variant_id`, `quantity`
  // (see supabase/migrations/0004_orders.sql, the jsonb_array_elements loop).
  // The app-side type is camelCase, so the keys are mapped HERE, at the DB
  // boundary. Do not "simplify" this to `p_items: input.items`: camelCase keys
  // make every lookup return NULL and the function refuses EVERY order with
  // hint 'product-missing'.
  const items = input.items.map((item) => ({
    product_id: item.productId,
    variant_id: item.variantId,
    quantity: item.quantity,
  }));

  const { data, error } = await client.rpc("create_order_with_items", {
    p_order_number: input.orderNumber,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail ?? null,
    p_shipping_address: input.shippingAddress,
    p_notes: input.notes ?? null,
    p_items: items,
    p_customer_id: customerId,
  });
  if (error || !data) {
    const hint = (error as { hint?: string } | null)?.hint ?? null;
    return { ok: false, reason: hintToReason(hint) };
  }

  const row = data as unknown as OrderRow;
  // Fetch the frozen lines (the function returns only the order header).
  const { data: itemRows } = await client
    .from("order_items")
    .select("product_id, variant_id, product_title_snapshot, variant_snapshot, unit_price, quantity, line_total")
    .eq("order_id", row.id);

  const order = mapOrderRow({ ...row, order_items: (itemRows ?? []) as unknown as OrderItemRow[] });
  if (order.items.length === 0) {
    // The order exists (money is recorded) but the lines could not be read back —
    // refuse instead of showing a half-empty confirmation.
    return { ok: false, reason: "persistence" };
  }
  return { ok: true, order };
}

/** Persian message for a refusal reason on the database path (shared wording). */
export function databaseOrderErrorToFa(reason: OrderErrorReason): string {
  return reason === "unavailable"
    ? "اتصال به دیتابیس فروشگاه برقرار نیست؛ سفارش ثبت نشد"
    : orderErrorToFa(reason);
}
