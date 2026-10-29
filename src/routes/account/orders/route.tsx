/**
 * Passthrough layout for `/account/orders` — same reason as `account/route.tsx`:
 * the order list and the order detail are separate pages, so the list must not be
 * the detail's mounting ancestor (it would swallow the detail body). Renders only
 * the child route; the list page renders its own header and nav.
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account/orders")({
  component: AccountOrdersLayout,
});

function AccountOrdersLayout() {
  return <Outlet />;
}
