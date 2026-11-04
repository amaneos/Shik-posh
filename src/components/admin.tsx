/**
 * Shared admin-area UI (STEP 7).
 *
 * `AdminPlaceholder` is the honest "not built yet" screen for the admin sections
 * that arrive in parts 2–3 of STEP 7 (products / orders / customers). It renders
 * NO data and fires NO query on purpose: a half-built screen that shows a fake
 * table is worse than a clear "next part" notice.
 */

import { Button } from "~/components/Button";
import { Card } from "~/components/Card";

export function AdminPlaceholder({
  title,
  description,
  section,
}: {
  title: string;
  description: string;
  section: string;
}) {
  return (
    <div data-admin-placeholder={section}>
      <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">{title}</h1>
      <Card className="mt-4 p-6">
        <p className="text-sm leading-6 text-stone-600">{description}</p>
        <p className="mt-3 inline-flex rounded-pill bg-stone-200/70 px-3 py-1 text-xs font-medium text-stone-600">
          در بخش بعدی
        </p>
        <p className="mt-4 text-xs leading-5 text-stone-400">
          این صفحه در ادامهٔ همین مرحله ساخته می‌شود. برای اینکه هیچ عدد یا جدولی از خودمان نسازیم،
          فعلاً هیچ داده‌ای در آن نمایش داده نمی‌شود.
        </p>
        <Button to="/admin" variant="secondary" size="sm" className="mt-5">
          بازگشت به داشبورد
        </Button>
      </Card>
    </div>
  );
}
