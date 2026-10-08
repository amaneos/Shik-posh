/**
 * Order confirmation page (STEP 5, part B) — «سفارش شما با موفقیت ثبت شد».
 *
 * Reads the order back from persistence by the `?order=` query
 * (`getOrder()` in `~/lib/orders` accepts either the id or the human-readable
 * reference, so a link or a reload keeps working). The page is a READ-ONLY view
 * of the stored snapshot: it never re-prices anything — the title, colour, size,
 * SKU and unit price shown are the ones frozen at purchase time — so an old order
 * still reads correctly after the catalog has changed.
 *
 * SSR-safe like `/cart`: persistence lives in `localStorage`, so the order is
 * read in an effect after mount (server render and first client render agree),
 * with a skeleton in between. `?order=` present + nothing stored is NOT an error
 * page — the honest explanation is that the order belongs to another device —
 * and a missing/invalid reference is explained the same neutral way.
 *
 * Deliberately absent: payment retry, receipt/e-mail, tracking, status changes,
 * customer accounts. None of those exist yet, and the page does not pretend they
 * do — both statuses are shown exactly as stored («در انتظار پرداخت» on a brand
 * new order, on both axes).
 */

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { CheckIcon } from "~/components/icons";
import { formatJalaliDate, formatPrice, toFaDigits } from "~/lib/format";
import { getOrder, type Order, type OrderItem } from "~/lib/orders";

export const Route = createFileRoute("/order-success")({
  validateSearch: (search: Record<string, unknown>): { order?: string } => ({
    order:
      typeof search.order === "string" && search.order.trim() !== ""
        ? search.order.trim()
        : undefined,
  }),
  component: OrderSuccessPage,
  head: () => ({
    meta: [{ title: "پیگیری سفارش | فروشگاه پوشاک" }],
  }),
});

/** Mobile-first skeleton for the async (localStorage) read. */
function ConfirmationSkeleton() {
  return (
    <div className="mt-8 space-y-6" aria-hidden="true">
      <Card className="p-6">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-stone-200" />
        <div className="mx-auto mt-4 h-5 w-56 animate-pulse rounded bg-stone-200" />
        <div className="mx-auto mt-3 h-4 w-40 animate-pulse rounded bg-stone-200" />
      </Card>
      <Card className="p-5">
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded bg-stone-200" />
          ))}
        </div>
      </Card>
    </div>
  );
}

/** One frozen line of the stored order (snapshot — never re-read from catalog). */
function OrderedLine({ item }: { item: OrderItem }) {
  const { color, size, sku } = item.variantSnapshot;
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2"
      data-order-line={item.variantId}
      data-sku={sku}
      data-quantity={item.quantity}
      data-unit-price={item.unitPrice}
      data-line-total={item.lineTotal}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-stone-900">{item.productTitleSnapshot}</p>
        <p className="mt-1 text-xs text-stone-500">
          {color ? (
            <>
              رنگ: <span className="text-stone-700">{color}</span>
            </>
          ) : null}
          {color && size ? " · " : null}
          {size ? (
            <>
              سایز: <span className="text-stone-700">{size}</span>
            </>
          ) : null}
        </p>
        {sku ? <p className="mt-0.5 text-xs text-stone-400">کد کالا: {sku}</p> : null}
      </div>

      <div className="text-end">
        <p className="text-xs text-stone-500">
          {toFaDigits(item.quantity)} × {formatPrice(item.unitPrice)} تومان
        </p>
        <p className="mt-0.5 flex items-baseline justify-end gap-1">
          <span
            className="text-sm font-bold text-stone-900"
            data-order-line-total={item.lineTotal}
          >
            {formatPrice(item.lineTotal)}
          </span>
          <span className="text-[11px] text-stone-400">تومان</span>
        </p>
      </div>
    </div>
  );
}

/** Neutral state: a reference we cannot resolve on THIS device (not an error). */
function OrderNotFound({ reference }: { reference?: string }) {
  return (
    <div
      className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-16 text-center shadow-soft"
      data-order-missing="true"
    >
      <h1 className="text-lg font-bold text-stone-800">سفارشی برای نمایش پیدا نشد</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm text-stone-500">
        {reference
          ? "این سفارش در این دستگاه پیدا نشد. "
          : "شماره سفارشی در آدرس صفحه مشخص نشده است. "}
        سفارش‌ها روی همان دستگاه و مرورگری نگه داشته می‌شوند که خرید با آن انجام شده است؛
        بنابراین ممکن است این سفارش روی دستگاه دیگری ثبت شده باشد.
      </p>
      {reference ? (
        <p className="mt-2 text-xs text-stone-400" dir="ltr">
          {toFaDigits(reference)}
        </p>
      ) : null}
      <Button to="/shop" className="mt-6">
        مشاهده فروشگاه
      </Button>
    </div>
  );
}

