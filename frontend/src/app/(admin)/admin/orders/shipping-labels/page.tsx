"use client";

/**
 * Shipments: every order that has left, with its carrier, tracking and label.
 *
 * Read from the orders themselves. "In transit" is an order whose status is
 * shipped and "Delivered" one whose status is delivered: nothing is guessed
 * from how many days have passed, which is what this screen used to do.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ask, tell } from "@/lib/dialog";
import { OrdersFrame, useOrdersOverview } from "@/components/admin/orders/OrdersFrame";

interface Shipment {
  id: string;
  order_number: string;
  company_name: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  status: string;
  courier: string | null;
  courier_service: string | null;
  tracking_number: string | null;
  tracking_url?: string | null;
  label_url?: string | null;
  shipped_at: string | null;
  item_count: number;
}

const SHOW: [string, string][] = [["", "All"], ["shipped", "In transit"], ["delivered", "Delivered"]];

export default function ShipmentsPage() {
  const { overview, refresh } = useOrdersOverview();
  const [rows, setRows] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [show, setShow] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<{ items: Shipment[]; total: number }>(
        `/api/v1/admin/orders?queue=sent&page_size=200${show ? `&status=${show}` : ""}`,
      );
      setRows(data?.items ?? []);
      setTotal(data?.total ?? 0);
      setFailed(false);
    } catch {
      setRows([]); setTotal(0); setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  function openLabel(s: Shipment) {
    const url = s.label_url ?? "";
    if (!url) return;
    // A label kept on the order is served by the admin API, which needs the
    // admin's sign-in: a plain link cannot carry it.
    if (!url.startsWith("/api/")) { window.open(url, "_blank", "noopener"); return; }
    const win = window.open("", "_blank");
    apiClient.blob(url)
      .then((b) => {
        const obj = URL.createObjectURL(b);
        if (win) win.location.href = obj; else window.location.href = obj;
        setTimeout(() => URL.revokeObjectURL(obj), 60_000);
      })
      .catch((e) => { win?.close(); tell(e instanceof Error ? e.message : "The label could not be opened."); });
  }

  async function markDelivered(s: Shipment) {
    if (!await ask(`Mark order ${s.order_number} as delivered? The customer is emailed.`, { title: "Mark delivered", ok: "Mark delivered" })) return;
    setBusyId(s.id);
    try {
      await apiClient.patch(`/api/v1/admin/orders/${s.id}/status`, { status: "delivered" });
      await load();
      refresh();
    } catch (e) {
      await tell(e instanceof Error ? e.message : "That could not be saved.");
    }
    setBusyId("");
  }

  return (
    <OrdersFrame active="shipments" overview={overview}>
      <div className="pc-filters no-print" role="group" aria-label="Show">
        <div className="pc-seg">
          {SHOW.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="pc-card">
        <div className="pc-scroll-x">
          <table className="pc-table" style={{ minWidth: "820px" }}>
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Carrier</th><th>Tracking</th><th>Shipped</th><th>Status</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && <tr><td colSpan={7}><div className="at-skel" style={{ height: "18px", width: "60%", borderRadius: "6px" }} /></td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="pc-empty">
                  {failed ? "The shipments could not be loaded. Reload to try again." : "Nothing has shipped yet. An order shows here once it is marked shipped or a label is bought."}
                </td></tr>
              )}
              {rows.map((s) => (
                <tr key={s.id} data-shipment={s.order_number}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    <Link href={`/admin/orders/${s.id}`} style={{ color: "inherit", textDecoration: "none" }}>{s.order_number}</Link>
                  </td>
                  <td>{s.company_name || s.guest_name || s.guest_email || "Guest"}</td>
                  <td>{s.courier ? `${String(s.courier).toUpperCase()}${s.courier_service ? ` ${s.courier_service}` : ""}` : <span style={{ color: "var(--pc-faint)" }}>Not recorded</span>}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {s.tracking_number
                      ? (s.tracking_url ? <a href={s.tracking_url} target="_blank" rel="noopener noreferrer" className="pc-link" style={{ fontWeight: 500 }}>{s.tracking_number}</a> : s.tracking_number)
                      : <span style={{ color: "var(--pc-faint)" }}>None</span>}
                  </td>
                  <td style={{ color: "var(--pc-muted)", whiteSpace: "nowrap" }}>{s.shipped_at ? new Date(s.shipped_at).toLocaleDateString() : ""}</td>
                  <td><span className="pc-pill" data-tone={s.status === "delivered" ? "green" : "blue"} style={{ textTransform: "none" }}>{s.status === "delivered" ? "Delivered" : "In transit"}</span></td>
                  <td>
                    <div className="pc-row-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      {s.label_url && <button type="button" className="pc-link" onClick={() => openLabel(s)}>Label</button>}
                      {s.status === "shipped" && (
                        <button type="button" className="pc-btn" style={{ height: "36px" }} disabled={busyId === s.id} onClick={() => markDelivered(s)}>
                          {busyId === s.id ? "Saving…" : "Mark delivered"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pc-table-foot"><span>{total} {total === 1 ? "shipment" : "shipments"}</span></div>
      </div>
    </OrdersFrame>
  );
}
