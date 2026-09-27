import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";

import { Container } from "~/components/Container";
import { Input } from "~/components/Input";
import { ProductCard } from "~/components/ProductCard";
import { BagIcon, SearchIcon } from "~/components/icons";
import { useCategories, useShopProducts, type SortMode } from "~/lib/data";
import { toFaDigits } from "~/lib/format";

interface ShopSearch {
  q?: string;
  category?: string;
  sort?: SortMode | undefined;
}

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>): ShopSearch => {
    const q = typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined;
    const category =
      typeof search.category === "string" && search.category ? search.category : undefined;
    const rawSort = search.sort;
    const sort: SortMode | undefined =
      rawSort === "newest" || rawSort === "price-asc" || rawSort === "price-desc"
        ? rawSort
        : undefined;
    return { q, category, sort };
  },
  component: ShopPage,
  head: () => ({
    meta: [{ title: "فروشگاه | فروشگاه پوشاک" }],
  }),
});

/** Builds the next search object: explicit patch keys win, rest stay in the URL. */
function patchSearch(current: ShopSearch, patch: Partial<ShopSearch>): ShopSearch {
  return {
    q: "q" in patch ? patch.q || undefined : current.q,
    category: "category" in patch ? patch.category || undefined : current.category,
    sort: "sort" in patch ? patch.sort ?? undefined : current.sort,
  };
}

/** Category filter chip — a link like any filter, so the state lives in the URL. */
function FilterChip({
  search,
  slug,
  label,
  active,
}: {
  search: ShopSearch;
  slug: string | undefined;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to="/shop"
      search={patchSearch(search, { category: slug })}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-pill bg-accent-700 px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors"
          : "rounded-pill border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-accent-400 hover:text-accent-900"
      }
    >
      {label}
    </Link>
  );
}

/** Light loading state — skeleton cards while the (Supabase) data arrives. */
function SkeletonGrid() {
  return (
    <div
      className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-card border border-stone-200/80 bg-white shadow-soft"
        >
          <div className="aspect-[4/5] animate-pulse bg-stone-200" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/3 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-stone-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Empty result — filters cleared so the visitor isn't stuck on a blank page. */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="mt-10 rounded-card border border-dashed border-stone-300 bg-white px-6 py-16 text-center shadow-soft">
      <BagIcon className="mx-auto h-12 w-12 text-stone-300" />
      <p className="mt-4 text-base font-medium text-stone-700">محصولی یافت نشد</p>
      <p className="mt-1 text-sm text-stone-500">
        {hasFilters
          ? "با فیلترهای فعلی محصولی پیدا نشد؛ عبارت یا فیلتر دیگری را امتحان کنید."
          : "محصولی در این دسته ثبت نشده است."}
      </p>
      {hasFilters ? (
        <Link
          to="/shop"
          search={{ q: undefined, category: undefined, sort: undefined }}
          className="mt-6 inline-flex items-center justify-center rounded-pill bg-accent-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-800"
        >
          حذف فیلترها و مشاهده همه محصولات
        </Link>
      ) : null}
    </div>
  );
}

/** Fetch error — honest message + a retry button that re-runs the query. */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-10 rounded-card border border-dashed border-stone-300 bg-white px-6 py-16 text-center shadow-soft">
      <BagIcon className="mx-auto h-12 w-12 text-stone-300" />
      <p className="mt-4 text-base font-medium text-stone-700">خطایی در دریافت اطلاعات رخ داد</p>
      <p className="mt-1 text-sm text-stone-500">لطفاً دوباره تلاش کنید.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center justify-center rounded-pill bg-accent-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-800"
      >
        تلاش مجدد
      </button>
    </div>
  );
}

