import { headers } from "next/headers";
import { loadStore } from "@/lib/store";
import MarketingShell from "@/components/marketing/MarketingShell";
import { AuthWhereProvider } from "@/components/auth/AuthPage";
import a from "@/components/marketing/auth.module.css";

// Rendered per request, as these pages always were (this layout used to read
// the request's headers): whose address it is decides the frame, and sign-up
// reads its ?plan= in the browser.
export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const PLATFORM_DOMAIN = (process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost").toLowerCase();

/** The shop's logo and colour, for its buyers' sign-in screens to open in from
 *  the first paint (the browser asks for the same branding again afterwards). */
async function shopLook(): Promise<{ logo: string | null; primary: string | null }> {
  try {
    const { apiClient } = await import("@/lib/api-client");
    const b = await apiClient.get<{ logo_url?: string | null; primary_color?: string | null }>(
      "/api/v1/storefront/branding", { skipAuth: true },
    );
    const colour = (b?.primary_color ?? "").trim();
    return { logo: b?.logo_url || null, primary: HEX.test(colour) ? colour : null };
  } catch {
    return { logo: null, primary: null };
  }
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // A shop's own sign-in pages stay bare — the form and nothing else. They are
  // its buyers' pages (sign in, open an account, apply for wholesale, reset a
  // password), so the card wears the shop's logo, name and colour. The
  // platform's wear the marketing site's header, footer and look, so signing
  // in or up at printcopilot.co looks like the rest of printcopilot.co.
  //
  // Decided by the address, not the path: this layout is shared by every page
  // here and is not re-rendered when the App Router moves between them, so a
  // choice made from the path (sign-in with a frame, sign-up without) outlived
  // the page it was made for and drew two headers.
  //
  // The same answer is handed to the pages (AuthWhereProvider), so each card
  // shows whose page it is without working it out again from the host name.
  //
  // printcopilot.co is known by its address. A failed brand lookup on a shop's
  // address must not turn the shop's buyer pages into the platform's (they
  // would send the buyer to start a store); only on a local copy, which has no
  // platform address, does "no brand" mean the platform.
  const { brand } = await loadStore();
  const host = (((await headers()).get("host") ?? "").split(":")[0] ?? "").toLowerCase();
  const onPlatform = PLATFORM_DOMAIN !== "localhost"
    ? host === PLATFORM_DOMAIN || host === `www.${PLATFORM_DOMAIN}`
    : brand === null;
  if (!onPlatform) {
    const look = await shopLook();
    return (
      <AuthWhereProvider platform={false} shopName={brand} logo={look.logo} primary={look.primary}>
        {children}
      </AuthWhereProvider>
    );
  }

  return (
    <AuthWhereProvider platform shopName={null}>
      <MarketingShell>
        <div className={a.platformAuth}>{children}</div>
      </MarketingShell>
    </AuthWhereProvider>
  );
}
