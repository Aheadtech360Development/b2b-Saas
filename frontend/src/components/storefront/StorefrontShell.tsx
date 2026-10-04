/**
 * The brand's own header and footer, around a storefront page.
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
 * with them. The chrome is still built here, on the server, where the brand's
 * theme is loaded — but whether to show it is decided by ShellGate, on the
 * client, for the same reason the problem above existed at all.
 */
import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import ThemeChrome, { ThemeChromeHead, loadStore } from "@/components/storefront/ThemeChrome";
import ShellGate from "@/components/storefront/ShellGate";
import { SiteHead, SitePart } from "@/components/builder/SiteParts";
import { loadBuilderChrome } from "@/lib/builder/load";

export default async function StorefrontShell({
  children, footer,
}: {
  children: ReactNode;
  /** The app's own footer, when this shop has no theme of its own. */
  footer?: ReactNode;
}) {
  const { brand, chrome } = await loadStore();

  // A shop its owner has switched to the visual builder wears the builder's
  // header and footer around every page, the app's own pages included. Every
  // other shop — every shop that has not switched — gets null here and goes
  // on exactly as below.
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

  // Three cases, and only the middle one wants the app's own header: a themed
  // shop wears the brand's chrome, a shop with no theme yet wears the app's,
  // and the platform's own address is not a shop at all — its page brings its
  // own header, so adding the app's put two of them on the screen.
  const appHeader = brand !== null && chrome === null;

  return (
    <ShellGate
      before={
        <>
          {appHeader && <Header />}
          {chrome && <ThemeChromeHead chrome={chrome} />}
          {chrome && <ThemeChrome sections={chrome.top} />}
        </>
      }
      after={
        <>
          {chrome && <ThemeChrome sections={chrome.bottom} />}
          {footer}
        </>
      }
    >
      {children}
    </ShellGate>
  );
}
