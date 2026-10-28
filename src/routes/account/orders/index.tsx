/**
 * /account/orders (سفارشهای من) — the signed-in customer's order history (STEP 6).
 *
 * The list is the REAL order table filtered by RLS («orders_select_own» in
 * 0005_customer_accounts.sql): the query cannot return another customer's order,
 * and guest orders (customer_id IS NULL) match no policy, so they never appear
 * here. There is no demo list — an unconfigured store or a signed-out visitor
 * gets an explicit state instead of invented orders.
 *
 * Each row shows the reference (Persian digits, ORD-…), the Persian date, both
 * status badges (payment + fulfilment) and the total; the row links to the
 * detail page, which re-checks ownership.
 */

import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { BagIcon } from "~/components/icons";
import { AccountNav, AccountSkeleton, AuthConfigNotice } from "~/components/account";
import { useAuth } from "~/lib/auth";
import { listMyOrders, type OrdersResult } from "~/lib/customer-orders";
import { formatJalaliDate, formatPrice, toFaDigits } from "~/lib/format";
import type { Order } from "~/lib/orders";

export const Route = createFileRoute("/account/orders/")({
  component: AccountOrdersPage,
  head: () => ({
    meta: [{ title: "سفارش‌های من | فروشگاه پوشاک" }],
  }),
});

/** One clickable order row (mobile-first: stacked, then columns on sm+). */
function OrderRow({ order }: { order: Order }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <li data-order-row={order.orderNumber}>
      <Link
        to={"/account/orders/$orderId" as LinkProps["to"]}
        params={{ orderId: order.orderNumber } as never}
        className="block px-4 py-4 transition-colors hover:bg-stone-100/70 sm:px-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span
            className="font-semibold text-stone-900"
            dir="ltr"
            data-order-number={order.orderNumber}
          >
            {toFaDigits(order.orderNumber)}
          </span>
          <span className="text-xs text-stone-500">{formatJalaliDate(order.createdAt) ?? ""}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="accent" data-order-payment-status={order.paymentStatus}>
            {order.paymentStatus}
          </Badge>
          <Badge variant="neutral" data-order-status={order.orderStatus}>
            {order.orderStatus}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-stone-500">
            {toFaDigits(itemCount)} کالا · {toFaDigits(order.items.length)} قلم
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-bold text-stone-900" data-order-total={order.totalAmount}>
              {formatPrice(order.totalAmount)}
            </span>
            <span className="text-xs text-stone-400">تومان</span>
          </span>
        </div>
      </Link>
    </li>
  );
}

function AccountOrdersPage() {
  const { status } = useAuth();
  const [result, setResult] = useState<OrdersResult<Order[]> | null>(null);

  useEffect(() => {
    if (status !== "signedIn") return;
    let active = true;
    void (async () => {
      const loaded = await listMyOrders();
      if (active) setResult(loaded);
    })();
    return () => {
      active = false;
    };
  }, [status]);

  return (
    <section className="py-10 sm:py-16" data-account-orders-page>
      <Container className="max-w-3xl">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">سفارش‌های من</h1>
        <p className="mt-2 text-sm text-stone-500">سابقه سفارش‌های ثبت‌شده با حساب شما.</p>

        {status === "loading" ? (
          <AccountSkeleton />
        ) : status === "unconfigured" ? (
          <AuthConfigNotice title="سابقه سفارش‌ها در حال حاضر فعال نیست" />
        ) : status === "signedOut" ? (
          <div
            className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-soft"
            data-account-signed-out="true"
          >
            <h2 className="text-lg font-bold text-stone-800">وارد حساب خود نشده‌اید</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-stone-500">
              برای دیدن سابقه سفارش‌ها ابتدا وارد شوید.
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
              <Card className="mt-6 p-6 text-center" data-account-orders-error="true">
                <p role="alert" className="text-sm font-medium text-red-600">
                  {result.message}
                </p>
                {result.signedOut ? (
                  <Button to="/login" className="mt-4">
                    ورود به حساب
                  </Button>
                ) : null}
              </Card>
            ) : result.data.length === 0 ? (
              <div
                className="mt-6 rounded-card border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-soft"
                data-account-orders-empty="true"
              >
                <BagIcon className="mx-auto h-12 w-12 text-stone-300" />
                <p className="mt-4 text-base font-medium text-stone-700">
                  هنوز سفارشی ثبت نشده است
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">
                  سفارش‌هایی که با این حساب ثبت کنید، اینجا نمایش داده می‌شوند.
                </p>
                <Button to="/shop" className="mt-6">
                  مشاهده فروشگاه
                </Button>
              </div>
            ) : (
              <Card className="mt-6 overflow-hidden" data-account-orders-list>
                <ul className="divide-y divide-stone-200/80">
                  {result.data.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </Container>
    </section>
  );
}
