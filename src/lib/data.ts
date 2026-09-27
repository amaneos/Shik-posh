/**
 * Catalog data layer.
 *
 * Two strictly separated sources, never mixed:
 *
 *   • Supabase branch  — real rows from the client store's own project, queried
 *                        when SUPABASE_URL + SUPABASE_ANON_KEY are configured.
 *   • Demo branch      — the static placeholder catalog (src/lib/demo-data.ts),
 *                        used only while no project is connected.
 *
 * UI code imports ONLY from this module (never demo-data directly).
 *
 * STEP 2: every public query treats a product as visible ONLY when the product
 * row is active AND its category is active (status filtering happens in
 * queries — statuses simply don't exist as schema in migrations). Products
 * embed their images (ordered by position) so a listing is a single request.
 *
 * STEP 3: products also carry their VARIANTS (colour + size + SKU + stock) and
 * every product query embeds them in the SAME request (no N+1) — see
 * supabase/migrations/0003_variants.sql. Inventory exists only on variants,
 * never on the product. Two rules to remember:
 *   • Public reads expose ACTIVE variants only; inactive ones are dropped in
 *     storeProductToProduct / toDemoProduct, so both branches behave identically.
 *   • A product whose variants are all inactive (or that has none) still loads —
 *     the product row is never hidden because of its variants.
 */

import { useCallback, useEffect, useState } from "react";

import { DEMO_CATEGORIES, DEMO_PRODUCTS, type DemoProduct } from "~/lib/demo-data";
import { getSupabaseClient, isSupabaseConfigured } from "~/lib/supabase";

export interface Category {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  description: string | null;
}

/* ── Variants + inventory (STEP 3) ────────────────────────────────────────────
 * A product never stores stock. Every PURCHASABLE THING is a variant: one row
 * per colour + size combination, with its own SKU and its own stock quantity
 * (supabase/migrations/0003_variants.sql). Public reads expose ACTIVE variants
 * only — the filtering happens once, in the two row mappers below, so the
 * Supabase and demo branches can never drift apart.
 */

export type VariantStatus = "active" | "inactive";

export interface Variant {
  id: string;
  productId: string;
  /** Colour name as shown to the customer, e.g. «مشکی». */
  color: string;
  /** Size label, e.g. S / M / L / XL. */
  size: string;
  /** Uppercase latin SKU, unique per client store, e.g. TS-BLK-S. */
  sku: string;
  /** Units on hand for THIS colour/size; 0 = «ناموجود». Never negative (DB CHECK). */
  stockQuantity: number;
  status: VariantStatus;
}

/** Canonical size order used to sort a product's variants. */
export const SIZE_ORDER = ["S", "M", "L", "XL"] as const;

export type SizeLabel = (typeof SIZE_ORDER)[number];

/** Rank of a size label in canonical order; unknown labels come after these. */
export function sizeRank(size: string): number {
  const index = SIZE_ORDER.indexOf(size.trim().toUpperCase() as SizeLabel);
  return index === -1 ? SIZE_ORDER.length : index;
}

/**
 * Sort variants for display: colour groups first (in the order the source
 * provides them — Supabase orders colours ascending in SQL, the demo fixtures
 * are curated), then S < M < L < XL inside each colour. Deliberately free of
 * locale-specific collation so SSR and the browser always agree on the order.
 */
export function sortVariants(variants: Variant[]): Variant[] {
  const colourOrder = new Map<string, number>();
  for (const v of variants) {
    if (!colourOrder.has(v.color)) colourOrder.set(v.color, colourOrder.size);
  }
  return [...variants].sort((a, b) => {
    const ca = colourOrder.get(a.color) ?? 0;
    const cb = colourOrder.get(b.color) ?? 0;
    if (ca !== cb) return ca - cb;
    const ra = sizeRank(a.size);
    const rb = sizeRank(b.size);
    if (ra !== rb) return ra - rb;
    return a.size < b.size ? -1 : a.size > b.size ? 1 : 0;
  });
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  base_price: number;
  discount_price: number | null;
  category: string | null; // display name (denormalised for the card UI)
  /** Category slug — lets /shop filter by ?category=<slug> without a join at render. */
  categorySlug: string | null;
  /** Ordered gallery URLs; product page shows these (first = featured). */
  images: string[];
  /** Main image — always images[0] when the gallery is non-empty, else null. */
  image: string | null;
  /**
   * ACTIVE colour/size variants, sorted (colour groups, then S < M < L < XL).
   * Empty when the product has no variants configured yet — see hasVariants().
   * All inventory questions are answered from here, never from the product row.
   */
  variants: Variant[];
}

