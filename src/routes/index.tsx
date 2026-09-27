import { Link, createFileRoute } from "@tanstack/react-router";

import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { ProductCard } from "~/components/ProductCard";
import { ArrowIcon, BagIcon } from "~/components/icons";
import { useCatalog, type Category } from "~/lib/data";
import { useStoreSettings } from "~/lib/store-settings";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [{ title: "فروشگاه پوشاک | فروشگاه اینترنتی پوشاک" }],
  }),
});

function SectionHeading({
  title,
  actionLabel,
  actionTo,
}: {
  title: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h2 className="text-xl font-bold text-stone-900 sm:text-2xl">{title}</h2>
      {actionLabel && actionTo ? (
        <Link
          to={actionTo}
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-700 transition-colors hover:text-accent-900"
        >
          {actionLabel}
          <ArrowIcon className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function Hero() {
  const settings = useStoreSettings();
  return (
    <section className="overflow-hidden border-b border-stone-200/60 bg-gradient-to-b from-stone-100 to-stone-50">
      <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-2 lg:py-24">
        <div>
          <Badge variant="accent">{settings.storeName}</Badge>
          <h1 className="mt-5 text-hero text-stone-900 sm:text-5xl">
            شیک و ساده،
            <br />
            برای هر روز
          </h1>
          <p className="mt-5 max-w-md text-base leading-8 text-stone-600">
            مجموعه‌ای از پوشاک باکیفیت و مینیمال — از تی‌شرت کلاسیک تا پالتوی
            زمستانه — تا استایل روزمره شما همیشه مرتب باشد.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to="/shop" size="lg">
              مشاهده فروشگاه
            </Button>
            <Button to="/about" variant="secondary" size="lg">
              درباره ما
            </Button>
          </div>
        </div>
        <div className="relative hidden lg:block">
          <div className="absolute -inset-4 -rotate-2 rounded-card bg-accent-700/10" />
          <img
            src="/images/product-coat.svg"
            alt=""
            loading="lazy"
            className="relative w-full rotate-1 rounded-card border border-stone-200/80 bg-white shadow-lift"
          />
        </div>
      </Container>
    </section>
  );
}

function CategoriesSection({ categories }: { categories: Category[] }) {
  return (
    <section className="py-14 sm:py-18">
      <Container>
        <SectionHeading title="دسته‌بندی‌ها" actionLabel="مشاهده همه" actionTo="/shop" />
        {categories.length === 0 ? (
          <EmptyState text="هنوز دسته‌بندی‌ای ثبت نشده است." />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                to="/shop"
                search={{ category: category.slug }}
                className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
              >
                <Card className="overflow-hidden transition-shadow duration-300 group-hover:shadow-lift">
                  <div className="aspect-[4/5] overflow-hidden bg-stone-100">
                    {category.image ? (
                      <img
                        src={category.image}
                        alt={category.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-stone-300">
                        <BagIcon className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-4">
                    <h3 className="font-semibold text-stone-900">{category.name}</h3>
                    <ArrowIcon className="h-4 w-4 text-stone-400 transition-transform duration-300 group-hover:-translate-x-1" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}

function ProductsSection({ products }: { products: ReturnType<typeof useCatalog>["products"] }) {
  return (
    <section className="py-14 sm:py-18">
      <Container>
        <SectionHeading title="منتخب محصولات" actionLabel="مشاهده همه" actionTo="/shop" />
        {products.length === 0 ? (
          <EmptyState text="هنوز محصولی ثبت نشده است." />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="p-10 text-center">
      <BagIcon className="mx-auto h-10 w-10 text-stone-300" />
      <p className="mt-4 text-sm text-stone-500">{text}</p>
    </Card>
  );
}

function Home() {
  const { categories, products } = useCatalog();
  return (
    <>
      <Hero />
      <CategoriesSection categories={categories} />
      <ProductsSection products={products} />
    </>
  );
}