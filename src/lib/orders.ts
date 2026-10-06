/**
 * Order engine (STEP 5, part A) — persistence + stock reservation, no UI.
 *
 * This module is the CLIENT-SIDE mirror of the database's single write path
 * (`public.create_order_with_items()` in supabase/migrations/0004_orders.sql):
 * it turns a validated cart into an immutable ORDER, prices it from the live
 * catalog, and removes the sold units from stock — all or nothing.
 *
 * Design rules (deliberate, mirroring src/lib/cart.ts — do not "improve" away):
 *  • The ONLY persisted order shape is the snapshot: `Order` stores the product
 *    title and the colour/size/SKU as they were at purchase time, plus the unit
 *    price actually charged. An order is history, not a live view of the
 *    catalog, so renaming/repricing a product never rewrites an old order.
 *  • Prices and totals are RECOMPUTED here from the catalog (`discount_price ??
 *    base_price`) — client-supplied prices are never read. The caller sends only
 *    `{ productId, variantId, quantity }` (+ optional colour/size HINTS used
 *    solely to word an error), exactly like the DB function's `p_items`.
 *  • Stock is only ever removed through src/lib/inventory.ts (`decrementStock`),
 *    which is all-or-nothing and can never go below zero. If the order cannot be
 *    persisted afterwards, `restoreStock()` puts the units back — so a failed
 *    write leaves neither an order nor a partial stock change (the same
 *    guarantee the DB function gets from its implicit transaction).
 *  • A `submissionToken` is consumed exactly once: replaying the same token
 *    (double click, retry, back button) is refused with «سفارش تکراری» instead
 *    of creating a second order.
 *  • Persistence lives behind the tiny `OrderStorage` adapter (same three-method
 *    shape as `CartStorage`), so a server-backed store — customer auth, or the
 *    Supabase RPC — can be swapped in without touching the engine.
 *  • SSR-safe: `localStorage` is touched only from `useOrders()`'s effect after
 *    mount, so server render and first client render agree (empty list).
 *  • White-label: no brand string anywhere, including the storage key. The
 *    order reference is `ORD-<yyyymmdd>-<seq>` — the neutral example the
 *    migration documents.
 *
 * WHEN A SUPABASE PROJECT IS CONNECTED this module's demo path is NOT used: the
 * DB function is the single writer of orders AND of `variants.stock_quantity`,
 * so `placeOrder` refuses («ثبت سفارش در حال حاضر امکانپذیر نیست») unless a
 * ledger backed by that RPC is injected through `options.ledger`. Nothing here
 * is ever mixed with real rows (same rule as data.ts).
 */

import { useCallback, useEffect, useState } from "react";

import {
  classifyVariantFailure,
  effectiveUnitPrice,
  findProductById,
  normalizeQuantity,
  type CartItem,
  type VariantHint,
} from "~/lib/cart";
import {
  getProductVariants,
  getProductsInitial,
  useCatalog,
  type Product,
} from "~/lib/data";
import { isSupabaseConfigured } from "~/lib/supabase";
import {
  InventoryError,
  decrementStock,
  demoInventory,
  restoreStock,
  type StockChange,
  type StockLedger,
} from "~/lib/inventory";

/* ── Statuses (stored as the exact Persian label the customer sees) ────────── */