/* ── Shop list query (search / category / sort) ───────────────────────────── */

export type SortMode = "newest" | "price-asc" | "price-desc";

export interface ShopQuery {
  /** Free text; matches title + description (case-insensitive). */
  search?: string;
  /** Category slug; undefined = all categories. */
  categorySlug?: string;
  /** undefined = "newest" (created_at desc), same as the default listing. */
  sort?: SortMode | undefined;
}

/* ── Supabase row shapes (mirror of supabase/migrations/0001_init.sql) ──────── */

interface StoreCategoryRow {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  description: string | null;
}

interface StoreProductImageRow {
  url: string;
}

/** One public.variants row (0003_variants.sql) — snake_case, as stored. */
interface StoreVariantRow {
  id: string;
  product_id: string;
  color: string;
  size: string;
  sku: string;
  stock_quantity: number | string;
  status: VariantStatus;
}

interface StoreProductRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  base_price: number | string;
  discount_price: number | string | null;
  category: { name: string; slug: string } | null;
  images: StoreProductImageRow[] | null;
  variants: StoreVariantRow[] | null;
}

/* ── Demo helpers (strictly demo; Supabase never touches these) ────────────── */

/** Names of categories whose status is active. */
function demoActiveCategoryNames(): Set<string> {
  return new Set(
    DEMO_CATEGORIES.filter((c) => c.status === "active").map((c) => c.name)
  );
}

function demoCategorySlug(categoryName: string): string | null {
  return DEMO_CATEGORIES.find((c) => c.name === categoryName)?.slug ?? null;
}

/** Demo rows that are publicly visible: active product AND active category. */
function visibleDemoRows() {
  const activeCategories = demoActiveCategoryNames();
  return DEMO_PRODUCTS.filter(
    (p) => p.status === "active" && activeCategories.has(p.category)
  );
}

/** Demo row → Product, resolving the category display name to its slug. */
function toDemoProduct(row: DemoProduct): Product {
  // The demo fixtures omit productId (the owning row supplies it) and may hold
  // INACTIVE variants on purpose — exactly like a real project. Inactive rows are
  // dropped here, the same way the Supabase mapper drops them.
  const allVariants: Variant[] = row.variants.map((v) => ({
    id: v.id,
    productId: row.id,
    color: v.color,
    size: v.size,
    sku: v.sku,
    stockQuantity: v.stockQuantity,
    status: v.status,
  }));
  return {
    ...row,
    categorySlug: demoCategorySlug(row.category),
    image: row.images[0] ?? null,
    variants: sortVariants(allVariants.filter((v) => v.status === "active")),
  };
}

/** Filter + sort the demo array exactly like the Supabase SQL branch does. */
function demoShopProducts(query: ShopQuery): Product[] {
  const term = (query.search ?? "").trim().toLowerCase();
  let rows = visibleDemoRows();
  if (query.categorySlug) {
    rows = rows.filter((p) => demoCategorySlug(p.category) === query.categorySlug);
  }
  if (term) {
    rows = rows.filter((p) =>
      `${p.title} ${p.description ?? ""}`.toLowerCase().includes(term)
    );
  }
  const sort = query.sort ?? "newest";
  rows = [...rows].sort((a, b) => {
    if (sort === "price-asc") return a.base_price - b.base_price;
    if (sort === "price-desc") return b.base_price - a.base_price;
    return b.created_at.localeCompare(a.created_at); // newest first
  });
  return rows.map(toDemoProduct);
}

/* ── Supabase row → Product ───────────────────────────────────────────────── */

