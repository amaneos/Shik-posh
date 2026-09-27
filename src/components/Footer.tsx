import { Link } from "@tanstack/react-router";

import { Container } from "~/components/Container";
import { useStoreSettings } from "~/lib/store-settings";
import { getCurrentJalaliYear } from "~/lib/format";

const QUICK_LINKS: { to: string; label: string }[] = [
  { to: "/", label: "خانه" },
  { to: "/shop", label: "فروشگاه" },
  { to: "/about", label: "درباره ما" },
];

const CATEGORY_LINKS: { to: string; label: string }[] = [
  { to: "/shop", label: "مردانه" },
  { to: "/shop", label: "زنانه" },
  { to: "/shop", label: "بچه‌گانه" },
  { to: "/shop", label: "اکسسوری" },
];

function FooterColumn({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-stone-900">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="text-sm text-stone-500 transition-colors hover:text-stone-900"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Footer — neutral placeholder identity, quick links, category nav, small print. */
export function Footer() {
  const settings = useStoreSettings();

  return (
    <footer className="border-t border-stone-200/80 bg-white">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="max-w-xs space-y-3">
            <p className="text-base font-bold text-stone-900">{settings.storeName}</p>
            <p className="text-sm leading-7 text-stone-500">{settings.footerText}</p>
          </div>
          <FooterColumn title="دسترسی سریع" links={QUICK_LINKS} />
          <FooterColumn title="دسته‌بندی‌ها" links={CATEGORY_LINKS} />
          <div>
            <h3 className="text-sm font-bold text-stone-900">سبد خرید</h3>
            <ul className="mt-4 space-y-3 text-sm text-stone-500">
              <li>محصولات موردعلاقه</li>
              <li>پیگیری سفارش</li>
              <li>شرایط بازگشت</li>
            </ul>
          </div>
        </div>
      </Container>
      <div className="border-t border-stone-100">
        <Container className="flex flex-col items-center justify-between gap-2 py-6 sm:flex-row">
          <p className="text-xs text-stone-400">
            © {getCurrentJalaliYear()} {settings.storeName} — تمامی حقوق محفوظ است.
          </p>
          <p className="text-xs text-stone-400">پوشاک ساده، باکیفیت و مینیمال</p>
        </Container>
      </div>
    </footer>
  );
}