function OrderConfirmation({ order }: { order: Order }) {
  const placedAt = formatJalaliDate(order.createdAt);
  return (
    <div className="mt-8 space-y-6" data-order-confirmation="true">
      {/* Success header + reference + both status axes, exactly as stored. */}
      <Card className="p-6 text-center sm:p-8">
        <CheckIcon className="mx-auto h-12 w-12 text-accent-700" />
        <h1 className="mt-4 text-xl font-bold text-stone-900 sm:text-2xl">
          سفارش شما با موفقیت ثبت شد
        </h1>
        <p className="mt-3 text-sm text-stone-600" data-order-number={order.orderNumber}>
          شماره سفارش:{" "}
          <span className="font-bold text-stone-900">{toFaDigits(order.orderNumber)}</span>
        </p>
        {placedAt ? (
          <p className="mt-1 text-xs text-stone-400">تاریخ ثبت: {placedAt}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-stone-500">وضعیت پرداخت:</span>
          <Badge
            variant="accent"
            data-payment-status={order.paymentStatus}
            data-order-payment-status={order.paymentStatus}
          >
            {order.paymentStatus}
          </Badge>
          <span className="text-xs text-stone-500">وضعیت سفارش:</span>
          <Badge variant="neutral" data-order-status={order.orderStatus}>
            {order.orderStatus}
          </Badge>
        </div>

        <p className="mx-auto mt-4 max-w-xl text-xs text-stone-400">
          پرداخت این سفارش تکمیل نشده است؛ وضعیت سفارش پس از تأیید پرداخت و در ادامه مراحل
          به‌روزرسانی می‌شود.
        </p>
      </Card>

      {/* Frozen lines + money, straight from the stored snapshot. */}
      <Card className="p-5 sm:p-6" data-order-summary>
        <h2 className="text-base font-bold text-stone-900">خلاصه سفارش</h2>
        <ul className="mt-4 divide-y divide-stone-200/80">
          {order.items.map((item) => (
            <li key={item.variantId} className="py-4 first:pt-0 last:pb-0">
              <OrderedLine item={item} />
            </li>
          ))}
        </ul>

        <dl className="mt-5 space-y-3 border-t border-stone-200/80 pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-stone-500">جمع سبد خرید</dt>
            <dd className="font-medium text-stone-800" data-order-subtotal={order.subtotalAmount}>
              {formatPrice(order.subtotalAmount)} تومان
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-stone-500">تعداد اقلام</dt>
            <dd className="font-medium text-stone-800">
              {toFaDigits(order.items.reduce((sum, item) => sum + item.quantity, 0))} کالا
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-stone-200/80 pt-3">
            <dt className="font-medium text-stone-700">مبلغ قابل پرداخت</dt>
            <dd className="flex items-baseline gap-1.5">
              <span
                className="text-lg font-bold text-stone-900"
                data-order-total={order.totalAmount}
              >
                {formatPrice(order.totalAmount)}
              </span>
              <span className="text-xs text-stone-400">تومان</span>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-stone-500">
          هزینه ارسال و مالیات در مراحل بعدی محاسبه می‌شود.
        </p>
      </Card>

      {/* Who and where the order is for (echoed back from the snapshot). */}
      <Card className="p-5 sm:p-6" data-order-customer>
        <h2 className="text-base font-bold text-stone-900">اطلاعات تحویل</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="w-24 shrink-0 text-stone-500">نام</dt>
            <dd className="font-medium text-stone-800" data-customer-name={order.customer.name}>
              {order.customer.name}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="w-24 shrink-0 text-stone-500">شماره تماس</dt>
            <dd className="font-medium text-stone-800" dir="ltr">
              {toFaDigits(order.customer.phone)}
            </dd>
          </div>
          {order.customer.email ? (
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="w-24 shrink-0 text-stone-500">ایمیل</dt>
              <dd className="font-medium text-stone-800" dir="ltr">
                {order.customer.email}
              </dd>
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="w-24 shrink-0 text-stone-500">نشانی</dt>
            <dd className="min-w-0 flex-1 text-stone-800" data-customer-address>
              {order.shippingAddress}
            </dd>
          </div>
          {order.notes ? (
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="w-24 shrink-0 text-stone-500">یادداشت</dt>
              <dd className="min-w-0 flex-1 text-stone-800">{order.notes}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <div className="flex justify-center">
        <Button to="/shop" size="lg">
          بازگشت به فروشگاه
        </Button>
      </div>
    </div>
  );
}

function OrderSuccessPage() {
  const { order: reference } = Route.useSearch();
  const [order, setOrder] = useState<Order | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Persistence is client-only (localStorage), so it is read after mount.
  useEffect(() => {
    setOrder(reference ? getOrder(reference) : null);
    setHydrated(true);
  }, [reference]);

  return (
    <section className="py-10 sm:py-16">
      <Container>
        {!hydrated ? (
          <ConfirmationSkeleton />
        ) : order ? (
          <OrderConfirmation order={order} />
        ) : (
          <OrderNotFound reference={reference} />
        )}
      </Container>
    </section>
  );
}
