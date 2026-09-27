import { Link, type LinkProps } from "@tanstack/react-router";

import { Badge } from "~/components/Badge";
import { Card } from "~/components/Card";
import { BagIcon } from "~/components/icons";
import { isOutOfStock, type Product } from "~/lib/data";
import { formatPrice, toFaDigits } from "~/lib/format";

/**
 * Product card: image, category, title, price (with discount price + percent
 * when present). Links to /product/:slug.
 */
export function ProductCard({ product }: { product: Product }) {
  const hasDiscount =
    product.discount_price != null && product.discount_price < product.base_price;
  const finalPrice = hasDiscount ? (product.discount_price as number) : product.base_price;
  const discountPercent = hasDiscount
    ? Math.round(((product.base_price - finalPrice) / product.base_price) * 100)
    : null;
  /* Availability hint (STEP 3): a product is only «ناموجود» when it HAS variants and
     every one of them is at 0 — a product with nothing configured yet is not
     sold out, so it keeps no badge. One badge, no clutter. */
  const soldOut = isOutOfStock(product);

  return (
    <Link
      // slug comes from store data, not the typed route tree, so cast it
      to={`/product/${product.slug}` as LinkProps["to"]}
      className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
    >
      <Card className="overflow-hidden transition-shadow duration-300 group-hover:shadow-lift">
        <div className="relative aspect-[4/5] overflow-hidden bg-stone-100">
          {product.image ? (
            <img
              src={product.image}
              alt={product.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-300">
              <BagIcon className="h-10 w-10" />
            </div>
          )}
          {hasDiscount && discountPercent != null ? (
            <Badge variant="accent" className="absolute top-3 start-3 shadow-soft">
              {toFaDigits(discountPercent)}٪ تخفیف
            </Badge>
          ) : null}
          {soldOut ? (
            <Badge
              variant="neutral"
              className="absolute top-3 end-3 bg-white/95 text-stone-700 shadow-soft"
            >
              ناموجود
            </Badge>
          ) : null}
        </div>
        <div className="p-4">
          <p className="text-xs text-stone-500">{product.category ?? "بدون دسته‌بندی"}</p>
          <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-stone-900">
            {product.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-base font-bold text-stone-900">{formatPrice(finalPrice)}</span>
            <span className="text-xs text-stone-400">تومان</span>
            {hasDiscount ? (
              <span className="text-xs text-stone-400 line-through">
                {formatPrice(product.base_price)}
              </span>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}