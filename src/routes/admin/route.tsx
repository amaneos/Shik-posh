/**
 * Admin area layout + guard (`/admin`, `/admin/products`, `/admin/orders`,
 * `/admin/customers`).
 *
 * ── THE GUARD IS UX ONLY ──────────────────────────────────────────────────────
 * This component decides what the browser is ALLOWED TO RENDER. It is not the
 * security boundary: every admin read/write is gated by Postgres RLS policies
 * that call `public.is_store_admin()` (supabase/migrations/0008_store_admin.sql),
 * and order money columns are additionally protected by column-level GRANTs. A
 * visitor who edits this bundle and forces the admin branch open still gets zero
 * rows back and cannot write anything. Never move a permission decision from SQL
 * into this file.
 *
 * ── THE <Outlet/> RULE ────────────────────────────────────────────────────────
 * A matched ancestor that does not render <Outlet/> silently stops its children
 * from mounting (that was bug #6 in the account area). This layout renders
 * <Outlet/> — and ONLY in the admin branch, so a non-admin never mounts a child
 * page (and therefore never fires an admin query).
 */

import { Link, Outlet, createFileRoute, useNavigate, type LinkProps } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Button } from "~/components/Button";
import { Container } from "~/components/Container";
import { AuthConfigNotice } from "~/components/account";
import { isStoreAdmin } from "~/lib/admin";
import { useAuth } from "~/lib/auth";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  head: () => ({
    meta: [{ title: "پنل مدیریت | فروشگاه پوشاک" }],
  }),
});

type AccessState = "checking" | "admin" | "forbidden";

const NAV_ITEMS = [
  { to: "/admin", label: "داشبورد", exact: true },
  { to: "/admin/products", label: "محصولات", exact: false },
  { to: "/admin/orders", label: "سفارش‌ها", exact: false },
  { to: "/admin/customers", label: "مشتریان", exact: false },
] as const;

function AdminLayout() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState<AccessState>("checking");

  // Resolve the role once the session is known. `isStoreAdmin()` fails closed, so
  // any error (including a database that has not had 0008 applied yet) lands on
  // "forbidden" rather than on an open panel.
  useEffect(() => {
    if (status !== "signedIn") return;
    let active = true;
    setAccess("checking");
    void isStoreAdmin().then((admin) => {
      if (active) setAccess(admin ? "admin" : "forbidden");
    });
    return () => {
      active = false;
    };
  }, [status, user?.id]);

  // Not signed in → the login page, remembering where the visitor wanted to go.
  useEffect(() => {
    if (status === "signedOut") {
      void navigate({ to: "/login", search: { redirect: "/admin" } });
    }
  }, [status, navigate]);

  const retry = useCallback(() => {
    setAccess("checking");
    void isStoreAdmin().then((admin) => setAccess(admin ? "admin" : "forbidden"));
  }, []);

  if (status === "unconfigured") {
    return (
      <section className="py-10 sm:py-16">
        <Container>
          <AuthConfigNotice title="پنل مدیریت در حال حاضر فعال نیست" />
        </Container>
      </section>
    );
  }

  if (status === "loading" || status === "signedOut" || access === "checking") {
    return (
      <section className="py-10 sm:py-16" data-admin-checking="true">
        <Container>
          <div className="h-6 w-40 animate-pulse rounded bg-stone-200" aria-hidden="true" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-card bg-stone-200/70" />
            ))}
          </div>
          <p className="mt-6 text-sm text-stone-500">در حال بررسی دسترسی…</p>
        </Container>
      </section>
    );
  }

  if (access === "forbidden") {
    return <ForbiddenScreen onRetry={retry} />;
  }

  return (
    <section className="bg-stone-100/60 py-6 sm:py-10" data-admin-shell="true">
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Sidebar (desktop) / horizontal nav (mobile). It scrolls on its own,
              so the page never gains a horizontal scrollbar at 375px. */}
          <aside className="lg:sticky lg:top-24 lg:w-60 lg:shrink-0">
            <div className="rounded-card border border-stone-200/80 bg-white p-3 shadow-soft">
              <p className="px-2 pb-2 text-xs font-medium text-stone-400">پنل مدیریت فروشگاه</p>
              <nav aria-label="ناوبری پنل مدیریت">
                <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                  {NAV_ITEMS.map((item) => (
                    <li key={item.to} className="shrink-0 lg:w-full">
                      <Link
                        to={item.to as LinkProps["to"]}
                        activeOptions={{ exact: item.exact }}
                        className="block"
                        data-admin-nav={item.to}
                      >
                        {({ isActive }) => (
                          <span
                            className={`block rounded-pill px-3.5 py-2 text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-accent-700/10 text-accent-800"
                                : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
                            }`}
                          >
                            {item.label}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="mt-3 border-t border-stone-200/80 px-2 pt-3">
                <p className="truncate text-xs text-stone-500" dir="ltr" data-admin-email>
                  {user?.email ?? ""}
                </p>
                <Link
                  to="/"
                  className="mt-2 inline-block text-xs font-medium text-accent-800 hover:underline"
                  data-admin-back-to-store
                >
                  بازگشت به فروشگاه
                </Link>
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </Container>
    </section>
  );
}

/**
 * Neutral refusal. No admin chrome, no counts, no queries — a signed-in customer
 * who guesses the URL learns nothing about the store's orders or customers.
 */
function ForbiddenScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="py-12 sm:py-20" data-admin-forbidden="true">
      <Container className="max-w-lg">
        <div className="rounded-card border border-stone-200/80 bg-white px-6 py-12 text-center shadow-soft">
          <h1 className="text-lg font-bold text-stone-800">دسترسی غیرمجاز</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-500">
            این بخش تنها برای مدیر فروشگاه در دسترس است. اگر فکر می‌کنید اشتباهی رخ داده، دوباره
            تلاش کنید یا به فروشگاه بازگردید.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button to="/" data-admin-forbidden-home>
              بازگشت به فروشگاه
            </Button>
            <Button variant="secondary" onClick={onRetry} data-admin-forbidden-retry>
              بررسی دوباره
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
