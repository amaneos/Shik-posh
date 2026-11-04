/**
 * /admin/products — product management (STEP 7 part 2).
 *
 * Placeholder on purpose: no table, no counts, no query. Product/SKU/stock
 * editing arrives in part 2; the database side (admin write policies on
 * products / product_images / variants, 0008) is already in place for it.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AdminPlaceholder } from "~/components/admin";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
  head: () => ({ meta: [{ title: "محصولات | پنل مدیریت" }] }),
});

function AdminProducts() {
  return (
    <AdminPlaceholder
      section="products"
      title="محصولات"
      description="فهرست محصولات، افزودن و ویرایش محصول، تصاویر، تنوع‌ها (رنگ/سایز)، کد کالا و موجودی در این بخش مدیریت می‌شود."
    />
  );
}
