/**
 * Shopping cart engine (STEP 4, part A).
 *
 * Design rules (deliberate, do not "improve" them away):
 *  • A cart ROW is a VARIANT: `{ productId, variantId, quantity }`. Two sizes of
 *    the same product are two separate rows. This is the ONLY persisted shape —
 *    title / image / colour / size / SKU / price are NEVER stored, so a cart can
 *    never show stale catalog data. Display data is resolved from the live
 *    catalog (useCatalog) on every render.
 *  • The engine NEVER mutates inventory. No stock reduction, no reservations —
 *    that is STEP 5. Quantities are only validated against stock.
 *  • Persistence lives behind the tiny `CartStorage` adapter, so a server-side
 *    cart (customer auth) can be swapped in without touching the store.
 *  • SSR-safe: `localStorage` is only ever touched from an effect after mount,
 *    so the server render, the first client render and any other render agree
 *    (no hydration mismatch). The same pattern the rest of this codebase uses
 *    ("derived defaults", "initial snapshot then async refresh").
 *  • White-label: no brand string anywhere, including the storage key/payload.
 *
 * Part B (`/cart`) consumes: `useCart()`, `CartLine`, `cartKey()`,
 * `cartErrorToFa()`, `formatPrice()` on `line.unitPrice` / `line.lineTotal`.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getProductVariants,
  isVariantAvailable,
  useCatalog,
  type Product,
  type Variant,
} from "~/lib/data";

/* ── Types ─────────────────────────────────────────────────────────────────── */

/** Canonical persisted cart row — a variant plus how many of it. */
export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
}

/** Why a cart operation was refused. Mapped to Persian by `cartErrorToFa()`. */
export type CartErrorReason =
  | "product-missing"
  | "color-missing"
  | "size-missing"
  | "insufficient-stock"
  | "inactive";

/** Typed result of a validating operation (add / increment). */
export type CartResult = { ok: true } | { ok: false; reason: CartErrorReason };

/** Optional colour/size hints so a failure can name the right option. */
export interface VariantHint {
  color?: string;
  size?: string;
}

/**
 * A cart row resolved against the live catalog.
 * `product` / `variant` are null only when the catalog no longer has them —
 * the row is kept (never silently dropped) and `available` is false so the UI
 * can show an honest message instead of losing the customer's item.
 */
export interface CartLine {
  /** Stable row key: productId + variantId (see `cartKey`). */
  key: string;
  productId: string;
  variantId: string;
  quantity: number;
  product: Product | null;
  variant: Variant | null;
  title: string;
  image: string | null;
  color: string;
  size: string;
  sku: string;
  /** `discount_price ?? base_price` (sanity-guarded) — per unit. */
  unitPrice: number;
  /** unitPrice × quantity (0 for an unresolvable row). */
  lineTotal: number;
  /** True only when the live variant is active AND in stock. */
  available: boolean;
  /** Why the row is not purchasable, null when it is. */
  reason: CartErrorReason | null;
}

/* ── Persian messages (the only place they live) ───────────────────────────── */

export const CART_ERROR_MESSAGES: Record<CartErrorReason, string> = {
  "product-missing": "این محصول موجود نیست",
  "color-missing": "این رنگ موجود نیست",
  "size-missing": "این سایز موجود نیست",
  "insufficient-stock": "موجودی کافی نیست",
  /** The variant is gone or no longer sellable — same wording as a missing product. */
  inactive: "این محصول موجود نیست",
};

/** Persian message for a refusal reason (use at the call site). */
export function cartErrorToFa(reason: CartErrorReason): string {
  return CART_ERROR_MESSAGES[reason];
}

/* ── Keys ──────────────────────────────────────────────────────────────────── */

const KEY_SEP = "::";

/** Row key for a variant — different variants of one product are separate rows. */
export function cartKey(productId: string, variantId: string): string {
  return `${productId}${KEY_SEP}${variantId}`;
}

/** Inverse of `cartKey` — null when the key is not a cart key. */
export function parseCartKey(key: string): { productId: string; variantId: string } | null {
  const index = key.indexOf(KEY_SEP);
  if (index <= 0) return null;
  const productId = key.slice(0, index);
  const variantId = key.slice(index + KEY_SEP.length);
  if (!productId || !variantId) return null;
  return { productId, variantId };
}

