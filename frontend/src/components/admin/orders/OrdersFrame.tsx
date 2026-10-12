"use client";

/**
 * The top of every Orders screen: its heading, its two buttons and its tabs.
 *
 * The tabs are the screens that used to hang under Orders in the sidebar
 * (drafts, returns, shipping labels) with the order list's own queues in front
 * of them. A tab's number is counted on the server from the same queue the tab
 * lists, so the number is the number of rows under it.
 */
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { apiClient } from "@/lib/api-client";

export interface OrdersOverview {
  tabs: Record<string, number>;
  /** The carriers a label can be bought from. Empty: none is connected. */
  carriers: string[];
}

export type OrdersTab = "all" | "new" | "to_ship" | "ready_for_pickup" | "drafts" | "returns" | "shipments";

const TABS: { key: OrdersTab; label: string; href: string; count: string | null; always?: boolean }[] = [
  { key: "all", label: "All", href: "/admin/orders", count: "all", always: true },
  { key: "new", label: "To confirm", href: "/admin/orders?queue=new", count: "new", always: true },
  { key: "to_ship", label: "To ship", href: "/admin/orders?queue=to_ship", count: "to_ship", always: true },
  { key: "ready_for_pickup", label: "Ready for pickup", href: "/admin/orders?queue=ready_for_pickup", count: "ready_for_pickup", always: true },
  { key: "drafts", label: "Drafts", href: "/admin/orders/drafts", count: "drafts" },
  { key: "returns", label: "Returns and reprints", href: "/admin/returns", count: "returns" },
  { key: "shipments", label: "Shipments", href: "/admin/orders/shipping-labels", count: null },
];

/** The tab counts and the connected carriers, with a way to ask again after
 *  something on the page changed them. */
export function useOrdersOverview(): { overview: OrdersOverview | null; refresh: () => void } {
  const [overview, setOverview] = useState<OrdersOverview | null>(null);
  const refresh = useCallback(() => {
    apiClient.get<OrdersOverview>("/api/v1/admin/orders/overview").then(setOverview).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { overview, refresh };
}

export function OrdersFrame({
  active, overview, actions, children,
}: {
  active: OrdersTab;
  overview: OrdersOverview | null;
  /** Buttons before "New order", e.g. Export on the list. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="pc-page" style={{ maxWidth: "1240px" }}>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Orders</div>
          <h1 className="pc-h1">Orders</h1>
          <p className="pc-lede">Confirm, print and ship from one list.</p>
        </div>
        <div className="pc-row-actions no-print">
          {actions}
          <Link href="/admin/orders/drafts?new=1" className="pc-btn" data-kind="primary">
            <Plus size={17} strokeWidth={2.4} /> New order
          </Link>
        </div>
      </div>

      <nav className="pc-tabs no-print" aria-label="Orders">
        {TABS.map((t) => {
          const n = t.count ? overview?.tabs?.[t.count] : undefined;
          const show = n != null && (t.always || n > 0);
          return (
            <Link key={t.key} href={t.href} className="pc-tab" data-on={t.key === active ? "" : undefined}
              aria-current={t.key === active ? "page" : undefined} data-tab={t.key}>
              {t.label}
              {show && <span className="pc-tab-count">{n}</span>}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
