/**
 * Checkout page (STEP 5, part B) — customer details + MOCK payment.
 *
 * What this page does, and what it deliberately does NOT do:
 *  • The order summary is resolved from the LIVE catalog by the cart store
 *    (`useCart().lines`) — nothing about title/price/colour/size/SKU is stored,
 *    exactly like `/cart`. Totals come from the same store, so the summary, the
 *    header badge and the cart page can never disagree.
 *  • There is NO real payment gateway. The primary button runs a short simulated
 *    payment (≈1s) and then hands the cart to the order engine
 *    (`placeOrder` in `~/lib/orders`), which validates stock, prices every line
 *    from the catalog, reserves the units and persists the order. The UI never
 *    fakes a success: a refusal is shown in Persian («موجودی کافی نیست» …) and the
 *    cart is left exactly as it was so the customer can fix it and retry.
 *  • Double-submit safety is two-layered: the button is disabled while the mock
 *    payment runs (one order per click), and every ATTEMPT sends a fresh
 *    `submissionToken`, which the engine consumes exactly once — a replay (double
 *    click, retry, back button) is refused as «سفارش تکراری» instead of creating
 *    a second order. A FAILED attempt is therefore still retryable, because the
 *    next attempt carries a new token.
 *  • Validation follows the cart page's style: nothing is disabled up front, the
 *    required fields are validated when the customer submits and each problem is
 *    reported inline in Persian next to its field.
 *  • White-label: no brand string, no phone/address of any shop; every value on
 *    screen is either typed by the customer or read from the catalog.
 */

import { useRef, useState } from "react";
import { Link, createFileRoute, useNavigate, type LinkProps } from "@tanstack/react-router";

import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { Input } from "~/components/Input";
import { BagIcon } from "~/components/icons";
import { useAuth } from "~/lib/auth";
import { useCart, type CartLine } from "~/lib/cart";
import {
  createOrderInDatabase,
  databaseOrderErrorToFa,
  databaseOrderNumber,
} from "~/lib/customer-orders";
import { formatPrice, toFaDigits } from "~/lib/format";
import { orderErrorToFa, placeOrder, type PlaceOrderResult } from "~/lib/orders";
import { isSupabaseConfigured } from "~/lib/supabase";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  head: () => ({
    meta: [{ title: "تسویه حساب | فروشگاه پوشاک" }],
  }),
});

/* ── Form model ────────────────────────────────────────────────────────────── */

type FieldKey = "name" | "phone" | "email" | "address" | "notes";

interface FormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: FormValues = { name: "", phone: "", email: "", address: "", notes: "" };

type FormErrors = Partial<Record<FieldKey, string>>;

/** Persian/Arabic digits → ASCII, so a phone number typed in Persian validates. */
function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/**
 * Required: name, phone, address (the same three the order engine and the DB
 * function insist on). Email is optional but must look like an email when filled.
 */
function validateForm(form: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (form.name.trim() === "") errors.name = "نام خود را وارد کنید";

  const phone = form.phone.trim();
  const digits = toLatinDigits(phone).replace(/[^0-9]/g, "");
  if (phone === "") errors.phone = "شماره تماس را وارد کنید";
  else if (digits.length < 8 || digits.length > 15) errors.phone = "شماره تماس معتبر نیست";

  if (form.address.trim() === "") errors.address = "نشانی تحویل سفارش را وارد کنید";

  const email = form.email.trim();
  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "ایمیل معتبر نیست";
  }

  return errors;
}

/** Single-use idempotency key for one payment attempt (see the engine's docs). */
function createSubmissionToken(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The address bar path for a placed order — the confirmation page reads `order`. */
function orderSuccessSearch(orderNumber: string): { order: string } {
  return { order: orderNumber };
}

/* ── Presentational pieces (mirroring the cart page's look) ─────────────────── */

const controlBase =
  "w-full border bg-white text-sm text-stone-900 outline-none transition-[border-color,box-shadow] " +
  "placeholder:text-stone-400 focus:border-accent-600 focus:ring-2 focus:ring-accent-600/20";

/** Label + control + inline Persian error (always rendered, empty when valid). */
function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-stone-700">
        {label}
        {required ? (
          <span className="ms-1 text-red-500" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ms-1 text-xs font-normal text-stone-400">(اختیاری)</span>
        )}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-stone-400">{hint}</p> : null}
      <p
        role="alert"
        data-field-error={id}
        data-error={error ? "true" : "false"}
        className="mt-1 min-h-4 text-xs font-medium text-red-600"
      >
        {error ?? ""}
      </p>
    </div>
  );
}

