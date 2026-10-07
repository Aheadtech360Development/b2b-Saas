/**
 * The shop's own header and footer, around a storefront page.
 *
 * This used to live in the root layout, which decided from the request path
 * whether to draw it. That is right for the first page of a visit and wrong
 * for every one after it: the root layout is shared by every route, and the
 * App Router keeps a shared layout mounted across client-side navigation
 * rather than re-rendering it. So the chrome drawn for the shop stayed on
 * screen when the same tab moved into the admin console — a storefront navbar
 * sitting above someone's dashboard, with no way for the layout to know the
 * route had changed.
 *
 * Rendered by the storefront's own segments now, so it mounts and unmounts
 * with them. The chrome is still built here, on the server, where the shop is
 * loaded — but whether to show it is decided by ShellGate, on the client, for
 * the same reason the problem above existed at all.
 */
import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import ShellGate from "@/components/storefront/ShellGate";
import { SiteHead, SitePart } from "@/components/builder/SiteParts";
import { loadBuilderChrome } from "@/lib/builder/load";
import { loadStore } from "@/lib/store";

export default async function StorefrontShell({
  children, footer,
}: {
  children: ReactNode;
  /** The app's own footer, for a shop that is not on the website builder. */
  footer?: ReactNode;
}) {
  const { brand } = await loadStore();

  // A shop live on the website builder wears the builder's header and footer
  // around every page, the app's own pages — cart, checkout, account —
  // included.
  const site = brand !== null ? await loadBuilderChrome() : null;
  if (site) {
    return (
      <ShellGate
        before={
          <>
            <SiteHead settings={site.settings} fonts={site.fonts} />
            <SitePart payload={site} part="announcement" />
            <SitePart payload={site} part="header" />
          </>
        }
        after={<SitePart payload={site} part="footer" />}
      >
        {children}
      </ShellGate>
    );
  }

  // Otherwise: a shop that has not gone live on the builder yet wears the
  // app's own header and footer, and the platform's own address is not a shop
  // at all — its page brings its own header, so adding the app's put two of
  // them on the screen.
  return (
    <ShellGate before={brand !== null ? <Header /> : null} after={footer}>
      {children}
    </ShellGate>
  );
}