/** Payment axis — the four values 0004_orders.sql allows. */
export const PAYMENT_STATUSES = [
  "در انتظار پرداخت",
  "پرداخت شده",
  "ناموفق",
  "بازگشت وجه",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Fulfilment axis — the six values 0004_orders.sql allows. */
export const ORDER_STATUSES = [
  "در انتظار پرداخت",
  "پردازش سفارش",
  "آماده ارسال",
  "ارسال شده",
  "تحویل داده شده",
  "لغو شده",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** A brand-new order starts here on BOTH axes (no gateway, no fulfilment yet). */
export const INITIAL_PAYMENT_STATUS: PaymentStatus = "در انتظار پرداخت";
export const INITIAL_ORDER_STATUS: OrderStatus = "در انتظار پرداخت";

/* ── Order shape ───────────────────────────────────────────────────────────── */

/** Frozen colour/size/SKU of the line as ordered — never re-read from catalog. */
export interface VariantSnapshot {
  color: string;
  size: string;
  sku: string;
}

/** One frozen line of an order. Money is integer Toman, like the DB (bigint). */
export interface OrderItem {
  productId: string;
  variantId: string;
  productTitleSnapshot: string;
  variantSnapshot: VariantSnapshot;
  /** `discount_price ?? base_price` as read at purchase time — per unit. */
  unitPrice: number;
  quantity: number;
  /** unitPrice × quantity. */
  lineTotal: number;
}

/** Who the order is for. Only name + phone are required (DB: NOT NULL). */
export interface OrderCustomer {
  name: string;
  phone: string;
  email?: string;
}

/** The persisted order — a snapshot, immutable once written. */
export interface Order {
  id: string;
  /** Human-readable reference, unique across the store (e.g. ORD-20260927-0001). */
  orderNumber: string;
  customer: OrderCustomer;
  shippingAddress: string;
  notes?: string;
  items: OrderItem[];
  /** Sum of lineTotal, integer Toman. */
  subtotalAmount: number;
  /** Amount payable; equals subtotalAmount until shipping/taxes exist. */
  totalAmount: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  createdAt: string; // ISO
  updatedAt?: string; // ISO — set when a later step moves a status
}

/* ── What the caller sends ─────────────────────────────────────────────────── */

/**
 * One requested line: ids + quantity only. `color`/`size` are optional HINTS
 * used to word a failure correctly («این رنگ موجود نیست» vs «این سایز موجود
 * نیست») — they never influence what is ordered or priced. Structurally
 * compatible with `CartItem`, so a cart can be passed straight in.
 */
export interface OrderRequestItem extends CartItem, VariantHint {}

/** Place-order request. Everything money-related is derived, never sent. */
export interface PlaceOrderInput {
  customer: OrderCustomer;
  shippingAddress: string;
  notes?: string;
  cartItems: OrderRequestItem[];
  /** Single-use idempotency key owned by the submit button/checkout page. */
  submissionToken: string;
}

/* ── Persian messages (the only place they live) ───────────────────────────── */

/**
 * Why an order was refused. The first five names are shared verbatim with
 * `CartErrorReason`, so a cart validation failure maps over unchanged.
 */
export type OrderErrorReason =
  | "empty-cart"
  | "product-missing"
  | "color-missing"
  | "size-missing"
  | "inactive"
  | "insufficient-stock"
  | "invalid-input"
  | "duplicate-order"
  | "unavailable"
  | "persistence";

export const ORDER_ERROR_MESSAGES: Record<OrderErrorReason, string> = {
  "empty-cart": "سبد خرید شما خالی است",
  "product-missing": "این محصول موجود نیست",
  "color-missing": "این رنگ موجود نیست",
  "size-missing": "این سایز موجود نیست",
  /** Gone or retired variant — no colour/size claim can honestly be made. */
  inactive: "این محصول موجود نیست",
  "insufficient-stock": "موجودی کافی نیست",
  /** Required customer field is blank (same wording as the DB function). */
  "invalid-input": "اطلاعات سفارش کامل نیست",
  "duplicate-order": "سفارش تکراری",
  /** No server-side writer available (Supabase connected, RPC not wired yet). */
  unavailable: "ثبت سفارش در حال حاضر امکان‌پذیر نیست",
  /** Stock was reserved but the order could not be stored — it was released. */
  persistence: "ثبت سفارش ناموفق بود؛ لطفاً دوباره تلاش کنید",
};

/** Persian message for a refusal reason (use at the call site). */
export function orderErrorToFa(reason: OrderErrorReason): string {
  return ORDER_ERROR_MESSAGES[reason];
}

/** Typed result of `placeOrder` — a refusal never leaves a partial order. */
export type PlaceOrderResult =
  | { ok: true; order: Order }
  | { ok: false; reason: OrderErrorReason };

/* ── Persistence adapter (same three-method shape as CartStorage) ──────────── */

/** Neutral, white-label storage key + payload version. */
export const ORDER_STORAGE_KEY = "pooshak-orders-v1";
export const ORDER_STORAGE_VERSION = 1;

/** How many consumed submission tokens are remembered (oldest are dropped). */
export const MAX_REMEMBERED_TOKENS = 200;

/** Everything that has to survive a refresh. */
export interface OrderStoreSnapshot {
  orders: Order[];
  /** Submission tokens already spent — a replay must not create an order. */
  submissionTokens: string[];
}

/**
 * Minimal storage contract. Swap in a server-backed implementation (customer
 * auth / Supabase) without touching the engine: implement these three methods.
 * `save` MUST throw when the write failed — a silently lost order is worse than
 * a lost cart, so unlike `CartStorage` nothing is swallowed here.
 */
export interface OrderStorage {
  /** Persisted state, or null when nothing usable is stored (empty/corrupt). */
  load(): OrderStoreSnapshot | null;
  /** Persist the whole snapshot; throws when it could not be written. */
  save(snapshot: OrderStoreSnapshot): void;
  clear(): void;
}

const EMPTY_SNAPSHOT: OrderStoreSnapshot = { orders: [], submissionTokens: [] };

/* ── Pure helpers ──────────────────────────────────────────────────────────── */

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/** `window.localStorage` when usable (SSR / disabled storage → null). */
let cachedLocalStorage: Storage | null | undefined;
function getLocalStorage(): Storage | null {
  if (cachedLocalStorage !== undefined) return cachedLocalStorage;
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      cachedLocalStorage = null;
      return null;
    }
    // Probe once: private mode can expose localStorage but throw on write.
    const probeKey = `${ORDER_STORAGE_KEY}-probe`;
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    cachedLocalStorage = window.localStorage;
  } catch {
    cachedLocalStorage = null;
  }
  return cachedLocalStorage;
}

