"use client";

/**
 * The Marketing place: its heading and the tabs across it, the same on every
 * screen that is one of them (like ProductsFrame for Products). The sidebar
 * shows Marketing as one line; these tabs are how its screens are reached.
 * Reviews came from Products, Segments from Customers and Tracking from
 * Settings: each is used to win or keep buyers.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export type MarketingTab = "discounts" | "gift-cards" | "abandoned-carts" | "reviews" | "segments" | "tracking";

const TABS: { key: MarketingTab; label: string; href: string }[] = [
  { key: "discounts", label: "Discounts", href: "/admin/discounts" },
  { key: "gift-cards", label: "Gift cards", href: "/admin/gift-cards" },
  { key: "abandoned-carts", label: "Abandoned carts", href: "/admin/abandoned-carts" },
  { key: "reviews", label: "Reviews", href: "/admin/products/reviews" },
  { key: "segments", label: "Segments", href: "/admin/customers/segments" },
  { key: "tracking", label: "Tracking", href: "/admin/settings/tracking" },
];

export function MarketingFrame({
  active, title, sub, actions, children,
}: {
  active: MarketingTab;
  /** The screen's own name: Discounts, Reviews… */
  title: string;
  sub: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="pc-page" data-marketing-frame={active}>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Marketing</div>
          <h1 className="pc-h1">{title}</h1>
          <p className="pc-sub-line">{sub}</p>
        </div>
        {actions && <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>{actions}</div>}
      </div>
      <nav className="pc-tabs" aria-label="Marketing">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} className="pc-tab" data-tab={t.key}
            data-on={active === t.key ? "" : undefined} aria-current={active === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
