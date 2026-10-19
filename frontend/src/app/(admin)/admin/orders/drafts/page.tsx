"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { ask } from "@/lib/dialog";
import { OrdersFrame, useOrdersOverview } from "@/components/admin/orders/OrdersFrame";

interface DraftOrder {
  id: string;
  order_number: string;
  company_name: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  status: string;
  payment_status: string;
  po_number: string | null;
  total: string;
  item_count: number;
  created_at: string;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DraftOrdersPage() {
  // The address is read with useSearchParams, which wants a boundary above it.
  return <Suspense fallback={null}><Drafts /></Suspense>;
}

function Drafts() {
  const router = useRouter();
  const sp = useSearchParams();
  const { overview, refresh } = useOrdersOverview();
  const [orders, setOrders] = useState<DraftOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState("");

  // Orders are written in the New order wizard now. An old "?new=1" address
  // (with a customer named, from a customer's page) goes there.
  useEffect(() => {
    if (sp.get("new") !== "1") return;
    const company = sp.get("company");
    router.replace(company
      ? `/admin/orders/new?company=${company}&company_name=${encodeURIComponent(sp.get("company_name") ?? "")}`
      : "/admin/orders/new");
  }, [sp, router]);

  async function load() {
    setIsLoading(true);
    try {
      // Filtered by the server. Pulling a page of pending orders and sifting it
      // here meant a store with more pending orders than that page stopped
      // seeing its own drafts.
      const data = await apiClient.get<{ items: DraftOrder[]; total: number }>(
        "/api/v1/admin/orders?drafts_only=true&status=pending&page_size=200"
      );
      setOrders(data?.items ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as { message?: string })?.message || "Could not load drafts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleConvert(o: DraftOrder) {
    const yes = await ask(
      `Confirm draft ${o.order_number} for ${o.company_name ?? o.guest_name ?? "this guest"}? It becomes an order and the invoice for $${Number(o.total).toFixed(2)} is emailed to the customer.`,
      { title: "Confirm this draft", ok: "Confirm and send invoice" },
    );
    if (!yes) return;
    setBusyId(o.id);
    try {
      await apiClient.patch(`/api/v1/admin/orders/${o.id}`, { status: "confirmed" });
      // Read again rather than patch in place: a confirmed draft is no longer
      // pending, so the list should stop showing it as one.
      await load();
      refresh();
    } catch (e) {
      setLoadError((e as { message?: string })?.message || "Could not confirm this draft.");
    }
    setBusyId("");
  }

  return (
    <OrdersFrame active="drafts" overview={overview}>
      {loadError && <div className="pc-flash" data-bad="" role="status">{loadError}</div>}

      <div className="pc-card">
        <div className="pc-card-head">
          <div>
            <h2 className="pc-h2">Drafts</h2>
            <div className="pc-sub-line">Orders you are writing for a customer. Confirming one makes it an order and emails the invoice.</div>
          </div>
          <Link href="/admin/orders/new" className="pc-btn">New order</Link>
        </div>
        <div className="pc-scroll-x">
          <table className="pc-table" style={{ minWidth: "720px" }}>
            <thead>
              <tr><th>Draft</th><th>Customer</th><th>PO</th><th className="pc-num">Items</th><th className="pc-num">Total</th><th>Created</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {isLoading && orders.length === 0 && (
                <tr><td colSpan={7}><div className="at-skel" style={{ height: "18px", width: "60%", borderRadius: "6px" }} /></td></tr>
              )}
              {!isLoading && orders.length === 0 && (
                <tr><td colSpan={7} className="pc-empty">No drafts. Use &quot;New order&quot; to write one for a customer.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} data-draft={o.order_number}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    <Link href={`/admin/orders/${o.id}`} style={{ color: "inherit", textDecoration: "none" }}>{o.order_number}</Link>
                  </td>
                  <td>{o.company_name ?? o.guest_name ?? o.guest_email ?? "Guest"}</td>
                  <td style={{ color: "var(--pc-muted)" }}>{o.po_number ?? ""}</td>
                  <td className="pc-num">{o.item_count}</td>
                  <td className="pc-num" style={{ fontWeight: 600 }}>${Number(o.total).toFixed(2)}</td>
                  <td style={{ color: "var(--pc-muted)", whiteSpace: "nowrap" }}>{new Date(o.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="pc-row-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button type="button" className="pc-btn" style={{ height: "36px" }} disabled={busyId === o.id || o.item_count === 0}
                        title={o.item_count === 0 ? "Add a product to this draft first" : undefined} onClick={() => handleConvert(o)}>
                        {busyId === o.id ? "Confirming…" : "Confirm"}
                      </button>
                      <Link href={`/admin/orders/new?order=${o.id}&step=${o.item_count ? 3 : 2}`} className="pc-link" data-continue>Continue</Link>
                      <Link href={`/admin/orders/${o.id}`} className="pc-link">Open</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pc-table-foot"><span>{orders.length} {orders.length === 1 ? "draft" : "drafts"}</span></div>
      </div>
    </OrdersFrame>
  );
}