function storeProductToProduct(row: StoreProductRow): Product {
  const images = (row.images ?? []).map((i) => i.url);
  // public.variants rows → Variant. Inactive variants never reach the UI (the
  // same rule the demo fixtures get), but a product row is never dropped because
  // of its variants — the product simply arrives with an empty list.
  const allVariants: Variant[] = (row.variants ?? []).map((v) => ({
    id: v.id,
    productId: v.product_id,
    color: v.color,
    size: v.size,
    sku: v.sku,
    stockQuantity: Number(v.stock_quantity),
    status: v.status,
  }));
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    base_price: Number(row.base_price),
    discount_price: row.discount_price == null ? null : Number(row.discount_price),
    category: row.category?.name ?? null,
    categorySlug: row.category?.slug ?? null,
    images,
    image: images[0] ?? null,
    variants: sortVariants(allVariants.filter((v) => v.status === "active")),
  };
}

/* ── Shared Supabase product query ──────────────────────────────────────────
 * One select used by every public product query, so a listing is a single
 * request (no N+1):
 *   • `category:categories(name, slug)` embeds the category relation.
 *   • `images:product_images(url)` embeds the gallery rows.
 *   • `variants:variants(...)` embeds the colour/size/SKU/stock rows (STEP 3) in
 *     that SAME request — the shop cards and the product page both get real
 *     availability without a second round trip.
 *   • `.eq("categories.status", "active")` — a filter on an EMBEDDED resource
 *     turns the embedding into an INNER JOIN in PostgREST, so products whose
 *     category is missing or inactive are excluded from the result entirely
 *     (instead of returning the product with a null category).
 *   • `.order("position", { referencedTable: "product_images" })` sorts each
 *     product's embedded gallery by position, so row.images[0] is the main shot.
 *   • `.order("color", { referencedTable: "variants" })` returns each product's
 *     variants grouped by colour in ascending order — the mapper then sorts by
 *     size (S < M < L < XL) inside every colour group.
 * NOTE: products.image does NOT exist in 0001_init.sql — the main image is
 * always images[0] from product_images.
 * NOTE: `.eq("variants.status", "active")` is deliberately NOT used: a filter on
 * an embedded resource is an INNER JOIN, which would silently DROP any product
 * whose variants are all inactive (or that has no variants yet). The variants
 * embedding therefore stays unfiltered and the status filter happens in
 * storeProductToProduct — the product always loads, only the hidden variants go.
 */

const PRODUCT_SELECT =
  "id, title, slug, description, base_price, discount_price, category:categories(name, slug), images:product_images(url), variants:variants(id, product_id, color, size, sku, stock_quantity, status)";

function productSelectQuery(client: NonNullable<ReturnType<typeof getSupabaseClient>>) {
  return client
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active") // product must be active
    .eq("categories.status", "active") // and its category must be active (inner join)
    .order("position", { referencedTable: "product_images", ascending: true })
    .order("color", { referencedTable: "variants", ascending: true });
}

/* ── Data access ────────────────────────────────────────────────────────────── */

export async function getCategories(): Promise<Category[]> {
  if (isSupabaseConfigured()) {
    // ── Supabase branch ──
    const client = getSupabaseClient();
    if (!client) return [];
    const { data, error } = await client
      .from("categories")
      .select("id, name, slug, image, description")
      .eq("status", "active")
      .order("name");
    if (error) {
      console.error("[data] getCategories:", error.message);
      return [];
    }
    return ((data ?? []) as unknown as StoreCategoryRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      image: row.image,
      description: row.description,
    }));
  }
  // ── Demo branch (no project connected) ──
  return DEMO_CATEGORIES.filter((c) => c.status === "active");
}

/** All visible products, newest first (for Home / related / shared hooks). */
export async function getProducts(): Promise<Product[]> {
  if (isSupabaseConfigured()) {
    // ── Supabase branch ──
    const client = getSupabaseClient();
    if (!client) return [];
    const { data, error } = await productSelectQuery(client).order("created_at", {
      ascending: false,
    });
    if (error) {
      console.error("[data] getProducts:", error.message);
      return [];
    }
    return ((data ?? []) as unknown as StoreProductRow[]).map(storeProductToProduct);
  }
  // ── Demo branch (no project connected) ──
  return demoShopProducts({});
}

/**
 * The one place the Shop page consumes: search + category + sort as a single
 * request in Supabase mode (statuses filtered server-side), exact same shape
 * from the demo array otherwise.
 */
