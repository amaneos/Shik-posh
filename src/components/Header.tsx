import { Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Container } from "~/components/Container";
import { Input } from "~/components/Input";
import { BagIcon, SearchIcon, UserIcon } from "~/components/icons";
import { useCart } from "~/lib/cart";
import { toFaDigits } from "~/lib/format";
import { useStoreSettings } from "~/lib/store-settings";

const NAV_ITEMS: { to: string; label: string }[] = [
  { to: "/", label: "خانه" },
  { to: "/shop", label: "فروشگاه" },
  { to: "/about", label: "درباره ما" },
];

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/" }}
      className="rounded-pill px-3.5 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200/70 hover:text-stone-900"
      activeProps={{
        className:
          "rounded-pill px-3.5 py-2 text-sm font-medium text-accent-800 transition-colors bg-accent-700/10",
      }}
    >
      {label}
    </Link>
  );
}

function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-stone-700 transition-colors hover:bg-stone-200/70 hover:text-stone-900"
    >
      {children}
    </button>
  );
}

/**
 * Cart entry point: a real link to /cart with a live unit-count badge. The count
 * comes from the cart store (variant rows → sum of quantities) and is rendered in
 * Persian digits; with an empty cart no badge is rendered at all. Hidden from
 * assistive tech via aria-hidden — the label already carries the number.
 */
function CartButton() {
  const { itemCount } = useCart();
  const label = itemCount > 0 ? `سبد خرید — ${toFaDigits(itemCount)} کالا` : "سبد خرید";
  return (
    <Link
      // The cart PAGE is part B of this step; until that route file exists the
      // generated route tree does not know "/cart", so the target is cast the
      // same way Button does with its `to` prop.
      to={"/cart" as LinkProps["to"]}
      aria-label={label}
      title={label}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-stone-700 transition-colors hover:bg-stone-200/70 hover:text-stone-900"
    >
      <BagIcon className="h-5 w-5" />
      {itemCount > 0 ? (
        <span
          data-cart-count={itemCount}
          aria-hidden="true"
          className="absolute -top-0.5 -end-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-700 px-1 text-[11px] font-bold leading-none text-white"
        >
          {toFaDigits(itemCount)}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Storefront header. Logo is a neutral wordmark read from store settings
 * (placeholder «فروشگاه پوشاک» until a client row exists). Two rows on mobile
 * (logo+actions, then nav); one row on md+ with an inline search box that
 * submits to /shop?q=<term>. The cart icon is live (badge + /cart link);
 * the account icon is still presentational.
 */
export function Header() {
  const settings = useStoreSettings();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/90 backdrop-blur">
      <Container className="flex h-16 items-center gap-4 sm:gap-6">
        <Link to="/" className="shrink-0 text-lg font-bold text-stone-900">
          {settings.storeName}
        </Link>

        <nav className="ms-auto hidden items-center gap-1 md:flex" aria-label="ناوبری اصلی">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>

        <form
          className="ms-auto hidden w-56 lg:block xl:w-64"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = draft.trim();
            navigate({ to: "/shop", search: q ? { q } : {} });
            setDraft("");
          }}
        >
          <Input
            icon={<SearchIcon className="h-4 w-4" />}
            placeholder="جستجوی محصولات…"
            aria-label="جستجوی محصولات"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </form>

        <div className="flex items-center gap-0.5">
          <span className="lg:hidden">
            <IconButton label="جستجو">
              <SearchIcon className="h-5 w-5" />
            </IconButton>
          </span>
          <IconButton label="حساب کاربری">
            <UserIcon className="h-5 w-5" />
          </IconButton>
          <CartButton />
        </div>
      </Container>

      {/* Mobile nav row */}
      <Container className="flex h-11 items-center gap-1 border-t border-stone-100 md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} label={item.label} />
        ))}
      </Container>
    </header>
  );
}