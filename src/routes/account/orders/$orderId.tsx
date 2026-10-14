/**
 * /account/orders/$orderId — one order of the signed-in customer (STEP 6).
 *
 * WHAT IS SHOWN: the frozen order as it was placed — reference (Persian digits),
 * Persian date, every line with colour/size/SKU/quantity/unit price/line total,
 * the money block, BOTH status badges (payment + fulfilment, i.e. all six
 * fulfilment statuses «در انتظار پرداخت» … «لغو شده»), and the customer echo that
 * was used for delivery. The page never re-prices anything: the snapshot in
 * `order_items` is the truth, so a later catalog change cannot rewrite history.
 *
 * OWNERSHIP — two independent layers:
 *   1. the read goes through RLS (`orders_select_own` / `order_items_select_own`
 *      in 0005_customer_accounts.sql), so the API physically cannot return
 *      another customer's order;
 *   2. the page STILL checks `order.customerId === user.id` and renders
 *      «این سفارش برای شما قابل مشاهده نیست» if a row ever arrives that is not
 *      the caller's (e.g. a widened policy or a service-role read later).
 *
 * About the neutral not-found state: a cross-account attempt returns NO row from
 * step 1, so the visitor sees the same neutral «سفارشی برای نمایش پیدا نشد» as for
 * a genuinely unknown reference. That is deliberate — distinguishing the two from
 * the client would require an existence oracle over order numbers, which would
 * leak other customers' references. No other customer's data is ever rendered.
 */

import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { AccountNav, AccountSkeleton, AuthConfigNotice } from "~/components/account";
import { useAuth } from "~/lib/auth";
import { getMyOrder, type OrdersResult } from "~/lib/customer-orders";
import { formatJalaliDate, formatPrice, toFaDigits } from "~/lib/format";
import type { Order, OrderItem } from "~/lib/orders";

export const Route = createFileRoute("/account/orders/$orderId")({
  component: AccountOrderDetailPage,
  head: () => ({
    meta: [{ title: "جزئیات سفارش | فروشگاه پوشاک" }],
  }),
});

/** Badge styling per fulfilment status (all six are supported). */
function statusVariant(status: string): "accent" | "neutral" | "outline" {
  if (status === "لغو شده") return "outline";
  if (status === "تحویل داده شده" || status === "ارسال شده") return "accent";
  return "neutral";
}

function OrderedLine({ item }: { item: OrderItem }) {
  const { color, size, sku } = item.variantSnapshot;
  return (
    <li
      className="py-4 first:pt-0 last:pb-0"
      data-order-line={item.variantId}
      data-sku={sku}
      data-quantity={item.quantity}
      data-unit-price={item.unitPrice}
      data-line-total={item.lineTotal}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
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
            <span className="text-sm font-bold text-stone-900">
              {formatPrice(item.lineTotal)}
            </span>
            <span className="text-[11px] text-stone-400">تومان</span>
          </p>
        </div>
      </div>
    </li>
  );
}

/** Neutral state — unknown reference, or another customer's order (RLS hides it). */
function OrderNotFound({ reference }: { reference: string }) {
  return (
    <div
      className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-soft"
      data-account-order-not-found="true"
    >
      <h2 className="text-lg font-bold text-stone-800">سفارشی برای نمایش پیدا نشد</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-stone-500">
        سفارشی با این شماره در حساب شما ثبت نشده است.
      </p>
      <p className="mt-2 text-xs text-stone-400" dir="ltr">
        {toFaDigits(reference)}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button to="/account/orders">سفارش‌های من</Button>
        <Button to="/shop" variant="secondary">
          مشاهده فروشگاه
        </Button>
      </div>
    </div>
  );
}