/** Mobile-first skeleton — shown until the cart store has read persistence. */
function CheckoutSkeleton() {
  return (
    <div className="mt-8 space-y-6" aria-hidden="true">
      <Card className="p-5">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-28 animate-pulse rounded bg-stone-200" />
              <div className="h-11 w-full animate-pulse rounded-pill bg-stone-200" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-stone-200" />
        <div className="mt-4 h-10 w-full animate-pulse rounded bg-stone-200" />
      </Card>
    </div>
  );
}

/** Empty cart — identical treatment (and wording) to the cart page. */
function EmptyCheckout() {
  return (
    <div
      className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-16 text-center shadow-soft"
      data-checkout-empty="true"
    >
      <BagIcon className="mx-auto h-12 w-12 text-stone-300" />
      <p className="mt-4 text-base font-medium text-stone-700">سبد خرید شما خالی است</p>
      <p className="mt-1 text-sm text-stone-500">
        برای تکمیل خرید، ابتدا از فروشگاه یک رنگ و سایز موجود را به سبد اضافه کنید.
      </p>
      <Button to="/shop" className="mt-6">
        مشاهده فروشگاه
      </Button>
    </div>
  );
}

/** One ordered line inside the summary panel (read-only — editing lives in /cart). */
function SummaryLine({ line }: { line: CartLine }) {
  const discount = line.product?.discount_price ?? null;
  const hasDiscount =
    discount != null && line.product != null && discount < line.product.base_price;
  const productHref = line.product
    ? (`/product/${line.product.slug}` as LinkProps["to"])
    : null;

  const thumbnail = line.image ? (
    <img src={line.image} alt={line.title} loading="lazy" className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-stone-300">
      <BagIcon className="h-6 w-6" />
    </span>
  );

  return (
    <li
      className="flex gap-3"
      data-checkout-line={`${line.productId}:${line.variantId}`}
      data-sku={line.sku}
      data-quantity={line.quantity}
      data-unit-price={line.unitPrice}
      data-line-total={line.lineTotal}
      data-available={line.available ? "true" : "false"}
    >
      {productHref ? (
        <Link
          to={productHref}
          className="aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100"
        >
          {thumbnail}
        </Link>
      ) : (
        <div className="aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
          {thumbnail}
        </div>
      )}

      <div className="min-w-0 flex-1">
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
        {line.sku ? <p className="mt-0.5 text-xs text-stone-400">کد کالا: {line.sku}</p> : null}
        <p className="mt-1 text-xs text-stone-500">
          تعداد: <span className="text-stone-700">{toFaDigits(line.quantity)}</span>
        </p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xs text-stone-400">قیمت واحد:</span>
          <span className="text-sm font-bold text-stone-900">{formatPrice(line.unitPrice)}</span>
          {hasDiscount && line.product ? (
            <span className="text-[11px] text-stone-400 line-through">
              {formatPrice(line.product.base_price)}
            </span>
          ) : null}
        </p>
      </div>

      <div className="shrink-0 text-end">
        <p className="text-[11px] text-stone-400">جمع</p>
        <p className="mt-0.5 text-sm font-bold text-stone-900">{formatPrice(line.lineTotal)}</p>
        <p className="text-[11px] text-stone-400">تومان</p>
      </div>
    </li>
  );
}

