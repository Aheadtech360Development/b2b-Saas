"use client";

/**
 * Whether a page wears the shop around it, decided on the client.
 *
 * The layout above decided this from the request path, which is right for the
 * first page of a visit and wrong for every one after it: a shared layout is
 * not re-rendered when the App Router moves between routes. So opening the
 * gang sheet builder from a product page left the whole storefront standing
 * behind it — header, theme chrome, footer — and the builder came up short,
 * with the shop showing underneath. Reloading fixed it, because a reload is
 * the one case where the layout is built fresh.
 *
 * This reads the path the client is actually on, so it changes when the route
 * changes. Same reasoning as StorefrontShell itself: see its note.
 */
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Full-screen applications, not pages in a shop. */
const BARE = ["/gang-sheets"];

export function ShellGate({
  before, after, children,
}: {
  before?: ReactNode;
  after?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  if (BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }
  return (
    <>
      {before}
      <main>{children}</main>
      {after}
    </>
  );
}

export default ShellGate;
