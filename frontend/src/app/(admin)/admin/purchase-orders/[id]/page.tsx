"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient, ApiClientError } from "@/lib/api-client";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:     { bg: "#F3F4F6", color: "#6B7280" },
  sent:      { bg: "#DBEAFE", color: "#1D4ED8" },
  partial:   { bg: "#FEF3C7", color: "#D97706" },
  received:  { bg: "#D1FAE5", color: "#065F46" },
  closed:    { bg: "#1B3A5C", color: "#fff" },
  cancelled: { bg: "#FEE2E2", color: "#991B1B" },
};

interface LineItem {
  id: string;
  product_name: string | null;
  variant_sku: string | null;
  variant_color: string | null;
  variant_size: string | null;
  new_product_name: string | null;
  new_product_sku: string | null;
  new_product_color: string | null;
  new_product_size: string | null;
  qty_ordered: number;
  unit_cost_expected: number;
  total_expected: number;
}

interface ReceivingItem {
  id: string;
  po_line_item_id: string | null;
  qty_received: number;
  unit_cost_actual: number;
  total_actual: number;
}

interface Receiving {
  id: string;
  received_date: string | null;
  notes: string | null;
  qb_bill_id: string | null;
  qb_synced: boolean;
  created_at: string | null;
  items: ReceivingItem[];
}

interface PO {
  id: string;
  po_number: string;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  status: string;
  order_date: string | null;
  expected_delivery: string | null;
  notes: string | null;
  total_expected: number;
  total_received: number;
  qb_synced: boolean;
  qb_po_id: string | null;
  qb_bill_id: string | null;
  created_at: string | null;
  line_items: LineItem[];
  receivings: Receiving[];
}

