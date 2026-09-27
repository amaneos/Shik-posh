import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Container } from "~/components/Container";
import { ProductCard } from "~/components/ProductCard";
import { ArrowIcon, BagIcon, TagIcon, TshirtIcon } from "~/components/icons";
import { cartErrorToFa, useCart } from "~/lib/cart";
import {
  findVariant,
  getColorOptions,
  getSizeOptions,
  hasVariants,
  isVariantAvailable,
  useProduct,
  useRelatedProducts,
} from "~/lib/data";
import { formatPrice, toFaDigits } from "~/lib/format";

export const Route = createFileRoute("/product/$slug")({
  component: ProductPage,
  head: () => ({
    meta: [{ title: "جزئیات محصول | فروشگاه پوشاک" }],
  }),
});

/* ── Variant / inventory UI (STEP 3) ─────────────────────────────────────────
 * Every colour and size chip is derived from the product's REAL variant rows
 * (data.ts inventory helpers). No hardcoded option lists, no invented stock.
 * The four honest Persian states this page can render:
 *   • «این رنگ موجود نیست»               — the selected colour is sold out
 *   • «این سایز موجود نیست»               — the selected size has stock 0
 *   • «ترکیب انتخاب‌شده ناموجود است»   — no variant for that colour+size
 *   • «اطلاعات موجودی قابل دریافت نیست» — fetch failed (error + retry state)
 */
/* Colour name (as stored on the variant) → swatch dot. Unknown names fall back
   to a neutral dot, so a client's own colour list never renders a blank chip. */
const COLOR_SWATCHES: Record<string, string> = {
  "مشکی": "bg-stone-900",
  "سفید": "border border-stone-300 bg-white",
  "زغالی": "bg-stone-700",
  "طوسی": "bg-stone-400",
  "خاکستری": "bg-stone-500",
  "سرمه‌ای": "bg-[#1f2c4d]",
  "آبی": "bg-[#31608f]",
  "آبی روشن": "bg-[#9dc3e6]",
  "زرشکی": "bg-[#7b1f34]",
  "زیتونی": "bg-[#6b7f3a]",
  "سبز": "bg-accent-600",
  "طلایی": "bg-[#c9a227]",
  "خاکی": "bg-[#a99a6b]",
};
const DEFAULT_SWATCH = "border border-stone-300 bg-stone-100";
function swatchClass(color: string): string {
  return COLOR_SWATCHES[color] ?? DEFAULT_SWATCH;
}
/** Where the current colour/size selection stands — drives every label below. */
type Availability = "none" | "color-out" | "invalid-combo" | "size-out" | "in-stock";

/** Inline result of the last add-to-cart attempt (honest, never pre-faked). */
type CartFeedback = { kind: "ok" | "error"; message: string };