export async function getShopProducts(query: ShopQuery): Promise<Product[]> {
  if (isSupabaseConfigured()) {
    // ── Supabase branch ──
    const client = getSupabaseClient();
    if (!client) return [];
    let q = productSelectQuery(client);

    const term = (query.search ?? "").trim();
    if (term) {
      // Case-insensitive substring search across title + description.
      // (ilike is case-insensitive; fine for Persian text too.)
      q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }
    if (query.categorySlug) {
      // Filter on the embedded category relation (same inner-join behaviour).
      q = q.eq("categories.slug", query.categorySlug);
    }
    const sort = query.sort ?? "newest";
    if (sort === "price-asc") q = q.order("base_price", { ascending: true });
    else if (sort === "price-desc") q = q.order("base_price", { ascending: false });
    else q = q.order("created_at", { ascending: false }); // newest

    const { data, error } = await q;
    if (error) {
      console.error("[data] getShopProducts:", error.message);
      return [];
    }
    return ((data ?? []) as unknown as StoreProductRow[]).map(storeProductToProduct);
  }
  // ── Demo branch (no project connected) ──
  return demoShopProducts(query);
}

/**
 * Sync snapshot of the same query for the first render (demo data is static so
 * the shop page can paint its real content during SSR; Supabase mode starts
 * empty and fills in after mount).
 */
export function getShopProductsInitial(query: ShopQuery): Product[] {
  return isSupabaseConfigured() ? [] : demoShopProducts(query);
}

/* ── Sync snapshots for first paint ───────────────────────────────────────────
 * Demo data is static and can render during SSR; real (Supabase) data is async
 * and only arrives after mount. These give the first render the demo content so
 * the page isn't empty for a frame — without ever mixing the two sources.
 */

export function getCategoriesInitial(): Category[] {
  return isSupabaseConfigured() ? [] : DEMO_CATEGORIES.filter((c) => c.status === "active");
}

export function getProductsInitial(): Product[] {
  return isSupabaseConfigured() ? [] : demoShopProducts({});
}

/* ── Single product (detail page) ──────────────────────────────────────────── */

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (isSupabaseConfigured()) {
    // ── Supabase branch ──
    const client = getSupabaseClient();
    if (!client) return null;
    const { data, error } = await productSelectQuery(client)
      .eq("slug", slug)
      .maybeSingle();
    // A genuine fetch failure is an ERROR — the caller shows the retryable
    // error state, never the not-found state.
    if (error) throw new Error(`[data] getProductBySlug: ${error.message}`);
    // No row (or a product whose category is inactive — fails the inner join)
    // → null, treated as not-found by the caller, so no broken pages.
    if (!data) return null;
    return storeProductToProduct(data as unknown as StoreProductRow);
  }
  // ── Demo branch (no project connected) ──
  return demoFindProduct(slug);
}

/** Demo lookup for a single visible product (active product + active category). */
function demoFindProduct(slug: string): Product | null {
  const row = DEMO_PRODUCTS.find(
    (p) =>
      p.slug === slug &&
      p.status === "active" &&
      demoActiveCategoryNames().has(p.category)
  );
  return row ? toDemoProduct(row) : null;
}

/**
 * Product hook: sync demo snapshot for SSR, async Supabase fetch on mount.
 * A catchable failure of the fetch is an ERROR (retryable) — the caller shows
 * the error state with a retry button, never the not-found state.
 */
export function useProduct(slug: string): {
  product: Product | null;
  loaded: boolean;
  error: boolean;
  retry: () => void;
} {
  const [product, setProduct] = useState<Product | null>(() =>
    isSupabaseConfigured() ? null : demoFindProduct(slug)
  );
  const [loaded, setLoaded] = useState(() => !isSupabaseConfigured());
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setError(false);
    if (!isSupabaseConfigured()) {
      setProduct(demoFindProduct(slug));
      setLoaded(true);
      return () => {
        live = false;
      };
    }
    setLoaded(false); // light skeleton while fetching
    getProductBySlug(slug)
      .then((p) => {
        if (!live) return;
        setProduct(p);
        setLoaded(true);
      })
      .catch(() => {
        if (!live) return;
        setError(true);
        setLoaded(true);
      });
    return () => {
      live = false;
    };
    // slug and tick (retry) both re-run the fetch; error state resets each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);

  return { product, loaded, error, retry };
}