function fmt(n: number) {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  async function load() {
    const data = await apiClient.get<PO>(`/api/v1/admin/purchase-orders/${id}`);
    setPo(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function handleSendEmail() {
    if (!window.confirm(`Send PO email to ${po?.manufacturer_name || "manufacturer"}?`)) return;
    setEmailSending(true);
    try {
      await apiClient.post(`/api/v1/admin/purchase-orders/${id}/send-email`);
      alert("Email sent to manufacturer!");
      await load();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  async function markSent() {
    if (!window.confirm("Mark this PO as Sent? This cannot be undone.")) return;
    setUpdatingStatus(true);
    try {
      await apiClient.post(`/api/v1/admin/purchase-orders/${id}/mark-sent`);
      await load();
      alert("PO marked as sent.");
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function syncQB() {
    setSyncing(true);
    try {
      const data = await apiClient.post<{ qb_id: string }>(`/api/v1/admin/purchase-orders/${id}/sync-qb`);
      alert(`QB Purchase Order created! ID: ${data.qb_id}`);
      await load();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "QB sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <div style={{ padding: "32px", color: "#9CA3AF" }}>Loading…</div>;
  if (!po) return <div style={{ padding: "32px", color: "#EF4444" }}>PO not found.</div>;

  const sc = STATUS_COLORS[po.status] ?? STATUS_COLORS.draft!;
  const canReceive = !["closed", "cancelled"].includes(po.status);

  return (
    <div style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: "13px", marginBottom: "8px" }}>← Back</button>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1B3A5C" }}>{po.po_number}</h1>
            <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: sc.bg, color: sc.color, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {po.status}
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>
            {po.manufacturer_name} {po.expected_delivery ? `· Expected ${new Date(po.expected_delivery).toLocaleDateString()}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {po.status === "draft" && (
            <>
              <button onClick={handleSendEmail} disabled={emailSending} style={{ padding: "9px 18px", borderRadius: "8px", background: "#1D4ED8", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                {emailSending ? "Sending…" : "Send Email to Manufacturer"}
              </button>
              <button onClick={markSent} disabled={updatingStatus} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #D1D5DB", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#374151" }}>
                Mark as Sent
              </button>
            </>
          )}
          {/* QB button: Sync to QB (draft/sent) OR View in QB (after receive) */}
          {["draft", "sent"].includes(po.status) ? (
            <button onClick={syncQB} disabled={syncing}
              style={{ padding: "9px 18px", borderRadius: "8px", background: "#1D4ED8", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              {syncing ? "Syncing…" : po.qb_po_id ? "Re-sync to QB" : "Sync to QB"}
            </button>
          ) : (po.qb_bill_id || po.qb_po_id) ? (
            <a
              href={po.qb_bill_id
                ? `https://app.qbo.intuit.com/app/bill?txnId=${po.qb_bill_id}`
                : `https://app.qbo.intuit.com/app/purchaseorder?txnId=${po.qb_po_id}`}
              target="_blank" rel="noopener noreferrer"
              style={{ padding: "9px 18px", borderRadius: "8px", background: "#059669", color: "#fff", textDecoration: "none", fontSize: "13px", fontWeight: 600 }}>
              View in QB ↗
            </a>
          ) : null}
          {canReceive && (
            <Link href={`/admin/purchase-orders/${po.id}/receive`} style={{ padding: "9px 18px", borderRadius: "8px", background: "#059669", color: "#fff", textDecoration: "none", fontSize: "13px", fontWeight: 600 }}>
              Receive Items
            </Link>
          )}
        </div>
      </div>

      {/* PO Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "28px" }}>
        {[
          { label: "Order Date", value: po.order_date ? new Date(po.order_date).toLocaleDateString() : new Date().toLocaleDateString() },
          { label: "Expected Delivery", value: po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : "—" },
          { label: "Total Expected", value: fmt(po.total_expected) },
          { label: "Total Received", value: fmt(po.total_received) },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "16px" }}>
            <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".07em" }}>{c.label}</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B3A5C" }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* QB Sync Status */}
      {(po.qb_po_id || po.qb_bill_id) && (
        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "8px", padding: "14px 18px", marginBottom: "24px", fontSize: "13px", color: "#1D4ED8" }}>
          <strong>QuickBooks:</strong>{" "}
          {po.qb_po_id && <span>PO ID: {po.qb_po_id} </span>}
          {po.qb_bill_id && <span>Bill ID: {po.qb_bill_id}</span>}
        </div>
      )}

      {/* Notes */}
      {po.notes && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", padding: "14px 18px", marginBottom: "24px", fontSize: "13px", color: "#92400E" }}>
          <strong>Notes:</strong> {po.notes}
        </div>
      )}

      {/* Line Items */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", overflow: "hidden", marginBottom: "28px" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: "14px", color: "#1B3A5C" }}>
          Line Items ({po.line_items.length})
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["PRODUCT", "SKU", "COLOR", "SIZE", "QTY ORDERED", "UNIT COST", "TOTAL EXPECTED"].map(h => (
                <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".07em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {po.line_items.map(li => (
              <tr key={li.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "13px 16px", fontSize: "13px", fontWeight: 500 }}>{li.product_name || li.new_product_name || "—"}</td>
                <td style={{ padding: "13px 16px", fontSize: "12px", color: "#6B7280", fontFamily: "monospace" }}>{li.new_product_sku || li.variant_sku || "—"}</td>
                <td style={{ padding: "13px 16px", fontSize: "13px" }}>{li.new_product_color || li.variant_color || "—"}</td>
                <td style={{ padding: "13px 16px", fontSize: "13px" }}>{li.new_product_size || li.variant_size || "—"}</td>
                <td style={{ padding: "13px 16px", fontSize: "13px" }}>{li.qty_ordered}</td>
                <td style={{ padding: "13px 16px", fontSize: "13px" }}>{fmt(li.unit_cost_expected)}</td>
                <td style={{ padding: "13px 16px", fontSize: "13px", fontWeight: 600 }}>{fmt(li.total_expected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Receivings */}
      {po.receivings.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: "14px", color: "#1B3A5C" }}>
            Receivings ({po.receivings.length})
          </div>
          {po.receivings.map((r, idx) => (
            <div key={r.id} style={{ padding: "16px 20px", borderBottom: idx < po.receivings.length - 1 ? "1px solid #F3F4F6" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>
                    Received {r.received_date ? new Date(r.received_date).toLocaleDateString() : "—"}
                  </span>
                  {r.notes && <span style={{ color: "#6B7280", fontSize: "12px", marginLeft: "12px" }}>{r.notes}</span>}
                </div>
                {r.qb_synced && <span style={{ fontSize: "11px", color: "#1D4ED8", fontWeight: 600 }}>QB Synced</span>}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["LINE ITEM", "QTY RECEIVED", "UNIT COST", "TOTAL"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#9CA3AF", letterSpacing: ".07em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.items.map(ri => {
                    const li = po.line_items.find(l => l.id === ri.po_line_item_id);
                    return (
                      <tr key={ri.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "9px 12px", fontSize: "12px" }}>{li ? (li.new_product_name || `${li.variant_color} / ${li.variant_size}`) : "—"}</td>
                        <td style={{ padding: "9px 12px", fontSize: "12px" }}>{ri.qty_received}</td>
                        <td style={{ padding: "9px 12px", fontSize: "12px" }}>{fmt(ri.unit_cost_actual)}</td>
                        <td style={{ padding: "9px 12px", fontSize: "12px", fontWeight: 600 }}>{fmt(ri.total_actual)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
