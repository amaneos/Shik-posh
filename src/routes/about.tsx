import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "~/components/Badge";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [{ title: "درباره ما | فروشگاه پوشاک" }],
  }),
});

/**
 * Minimal neutral about page so the third header nav item has a real target.
 * Pure placeholder copy — no brand identity.
 */
function AboutPage() {
  return (
    <section className="py-16 sm:py-24">
      <Container className="text-center">
        <Badge variant="accent">درباره ما</Badge>
        <h1 className="mt-5 text-2xl font-bold text-stone-900 sm:text-3xl">
          درباره فروشگاه پوشاک
        </h1>
        <Card className="mx-auto mt-8 max-w-lg p-10 text-center">
          <p className="text-sm leading-8 text-stone-600">
            این صفحه به‌زودی با معرفی کامل فروشگاه تکمیل می‌شود.
          </p>
        </Card>
      </Container>
    </section>
  );
}