/* ── Related products (same category, active only, never self) ─────────────── */

export async function getRelatedProducts(product: Product): Promise<Product[]> {
  if (!product.categorySlug || !product.id) return [];
  if (isSupabaseConfigured()) {
    // ── Supabase branch ──
    const client = getSupabaseClient();
    if (!client) return [];
    const { data, error } = await productSelectQuery(client)
      .eq("categories.slug", product.categorySlug)
      .neq("id", product.id)
      .limit(4);
    if (error) {
      console.error("[data] getRelatedProducts:", error.message);
      return [];
    }
    return ((data ?? []) as unknown as StoreProductRow[]).map(storeProductToProduct);
  }
  // ── Demo branch (no project connected) ──
  return demoRelatedProducts(product);
}

/** Demo related products: same category, active only, never self, max 4. */
function demoRelatedProducts(product: Product): Product[] {
  if (!product.categorySlug) return [];
  return demoShopProducts({ categorySlug: product.categorySlug })
    .filter((p) => p.id !== product.id)
    .slice(0, 4);
}

/**
 * Related products hook for the detail page: sync demo snapshot for SSR, async
 * Supabase fetch on mount. `related` is empty when there are no siblings (the
 * page hides the whole section then, which is the clean empty behaviour).
 */
export function useRelatedProducts(product: Product | null): {
  related: Product[];
  loaded: boolean;
} {
  const [related, setRelated] = useState<Product[]>(() =>
    !isSupabaseConfigured() && product ? demoRelatedProducts(product) : []
  );
  const [loaded, setLoaded] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    let live = true;
    if (!product) {
      setRelated([]);
      setLoaded(true);
      return () => {
        live = false;
      };
    }
    if (!isSupabaseConfigured()) {
      setRelated(demoRelatedProducts(product));
      setLoaded(true);
      return () => {
        live = false;
      };
    }
    setLoaded(false); // skeleton while related products load
    getRelatedProducts(product)
      .then((rows) => {
        if (!live) return;
        setRelated(rows);
        setLoaded(true);
      })
      .catch(() => {
        if (!live) return;
        setRelated([]); // no related section on failure — never blank-flash the page
        setLoaded(true);
      });
    return () => {
      live = false;
    };
    // product identity drives the fetch; eslint-disable for product object dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, product?.categorySlug]);

  return { related, loaded };
}

