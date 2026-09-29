// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import { loadStore } from "@/components/storefront/ThemeChrome";
import { Providers } from "@/components/providers/Providers";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No storefront chrome is decided here any more. This layout is shared by
  // every route, and the App Router keeps a shared layout mounted across
  // client-side navigation instead of re-rendering it — so a header chosen
  // here for the shop stayed on screen when the same tab moved into the admin
  // console, and no amount of path-matching in this file could notice. Each
  // segment draws its own now: see components/storefront/StorefrontShell.
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
          {children}
        </Providers>
      </body>
    </html>
  );
}
