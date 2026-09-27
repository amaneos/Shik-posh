import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Footer } from "~/components/Footer";
import { Header } from "~/components/Header";
import { CartProvider } from "~/lib/cart";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "فروشگاه پوشاک" },
      {
        name: "description",
        content: "فروشگاه اینترنتی پوشاک؛ مجموعه‌ای ساده، باکیفیت و مینیمال.",
      },
      { name: "theme-color", content: "#20453e" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-64 items-center justify-center py-24 text-stone-500">
      صفحه موردنظر پیدا نشد.
    </div>
  ),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      {/* CartProvider wraps the WHOLE layout (not just <Outlet/>) because the
          header's cart badge reads the same store. It hydrates from
          localStorage after mount, so SSR and the first client render agree. */}
      <CartProvider>
        <div className="flex min-h-dvh flex-col">
          <Header />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
      </CartProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}