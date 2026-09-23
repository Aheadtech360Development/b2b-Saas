// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
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
 * Whether this brand's storefront is drawn by its own theme. Decided here, on
 * the server, so a themed page is sent without the app's header at all — it
 * used to render and then hide itself, which is the flash of an old header
 * people saw on every navigation.
 */
async function storeIsThemed(): Promise<boolean> {
  try {
    const { apiClient } = await import("@/lib/api-client");
    const r = await apiClient.get<{ active: boolean }>("/api/v1/storefront/theme-active", { skipAuth: true });
    return Boolean(r?.active);
  } catch {
    return false;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themed = await storeIsThemed();
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
          {children}
        </Providers>
      </body>
    </html>
  );
}