/** Order summary: lines + «جمع سبد خرید» + item count + «مبلغ قابل پرداخت». */
function OrderSummary({
  lines,
  itemCount,
  subtotal,
}: {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
}) {
  return (
    <Card className="p-5" data-checkout-summary data-checkout-total={subtotal}>
      <h2 className="text-base font-bold text-stone-900">خلاصه سفارش</h2>

      <ul className="mt-4 space-y-4">
        {lines.map((line) => (
          <SummaryLine key={line.key} line={line} />
        ))}
      </ul>

      <dl className="mt-5 space-y-3 border-t border-stone-200/80 pt-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-stone-500">جمع سبد خرید</dt>
          <dd className="font-medium text-stone-800" data-checkout-subtotal={subtotal}>
            {formatPrice(subtotal)} تومان
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-stone-500">تعداد اقلام</dt>
          <dd className="font-medium text-stone-800" data-checkout-item-count={itemCount}>
            {toFaDigits(itemCount)} کالا
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-stone-200/80 pt-3">
          <dt className="font-medium text-stone-700">مبلغ قابل پرداخت</dt>
          <dd className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-stone-900">{formatPrice(subtotal)}</span>
            <span className="text-xs text-stone-400">تومان</span>
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-stone-500">
        هزینه ارسال و مالیات در مراحل بعدی محاسبه می‌شود.
      </p>
    </Card>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

/**
 * How long the simulated payment "takes". A real gateway introduces exactly this
 * kind of gap, which is why the busy state and the single-use token exist.
 */
const MOCK_PAYMENT_MS = 1000;

function CheckoutPage() {
  const { items, lines, hydrated, itemCount, subtotal, clear } = useCart();
  const { status: authStatus, user, profile } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [paying, setPaying] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  /**
   * One immutable token per checkout page instance. A retry after a refusal is
   * still allowed (a refused attempt never consumes the token), but a replayed
   * submission — e.g. a double click racing the busy state — can only ever
   * produce one order, because the engine rejects a spent token.
   */
  const [submissionToken] = useState(() => createSubmissionToken());
  /**
   * Synchronous re-entrancy guard. `paying` is React state, so it is still
   * `false` for every handler that runs in the same task as the first click —
   * the ref closes that gap.
   */
  const payingRef = useRef(false);

  const isEmpty = lines.length === 0;
  /** Signed-in + configured → the order is written by the database function. */
  const databaseMode = isSupabaseConfigured() && authStatus === "signedIn" && !!user;

  /**
   * Pre-fill the delivery details from the customer's profile ONCE, as soon as
   * the session is known. Typed values are never overwritten (the ref latches on
   * the first fill), so a customer who edits a field keeps their edit.
   */
  const prefilled = useRef(false);
  if (databaseMode && !prefilled.current && profile) {
    prefilled.current = true;
    setForm((prev) => ({
      ...prev,
      name: prev.name || profile.name || "",
      phone: prev.phone || profile.phone || "",
      email: prev.email || profile.email || user?.email || "",
    }));
  }

  const update = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear the field's message as soon as the customer edits it (cart-page style:
    // the next submit re-validates everything).
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  /**
   * Submit to whichever writer this deployment has. The demo deployment keeps the
   * in-memory ledger path of STEP 5 (unchanged); a connected store writes through
   * `public.create_order_with_items(..., p_customer_id)`, which prices the order
   * and reserves stock in one transaction.
   */
  const submit = async (): Promise<{ result: PlaceOrderResult; message: string | null }> => {
    const customer = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
    };
    const address = form.address.trim();
    const notes = form.notes.trim();

    if (!databaseMode) {
      const result = placeOrder({
        customer: {
          name: customer.name,
          phone: customer.phone,
          ...(customer.email === "" ? {} : { email: customer.email }),
        },
        shippingAddress: address,
        ...(notes === "" ? {} : { notes }),
        cartItems: items.map(({ productId, variantId, quantity }) => ({
          productId,
          variantId,
          quantity,
        })),
        // Page-scoped token: a retry after a refusal is allowed, while a replay
        // of an already-consumed attempt can never create a second order.
        submissionToken,
      });
      return { result, message: result.ok ? null : orderErrorToFa(result.reason) };
    }

    // Reference = ORD-<yyyymmdd>-<minutes>: human-readable and 4 digits. If two
    // orders land in the same minute the UNIQUE constraint refuses the second,
    // and we simply try the next minute a couple of times.
    const itemsSent = items.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId,
      quantity,
    }));
    for (let attempt = 0; attempt <= 3; attempt += 1) {
      const result = await createOrderInDatabase({
        orderNumber: databaseOrderNumber(new Date(), attempt),
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email === "" ? null : customer.email,
        shippingAddress: address,
        notes: notes === "" ? null : notes,
        items: itemsSent,
        customerId: user?.id ?? null,
      });
      if (result.ok) return { result, message: null };
      if (result.reason === "duplicate-order" && attempt < 3) continue;
      return { result, message: databaseOrderErrorToFa(result.reason) };
    }
    return {
      result: { ok: false, reason: "persistence" },
      message: databaseOrderErrorToFa("persistence"),
    };
  };

  const pay = async () => {
    if (payingRef.current || paying) return; // one order per click — the button is disabled too

    const found = validateForm(form);
    setErrors(found);
    setOrderError(null);
    if (Object.keys(found).length > 0) return; // no order, errors are on screen

    payingRef.current = true; // synchronous: blocks a second click in this task
    setPaying(true);
    try {
      // Mock payment: nothing is charged, no gateway is contacted.
      await new Promise((resolve) => setTimeout(resolve, MOCK_PAYMENT_MS));

      const { result, message } = await submit();

      if (!result.ok) {
        // Honest failure: the cart is untouched so the customer can adjust it.
        setOrderError(message ?? orderErrorToFa(result.reason));
        return;
      }

      clear(); // the order owns the units now
      await navigate({
        to: "/order-success",
        search: orderSuccessSearch(result.order.orderNumber),
      });
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };

  return (
    <section className="py-10 sm:py-16" data-checkout-page>
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">تسویه حساب</h1>
            <p className="mt-2 text-sm text-stone-500">
              اطلاعات تحویل را وارد کنید و سفارش را ثبت کنید.
            </p>
          </div>
          {hydrated && !isEmpty ? (
            <Link
              to="/cart"
              className="rounded-pill px-3 py-2 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-200/60 hover:text-stone-800"
            >
              ویرایش سبد خرید
            </Link>
          ) : null}
        </div>

        {!hydrated ? (
          <CheckoutSkeleton />
        ) : isEmpty ? (
          <EmptyCheckout />
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <Card className="p-5 sm:p-6" data-checkout-form>
              <h2 className="text-base font-bold text-stone-900">اطلاعات خریدار</h2>

              <div className="mt-4 space-y-3">
                <Field id="name" label="نام و نام خانوادگی" required error={errors.name}>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    aria-invalid={errors.name ? true : undefined}
                    placeholder="نام و نام خانوادگی"
                    className={errors.name ? "border-red-400" : ""}
                  />
                </Field>

                <Field
                  id="phone"
                  label="شماره تماس"
                  required
                  error={errors.phone}
                  hint="برای هماهنگی ارسال سفارش استفاده می‌شود."
                >
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    aria-invalid={errors.phone ? true : undefined}
                    placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                    className={`text-start ${errors.phone ? "border-red-400" : ""}`}
                  />
                </Field>

                <Field id="email" label="ایمیل" error={errors.email}>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    aria-invalid={errors.email ? true : undefined}
                    placeholder="name@example.com"
                    className={`text-start ${errors.email ? "border-red-400" : ""}`}
                  />
                </Field>

                <Field id="address" label="نشانی تحویل" required error={errors.address}>
                  <textarea
                    id="address"
                    name="address"
                    rows={3}
                    autoComplete="street-address"
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    aria-invalid={errors.address ? true : undefined}
                    placeholder="شهر، خیابان، پلاک، واحد و کد پستی"
                    className={`${controlBase} rounded-2xl px-4 py-3 ${
                      errors.address ? "border-red-400" : "border-stone-300"
                    }`}
                  />
                </Field>

                <Field id="notes" label="یادداشت سفارش" error={errors.notes}>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    placeholder="توضیح اختیاری برای ارسال (ساعت تحویل، توضیح بسته‌بندی و …)"
                    className={`${controlBase} rounded-2xl px-4 py-3 border-stone-300`}
                  />
                </Field>
              </div>

              {/* Refusal from the order engine — the cart is kept for a retry. */}
              <p
                role="alert"
                aria-live="polite"
                data-checkout-error={orderError ? "true" : "false"}
                className={`mt-4 text-sm font-medium text-red-600 ${
                  orderError ? "" : "hidden"
                }`}
              >
                {orderError ?? ""}
              </p>

              <Button
                onClick={pay}
                disabled={paying || isEmpty}
                size="lg"
                className="mt-5 w-full"
                data-checkout-submit
                data-paying={paying ? "true" : "false"}
              >
                {paying ? "در حال پرداخت…" : "پرداخت و ثبت سفارش"}
              </Button>
              <p className="mt-2 text-center text-xs text-stone-500">
                پرداخت این مرحله آزمایشی است و مبلغی از حساب شما کسر نمی‌شود.
              </p>
            </Card>

            <div className="lg:sticky lg:top-24">
              <OrderSummary lines={lines} itemCount={itemCount} subtotal={subtotal} />
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