/**
 * localStorage-backed adapter. A missing, corrupt or wrong-version value simply
 * yields null (→ no orders), and `save` THROWS when the value could not be
 * written so `placeOrder` can release the reserved stock.
 */
export function createLocalOrderStorage(
  key: string = ORDER_STORAGE_KEY,
  storage?: Storage | null
): OrderStorage {
  const resolve = () => (storage === undefined ? getLocalStorage() : storage);
  return {
    load() {
      const store = resolve();
      if (!store) return null;
      try {
        const raw = store.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        return sanitizeOrderSnapshot(parsed);
      } catch {
        // Corrupt JSON is not worth crashing a checkout over.
        return null;
      }
    },
    save(snapshot) {
      const store = resolve();
      // No storage at all (SSR, disabled storage): refuse loudly — the caller
      // must not believe an order was recorded when it was not.
      if (!store) throw new Error("orders: storage unavailable");
      const payload: OrderStoreSnapshot & { version: number } = {
        version: ORDER_STORAGE_VERSION,
        ...sanitizeOrderSnapshot(snapshot),
      };
      store.setItem(key, JSON.stringify(payload));
    },
    clear() {
      const store = resolve();
      if (!store) return;
      try {
        store.removeItem(key);
      } catch {
        /* nothing to do */
      }
    },
  };
}

/** Default adapter — localStorage on the client, unavailable on the server. */
export const localOrderStorage: OrderStorage = createLocalOrderStorage();

/**
 * Keep only well-formed orders and tokens. Tolerates a bare snapshot, a
 * `{version, orders, submissionTokens}` payload and any corruption: an order
 * that cannot be read back faithfully is dropped rather than half-restored.
 */
