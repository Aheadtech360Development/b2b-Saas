/**
 * printcopilot.co — the frame around every page of the platform's own site.
 *
 * Only ever drawn where there is no brand (see app/page.tsx and the platform
 * branch at the top of each marketing route), so a shop never sees any of it.
 * The header and footer are the design's, the same on every page; the page
 * passes which nav link is its own.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import s from "./marketing.module.css";
import MobileNav from "./MobileNav";

export type MarketingNav = "features" | "pricing" | "partners" | "about" | null;

const NAV: { key: Exclude<MarketingNav, null>; href: string; label: string }[] = [
  { key: "features", href: "/features", label: "Features" },
  { key: "pricing", href: "/pricing", label: "Pricing" },
  { key: "partners", href: "/affiliate", label: "Affiliate" },
  { key: "about", href: "/about", label: "About" },
];

export default function MarketingShell({ active = null, children }: { active?: MarketingNav; children: ReactNode }) {
  return (
    <div id="top" className={s.root}>
      {/* Inter and Outfit, the design's two faces. React hoists this into <head>. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap"
        precedence="default"
      />
      <MarketingHeader active={active} />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

function MarketingHeader({ active }: { active: MarketingNav }) {
  return (
    <header
      style={{
        position: "sticky",
        top: "0",
        zIndex: "50",
        background: "#0C1E35",
        borderBottom: "1px solid rgba(255,255,255,.1)",
      }}
    >
      <div
        className={s.bar}
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 32px",
          minHeight: "72px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
        }}
      >
        <Link href="/" className={s.logo} aria-label="PrintCoPilot home">
          {/* The navy header: the off-white wordmark. */}
          <PlatformLogo onDark width={210} className={s.wordmark} />
        </Link>
        <nav
          className={s["nav-links"]}
          aria-label="Main"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
            fontSize: "15px",
            fontWeight: "500",
            color: "rgba(255,255,255,.78)",
          }}
        >
          {NAV.map((n) => (
            <Link
              key={n.key}
              className={s["navlink"]}
              href={n.href}
              style={active === n.key ? { color: "#FFFFFF" } : undefined}
              aria-current={active === n.key ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* An empty ?tenant= signs in at the platform's address, not in whichever shop was browsed last. */}
          <Link
            className={`${s["navlink"]} ${s["nav-links"]}`}
            href="/login?tenant="
            style={{ fontSize: "15px", fontWeight: "500", color: "rgba(255,255,255,.78)", padding: "0 8px" }}
          >
            Log in
          </Link>
          <Link
            className={`${s["btn-ghost"]} ${s["hide-sm"]}`}
            href="/demo"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "44px",
              padding: "0 18px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,.28)",
              color: "#FFFFFF",
              fontSize: "15px",
              fontWeight: "600",
            }}
          >
            Book a demo
          </Link>
          <Link
            className={s["btn-primary"]}
            href="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "44px",
              padding: "0 18px",
              borderRadius: "8px",
              background: "#0B66E4",
              color: "#FFFFFF",
              fontSize: "15px",
              fontWeight: "600",
            }}
          >
            Start free trial
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

const FOOTER_COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/signup", label: "Start free trial" },
      { href: "/demo", label: "Book a demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/affiliate", label: "Affiliate and Partners" },
      // The partner programme itself (app/(partners)), linked from the old home page too.
      { href: "/partners", label: "Partner program" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy-policy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/cookie-policy", label: "Cookies" },
    ],
  },
];

function MarketingFooter() {
  return (
    <footer
      style={{ background: "#0C1E35", borderTop: "1px solid rgba(255,255,255,.1)", color: "rgba(255,255,255,.78)" }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "64px 32px 32px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "48px", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 280px", maxWidth: "360px" }}>
            {/* The navy footer: the off-white wordmark. */}
            <PlatformLogo onDark width={240} />
            <p style={{ marginTop: "12px", fontSize: "15px", lineHeight: "22px" }}>
              Commerce and production for print and apparel businesses.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "48px" }}>
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "15px" }}>
                <p
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "#FFFFFF",
                  }}
                >
                  {col.title}
                </p>
                {col.links.map((l) => (
                  <Link key={l.href} className={s["navlink"]} href={l.href}>
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p
          style={{
            marginTop: "48px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255,255,255,.1)",
            fontSize: "13px",
          }}
        >
          {new Date().getFullYear()} PrintCoPilot. Prices in USD.
        </p>
      </div>
    </footer>
  );
}
