/**
 * /admin/customers — customer list (STEP 7 part 3).
 *
 * Placeholder on purpose: no table, no counts, no query. The customer list
 * arrives in part 3. Note for that work: admins get SELECT only on
 * customer_profiles (0008) — no edit, no delete.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AdminPlaceholder } from "~/components/admin";

export const Route = createFileRoute("/admin/customers")({
  component: AdminCustomers,
  head: () => ({ meta: [{ title: "مشتریان | پنل مدیریت" }] }),
});

function AdminCustomers() {
  return (
    <AdminPlaceholder
      section="customers"
      title="مشتریان"
      description="فهرست مشتریان ثبت‌نام‌شده و اطلاعات تماس آن‌ها در این بخش نمایش داده می‌شود."
    />
  );
}
