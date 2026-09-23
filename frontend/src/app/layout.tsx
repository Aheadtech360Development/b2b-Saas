// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import ThemeChrome, { ThemeChromeHead, loadThemeChrome } from "@/components/storefront/ThemeChrome";
import { Providers } from "@/components/providers/Providers";
import { Header } from "@/components/layout/Header";
import { DeployRefresh } from "@/components/providers/DeployRefresh";
import { AttributionTracker } from "@/components/analytics/AttributionTracker";
import { TrackingScripts } from "@/components/analytics/TrackingScripts";

export const metadata: Metadata = {
  title: "Wholesale Store",
  description: "B2B wholesale storefront.",
};

/**
 * Pages that are not the shop: the consoles, the theme editor, and the bare
 * sign-in pages. Everywhere else is the storefront and wears the brand's own
 * header and footer.
 */
const NOT_STOREFRONT = [
  "/admin", "/platform", "/theme-editor", "/theme-preview", "/ui-preview", "/account",
  "/login", "/wholesale", "/forgot-password", "/reset-password", "/activate-account",
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
  const chrome = storefront ? await loadThemeChrome() : null;
  const themed = chrome !== null;
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
          {!themed && <Header />}
          {/* The brand's own chrome, around every storefront page — the cart
              and the checkout included, which the theme has no page for. */}
          {chrome && <ThemeChromeHead chrome={chrome} />}
          {chrome && <ThemeChrome sections={chrome.top} />}
          {children}
          {chrome && <ThemeChrome sections={chrome.bottom} />}
        </Providers>
      </body>
    </html>
  );
}
