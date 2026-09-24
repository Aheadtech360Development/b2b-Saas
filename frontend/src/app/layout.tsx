// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import ThemeChrome, { ThemeChromeHead, loadStore } from "@/components/storefront/ThemeChrome";
import { Providers } from "@/components/providers/Providers";
import { Header } from "@/components/layout/Header";
import { PlatformHeader, PlatformFooter } from "@/components/platform/PlatformChrome";
import { DeployRefresh } from "@/components/providers/DeployRefresh";
import { AttributionTracker } from "@/components/analytics/AttributionTracker";
import { TrackingScripts } from "@/components/analytics/TrackingScripts";

/** What the browser tab says and shows.
 *
 *  Every shop wore the platform's own name and icon, because this was a fixed
 *  object. It is asked per request now: a brand's own site carries the brand's
 *  favicon and store name, and the platform's own address — and its console —
 *  stay the platform's.
 */
export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const platformPage = pathname === "/platform" || pathname.startsWith("/platform/");
  const store = platformPage ? null : await loadStore();

  if (store?.brand) {
    return {
      title: store.title || store.brand,
      description: `${store.brand} — order online.`,
      // Only when the brand has set one: a missing icon falls through to the
      // file in /public rather than to a broken image.
      icons: store.icon ? { icon: store.icon, shortcut: store.icon, apple: store.icon } : undefined,
    };
  }
  return {
    title: "PrintCopilot",
    description: "Commerce software for print shops.",
  };
}

/**
 * Pages that are not the shop: the consoles, the theme editor, and the bare
 * sign-in pages. Everywhere else is the storefront and wears the brand's own
 * header and footer.
 */
const NOT_STOREFRONT = [
  "/admin", "/platform", "/theme-editor", "/theme-preview", "/ui-preview", "/account",
  "/wholesale",
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Decided here, on the server, so a themed page is sent with the brand's
  // chrome already in it — rendering the app's and hiding it afterwards is the
  // flash of an old header people saw on every navigation.
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const storefront = !NOT_STOREFRONT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const store = storefront ? await loadStore() : { brand: null, chrome: null };
  const chrome = store.chrome;
  // Three cases, and only the middle one wants the app's own header: a themed
  // shop wears the brand's chrome, a shop with no theme yet wears the app's,
  // and the platform's own address is not a shop at all — its page brings its
  // own header, so adding the app's put two of them on the screen.
  const appHeader = storefront && store.brand !== null && chrome === null;
  // The platform's own pages. Its landing page and its sign-up flow draw their
  // own header, so only what is left — signing in, resetting a password —
  // needs one from here.
  const platformChrome =
    storefront && store.brand === null && pathname !== "/" && !pathname.startsWith("/signup");
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,300&family=DM+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Theme font pairings (chosen per brand in Storefront → Typography) */}
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=Lato:wght@400;700&family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600&family=Libre+Baskerville:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" style={{ fontFamily: "var(--font-jakarta)", background: "#FAFAFA", color: "var(--af-text)" }}>
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
          <Script
            id="google-maps"
            src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`}
            strategy="afterInteractive"
          />
        )}
        <Providers>
          <DeployRefresh />
          {/* Remembers which campaign brought this visitor, until they order. */}
          <AttributionTracker />
          {/* Loads only the tracking tools this brand connected, if any. */}
          <TrackingScripts />
          {appHeader && <Header />}
          {platformChrome && <PlatformHeader />}
          {/* The brand's own chrome, around every storefront page — the cart
              and the checkout included, which the theme has no page for. */}
          {chrome && <ThemeChromeHead chrome={chrome} />}
          {chrome && <ThemeChrome sections={chrome.top} />}
          {children}
          {chrome && <ThemeChrome sections={chrome.bottom} />}
          {platformChrome && <PlatformFooter />}
        </Providers>
      </body>
    </html>
  );
}