/* ── Pure helpers ──────────────────────────────────────────────────────────── */

/** Quantities are whole numbers, never below 1. */
export function normalizeQuantity(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

/**
 * Unit price of a product = `discount_price ?? base_price`, with the same
 * sanity guard the product page uses (a discount only counts when it is really
 * lower) — so the cart total can never disagree with the price on the page.
 */
export function effectiveUnitPrice(product: Product): number {
  const discount = product.discount_price;
  return discount != null && discount < product.base_price ? discount : product.base_price;
}

/** Live catalog lookup by product id (never by slug — cart rows store ids). */
export function findProductById(products: Product[], productId: string): Product | null {
  return products.find((p) => p.id === productId) ?? null;
}

/**
 * When a variant id is NOT in the product's (active-only) variant list, work out
 * which honest message fits: an unknown COLOUR is «این رنگ موجود نیست», a
 * missing SIZE for a known colour is «این سایز موجود نیست», and otherwise the
 * variant is simply gone/inactive.
 */
export function classifyVariantFailure(
  product: Product,
  hints: VariantHint | undefined
): CartErrorReason {
  const variants = getProductVariants(product);
  if (hints?.color && !variants.some((v) => v.color === hints.color)) return "color-missing";
  if (hints?.size) {
    const scoped = hints.color
      ? variants.filter((v) => v.color === hints.color)
      : variants;
    if (!scoped.some((v) => v.size === hints.size)) return "size-missing";
  }
  return "inactive";
}

/**
 * Validate a request for `requestedQuantity` units of one variant against the
 * LIVE catalog. Pure — exported so it can be unit-tested and reused by part B.
 * Never returns ok for a nonexistent/inactive variant or for a quantity above
 * stock_quantity (a stock of 0 therefore always fails).
 */
export function validateCartRequest(
  products: Product[],
  productId: string,
  variantId: string,
  requestedQuantity: number,
  hints?: VariantHint
): CartResult {
  const product = findProductById(products, productId);
  if (!product) return { ok: false, reason: "product-missing" };

  const variant = getProductVariants(product).find((v) => v.id === variantId) ?? null;
  if (!variant) return { ok: false, reason: classifyVariantFailure(product, hints) };
  if (variant.status !== "active") {
    // Defensive: both catalog mappers already drop inactive variants, so this is
    // only reachable if a row flips status between render and click. «این محصول
    // موجود نیست» is the honest wording — no colour/size claim can be made.
    return { ok: false, reason: "inactive" };
  }

  const quantity = normalizeQuantity(requestedQuantity);
  if (variant.stockQuantity <= 0 || quantity > variant.stockQuantity) {
    return { ok: false, reason: "insufficient-stock" };
  }
  return { ok: true };
}

/** Resolve persisted rows into display-ready lines against the live catalog. */
export function resolveCartLines(items: CartItem[], products: Product[]): CartLine[] {
  return items.map((item) => {
    const quantity = normalizeQuantity(item.quantity);
    const product = findProductById(products, item.productId);
    const variant =
      product !== null
        ? (getProductVariants(product).find((v) => v.id === item.variantId) ?? null)
        : null;
    const available = product !== null && variant !== null && isVariantAvailable(variant);
    const unitPrice = product !== null ? effectiveUnitPrice(product) : 0;
    const reason: CartErrorReason | null = available
      ? null
      : product === null
        ? "product-missing"
        : variant === null
          ? "inactive"
          : "insufficient-stock";
    return {
      key: cartKey(item.productId, item.variantId),
      productId: item.productId,
      variantId: item.variantId,
      quantity,
      product,
      variant,
      title: product?.title ?? "",
      image: product?.image ?? null,
      color: variant?.color ?? "",
      size: variant?.size ?? "",
      sku: variant?.sku ?? "",
      unitPrice,
      lineTotal: unitPrice * quantity,
      available,
      reason,
    };
  });
}

/** Total units in the cart (sum of quantities, not of rows). */
export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Cart subtotal = sum of line totals. No shipping/taxes (out of scope). */
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

/* ── Persistence adapter ───────────────────────────────────────────────────── */

/** Neutral, white-label storage key + payload version. */
export const CART_STORAGE_KEY = "pooshak-cart-v1";
export const CART_STORAGE_VERSION = 1;

/**
 * Minimal storage contract. Swap in a server-backed implementation (customer
 * auth) without touching the store: implement these three methods.
 */
export interface CartStorage {
  /** Persisted rows, or null when nothing usable is stored (empty/corrupt). */
  load(): CartItem[] | null;
  save(items: CartItem[]): void;
  clear(): void;
}

/** What actually goes on disk: `{ version, items }`. */
interface PersistedCart {
  version: number;
  items: CartItem[];
}

/** Keep only well-formed rows; clamp quantity to a whole number >= 1; dedupe. */
export function sanitizeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, CartItem>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Partial<CartItem>;
    if (typeof row.productId !== "string" || !row.productId) continue;
    if (typeof row.variantId !== "string" || !row.variantId) continue;
    const quantity = normalizeQuantity(Number(row.quantity));
    const key = cartKey(row.productId, row.variantId);
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing
        ? { ...existing, quantity: existing.quantity + quantity }
        : { productId: row.productId, variantId: row.variantId, quantity }
    );
  }
  return [...byKey.values()];
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
    const probeKey = `${CART_STORAGE_KEY}-probe`;
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    cachedLocalStorage = window.localStorage;
  } catch {
    cachedLocalStorage = null;
  }
  return cachedLocalStorage;
}

