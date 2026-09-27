/**
 * Shopping cart page (STEP 4, part B).
 *
 * Renders the persisted cart ROWS (variant = row) resolved against the LIVE
 * catalog by the cart store (`useCart` + `resolveCartLines` in `~/lib/cart`).
 * Nothing is stored for display: title / image / colour / size / SKU / price all
 * come from the catalog on every render, so the page can never show stale data.
 *
 * Rules this page enforces (all honest — no faked success):
 *  • A row with no resolvable product/variant is KEPT and shown as unavailable
 *    with the store's own Persian reason, never silently dropped.
 *  • `+` calls the store's validated `increment`; a refusal («موجودی کافی نیست»)
 *    shows the store's message and the quantity is left untouched. It is
 *    deliberately NOT hidden at the stock ceiling so the refusal is observable
 *    and explainable rather than a dead button.
 *  • `−` is disabled at 1, so a quantity can never fall to 0 (remove does that).
 *  • Remove is always available. Emptying the cart falls back to the empty state.
 *  • No checkout/payment/shipping/taxes here — the action is a disabled,
 *    honest note.
 */

import { useState } from "react";
import { Link, createFileRoute, type LinkProps } from "@tanstack/react-router";

import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { BagIcon, MinusIcon, PlusIcon, TrashIcon } from "~/components/icons";
import { cartErrorToFa, useCart, type CartLine } from "~/lib/cart";
import { formatPrice, toFaDigits } from "~/lib/format";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({
    meta: [{ title: "سبد خرید | فروشگاه پوشاک" }],
  }),
});

/** Which row a rejection message belongs to (only one is shown at a time). */
interface RowFeedback {
  key: string;
  message: string;
}

/** The «ناموجود»-style reason for a row the catalog can no longer serve. */
function unavailableMessage(line: CartLine): string {
  return line.reason ? cartErrorToFa(line.reason) : "";
}

/** Mobile-first skeleton — shown until the store has read persistence, so the
 *  page never flashes «سبد خرید شما خالی است» over a stored cart. */
function CartSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="p-3 sm:p-4">
          <div className="flex gap-3 sm:gap-5">
            <div className="aspect-[4/5] w-20 shrink-0 animate-pulse rounded-xl bg-stone-200 sm:w-24" />
            <div className="flex-1 space-y-2.5 py-1">
              <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-stone-200" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-stone-200" />
              <div className="h-9 w-32 animate-pulse rounded-pill bg-stone-200" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Compact quantity stepper (36px targets on mobile, 40px from sm up). */
function QuantityStepper({
  quantity,
  onDecrease,
  onIncrease,
  increaseDisabled,
  sku,
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  increaseDisabled: boolean;
  sku: string;
}) {
  return (
    <div
      className="inline-flex items-center rounded-pill border border-stone-300 bg-white"
      data-quantity-stepper
    >
      <button
        type="button"
        aria-label="کاهش تعداد"
        disabled={quantity <= 1}
        onClick={onDecrease}
        data-cart-decrement
        className="flex h-9 w-9 items-center justify-center rounded-pill text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-30 sm:h-10 sm:w-10"
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <span
        className="w-9 text-center text-sm font-semibold text-stone-900 sm:w-10"
        aria-live="polite"
        data-quantity={quantity}
      >
        {toFaDigits(quantity)}
      </span>
      <button
        type="button"
        aria-label="افزایش تعداد"
        disabled={increaseDisabled}
        onClick={onIncrease}
        data-cart-increment
        className="flex h-9 w-9 items-center justify-center rounded-pill text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-30 sm:h-10 sm:w-10"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
      <span className="sr-only">تعداد برای کد کالای {sku}</span>
    </div>
  );
}

