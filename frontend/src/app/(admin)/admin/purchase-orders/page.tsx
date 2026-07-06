"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:      { bg: "#F3F4F6", color: "#6B7280" },
  sent:       { bg: "#DBEAFE", color: "#1D4ED8" },
  partial:    { bg: "#FEF3C7", color: "#D97706" },
  received:   { bg: "#D1FAE5", color: "#065F46" },
  closed:     { bg: "#1B3A5C", color: "#fff" },
  cancelled:  { bg: "#FEE2E2", color: "#991B1B" },
};

interface PO {
  id: string;
  po_number: string;
  manufacturer_name: string | null;
  order_date: string | null;
  expected_delivery: string | null;
  item_count: number;
  total_expected: number;
  status: string;
}

function fmt(n: number) {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<PO[]>("/api/v1/admin/purchase-orders/")
      .then(data => { setPos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalValue = pos.reduce((s, p) => s + (p.total_expected || 0), 0);
  const pending = pos.filter(p => ["draft", "sent", "partial"].includes(p.status)).length;

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1B3A5C", letterSpacing: ".04em" }}>
          PURCHASE ORDERS
        </h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link href="/admin/purchase-orders/manufacturers" style={{
            padding: "9px 18px", borderRadius: "8px", border: "1px solid #D1D5DB",
            fontSize: "13px", fontWeight: 600, color: "#374151", textDecoration: "none",
            background: "#fff",
          }}>
            Manufacturers
          </Link>
          <Link href="/admin/purchase-orders/create" style={{
            padding: "9px 18px", borderRadius: "8px", background: "#1B3A5C",
            color: "#fff", fontSize: "13px", fontWeight: 600, textDecoration: "none",
          }}>
            + Create PO
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
        {[
          { label: "Total POs", value: pos.length.toString() },
          { label: "Pending / In Progress", value: pending.toString() },
          { label: "Total Value", value: fmt(totalValue) },
        ].map(card => (
          <div key={card.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "20px" }}>
            <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".07em" }}>{card.label}</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#1B3A5C" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["PO NUMBER", "MANUFACTURER", "DATE", "EXP. DELIVERY", "ITEMS", "TOTAL", "STATUS", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".07em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>Loading…</td></tr>
            ) : pos.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>No purchase orders yet. <Link href="/admin/purchase-orders/create" style={{ color: "#1A5CFF" }}>Create one →</Link></td></tr>
            ) : pos.map(po => {
              const sc = STATUS_COLORS[po.status] ?? STATUS_COLORS.draft!;
              return (
                <tr key={po.id} style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}
                  onClick={() => window.location.href = `/admin/purchase-orders/${po.id}`}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F9FAFB"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <td style={{ padding: "14px 16px", fontWeight: 700, color: "#1B3A5C", fontSize: "13px" }}>{po.po_number}</td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "#374151" }}>{po.manufacturer_name || "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "#6B7280" }}>{po.order_date ? new Date(po.order_date).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "#6B7280" }}>{po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "#374151" }}>{po.item_count}</td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: "#374151" }}>{fmt(po.total_expected)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: sc.bg, color: sc.color, textTransform: "uppercase", letterSpacing: ".06em" }}>
                      {po.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <Link href={`/admin/purchase-orders/${po.id}`} style={{ fontSize: "12px", color: "#1A5CFF", textDecoration: "none", fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