export function sanitizeOrderSnapshot(raw: unknown): OrderStoreSnapshot {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SNAPSHOT };
  const source = raw as Partial<OrderStoreSnapshot>;
  const orders = (Array.isArray(source.orders) ? source.orders : []).filter(
    isWellFormedOrder
  );
  const tokens = (Array.isArray(source.submissionTokens) ? source.submissionTokens : [])
    .filter((token): token is string => typeof token === "string" && token.trim() !== "")
    .slice(0, MAX_REMEMBERED_TOKENS);
  return { orders, submissionTokens: tokens };
}

function isWellFormedOrder(value: unknown): value is Order {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<Order>;
  if (isBlank(order.id) || isBlank(order.orderNumber) || isBlank(order.createdAt)) return false;
  if (!order.customer || isBlank(order.customer.name) || isBlank(order.customer.phone)) return false;
  if (isBlank(order.shippingAddress)) return false;
  if (!Array.isArray(order.items) || order.items.length === 0) return false;
  if (!PAYMENT_STATUSES.includes(order.paymentStatus as PaymentStatus)) return false;
  if (!ORDER_STATUSES.includes(order.orderStatus as OrderStatus)) return false;
  return order.items.every(
    (item) =>
      !!item &&
      !isBlank(item.productId) &&
      !isBlank(item.variantId) &&
      Number.isFinite(item.quantity) &&
      item.quantity > 0 &&
      Number.isFinite(item.unitPrice) &&
      Number.isFinite(item.lineTotal)
  );
}

/* ── Order references ──────────────────────────────────────────────────────── */

/** Neutral prefix for order references (no brand string — white-label). */
export const ORDER_NUMBER_PREFIX = "ORD";