/** One cart row: image, title, colour/size, SKU, unit price, stepper, line total. */
function CartRow({
  line,
  feedback,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  line: CartLine;
  feedback: RowFeedback | null;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  const discount = line.product?.discount_price ?? null;
  const hasDiscount =
    discount != null && line.product != null && discount < line.product.base_price;
  const stock = line.variant?.stockQuantity ?? 0;
  const atStockCeiling = line.available && stock > 0 && line.quantity >= stock;
  const rowFeedback = feedback && feedback.key === line.key ? feedback : null;
  const productHref = line.product
    ? (`/product/${line.product.slug}` as LinkProps["to"])
    : null;

  const thumbnail = line.image ? (
    <img
      src={line.image}
      alt={line.title}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-stone-300">
      <BagIcon className="h-7 w-7" />
    </span>
  );

  return (
    <li
      data-cart-line={`${line.productId}:${line.variantId}`}
      data-sku={line.sku}
      data-stock={stock}
      data-quantity={line.quantity}
      data-available={line.available ? "true" : "false"}
    >
      <Card className="p-3 sm:p-4">
        <div className="flex gap-3 sm:gap-5">
          {productHref ? (
            <Link
              to={productHref}
              className="aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100 sm:w-24"
            >
              {thumbnail}
            </Link>
          ) : (
            <div className="aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100 sm:w-24">
              {thumbnail}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                {productHref ? (
                  <Link
                    to={productHref}
                    className="line-clamp-2 text-sm font-semibold text-stone-900 transition-colors hover:text-accent-800"
                  >
                    {line.title}
                  </Link>
                ) : (
                  <span className="line-clamp-2 text-sm font-semibold text-stone-500">
                    {line.title || "کالای نامشخص"}
                  </span>
                )}

                <p className="mt-1 text-xs text-stone-500">
                  {line.color ? (
                    <>
                      رنگ: <span className="text-stone-700">{line.color}</span>
                    </>
                  ) : null}
                  {line.color && line.size ? " · " : null}
                  {line.size ? (
                    <>
                      سایز: <span className="text-stone-700">{line.size}</span>
                    </>
                  ) : null}
                </p>
                {line.sku ? (
                  <p className="mt-0.5 text-xs text-stone-400">کد کالا: {line.sku}</p>
                ) : null}
              </div>

              {/* Unit price — base_price struck through when a discount applies,
                  exactly like the cards and the product page. */}
              <div className="text-end">
                <p className="text-[11px] text-stone-400">قیمت واحد</p>
                <p className="mt-0.5 flex items-baseline justify-end gap-1">
                  <span className="text-sm font-bold text-stone-900">
                    {formatPrice(line.unitPrice)}
                  </span>
                  <span className="text-[11px] text-stone-400">تومان</span>
                </p>
                {hasDiscount && line.product ? (
                  <p className="text-[11px] text-stone-400 line-through">
                    {formatPrice(line.product.base_price)}
                  </p>
                ) : null}
              </div>
            </div>

            {!line.available ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="neutral" className="bg-stone-200/70 text-stone-700">
                  ناموجود
                </Badge>
                <span className="text-xs text-stone-500">
                  {unavailableMessage(line)} — این کالا از سبد حذف نشده است.
                </span>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex items-center gap-2">
                <QuantityStepper
                  quantity={line.quantity}
                  onDecrease={onDecrease}
                  onIncrease={onIncrease}
                  increaseDisabled={!line.available}
                  sku={line.sku}
                />
                <button
                  type="button"
                  aria-label={`حذف ${line.title} از سبد خرید`}
                  title="حذف از سبد خرید"
                  onClick={onRemove}
                  data-cart-remove
                  className="inline-flex h-9 w-9 items-center justify-center rounded-pill text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600 sm:h-10 sm:w-10"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-stone-500">جمع کل:</span>
                <span
                  className="text-sm font-bold text-stone-900 sm:text-base"
                  data-line-total={line.lineTotal}
                >
                  {formatPrice(line.lineTotal)}
                </span>
                <span className="text-[11px] text-stone-400">تومان</span>
              </div>
            </div>

            {atStockCeiling ? (
              <p className="mt-2 text-xs text-stone-500">
                بیشترین موجودی این کالا ({toFaDigits(stock)} عدد) در سبد شماست.
              </p>
            ) : null}

            <div
              className="mt-2"
              data-cart-row-feedback={rowFeedback ? "error" : "none"}
            >
              <p role="status" aria-live="polite" className="text-xs font-medium text-red-600">
                {rowFeedback?.message ?? ""}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </li>
  );
}

/** Empty cart — never a blank screen: message + a way back to the shop. */
function EmptyCart() {
  return (
    <div
      className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-16 text-center shadow-soft"
      data-cart-empty="true"
    >
      <BagIcon className="mx-auto h-12 w-12 text-stone-300" />
      <p className="mt-4 text-base font-medium text-stone-700">سبد خرید شما خالی است</p>
      <p className="mt-1 text-sm text-stone-500">
        برای افزودن کالا، از فروشگاه یک رنگ و سایز موجود را انتخاب کنید.
      </p>
      <Button to="/shop" className="mt-6">
        مشاهده فروشگاه
      </Button>
    </div>
  );
}

/**
 * Cart page. Totals come from the store (`itemCount` = units, `subtotal` = sum of
 * line totals) so the page, the header badge and the persisted rows always agree.
 */
function CartPage() {
  const { lines, hydrated, itemCount, subtotal, increment, decrement, removeItem, clear } =
    useCart();
  const [feedback, setFeedback] = useState<RowFeedback | null>(null);

  const isEmpty = lines.length === 0;

  /* Increasing is validated by the store against the LIVE catalog; a refusal is
     surfaced with the store's own Persian message and changes nothing. */
  const increase = (line: CartLine) => {
    const result = increment(line.key);
    setFeedback(
      result.ok
        ? null
        : { key: line.key, message: cartErrorToFa(result.reason) }
    );
  };

  const decrease = (line: CartLine) => {
    setFeedback(null);
    decrement(line.key); // floors at 1 — the minus button is disabled at 1 anyway
  };

  const remove = (line: CartLine) => {
    setFeedback(null);
    removeItem(line.key);
  };

  return (
    <section className="py-10 sm:py-16">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">سبد خرید</h1>
            {hydrated && !isEmpty ? (
              <p className="mt-2 text-sm text-stone-500" data-cart-item-count={itemCount}>
                تعداد اقلام: {toFaDigits(itemCount)} کالا
              </p>
            ) : (
              <p className="mt-2 text-sm text-stone-500">
                کالاهای انتخابی شما تا تکمیل خرید اینجا نگه داشته می‌شوند.
              </p>
            )}
          </div>
          {hydrated && !isEmpty ? (
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                clear();
              }}
              data-cart-clear
              className="rounded-pill px-3 py-2 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-200/60 hover:text-stone-800"
            >
              خالی کردن سبد
            </button>
          ) : null}
        </div>

        {!hydrated ? (
          <CartSkeleton />
        ) : isEmpty ? (
          <EmptyCart />
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <ul className="space-y-4">
              {lines.map((line) => (
                <CartRow
                  key={line.key}
                  line={line}
                  feedback={feedback}
                  onDecrease={() => decrease(line)}
                  onIncrease={() => increase(line)}
                  onRemove={() => remove(line)}
                />
              ))}
            </ul>

            {/* Summary — subtotal + item count only. No shipping, no taxes. */}
            <Card className="p-5 lg:sticky lg:top-24" data-cart-summary>
              <h2 className="text-base font-bold text-stone-900">جمع سبد خرید</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-stone-500">تعداد اقلام</dt>
                  <dd className="font-medium text-stone-800">
                    {toFaDigits(itemCount)} کالا
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-stone-500">تعداد ردیف</dt>
                  <dd className="font-medium text-stone-800">
                    {toFaDigits(lines.length)} ردیف
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-stone-200/80 pt-3">
                  <dt className="font-medium text-stone-700">مبلغ کل</dt>
                  <dd className="flex items-baseline gap-1.5">
                    <span
                      className="text-lg font-bold text-stone-900"
                      data-cart-subtotal={subtotal}
                    >
                      {formatPrice(subtotal)}
                    </span>
                    <span className="text-xs text-stone-400">تومان</span>
                  </dd>
                </div>
              </dl>

              <Button disabled className="mt-5 w-full" data-checkout-disabled="true">
                ادامه فرآیند خرید
              </Button>
              <p className="mt-2 text-center text-xs text-stone-500">
                تسویه‌حساب و پرداخت در مراحل بعدی فعال می‌شود.
              </p>
            </Card>
          </div>
        )}
      </Container>
    </section>
  );
}
