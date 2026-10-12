"use client";

/**
 * The Products place: its heading and the tabs across it, the same on every
 * screen that is one of them (like OrdersFrame for Orders). The sidebar shows
 * Products as one line; these tabs are how its screens are reached.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export type ProductsTab = "catalog" | "collections" | "categories" | "inventory" | "purchase-orders" | "suppliers" | "reviews" | "gang-sheets";

const TABS: { key: ProductsTab; label: string; href: string }[] = [
  { key: "catalog", label: "Catalog", href: "/admin/products" },
  { key: "collections", label: "Collections", href: "/admin/products/collections" },
  { key: "categories", label: "Categories", href: "/admin/products/categories" },
  { key: "inventory", label: "Inventory", href: "/admin/inventory" },
  { key: "purchase-orders", label: "Purchase orders", href: "/admin/purchase-orders" },
  { key: "suppliers", label: "Suppliers", href: "/admin/suppliers" },
  { key: "reviews", label: "Reviews", href: "/admin/products/reviews" },
  { key: "gang-sheets", label: "Gang sheet setup", href: "/admin/gang-sheets?tab=setup" },
];

export function ProductsFrame({
  active, count, actions, title = "Products", sub = "What you sell. Pick a type, set a price, publish.", children,
}: {
  active: ProductsTab;
  /** The screen's own name: Products, or the tab's (Inventory, Gang sheet setup). */
  title?: string;
  /** The catalog's own count, beside its tab. */
  count?: number | null;
  actions?: ReactNode;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="pc-page" data-products-frame={active}>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Products</div>
          <h1 className="pc-h1">{title}</h1>
          <p className="pc-sub-line">{sub}</p>
        </div>
        {actions && <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>{actions}</div>}
      </div>
      <nav className="pc-tabs" aria-label="Products">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} className="pc-tab" data-tab={t.key}
            data-on={active === t.key ? "" : undefined} aria-current={active === t.key ? "page" : undefined}>
            {t.label}
            {t.key === "catalog" && count != null && <span className="pc-tab-count">{count}</span>}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
