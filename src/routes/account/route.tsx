/**
 * Layout for the account area (`/account`, `/account/orders`, …).
 *
 * In TanStack Router a matched ancestor that does not render <Outlet/> stops its
 * descendants from mounting: the body stayed on this ancestor's page while the
 * document head came from the deepest match, so titles looked right and bodies
 * were wrong (order tracking rendered the profile page). This directory layout
 * exists only to render the child route — the account pages already render their
 * own <Container>/<h1>/<AccountNav>, so adding chrome here would duplicate it.
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account")({
  component: AccountLayout,
});

function AccountLayout() {
  return <Outlet />;
}