/**
 * localStorage-backed adapter. Every operation is failure-tolerant: a missing,
 * corrupt, wrong-version or unreadable value simply yields null (→ empty cart),
 * and a failed write is swallowed (the in-memory cart still works).
 */
export function createLocalCartStorage(
  key: string = CART_STORAGE_KEY,
  storage?: Storage | null
): CartStorage {
  const resolve = () => (storage === undefined ? getLocalStorage() : storage);
  return {
    load() {
      const store = resolve();
      if (!store) return null;
      try {
        const raw = store.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        // Tolerate both `{ version, items }` and a bare items array.
        const source = Array.isArray(parsed)
          ? parsed
          : ((parsed as Partial<PersistedCart> | null)?.items ?? null);
        return sanitizeCartItems(source);
      } catch {
        return null;
      }
    },
    save(items) {
      const store = resolve();
      if (!store) return;
      try {
        const payload: PersistedCart = {
          version: CART_STORAGE_VERSION,
          items: sanitizeCartItems(items),
        };
        store.setItem(key, JSON.stringify(payload));
      } catch {
        /* quota / private mode — in-memory cart keeps working */
      }
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

/** Default adapter — localStorage on the client, a no-op on the server. */
export const localCartStorage: CartStorage = createLocalCartStorage();

/* ── Store (React context) ─────────────────────────────────────────────────── */

export interface CartContextValue {
  /** Canonical persisted rows (variant = row). */
  items: CartItem[];
  /** True once the client has read persistence — false during SSR/first paint. */
  hydrated: boolean;
  /** Rows resolved against the live catalog (display data lives here). */
  lines: CartLine[];
  /** Total units in the cart — the header badge number. */
  itemCount: number;
  /** Number of distinct rows (product + variant). */
  uniqueItemCount: number;
  /** Sum of line totals, in Toman. */
  subtotal: number;
  /** Add `quantity` units; validates against the live catalog. */
  addItem: (
    productId: string,
    variantId: string,
    quantity?: number,
    hints?: VariantHint
  ) => CartResult;
  /** Add `by` more units of an existing row; never exceeds stock. */
  increment: (variantKey: string, by?: number) => CartResult;
  /** Remove one unit; floors at 1 (never drops below). */
  decrement: (variantKey: string) => void;
  /** Remove the whole row. */
  removeItem: (variantKey: string) => void;
  /** Empty the cart (state + persistence). */
  clear: () => void;
  /** Units of one row (0 when absent). */
  quantityOf: (variantKey: string) => number;
  /** Is this row already in the cart? */
  hasItem: (variantKey: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

const OK: CartResult = { ok: true };

function withQuantity(
  items: CartItem[],
  productId: string,
  variantId: string,
  quantity: number
): CartItem[] {
  const key = cartKey(productId, variantId);
  const index = items.findIndex((i) => cartKey(i.productId, i.variantId) === key);
  if (index === -1) return [...items, { productId, variantId, quantity }];
  const next = [...items];
  next[index] = { ...next[index], quantity };
  return next;
}

/**
 * Cart provider. Mount once, high enough that BOTH the header badge and every
 * page can read it (see `__root.tsx`). Hydration order is deliberate:
 * server render + first client render = empty cart, then an effect loads
 * persistence — identical markup on both sides, so React never warns.
 */
export function CartProvider({
  children,
  storage = localCartStorage,
}: {
  children: ReactNode;
  /** Injectable for tests / a future server-backed cart. */
  storage?: CartStorage;
}) {
  const { products } = useCatalog();
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // 1) Hydrate from persistence after mount (never during SSR).
  useEffect(() => {
    setItems(sanitizeCartItems(storage.load() ?? []));
    setHydrated(true);
  }, [storage]);

  // 2) Persist every mutation — but only once hydration has happened, so an
  //    empty first render can never wipe a stored cart.
  useEffect(() => {
    if (!hydrated) return;
    storage.save(items);
  }, [items, hydrated, storage]);

  const addItem = useCallback<CartContextValue["addItem"]>(
    (productId, variantId, quantity = 1, hints) => {
      const current =
        items.find((i) => i.productId === productId && i.variantId === variantId)?.quantity ?? 0;
      const requested = current + normalizeQuantity(quantity);
      const result = validateCartRequest(products, productId, variantId, requested, hints);
      if (!result.ok) return result;
      setItems((prev) => withQuantity(prev, productId, variantId, requested));
      return OK;
    },
    [items, products]
  );

  const increment = useCallback<CartContextValue["increment"]>(
    (variantKey, by = 1) => {
      const row = items.find((i) => cartKey(i.productId, i.variantId) === variantKey);
      // No such row → nothing to increase. Reported with the closest reason in
      // the union; the UI never offers +/- for a row that does not exist.
      if (!row) return { ok: false, reason: "product-missing" };
      const requested = row.quantity + Math.max(1, Math.floor(by));
      const result = validateCartRequest(products, row.productId, row.variantId, requested);
      if (!result.ok) return result;
      setItems((prev) => withQuantity(prev, row.productId, row.variantId, requested));
      return OK;
    },
    [items, products]
  );

  const decrement = useCallback<CartContextValue["decrement"]>((variantKey) => {
    setItems((prev) =>
      prev.map((i) =>
        cartKey(i.productId, i.variantId) === variantKey
          ? { ...i, quantity: Math.max(1, i.quantity - 1) }
          : i
      )
    );
  }, []);

  const removeItem = useCallback<CartContextValue["removeItem"]>((variantKey) => {
    setItems((prev) =>
      prev.filter((i) => cartKey(i.productId, i.variantId) !== variantKey)
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const lines = useMemo(() => resolveCartLines(items, products), [items, products]);
  const itemCount = useMemo(() => cartItemCount(lines), [lines]);
  const subtotal = useMemo(() => cartSubtotal(lines), [lines]);

  const quantityOf = useCallback<CartContextValue["quantityOf"]>(
    (variantKey) =>
      items.find((i) => cartKey(i.productId, i.variantId) === variantKey)?.quantity ?? 0,
    [items]
  );

  const hasItem = useCallback<CartContextValue["hasItem"]>(
    (variantKey) => items.some((i) => cartKey(i.productId, i.variantId) === variantKey),
    [items]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      hydrated,
      lines,
      itemCount,
      uniqueItemCount: items.length,
      subtotal,
      addItem,
      increment,
      decrement,
      removeItem,
      clear,
      quantityOf,
      hasItem,
    }),
    [
      items,
      hydrated,
      lines,
      itemCount,
      subtotal,
      addItem,
      increment,
      decrement,
      removeItem,
      clear,
      quantityOf,
      hasItem,
    ]
  );

  // createElement (not JSX) keeps this module a plain `.ts` file.
  return createElement(CartContext.Provider, { value }, children);
}

/** Cart store accessor — must be rendered inside <CartProvider>. */
export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider> (mounted in src/routes/__root.tsx)");
  }
  return context;
}

/** Convenience selector for components that only render resolved rows. */
export function useCartLines(): CartLine[] {
  return useCart().lines;
}
