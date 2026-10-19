"use client";

/**
 * The Settings place: its heading and the list down its left side, the same
 * on every screen that is one of them. The sidebar shows Settings as one line;
 * this list is how its screens are reached. A screen somebody's role cannot
 * open is left off the list.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { hasScope, type Scope } from "@/lib/permissions";

export type SettingsKey =
  | "store" | "markets" | "shipping" | "taxes" | "billing" | "notifications" | "domain" | "team" | "audit" | "account";

const ITEMS: { key: SettingsKey; label: string; href: string; scopes?: Scope[] }[] = [
  { key: "store", label: "Store details", href: "/admin/settings", scopes: ["settings"] },
  { key: "markets", label: "Markets", href: "/admin/settings/markets", scopes: ["settings"] },
  { key: "shipping", label: "Shipping and pickup", href: "/admin/standard-shipping", scopes: ["settings"] },
  { key: "taxes", label: "Taxes", href: "/admin/settings/taxes", scopes: ["settings"] },
  { key: "billing", label: "Payments and billing", href: "/admin/billing", scopes: ["billing", "payouts"] },
  { key: "notifications", label: "Notifications", href: "/admin/settings/notifications", scopes: ["settings"] },
  { key: "domain", label: "Domain and email", href: "/admin/settings/domain", scopes: ["settings"] },
  { key: "team", label: "Team and roles", href: "/admin/users", scopes: ["staff"] },
  { key: "audit", label: "Audit log", href: "/admin/settings/audit-log", scopes: ["audit"] },
  // Everybody has an account of their own.
  { key: "account", label: "My account", href: "/admin/settings/security" },
];

export function SettingsFrame({
  active, title, sub, actions, children,
}: {
  active: SettingsKey;
  title: string;
  sub: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user } = useAuthStore();
  const shown = ITEMS.filter((i) => !i.scopes || i.scopes.some((s) => hasScope(user?.role, s, user?.scopes)));
  return (
    <div className="pc-page" data-settings-frame={active}>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Settings</div>
          <h1 className="pc-h1">{title}</h1>
          <p className="pc-sub-line">{sub}</p>
        </div>
        {actions && <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>{actions}</div>}
      </div>
      <div className="pc-settings">
        <nav className="pc-setnav" aria-label="Settings">
          {shown.map((i) => (
            <Link key={i.key} href={i.href} data-on={active === i.key ? "" : undefined} aria-current={active === i.key ? "page" : undefined}>{i.label}</Link>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
