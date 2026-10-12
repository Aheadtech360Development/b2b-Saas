"use client";

/**
 * The Customers place: its heading and the tabs across it, the same on every
 * screen that is one of them (like OrdersFrame and ProductsFrame). The sidebar
 * shows Customers as one line.
 *
 * All, Retail, Wholesale and Guest are the list, filtered; Applications and
 * Pricing tiers are screens of their own. The numbers come from the same rows
 * the list shows (GET /admin/customers/overview).
 */
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { customersService, type CustomersOverview } from "@/services/customers.service";

export type CustomersTab = "all" | "retail" | "wholesale" | "guest" | "applications" | "tiers";

const TABS: { key: CustomersTab; label: string; href: string }[] = [
  { key: "all", label: "All", href: "/admin/customers" },
  { key: "retail", label: "Retail", href: "/admin/customers?type=retail" },
  { key: "wholesale", label: "Wholesale", href: "/admin/customers?type=wholesale" },
  { key: "guest", label: "Guest", href: "/admin/customers?type=guest" },
  { key: "applications", label: "Applications", href: "/admin/customers/applications" },
  { key: "tiers", label: "Pricing tiers", href: "/admin/customers/tiers" },
];

/** The tabs' numbers and what the plan includes, with a way to ask again. */
export function useCustomersOverview(): { overview: CustomersOverview | null; refresh: () => void } {
  const [overview, setOverview] = useState<CustomersOverview | null>(null);
  const refresh = useCallback(() => {
    customersService.overview().then(setOverview).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { overview, refresh };
}

export function CustomersFrame({
  active, overview, title = "Customers", sub = "Everyone who buys from you, retail, wholesale and guest.",
  actions, children,
}: {
  active: CustomersTab;
  overview: CustomersOverview | null;
  title?: string;
  sub?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const counts = overview?.counts;
  const count = (key: CustomersTab): number | null => {
    if (!overview) return null;
    if (key === "applications") return overview.features.wholesale_accounts ? overview.applications_pending || null : null;
    if (key === "tiers") return null;
    return counts?.[key] ?? 0;
  };
  return (
    <div className="pc-page" data-customers-frame={active}>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Customers</div>
          <h1 className="pc-h1">{title}</h1>
          <p className="pc-sub-line">{sub}</p>
        </div>
        {actions && <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>{actions}</div>}
      </div>
      <nav className="pc-tabs" aria-label="Customers">
        {TABS.map((t) => {
          const n = count(t.key);
          return (
            <Link key={t.key} href={t.href} className="pc-tab" data-tab={t.key} scroll={false}
              data-on={active === t.key ? "" : undefined} aria-current={active === t.key ? "page" : undefined}>
              {t.label}
              {n != null && <span className="pc-tab-count">{n}</span>}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

/** What a locked part says: which plan has it, and where to see the plans. */
export function PlanLock({ title, blurb, cta = "See plans" }: { title: string; blurb: string; cta?: string }) {
  return (
    <div className="pc-lock" data-plan-lock>
      <span className="pc-lock-icon" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <h3 className="pc-lock-title">{title}</h3>
      <p className="pc-lock-blurb">{blurb}</p>
      <Link href="/admin/billing" className="pc-btn" data-kind="primary">{cta}</Link>
    </div>
  );
}