/** Catalog hook: SSR-friendly initial snapshot + async refresh on mount. */
export function useCatalog() {
  const [categories, setCategories] = useState<Category[]>(() => getCategoriesInitial());
  const [products, setProducts] = useState<Product[]>(() => getProductsInitial());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([getCategories(), getProducts()])
      .then(([cats, prods]) => {
        if (!live) return;
        setCategories(cats);
        setProducts(prods);
        setLoaded(true);
      })
      .catch(() => {
        /* keep whatever the initial snapshot had */
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return { categories, products, loaded };
}

/** Categories hook used by the Shop page (active categories for the chips). */
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(() => getCategoriesInitial());
  const [loaded, setLoaded] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    let live = true;
    getCategories()
      .then((cats) => {
        if (!live) return;
        setCategories(cats);
        setLoaded(true);
      })
      .catch(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return { categories, loaded };
}

/**
 * Shop products hook: SSR-friendly first paint from the initial snapshot, then
 * an async refresh (Supabase mode; demo mode resolves the same pure filter
 * synchronously). Refetches whenever search/category/sort change.
 */
export function useShopProducts(query: ShopQuery): {
  products: Product[];
  loaded: boolean;
  error: boolean;
  retry: () => void;
} {
  const [products, setProducts] = useState<Product[]>(() => getShopProductsInitial(query));
  const [loaded, setLoaded] = useState(() => !isSupabaseConfigured());
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  const key = `${query.search ?? ""}\u0001${query.categorySlug ?? ""}\u0001${query.sort ?? ""}`;

  useEffect(() => {
    let live = true;
    setError(false);
    if (!isSupabaseConfigured()) {
      // Demo mode: filtering is synchronous — no loading flash.
      setProducts(demoShopProducts(query));
      setLoaded(true);
      return () => {
        live = false;
      };
    }
    setLoaded(false); // light skeleton while (re)fetching
    getShopProducts(query)
      .then((p) => {
        if (!live) return;
        setProducts(p);
        setLoaded(true);
      })
      .catch(() => {
        if (!live) return;
        setError(true);
        setLoaded(true);
      });
    return () => {
      live = false;
    };
    // key covers every field of `query`; tick re-runs the effect on retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);

  return { products, loaded, error, retry };
}

/* ── Inventory helpers (STEP 3, part B) ───────────────────────────────────────
 * Pure, demo-safe derivations from a Product's (already active-only) variants.
 * They exist so no UI component ever invents availability numbers: the card
 * badge, the colour chips, the size chips and the «موجودی: …» line all read the
 * SAME real variant rows in both branches.
 */

/** A variant can be bought right now (active AND in stock). */
export function isVariantAvailable(variant: Variant): boolean {
  return variant.status === "active" && variant.stockQuantity > 0;
}

/** The product's public (active) variants — [] when it has none configured. */
export function getProductVariants(product: Product): Variant[] {
  return product.variants ?? [];
}

/** Does this product have any active variant at all? */
export function hasVariants(product: Product): boolean {
  return getProductVariants(product).length > 0;
}

/** Total sellable stock = sum of the product's active variants. */
export function getTotalStock(product: Product): number {
  return getProductVariants(product).reduce(
    (sum, v) => (v.status === "active" ? sum + v.stockQuantity : sum),
    0
  );
}

/**
 * Product-card availability badge.
 * Out of stock means: has variants, and every one of them is at 0 (or inactive).
 * A product with NO variants yet is NOT «ناموجود» — nothing is configured, which
 * is a different situation from sold out; use hasVariants() to tell them apart.
 */
export function isOutOfStock(product: Product): boolean {
  return hasVariants(product) && getTotalStock(product) === 0;
}

export interface ColorOption {
  /** Colour name as stored on the variant, e.g. «مشکی». */
  color: string;
  /** Stock summed over this colour's active variants. */
  totalStock: number;
  /** false when every size of this colour is out of stock → «این رنگ موجود نیست». */
  inStock: boolean;
}

/**
 * Distinct colours of a product, in variant order (colour groups, matching the
 * order the variants array already has), each with its summed availability.
 */
export function getColorOptions(product: Product): ColorOption[] {
  const byColor = new Map<string, ColorOption>();
  for (const variant of getProductVariants(product)) {
    const existing = byColor.get(variant.color);
    const stock = variant.status === "active" ? variant.stockQuantity : 0;
    if (existing) existing.totalStock += stock;
    else byColor.set(variant.color, { color: variant.color, totalStock: stock, inStock: false });
  }
  return [...byColor.values()].map((option) => ({
    ...option,
    inStock: option.totalStock > 0,
  }));
}

export interface SizeOption {
  /** Size label, e.g. L. */
  size: string;
  /** SKU of this exact colour/size variant — handy as a stable key/test hook. */
  sku: string;
  /** Units on hand for this colour/size. */
  stockQuantity: number;
  /** false = «ناموجود» for this size (stock 0). */
  inStock: boolean;
}

/**
 * The sizes offered for ONE colour, in canonical size order (S < M < L < XL),
 * each with its real stock. Empty when the colour has no variants.
 */
export function getSizeOptions(product: Product, color: string): SizeOption[] {
  return sortVariants(getProductVariants(product).filter((v) => v.color === color)).map((v) => ({
    size: v.size,
    sku: v.sku,
    stockQuantity: v.stockQuantity,
    inStock: isVariantAvailable(v),
  }));
}

/**
 * Resolve the variant behind a colour + size selection — null when that
 * combination does not exist (or is not public). The caller disables the
 * purchase action when this returns null or the variant is out of stock.
 */
export function findVariant(product: Product, color: string, size: string): Variant | null {
  return (
    getProductVariants(product).find((v) => v.color === color && v.size === size) ?? null
  );
}