/** `yyyymmdd` of a date, in the store's local time (never UTC-shifted). */
export function orderNumberDatePart(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Readable, unique reference: `ORD-<yyyymmdd>-<seq>` (4-digit, zero padded).
 * The sequence continues from the highest reference already used on that day, so
 * two orders can never share a number — and since `orders.order_number` is
 * UNIQUE, a collision would be refused by the database too.
 */
export function generateOrderNumber(
  date: Date = new Date(),
  taken: Iterable<string> = []
): string {
  const takenSet = new Set(taken);
  const base = `${ORDER_NUMBER_PREFIX}-${orderNumberDatePart(date)}`;
  let highest = 0;
  for (const reference of takenSet) {
    if (!reference.startsWith(`${base}-`)) continue;
    const sequence = Number.parseInt(reference.slice(base.length + 1), 10);
    if (Number.isFinite(sequence) && sequence > highest) highest = sequence;
  }
  let sequence = highest + 1;
  while (takenSet.has(`${base}-${`${sequence}`.padStart(4, "0")}`)) sequence += 1;
  return `${base}-${`${sequence}`.padStart(4, "0")}`;
}

/** Best-effort unique id (crypto.randomUUID when available). */
export function createOrderId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  return `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ── Request normalisation ─────────────────────────────────────────────────── */

/**
 * Aggregate the requested rows into ONE line per variant (the cart already
 * keeps them unique; the DB's unique (order_id, variant_id) index means a
 * duplicate would be refused there anyway). Malformed rows are dropped,
 * quantities are whole numbers >= 1.
 */
export function normalizeOrderItems(items: OrderRequestItem[]): OrderRequestItem[] {
  if (!Array.isArray(items)) return [];
  const byKey = new Map<string, OrderRequestItem>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (isBlank(item.productId) || isBlank(item.variantId)) continue;
    const quantity = normalizeQuantity(Number(item.quantity));
    const key = `${item.productId}::${item.variantId}`;
    const existing = byKey.get(key);
    byKey.set(key, {
      productId: item.productId,
      variantId: item.variantId,
      quantity: existing ? existing.quantity + quantity : quantity,
      color: item.color ?? existing?.color,
      size: item.size ?? existing?.size,
    });
  }
  return [...byKey.values()];
}

/* ── The engine ────────────────────────────────────────────────────────────── */

export interface PlaceOrderOptions {
  /** Catalog to validate and price against. Defaults to the visible catalog. */
  products?: Product[];
  /** Stock writer. Defaults to the in-memory demo ledger (demo mode only). */
  ledger?: StockLedger;
  /** Where the order is stored. Defaults to localStorage. */
  storage?: OrderStorage;
  /** Injectable clock (tests / deterministic references). */
  now?: Date;
}

function refuse(reason: OrderErrorReason): PlaceOrderResult {
  return { ok: false, reason };
}

function readSnapshot(storage: OrderStorage): OrderStoreSnapshot {
  try {
    return storage.load() ?? { ...EMPTY_SNAPSHOT };
  } catch {
    return { ...EMPTY_SNAPSHOT };
  }
}

/**
 * Turn a validated cart into an order. Validates product / variant / stock,
 * prices every line from the catalog, reserves the stock, and only then writes
 * the order — an all-or-nothing sequence matching the DB function.
 *
 * Returns a typed refusal (Persian message via `orderErrorToFa`) instead of
 * throwing; a refusal always leaves the store and the ledger untouched.
 */
export function placeOrder(
  input: PlaceOrderInput,
  options: PlaceOrderOptions = {}
): PlaceOrderResult {
  const storage = options.storage ?? localOrderStorage;
  const ledger = options.ledger ?? (isSupabaseConfigured() ? null : demoInventory);
  const products = options.products ?? getProductsInitial();
  const now = options.now ?? new Date();

  // No writer for this deployment: refuse rather than write a demo order next to
  // a real catalog (demo and Supabase branches are never mixed).
  if (!ledger || products.length === 0) return refuse("unavailable");

  const snapshot = readSnapshot(storage);

  // ── 1) Idempotency: a spent token can never create a second order. ─────────
  const token = typeof input.submissionToken === "string" ? input.submissionToken.trim() : "";
  if (token !== "" && snapshot.submissionTokens.includes(token)) {
    return refuse("duplicate-order");
  }

  // ── 2) Shape of the request (same required fields as the DB). ──────────────
  const name = typeof input.customer?.name === "string" ? input.customer.name.trim() : "";
  const phone = typeof input.customer?.phone === "string" ? input.customer.phone.trim() : "";
  const email = typeof input.customer?.email === "string" ? input.customer.email.trim() : "";
  const shippingAddress =
    typeof input.shippingAddress === "string" ? input.shippingAddress.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (token === "" || isBlank(name) || isBlank(phone) || isBlank(shippingAddress)) {
    return refuse("invalid-input");
  }

  const requested = normalizeOrderItems(input.cartItems);
  if (requested.length === 0) return refuse("empty-cart");

  // ── 3) Validate + price every line against the LIVE catalog. ───────────────
  const items: OrderItem[] = [];
  for (const line of requested) {
    const product = findProductById(products, line.productId);
    if (!product) return refuse("product-missing");

    const variant =
      getProductVariants(product).find((v) => v.id === line.variantId) ?? null;
    if (!variant) {
      // Unknown variant: word the refusal like the cart does (unknown colour,
      // missing size for a known colour, otherwise "gone").
      return refuse(classifyVariantFailure(product, { color: line.color, size: line.size }));
    }
    if (variant.status !== "active") return refuse("inactive");

    // The ledger is the authority on stock. A variant the ledger has never seen
    // is seeded from the catalog first, so the ledger mirrors `public.variants`
    // instead of pretending a sellable variant is unknown.
    if (ledger.get(variant.id) === null) ledger.seed([[variant.id, variant.stockQuantity]]);
    const available = ledger.get(variant.id) ?? variant.stockQuantity;
    if (available <= 0 || line.quantity > available) return refuse("insufficient-stock");

    // Price computed HERE from the catalog — the caller's numbers are ignored.
    const unitPrice = effectiveUnitPrice(product);
    items.push({
      productId: product.id,
      variantId: variant.id,
      productTitleSnapshot: product.title,
      variantSnapshot: { color: variant.color, size: variant.size, sku: variant.sku },
      unitPrice,
      quantity: line.quantity,
      lineTotal: unitPrice * line.quantity,
    });
  }

  const subtotalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);

  // ── 4) Reserve the stock (all-or-nothing; never below zero). ───────────────
  const changes: StockChange[] = items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
  }));
  try {
    decrementStock(changes, ledger);
  } catch (error) {
    if (error instanceof InventoryError && error.reason === "insufficient-stock") {
      return refuse("insufficient-stock");
    }
    // Something else went wrong while touching stock — refuse the order rather
    // than price a sale we could not reserve.
    return refuse("unavailable");
  }

  // ── 5) Persist. If this fails, release the units: no order, no stock change. ─
  const order: Order = {
    id: createOrderId(),
    orderNumber: generateOrderNumber(now, snapshot.orders.map((o) => o.orderNumber)),
    customer: email === "" ? { name, phone } : { name, phone, email },
    shippingAddress,
    ...(notes === "" ? {} : { notes }),
    items,
    subtotalAmount,
    totalAmount: subtotalAmount, // no shipping/taxes in this step
    paymentStatus: INITIAL_PAYMENT_STATUS,
    orderStatus: INITIAL_ORDER_STATUS,
    createdAt: now.toISOString(),
  };

  try {
    storage.save({
      orders: [order, ...snapshot.orders],
      submissionTokens: [token, ...snapshot.submissionTokens].slice(
        0,
        MAX_REMEMBERED_TOKENS
      ),
    });
  } catch {
    restoreStock(changes, ledger);
    return refuse("persistence");
  }

  return { ok: true, order };
}

/* ── Read helpers (part 2: checkout + confirmation) ────────────────────────── */

/** All stored orders, newest first. */
export function listOrders(storage: OrderStorage = localOrderStorage): Order[] {
  return readSnapshot(storage).orders;
}

/** Look up one order by id OR by its human-readable reference. */
export function getOrder(
  reference: string,
  storage: OrderStorage = localOrderStorage
): Order | null {
  if (isBlank(reference)) return null;
  const wanted = reference.trim();
  return listOrders(storage).find((o) => o.id === wanted || o.orderNumber === wanted) ?? null;
}

/** Was this submission token already spent (i.e. is a retry a replay)? */
export function hasSubmissionToken(
  token: string,
  storage: OrderStorage = localOrderStorage
): boolean {
  return readSnapshot(storage).submissionTokens.includes(token);
}

/**
 * Minimal orders hook: loads persisted orders after mount (so SSR and the first
 * client render agree) and places orders against the live catalog.
 */
export function useOrders(storage: OrderStorage = localOrderStorage): {
  orders: Order[];
  hydrated: boolean;
  /** Place an order; on success the hook's list refreshes from persistence. */
  placeOrder: (input: PlaceOrderInput) => PlaceOrderResult;
  /** This hook's view of one order (id or orderNumber). */
  getOrder: (reference: string) => Order | null;
  /** Re-read persistence (e.g. another tab, or after a server-side write). */
  refresh: () => void;
} {
  const { products } = useCatalog();
  const [orders, setOrders] = useState<Order[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // 1) Read persistence after mount (never during SSR).
  useEffect(() => {
    setOrders(readSnapshot(storage).orders);
    setHydrated(true);
  }, [storage]);

  const refresh = useCallback(() => {
    setOrders(readSnapshot(storage).orders);
  }, [storage]);

  const submit = useCallback(
    (input: PlaceOrderInput) => {
      const result = placeOrder(input, { products, storage });
      if (result.ok) setOrders(readSnapshot(storage).orders);
      return result;
    },
    [products, storage]
  );

  const find = useCallback(
    (reference: string) =>
      orders.find((o) => o.id === reference || o.orderNumber === reference) ?? null,
    [orders]
  );

  return { orders, hydrated, placeOrder: submit, getOrder: find, refresh };
}