/** No active categories at all — nothing to show yet, with an honest message. */
function CategoriesEmptyState() {
  return (
    <div className="mt-10 rounded-card border border-dashed border-stone-300 bg-white px-6 py-16 text-center shadow-soft">
      <BagIcon className="mx-auto h-12 w-12 text-stone-300" />
      <p className="mt-4 text-base font-medium text-stone-700">دسته‌ای برای نمایش وجود ندارد</p>
      <p className="mt-1 text-sm text-stone-500">
        به‌محض افزودن دسته‌بندی‌ها، محصولات در اینجا نمایش داده می‌شوند.
      </p>
    </div>
  );
}

/**
 * Shop page — data-driven catalog listing. Search (?q=), category filter
 * (?category=<slug>) and sort (?sort=) all live in the URL, so every state is
 * shareable/bookmarkable. Data comes from getShopProducts in the data layer
 * (Supabase when connected, demo catalog otherwise). First paint comes from the
 * sync snapshot; Supabase data refreshes in after mount.
 */
function ShopPage() {
  const { q, category, sort } = useSearch({ from: "/shop" });
  const navigate = useNavigate();
  const { categories, loaded: categoriesLoaded } = useCategories();
  const { products, loaded, error, retry } = useShopProducts({
    search: q,
    categorySlug: category,
    sort,
  });

  // Search box is a local draft synced to the URL so typing never stutters;
  // every change also updates ?q= (replace, no history spam).
  const [draft, setDraft] = useState(q ?? "");
  useEffect(() => setDraft(q ?? ""), [q]);

  const search: ShopSearch = { q, category, sort };
  const hasFilters = Boolean(q || category);

  const apply = (patch: Partial<ShopSearch>, opts: { replace?: boolean } = {}) => {
    navigate({ to: "/shop", search: patchSearch(search, patch), replace: opts.replace });
  };

  return (
    <section className="py-10 sm:py-16">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">فروشگاه</h1>
            <p className="mt-2 text-sm text-stone-500">
              {loaded ? toFaDigits(products.length) : "…"} محصول
              {category ? " در این دسته" : ""}
            </p>
          </div>
        </div>

        {/* Search + sort */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <form
            className="sm:max-w-md sm:flex-1"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              apply({ q: draft });
            }}
          >
            <Input
              type="search"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                apply({ q: e.target.value }, { replace: true });
              }}
              placeholder="جستجوی محصولات…"
              aria-label="جستجوی محصولات"
              icon={<SearchIcon className="h-4 w-4" />}
            />
          </form>
          <div className="flex items-center gap-2">
            <label htmlFor="shop-sort" className="shrink-0 text-sm text-stone-500">
              مرتب‌سازی:
            </label>
            <select
              id="shop-sort"
              value={sort ?? "newest"}
              onChange={(e) => apply({ sort: (e.target.value || undefined) as SortMode | undefined })}
              className="h-11 cursor-pointer rounded-pill border border-stone-300 bg-white px-4 text-sm text-stone-700 outline-none transition-colors focus:border-accent-600 focus:ring-2 focus:ring-accent-600/20"
            >
              <option value="newest">جدیدترین</option>
              <option value="price-asc">ارزان‌ترین</option>
              <option value="price-desc">گران‌ترین</option>
            </select>
          </div>
        </div>

        {/* Category chips (hidden only while categories are still loading) */}
        {categoriesLoaded || categories.length > 0 ? (
          <nav
            aria-label="دسته‌بندی محصولات"
            className="mt-6 flex flex-wrap items-center gap-2 border-y border-stone-200/70 py-3"
          >
            <FilterChip search={search} slug={undefined} label="همه" active={!category} />
            {categories.map((c) => (
              <FilterChip
                key={c.id}
                search={search}
                slug={c.slug}
                label={c.name}
                active={category === c.slug}
              />
            ))}
          </nav>
        ) : null}

        {/* Body states: error → loading → categories-empty → products-empty → grid */}
        {error ? (
          <ErrorState onRetry={retry} />
        ) : !loaded ? (
          <SkeletonGrid />
        ) : categoriesLoaded && categories.length === 0 ? (
          <CategoriesEmptyState />
        ) : products.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}