/* ── Gallery: main image + thumbnail strip (static, no carousel) ───────────── */

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  if (images.length === 0) {
    // Elegant neutral placeholder when a product has no gallery yet — the page
    // never renders a broken image icon.
    return (
      <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-card border border-stone-200/80 bg-stone-100 text-stone-300 shadow-soft">
        <TshirtIcon className="h-14 w-14" />
        <p className="text-xs text-stone-400">تصویر این محصول بهزودی اضافه میشود</p>
      </div>
    );
  }
  const safeIdx = Math.min(activeIdx, images.length - 1);
  return (
    <div>
      <div className="aspect-[4/5] overflow-hidden rounded-card border border-stone-200/80 bg-stone-100 shadow-soft">
        <img
          src={images[safeIdx]}
          alt={title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setActiveIdx(i)}
            aria-label={`تصویر ${toFaDigits(i + 1)}`}
            aria-current={i === safeIdx ? "true" : undefined}
            className={`aspect-square overflow-hidden rounded-card border bg-stone-100 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700 ${
              i === safeIdx
                ? "border-accent-700 ring-2 ring-accent-700 ring-offset-2"
                : "border-stone-200 opacity-75 hover:opacity-100"
            }`}
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Selector chip (colour / size) — real availability states ──────────────
 * `unavailable` is the spec's «ناموجود» treatment: dashed border + muted text so it is
 * unmistakable next to a selectable chip. Chips stay clickable on purpose — the
 * visitor may inspect a sold-out colour/size; purchase stays disabled for it.
 */
function OptionChip({
  selected,
  onSelect,
  label,
  unavailable = false,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  unavailable?: boolean;
  children: ReactNode;
}) {
  const base = "rounded-pill border px-4 py-2 text-sm font-medium transition-colors";
  const classes = unavailable
    ? selected
      ? `${base} border-dashed border-stone-400 bg-stone-100 text-stone-500 shadow-soft`
      : `${base} border-dashed border-stone-300 bg-stone-50 text-stone-400 hover:border-stone-400`
    : selected
      ? `${base} border-accent-700 bg-accent-50 text-accent-900 shadow-soft`
      : `${base} border-stone-300 bg-white text-stone-700 hover:border-accent-400 hover:text-accent-900`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      data-available={unavailable ? "false" : "true"}
      className={classes}
    >
      {children}
    </button>
  );
}
/* ── Not-found state — ONLY for a genuinely missing/inactive product ───────── */

function ProductNotFound() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="mx-auto max-w-md rounded-card border border-stone-200/80 bg-white p-10 text-center shadow-soft sm:p-12">
          <BagIcon className="mx-auto h-12 w-12 text-stone-300" />
          <h1 className="mt-5 text-xl font-bold text-stone-900">محصولی یافت نشد</h1>
          <p className="mt-2 text-sm leading-7 text-stone-600">
            این محصول در دسترس نیست یا آدرس آن تغییر کرده است.
          </p>
          <Button to="/shop" className="mt-6">
            بازگشت به فروشگاه
          </Button>
        </div>
      </Container>
    </section>
  );
}

/* ── Fetch-error state (Supabase) — retry, NOT the not-found state ─────────── */

function ProductErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="mx-auto max-w-md rounded-card border border-dashed border-stone-300 bg-white p-10 text-center shadow-soft sm:p-12">
          <BagIcon className="mx-auto h-12 w-12 text-stone-300" />
          <h1 className="mt-5 text-xl font-bold text-stone-900">خطایی در دریافت اطلاعات رخ داد</h1>
          <p className="mt-2 text-sm leading-7 text-stone-600">
            اطلاعات موجودی قابل دریافت نیست. لطفاً دوباره تلاش کنید.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex items-center justify-center rounded-pill bg-accent-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-800"
          >
            تلاش مجدد
          </button>
        </div>
      </Container>
    </section>
  );
}

/* ── Page skeleton — subtle, never a blank flash while (Supabase) loading ──── */