function OrderDetail({ order }: { order: Order }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="mt-6 space-y-6" data-account-order-detail>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              سفارش <span dir="ltr" data-account-order-number={order.orderNumber}>{toFaDigits(order.orderNumber)}</span>
            </h2>
            <p className="mt-1 text-xs text-stone-400">
              تاریخ ثبت: {formatJalaliDate(order.createdAt) ?? "—"}
            </p>
          </div>
          <Link
            to={"/account/orders" as LinkProps["to"]}
            className="text-xs font-medium text-accent-800 hover:underline"
          >
            بازگشت به سفارش‌های من
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-500">وضعیت پرداخت:</span>
          <Badge variant="accent" data-account-payment-status={order.paymentStatus}>
            {order.paymentStatus}
          </Badge>
          <span className="text-xs text-stone-500">وضعیت سفارش:</span>
          <Badge
            variant={statusVariant(order.orderStatus)}
            data-account-order-status={order.orderStatus}
          >
            {order.orderStatus}
          </Badge>
        </div>
      </Card>

      <Card className="p-5 sm:p-6" data-account-order-items>
        <h3 className="text-base font-bold text-stone-900">اقلام سفارش</h3>
        <ul className="mt-4 divide-y divide-stone-200/80">
          {order.items.map((item) => (
            <OrderedLine key={item.variantId} item={item} />
          ))}
        </ul>

        <dl className="mt-5 space-y-3 border-t border-stone-200/80 pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-stone-500">جمع سبد خرید</dt>
            <dd className="font-medium text-stone-800" data-account-subtotal={order.subtotalAmount}>
              {formatPrice(order.subtotalAmount)} تومان
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-stone-500">تعداد اقلام</dt>
            <dd className="font-medium text-stone-800">{toFaDigits(itemCount)} کالا</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-stone-200/80 pt-3">
            <dt className="font-medium text-stone-700">مبلغ قابل پرداخت</dt>
            <dd className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-stone-900" data-account-total={order.totalAmount}>
                {formatPrice(order.totalAmount)}
              </span>
              <span className="text-xs text-stone-400">تومان</span>
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5 sm:p-6" data-account-order-customer>
        <h3 className="text-base font-bold text-stone-900">اطلاعات تحویل</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-stone-500">نام</dt>
            <dd className="font-medium text-stone-800">{order.customer.name}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-stone-500">شماره تماس</dt>
            <dd className="font-medium text-stone-800" dir="ltr">
              {toFaDigits(order.customer.phone)}
            </dd>
          </div>
          {order.customer.email ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-stone-500">ایمیل</dt>
              <dd className="font-medium text-stone-800" dir="ltr">
                {order.customer.email}
              </dd>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-stone-500">نشانی</dt>
            <dd className="max-w-md font-medium text-stone-800">{order.shippingAddress}</dd>
          </div>
          {order.notes ? (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-stone-500">یادداشت</dt>
              <dd className="max-w-md text-stone-700">{order.notes}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-4 text-xs text-stone-400">
          پرداخت این سفارش از طریق درگاه واقعی انجام نشده است؛ وضعیت سفارش پس از اتصال درگاه
          پرداخت به‌روزرسانی می‌شود.
        </p>
      </Card>
    </div>
  );
}

function AccountOrderDetailPage() {
  const { orderId } = Route.useParams();
  const { status, user } = useAuth();
  const [result, setResult] = useState<OrdersResult<Order | null> | null>(null);

  useEffect(() => {
    if (status !== "signedIn") {
      setResult(null);
      return;
    }
    let active = true;
    setResult(null);
    void (async () => {
      const loaded = await getMyOrder(orderId);
      if (active) setResult(loaded);
    })();
    return () => {
      active = false;
    };
  }, [status, orderId, user?.id]);

  const order = result?.ok ? result.data : null;
  /** Layer 2 of the ownership check (layer 1 is RLS). */
  const notMine = !!order && !!user && order.customerId !== user.id;

  return (
    <section className="py-10 sm:py-16" data-account-order-page>
      <Container className="max-w-3xl">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">جزئیات سفارش</h1>
        <p className="mt-2 text-sm text-stone-500">
          وضعیت و اقلام این سفارش، همان‌گونه که ثبت شده است.
        </p>

        {status === "loading" ? (
          <AccountSkeleton />
        ) : status === "unconfigured" ? (
          <AuthConfigNotice title="جزئیات سفارش در حال حاضر فعال نیست" />
        ) : status === "signedOut" ? (
          <div
            className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-soft"
            data-account-signed-out="true"
          >
            <h2 className="text-lg font-bold text-stone-800">وارد حساب خود نشده‌اید</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-stone-500">
              برای دیدن جزئیات سفارش ابتدا وارد شوید.
            </p>
            <Button to="/login" className="mt-6">
              ورود به حساب
            </Button>
          </div>
        ) : (
          <>
            <AccountNav active="orders" />

            {result === null ? (
              <AccountSkeleton />
            ) : !result.ok ? (
              <Card className="mt-6 p-6 text-center" data-account-order-error="true">
                <p role="alert" className="text-sm font-medium text-red-600">
                  {result.message}
                </p>
              </Card>
            ) : notMine ? (
              <div
                className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-soft"
                data-account-order-forbidden="true"
              >
                <h2 className="text-lg font-bold text-stone-800">
                  این سفارش برای شما قابل مشاهده نیست
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-stone-500">
                  این سفارش به حساب دیگری ثبت شده است.
                </p>
                <Button to="/account/orders" className="mt-6">
                  سفارش‌های من
                </Button>
              </div>
            ) : order ? (
              <OrderDetail order={order} />
            ) : (
              <OrderNotFound reference={orderId} />
            )}
          </>
        )}
      </Container>
    </section>
  );
}
