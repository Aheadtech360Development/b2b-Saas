"use client";

/**
 * The partner portal's frame, as the design draws it: the navy rail on the
 * left, the bar on top, and on a phone a tab bar at the bottom instead of the
 * rail. It also holds the session: no token and no cookie that renews one
 * sends the partner to sign in, and an ended session says so there.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import {
  PartnerApiError, hasPartnerToken, initials, isViewingAs, papi, renewPartnerSession, setPartnerToken,
} from "@/lib/partnerApi";
import { Banner, Icon, ROOT, Skeleton, type IconName } from "./ui";
import { PlatformLogo } from "@/components/shared/PlatformLogo";

export type Partner = {
  id: string; name: string; email: string; business_name: string | null; website: string | null;
  code: string; link: string; status: "active" | "paused" | "suspended" | "terminated";
  rate_bps: number; rate: string; rate_from: "plan" | "override"; rate_plan: string | null;
  custom_rate_ends_on: string | null; terms_version: number | null; terms_latest: number | null;
  two_factor_enabled: boolean; payout_method: "paypal" | "wise" | "bank" | null; payout_account: string | null;
  has_w9: boolean; w9_uploaded_at: string | null; email_prefs: Record<string, boolean>; joined: string; read_only: boolean;
  support_email: string | null; accepting_referrals: boolean;
};

type Session = { partner: Partner; reload: () => Promise<void>; signOut: () => Promise<void> };

const SessionContext = createContext<Session | null>(null);

export function usePartner(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("usePartner outside the partner portal");
  return s;
}

const NAV: { href: string; label: string; icon: IconName; tab?: string }[] = [
  { href: "/partners/dashboard", label: "Dashboard", icon: "home", tab: "Home" },
  { href: "/partners/link", label: "Link and assets", icon: "link", tab: "Link" },
  { href: "/partners/referrals", label: "Referrals", icon: "users", tab: "Shops" },
  { href: "/partners/earnings", label: "Earnings", icon: "dollar", tab: "Earnings" },
  { href: "/partners/payouts", label: "Payouts", icon: "wallet" },
  { href: "/partners/settings", label: "Profile and settings", icon: "user", tab: "More" },
  { href: "/partners/terms", label: "Terms", icon: "file" },
];

export function PartnerShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/partners/dashboard";
  const [partner, setPartner] = useState<Partner | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const toLogin = useCallback((reason?: string) => {
    const q = new URLSearchParams({ next: pathname });
    if (reason) q.set(reason, "1");
    router.replace(`/partners/login?${q.toString()}`);
  }, [pathname, router]);

  const reload = useCallback(async () => {
    if (!hasPartnerToken() && !(await renewPartnerSession())) {
      toLogin();
      return;
    }
    try {
      setPartner(await papi<Partner>("/partners/me"));
    } catch (e) {
      if (e instanceof PartnerApiError && (e.status === 401 || e.status === 403)) {
        if (isViewingAs()) setFailed("The view as this affiliate has ended. Open it again from the Affiliates tab.");
        else toLogin("ended");
      } else {
        setFailed(e instanceof Error ? e.message : "The portal could not load.");
      }
    }
  }, [toLogin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const signOut = useCallback(async () => {
    try {
      await papi("/partners/auth/logout", { method: "POST", auth: false });
    } catch {
      // signing out still happens on this side
    }
    setPartnerToken(null);
    router.replace("/partners/login?signed_out=1");
  }, [router]);

  if (failed) {
    return (
      <div className={ROOT} style={{ minHeight: "100vh" }}>
        <div className="content" style={{ margin: "0 auto" }}>
          <Banner tone="bad">{failed}</Banner>
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className={ROOT}>
        <div className="app">
          <nav className="rail" aria-hidden="true"><div className="brand"><PlatformLogo onDark /></div></nav>
          <div className="main">
            <header className="top" />
            <div className="content">
              <Skeleton h={34} w={240} />
              <div className="g4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={110} />)}</div>
              <Skeleton h={260} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <SessionContext.Provider value={{ partner, reload, signOut }}>
      <div className={ROOT}>
        <div className="app">
          <nav className="rail" aria-label="Partner portal">
            <div className="brand"><PlatformLogo onDark /><span style={{ fontWeight: 500, color: "#8FA3BD" }}>Partners</span></div>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={isOn(n.href) ? "on" : ""} aria-current={isOn(n.href) ? "page" : undefined}>
                <Icon name={n.icon} />{n.label}
              </Link>
            ))}
            <div className="gap" />
            {!partner.read_only ? (
              <a href="#sign-out" onClick={(e) => { e.preventDefault(); void signOut(); }}>
                <Icon name="logout" />Sign out
              </a>
            ) : null}
          </nav>
          <div className="main">
            <header className="top">
              <span className="brand-m"><PlatformLogo /><span>Partners</span></span>
              <div className="sp" />
              <span className="av" aria-hidden="true">{initials(partner.name)}</span>
              <span className="b ink hide-m">{partner.name}</span>
            </header>
            {partner.read_only || partner.status === "paused" ? <div className="content" style={{ paddingBottom: 0 }}>
              {partner.read_only ? (
                <Banner icon="eye" action={<button className="btn sm" onClick={() => window.close()}>Close</button>}>
                  <b>Viewing as {partner.name}.</b> Read only: this is what the affiliate sees.
                </Banner>
              ) : null}
              {partner.status === "paused" ? (
                <Banner tone="warn" icon="pause" action={partner.support_email
                  ? <a className="btn sm" href={`mailto:${partner.support_email}`}>Contact us</a> : undefined}>
                  <b>Paused.</b> Your account is paused. Your link is not tracking new shops. Shops you already
                  referred keep earning for you.
                </Banner>
              ) : null}
            </div> : null}
            <main className="content">{children}</main>
            <nav className="tabbar" aria-label="Partner portal">
              {NAV.filter((n) => n.tab).map((n) => (
                <Link key={n.href} href={n.href} className={isOn(n.href) ? "on" : ""}>
                  <Icon name={n.icon} />{n.tab}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
