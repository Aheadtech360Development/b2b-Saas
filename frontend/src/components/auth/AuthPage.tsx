"use client";

/**
 * The frame every sign-in screen is drawn in, as designed (PrintCoPilot Sign Up
 * and Onboarding, 2026-10-19): one card on a light band, with whose page it is
 * at the top of the card.
 *
 * On a shop that is the shop's logo and name, and the buttons and links wear
 * the shop's colour. On printcopilot.co it is the PrintCoPilot mark and the
 * platform blue. Which of the two is decided by the address, once, in the auth
 * layout (it already knows: a shop's pages are bare, the platform's sit inside
 * the marketing site's frame), and handed down here rather than guessed again
 * from the host name in each page.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Inter, Outfit } from "next/font/google";
import { useBranding } from "@/components/providers/BrandingProvider";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import ui from "./auth-page.module.css";

// The design's two faces, loaded with exactly the options the admin console
// loads them with (app/(admin)/layout.tsx), so both are one font module: the
// build refuses a second Outfit with other options beside it.
const sans = Inter({ subsets: ["latin"], variable: "--pc-font-sans", display: "swap" });
const display = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--pc-font-display", display: "swap" });

export { ui };

/** The design's two faces, for another screen drawn with the same parts (the onboarding wizard). */
export const authFonts = `${sans.variable} ${display.variable}`;

interface Where {
  /** printcopilot.co itself, not a shop. */
  platform: boolean;
  /** The shop's name, logo and colour as the server knew them when it drew the
   *  page, so a buyer's card opens in the shop's own look rather than showing a
   *  stand-in until the browser has asked for the shop's branding. */
  shopName: string | null;
  logo?: string | null;
  primary?: string | null;
}

const WhereContext = createContext<Where>({ platform: false, shopName: null });

export function AuthWhereProvider({ platform, shopName, logo = null, primary = null, children }: Where & { children: ReactNode }) {
  return <WhereContext.Provider value={{ platform, shopName, logo, primary }}>{children}</WhereContext.Provider>;
}

export const useAuthWhere = () => useContext(WhereContext);

/**
 * A page that belongs to one side only. A shop's buyers open an account or
 * apply for wholesale on the shop's address; a shop owner starts a store on
 * printcopilot.co. Opened on the other side (an old link, a typed address),
 * the visitor is sent to that side's own page instead of a form that would
 * make the wrong kind of account. True while the page is being left.
 */
export function useOnlyOn(side: "shop" | "platform", elsewhere: string): boolean {
  const { platform } = useAuthWhere();
  const router = useRouter();
  const wrong = side === "shop" ? platform : !platform;
  useEffect(() => {
    if (wrong) router.replace(elsewhere);
  }, [wrong, elsewhere, router]);
  return wrong;
}

/** The shop's logo and name, or its first letter in its colour when it has no logo. */
export function ShopMark() {
  const { shopName, logo } = useAuthWhere();
  const { logo_url, store_name } = useBranding();
  // "Store" is the stand-in before the shop's branding has loaded.
  const name = (store_name && store_name !== "Store" ? store_name : shopName) ?? "";
  const picture = logo_url || logo;
  return (
    <div className={ui.head}>
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- the shop's own logo, any host
        <img src={picture} alt="" className={ui.logo} />
      ) : name ? (
        <span className={ui.logoTile} aria-hidden>{name.trim().charAt(0).toUpperCase()}</span>
      ) : null}
      <span className={ui.name}>{name}</span>
    </div>
  );
}

export function PlatformMark() {
  // The logo printcopilot.co's header has: the mark alone, no name in text.
  return (
    <div className={ui.head}>
      <PlatformLogo size={36} />
    </div>
  );
}

export function AuthPage({
  title,
  sub,
  size = "narrow",
  children,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  /** "wide" is the wholesale application's card. */
  size?: "narrow" | "wide";
  children: ReactNode;
}) {
  const { platform, primary } = useAuthWhere();
  const width = size === "wide" ? ui.wide : platform ? ui.owner : "";
  // The shop's colour from the first paint (the theme sets the same variable on
  // the whole document once the browser has its branding).
  const look = !platform && primary ? ({ "--brand-primary": primary } as React.CSSProperties) : undefined;
  return (
    <div className={`${ui.page} ${platform ? ui.platform : ""} ${authFonts}`} style={look}>
      <div className={`${ui.card} ${width}`}>
        {platform ? <PlatformMark /> : <ShopMark />}
        {title ? <h1 className={ui.h1}>{title}</h1> : null}
        {sub ? <p className={ui.sub}>{sub}</p> : null}
        <div className={ui.body}>{children}</div>
      </div>
    </div>
  );
}

export default AuthPage;
