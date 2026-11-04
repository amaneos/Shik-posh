/**
 * /admin/orders — order management (STEP 7 part 2).
 *
 * Placeholder on purpose: no table, no counts, no query. Moving an order along
 * the fulfilment axis (order_status) arrives in part 2. Note for that work: the
 * database allows an admin to change `order_status` ONLY — payment_status and
 * every amount are protected by column-level grants (0008), so this screen must
 * never offer a "mark as paid" control.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AdminPlaceholder } from "~/components/admin";

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrders,
  head: () => ({ meta: [{ title: "سفارش‌ها | پنل مدیریت" }] }),
});

function AdminOrders() {
  return (
    <AdminPlaceholder
      section="orders"
      title="سفارش‌ها"
      description="فهرست سفارش‌ها، جزئیات هر سفارش و تغییر وضعیت اجرایی آن (پردازش، آماده ارسال، ارسال، تحویل) در این بخش انجام می‌شود."
    />
  );
}
