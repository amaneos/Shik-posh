/**
 * /admin — the store dashboard (STEP 7).
 *
 * Every number on this page is a REAL query against the connected database
 * (`fetchAdminOverview` in ~/lib/admin). There is no sample data: on a store
 * with no orders yet the sales card honestly says «بدون فروش ثبت‌شده» and the
 * low-stock panel says the shelf is fine, instead of inventing activity.
 *
 * Each panel handles the three states on its own — loading skeleton, error with
 * a retry («خطا در دریافت اطلاعات»), and the real value — so one slow query can
 * never make the page look like it has data it does not have.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import {
  ADMIN_LOAD_ERROR,
  LOW_STOCK_THRESHOLD,
  fetchAdminOverview,
  type AdminOverview,
} from "~/lib/admin";
import { formatPrice, toFaDigits } from "~/lib/format";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
  head: () => ({
    meta: [{ title: "داشبورد مدیریت | فروشگاه پوشاک" }],
  }),
});

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: AdminOverview }
  | { status: "error"; message: string };

function AdminDashboard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await fetchAdminOverview();
    setState(
      result.ok
        ? { status: "ready", data: result.data }
        : { status: "error", message: result.message || ADMIN_LOAD_ERROR }
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = () => void load();

  return (
    <div data-admin-dashboard="true">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">داشبورد</h1>
          <p className="mt-1 text-sm text-stone-500">نمای کلی فروشگاه، بر اساس داده‌های واقعی.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={retry} data-admin-refresh>
          به‌روزرسانی
        </Button>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="محصولات"
          value={state.status === "ready" ? toFaDigits(state.data.productsTotal) : null}
          hint={
            state.status === "ready"
              ? `${toFaDigits(state.data.productsActive)} محصول فعال`
              : undefined
          }
          error={state.status === "error" ? state.message : undefined}
          onRetry={retry}
          testId="products"
        />
        <StatCard
          label="سفارش‌ها"
          value={state.status === "ready" ? toFaDigits(state.data.ordersTotal) : null}
          hint={
            state.status === "ready"
              ? state.data.ordersTotal === 0
                ? "هنوز سفارشی ثبت نشده است"
                : `${toFaDigits(state.data.ordersPending)} سفارش در جریان`
              : undefined
          }
          error={state.status === "error" ? state.message : undefined}
          onRetry={retry}
          testId="orders"
        />
        <StatCard
          label="سفارش‌های در جریان"
          value={state.status === "ready" ? toFaDigits(state.data.ordersPending) : null}
          hint="در انتظار پرداخت، پردازش سفارش و آماده ارسال"
          error={state.status === "error" ? state.message : undefined}
          onRetry={retry}
          testId="pending"
        />
        <StatCard
          label="فروش کل"
          value={
            state.status === "ready"
              ? state.data.salesOrders === 0
                ? "بدون فروش ثبت‌شده"
                : `${formatPrice(state.data.salesTotal)} تومان`
              : null
          }
          hint={
            state.status === "ready" && state.data.salesOrders > 0
              ? `از ${toFaDigits(state.data.salesOrders)} سفارش پرداخت‌شده`
              : undefined
          }
          error={state.status === "error" ? state.message : undefined}
          onRetry={retry}
          testId="sales"
        />
      </div>

      <LowStockPanel
        state={state}
        onRetry={retry}
      />
    </div>
  );
}

/* ── Panels ────────────────────────────────────────────────────────────────── */

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-3" role="alert" data-admin-panel-error="true">
      <p className="text-sm font-medium text-red-600">{message}</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
        تلاش دوباره
      </Button>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  error,
  onRetry,
  testId,
}: {
  label: string;
  value: string | null;
  hint?: string;
  error?: string;
  onRetry: () => void;
  testId: string;
}) {
  return (
    <Card className="p-5" data-admin-stat={testId}>
      <p className="text-xs font-medium text-stone-400">{label}</p>
      {error ? (
        <PanelError message={error} onRetry={onRetry} />
      ) : value === null ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          <div className="h-7 w-20 animate-pulse rounded bg-stone-200" />
          <div className="h-3 w-28 animate-pulse rounded bg-stone-200/70" />
        </div>
      ) : (
        <>
          <p
            className="mt-2 text-2xl font-bold text-stone-900"
            data-admin-stat-value={testId}
          >
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
        </>
      )}
    </Card>
  );
}

function LowStockPanel({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  return (
    <Card className="mt-6 p-5" data-admin-low-stock>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-stone-800">موجودی کم</h2>
        <Badge variant="outline">
          آستانه: {toFaDigits(LOW_STOCK_THRESHOLD)} عدد یا کمتر
        </Badge>
      </div>

      {state.status === "error" ? (
        <PanelError message={state.message} onRetry={onRetry} />
      ) : state.status === "loading" ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-stone-200/70" />
          ))}
        </div>
      ) : state.data.lowStock.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500" data-admin-low-stock-empty="true">
          موجودی همه تنوع‌ها بالای آستانه است؛ موردی برای پیگیری نیست.
        </p>
      ) : (
        <>
          {/* Mobile: stacked cards — a table here would scroll sideways at 375px. */}
          <ul className="mt-4 space-y-2 md:hidden">
            {state.data.lowStock.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-stone-200/80 p-3"
                data-admin-low-stock-row
              >
                <p className="text-sm font-medium text-stone-900">{item.productTitle}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {item.color} / {item.size}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-stone-400" dir="ltr">
                    {item.sku}
                  </span>
                  <Badge variant={item.stock === 0 ? "neutral" : "accent"}>
                    {item.stock === 0 ? "ناموجود" : `${toFaDigits(item.stock)} عدد`}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table. */}
          <div className="mt-4 hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400">
                  <th className="pb-2 text-start font-medium">محصول</th>
                  <th className="pb-2 text-start font-medium">رنگ</th>
                  <th className="pb-2 text-start font-medium">سایز</th>
                  <th className="pb-2 text-start font-medium">کد (SKU)</th>
                  <th className="pb-2 text-start font-medium">موجودی</th>
                </tr>
              </thead>
              <tbody>
                {state.data.lowStock.map((item) => (
                  <tr key={item.id} className="border-t border-stone-200/80">
                    <td className="py-2.5 text-stone-900">{item.productTitle}</td>
                    <td className="py-2.5 text-stone-600">{item.color}</td>
                    <td className="py-2.5 text-stone-600">{item.size}</td>
                    <td className="py-2.5 text-stone-400" dir="ltr">
                      {item.sku}
                    </td>
                    <td className="py-2.5">
                      <Badge variant={item.stock === 0 ? "neutral" : "accent"}>
                        {item.stock === 0 ? "ناموجود" : `${toFaDigits(item.stock)} عدد`}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
