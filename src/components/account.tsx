/**
 * Shared account-area UI (STEP 6) — Persian RTL, mobile-first, white-label.
 *
 * Every piece here is presentation only; the Supabase work lives in
 * `~/lib/auth.tsx` and `~/lib/customer-orders.ts`. Two rules are encoded here
 * rather than repeated in each route:
 *   • `AuthConfigNotice` is the ONE "connect the database" state — identical
 *     wording everywhere, so no account page can quietly pretend to work.
 *   • `AccountNav` is the single account navigation, so the active item, the
 *     sign-out button (with a confirm) and its placement never drift apart.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { UserIcon } from "~/components/icons";
import { AUTH_CONFIG_MESSAGE, useAuth } from "~/lib/auth";

/** The neutral "no database connected" state (login, register, account, orders). */
export function AuthConfigNotice({ title }: { title: string }) {
  return (
    <div
      className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-soft"
      data-auth-unconfigured="true"
    >
      <UserIcon className="mx-auto h-10 w-10 text-stone-300" />
      <h1 className="mt-4 text-lg font-bold text-stone-800">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-500">
        {AUTH_CONFIG_MESSAGE}
      </p>
      <Button to="/shop" className="mt-6" data-auth-unconfigured-cta>
        مشاهده فروشگاه
      </Button>
    </div>
  );
}

/** Mobile-first skeleton shown while the session is being restored. */
export function AccountSkeleton() {
  return (
    <div className="mt-8 space-y-6" aria-hidden="true">
      <Card className="p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-stone-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-stone-200" />
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-stone-200" />
        <div className="mt-4 h-24 w-full animate-pulse rounded bg-stone-200" />
      </Card>
    </div>
  );
}

type AccountSection = "profile" | "orders";

/**
 * Account navigation: profile / orders + sign-out. Sign-out asks for a confirm
 * (a stray tap must not end the session) and reports a failure inline.
 */
export function AccountNav({ active }: { active: AccountSection }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemClass = (section: AccountSection) =>
    `rounded-pill px-3.5 py-2 text-sm font-medium transition-colors ${
      active === section
        ? "bg-accent-700/10 text-accent-800"
        : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
    }`;

  return (
    <nav
      className="mt-6 flex flex-wrap items-center gap-1 rounded-card border border-stone-200/80 bg-white p-2 shadow-soft"
      aria-label="ناوبری حساب کاربری"
      data-account-nav
    >
      <Link to="/account" className={itemClass("profile")} data-account-nav-item="profile">
        حساب کاربری
      </Link>
      <Link
        to="/account/orders"
        className={itemClass("orders")}
        data-account-nav-item="orders"
      >
        سفارش‌های من
      </Link>

      <span className="ms-auto flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-stone-500">از حساب خود خارج می‌شوید؟</span>
            <Button
              size="sm"
              variant="secondary"
              data-account-signout-confirm
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
            >
              انصراف
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          data-account-signout
          data-confirming={confirming ? "true" : "false"}
          disabled={busy}
          onClick={async () => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            setBusy(true);
            setError(null);
            const result = await signOut();
            setBusy(false);
            setConfirming(false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            await navigate({ to: "/" });
          }}
        >
          {busy ? "در حال خروج…" : "خروج"}
        </Button>
      </span>

      {error ? (
        <p role="alert" className="w-full px-2 pt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </nav>
  );
}

/** Label + control + inline Persian error, in the checkout page's visual style. */
export function AccountField({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-stone-700">
        {label}
        {required ? (
          <span className="ms-1 text-red-500" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-stone-400">{hint}</p> : null}
      <p
        role="alert"
        data-field-error={id}
        data-error={error ? "true" : "false"}
        className="mt-1 min-h-4 text-xs font-medium text-red-600"
      >
        {error ?? ""}
      </p>
    </div>
  );
}

/** Shared border for the text controls of this area (matches checkout). */
export const ACCOUNT_CONTROL_CLASS =
  "w-full border bg-white text-sm text-stone-900 outline-none transition-[border-color,box-shadow] " +
  "placeholder:text-stone-400 focus:border-accent-600 focus:ring-2 focus:ring-accent-600/20";