function ProductSkeleton() {
  return (
    <section className="py-8 sm:py-14">
      <Container>
        <div className="h-4 w-32 animate-pulse rounded bg-stone-200" />
        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="aspect-[4/5] animate-pulse rounded-card bg-stone-200" />
          <div className="space-y-4">
            <div className="h-5 w-24 animate-pulse rounded bg-stone-200" />
            <div className="h-8 w-3/4 animate-pulse rounded bg-stone-200" />
            <div className="h-6 w-1/2 animate-pulse rounded bg-stone-200" />
            <div className="h-24 w-full animate-pulse rounded bg-stone-100" />
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ── Related products skeleton — light row of placeholder cards ────────────── */

function RelatedSkeleton() {
  return (
    <div
      className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-card border border-stone-200/80 bg-white shadow-soft"
        >
          <div className="aspect-[4/5] animate-pulse bg-stone-200" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/3 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-stone-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

function ProductPage() {
  const { slug } = useParams({ from: "/product/$slug" });
  const { product, loaded, error, retry } = useProduct(slug);
  const { addItem } = useCart();
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<CartFeedback | null>(null);

  // The «به سبد اضافه شد» confirmation is temporary: it clears itself so the
  // button goes back to its normal label. Only shown after a REAL successful
  // add — the store validated against the live catalog.
  useEffect(() => {
    if (feedback?.kind !== "ok") return;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Related products (same category, active only, never self). The hook is
  // called unconditionally (https://react.dev/rules) — with product===null it
  // simply resolves to an empty list, and the section is hidden entirely.
  const { related, loaded: relatedLoaded } = useRelatedProducts(product);

  if (!loaded) return <ProductSkeleton />;
  if (error) return <ProductErrorState onRetry={retry} />;
  if (!product) return <ProductNotFound />;

  const images =
    product.images && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [];
  /* ── Variant selection — resolved from REAL variant rows ──────────────
   * Default = first colour that actually has stock + its first in-stock size;
   * both stay `null` until the visitor picks, so the first paint is already
   * correct and no effect is needed (works for SSR and the async branch).
   */
  const colorOptions = getColorOptions(product);
  const activeColor =
    color ?? colorOptions.find((c) => c.inStock)?.color ?? colorOptions[0]?.color ?? null;
  const colorOption = colorOptions.find((c) => c.color === activeColor) ?? null;
  const sizeOptions = activeColor ? getSizeOptions(product, activeColor) : [];
  /* A chosen size deliberately survives a colour switch: when the new colour
     has no such size we show «ترکیب انتخاب‌شده ناموجود است» instead of silently
     moving the customer to a different size. */
  const activeSize =
    size ?? sizeOptions.find((option) => option.inStock)?.size ?? sizeOptions[0]?.size ?? null;
  const variant =
    activeColor && activeSize ? findVariant(product, activeColor, activeSize) : null;
  const availability: Availability = !hasVariants(product)
    ? "none" // nothing configured yet — NOT the same as sold out
    : !colorOption
      ? "invalid-combo"
      : !colorOption.inStock
        ? "color-out"
        : !variant
          ? "invalid-combo"
          : isVariantAvailable(variant)
            ? "in-stock"
            : "size-out";
  const canPurchase = availability === "in-stock";
  /* The action is enabled only for a real in-stock variant. A product with no
     variants configured at all is NOT «ناموجود» (nothing is on sale yet), so it
     keeps the add label (disabled) plus an explanatory note. */
  const justAdded = feedback?.kind === "ok";
  const purchaseLabel = canPurchase
    ? justAdded
      ? "به سبد اضافه شد"
      : "افزودن به سبد خرید"
    : availability === "none"
      ? "افزودن به سبد خرید"
      : "ناموجود";
  const purchaseNote = canPurchase
    ? "تکمیل خرید و پرداخت در مراحل بعدی فعال می‌شود."
    : availability === "none"
      ? "این محصول هنوز برای فروش آماده نشده است."
      : "برای خرید، یک رنگ و سایز موجود را انتخاب کنید.";
  /* Stepper ceiling = the REAL stock of the selected variant (the ۹-unit cap is
     just a UI convenience). The cart store enforces the same ceiling, so a
     quantity that the catalog cannot serve is refused, never silently accepted. */
  const stockCap = canPurchase && variant ? Math.min(9, variant.stockQuantity) : 9;
  const atStockCap = canPurchase && variant !== null && qty >= variant.stockQuantity;

  /* Add the SELECTED variant (colour + size + quantity) to the cart. The store
     validates against the live catalog and returns a typed result; the Persian
     message comes straight from cartErrorToFa — no invented success. */
  const handleAddToCart = () => {
    if (!variant) {
      setFeedback({
        kind: "error",
        message: "برای خرید، یک رنگ و سایز موجود را انتخاب کنید.",
      });
      return;
    }
    const result = addItem(product.id, variant.id, qty, {
      color: activeColor ?? undefined,
      size: activeSize ?? undefined,
    });
    setFeedback(
      result.ok
        ? { kind: "ok", message: "به سبد اضافه شد" }
        : { kind: "error", message: cartErrorToFa(result.reason) }
    );
  };
  const hasDiscount =
    product.discount_price != null && product.discount_price < product.base_price;
  const finalPrice = hasDiscount ? (product.discount_price as number) : product.base_price;
  const discountPercent = hasDiscount
    ? Math.round(((product.base_price - finalPrice) / product.base_price) * 100)
    : null;

  return (
    <section className="py-8 sm:py-14">
      <Container>
        <Link
          to="/shop" search={{ category: undefined }}
          className="inline-flex items-center gap-1.5 text-sm text-stone-500 transition-colors hover:text-stone-900"
        >
          <ArrowIcon className="h-4 w-4 rotate-180" />
          بازگشت به فروشگاه
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <Gallery images={images} title={product.title} />

          <div>
            {product.category ? (
              <Badge variant="outline">
                <TagIcon className="h-3.5 w-3.5" />
                {product.category}
              </Badge>
            ) : null}

            <h1 className="mt-3 text-2xl font-bold text-stone-900 sm:text-3xl">
              {product.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-2xl font-bold text-stone-900">{formatPrice(finalPrice)}</span>
              <span className="text-sm text-stone-500">تومان</span>
              {hasDiscount ? (
                <span className="text-base text-stone-400 line-through">
                  {formatPrice(product.base_price)}
                </span>
              ) : null}
              {hasDiscount && discountPercent != null ? (
                <Badge variant="accent">{toFaDigits(discountPercent)}٪ تخفیف</Badge>
              ) : null}
            </div>

            {product.description ? (
              <p className="mt-6 text-sm leading-8 text-stone-600">{product.description}</p>
            ) : null}

            {hasVariants(product) ? (
              <>
                <div className="mt-7">
                  <h2 className="text-sm font-semibold text-stone-900">رنگ</h2>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {colorOptions.map((option) => (
                      <OptionChip
                        key={option.color}
                        selected={activeColor === option.color}
                        onSelect={() => {
                          setColor(option.color);
                          setFeedback(null); // a new selection invalidates the old message
                        }}
                        label={
                          option.inStock
                            ? `رنگ ${option.color}`
                            : `رنگ ${option.color} — این رنگ موجود نیست`
                        }
                        unavailable={!option.inStock}
                      >
                        <span
                          className={`me-1.5 inline-block h-3 w-3 rounded-full align-[-1px] ${swatchClass(option.color)}`}
                        />
                        {option.color}
                        {!option.inStock ? (
                          <span className="ms-1.5 text-[11px] font-normal text-stone-400">
                            ناموجود
                          </span>
                        ) : null}
                      </OptionChip>
                    ))}
                  </div>
                </div>
                <div className="mt-6">
                  <h2 className="text-sm font-semibold text-stone-900">سایز</h2>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {sizeOptions.map((option) => (
                      <OptionChip
                        key={option.size}
                        selected={activeSize === option.size}
                        onSelect={() => {
                          setSize(option.size);
                          setFeedback(null);
                        }}
                        label={
                          option.inStock
                            ? `سایز ${option.size}`
                            : `سایز ${option.size} — این سایز موجود نیست`
                        }
                        unavailable={!option.inStock}
                      >
                        {option.size}
                        {!option.inStock ? (
                          <span className="ms-1.5 text-[11px] font-normal text-stone-400">
                            ناموجود
                          </span>
                        ) : null}
                      </OptionChip>
                    ))}
                  </div>
                </div>
                {/* Live inventory + the honest states. aria-live announces the
                    change when the selection moves; data-attrs are QA hooks. */}
                <div
                  className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-2"
                  aria-live="polite"
                  data-availability={availability}
                  data-sku={variant?.sku ?? ""}
                >
                  {availability === "in-stock" && variant ? (
                    <span className="inline-flex items-center rounded-pill bg-accent-700/10 px-3 py-1 text-sm font-semibold text-accent-800">
                      موجودی: {toFaDigits(variant.stockQuantity)} عدد
                    </span>
                  ) : null}
                  {availability === "color-out" ? (
                    <>
                      <span className="rounded-pill bg-stone-200/70 px-3 py-1 text-sm font-semibold text-stone-600">
                        ناموجود
                      </span>
                      <span className="text-xs text-stone-500">
                        این رنگ موجود نیست؛ رنگ دیگری را انتخاب کنید.
                      </span>
                    </>
                  ) : null}
                  {availability === "size-out" ? (
                    <>
                      <span className="rounded-pill bg-stone-200/70 px-3 py-1 text-sm font-semibold text-stone-600">
                        ناموجود
                      </span>
                      <span className="text-xs text-stone-500">
                        این سایز موجود نیست؛ سایز دیگری را انتخاب کنید.
                      </span>
                    </>
                  ) : null}
                  {availability === "invalid-combo" ? (
                    <>
                      <span className="rounded-pill bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                        ترکیب انتخاب‌شده ناموجود است
                      </span>
                      <span className="text-xs text-stone-500">
                        این رنگ در سایز انتخاب‌شده عرضه نمی‌شود.
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="mt-6">
                  <h2 className="text-sm font-semibold text-stone-900">تعداد</h2>
                  <div className="mt-2.5 inline-flex items-center rounded-pill border border-stone-300 bg-white">
                    <button
                      type="button"
                      aria-label="کاهش تعداد"
                      disabled={qty <= 1}
                      onClick={() => {
                        setQty((q) => Math.max(1, q - 1));
                        setFeedback(null);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-pill text-lg text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-sm font-semibold text-stone-900" aria-live="polite">
                      {toFaDigits(qty)}
                    </span>
                    <button
                      type="button"
                      aria-label="افزایش تعداد"
                      disabled={qty >= stockCap}
                      onClick={() => {
                        setQty((q) => Math.min(stockCap, q + 1));
                        setFeedback(null);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-pill text-lg text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  {atStockCap && variant ? (
                    <p className="mt-1.5 text-xs text-stone-500">
                      بیشترین موجودی این رنگ و سایز {toFaDigits(variant.stockQuantity)} عدد است.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            <div className="mt-8">
              {/* Wired to the real cart store (STEP 4): the click adds the
                  SELECTED variant and the message below is the store's own
                  result — never a pre-faked success. The action stays disabled
                  unless a real in-stock variant is selected, so a failed add is
                  rare (stock can change, or a quantity above stock can be
                  requested); both paths are handled honestly. */}
              <Button
                size="lg"
                disabled={!canPurchase}
                onClick={handleAddToCart}
                className="w-full sm:w-auto sm:px-12"
                data-purchasable={canPurchase ? "true" : "false"}
              >
                <BagIcon className="h-5 w-5" />
                {purchaseLabel}
              </Button>
              <div
                className="mt-2.5"
                data-cart-feedback={feedback ? feedback.kind : "none"}
              >
                <p
                  role="status"
                  aria-live="polite"
                  className={`text-xs ${
                    feedback?.kind === "ok"
                      ? "font-medium text-accent-800"
                      : feedback?.kind === "error"
                        ? "font-medium text-amber-800"
                        : "text-stone-400"
                  }`}
                >
                  {feedback ? feedback.message : purchaseNote}
                </p>
              </div>
            </div>
          </div>
        </div>
        {!relatedLoaded ? (
          <div className="mt-16 border-t border-stone-200/70 pt-10">
            <h2 className="text-xl font-bold text-stone-900 sm:text-2xl">محصولات مرتبط</h2>
            <RelatedSkeleton />
          </div>
        ) : related.length > 0 ? (
          <div className="mt-16 border-t border-stone-200/70 pt-10">
            <h2 className="text-xl font-bold text-stone-900 sm:text-2xl">محصولات مرتبط</h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        ) : null}
      </Container>
    </section>
  );
}