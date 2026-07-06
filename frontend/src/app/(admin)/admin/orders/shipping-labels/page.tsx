"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { PackageIcon, TruckIcon, CheckCircleIcon, TagIcon, DownloadIcon, PrinterIcon, FileTextIcon } from "@/components/ui/icons";

interface ShippingLabel {
  id: string;
  order_number: string;
  company_name: string;
  item_count: number;
  weight_lbs: number;
  shipping_cost: string;
  courier: string | null;
  courier_service: string | null;
  tracking_number: string | null;
  label_status: "printed" | "pending";
  delivery_status: "in_transit" | "delivered" | "pending";
  shipped_at: string | null;
  // editable local state
  pkg_type: string;
}

const COURIERS = ["FedEx", "UPS", "USPS", "DHL", "Other"];

const LABEL_STYLE: Record<string, { bg: string; color: string }> = {
  printed: { bg: "rgba(5,150,105,.1)", color: "#059669" },
  pending: { bg: "rgba(217,119,6,.1)", color: "#D97706" },
  in_transit: { bg: "rgba(26,92,255,.1)", color: "#1A5CFF" },
  delivered: { bg: "rgba(5,150,105,.1)", color: "#059669" },
};

function Badge({ label, type }: { label: string; type: string }) {
  const s = LABEL_STYLE[type] ?? { bg: "rgba(0,0,0,.06)", color: "#555" };
  return (
    <span style={{ background: s.bg, color: s.color, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize" as const, whiteSpace: "nowrap" as const }}>
      {label}
    </span>
  );
}

const PKG_TYPES = ["Box", "Poly Bag", "Flat Pack", "Pallet", "Envelope"];

export default function ShippingLabelsPage() {
  const [labels, setLabels] = useState<ShippingLabel[]>([]);
  const [filtered, setFiltered] = useState<ShippingLabel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState<"all" | "pending" | "in_transit" | "delivered">("all");
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [pkgTypes, setPkgTypes] = useState<Record<string, string>>({});

  async function load() {
    setIsLoading(true);
    try {
      const data = await apiClient.get<{ items: any[]; total: number }>(
        "/api/v1/admin/orders?status=shipped&page_size=100"
      );
      const items: ShippingLabel[] = (data?.items ?? []).map((o: any) => {
        // Infer delivery_status from shipped_at date (>5 days → delivered heuristic)
        let delivery_status: ShippingLabel["delivery_status"] = "pending";
        if (o.shipped_at) {
          const daysSince = (Date.now() - new Date(o.shipped_at).getTime()) / 86400000;
          delivery_status = daysSince > 5 ? "delivered" : "in_transit";
        }
        return {
          id: o.id,
          order_number: o.order_number,
          company_name: o.company_name,
          item_count: o.item_count,
          weight_lbs: 0,
          shipping_cost: o.shipping_cost ?? "0",
          courier: o.courier,
          courier_service: o.courier_service,
          tracking_number: o.tracking_number,
          label_status: o.tracking_number ? "printed" : "pending",
          delivery_status,
          shipped_at: o.shipped_at,
          pkg_type: "Box",
        };
      });
      setLabels(items);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (tab === "all") setFiltered(labels);
    else if (tab === "pending") setFiltered(labels.filter(l => l.label_status === "pending"));
    else if (tab === "in_transit") setFiltered(labels.filter(l => l.delivery_status === "in_transit"));
    else if (tab === "delivered") setFiltered(labels.filter(l => l.delivery_status === "delivered"));
  }, [tab, labels]);

  const stats = {
    total: labels.length,
    in_transit: labels.filter(l => l.delivery_status === "in_transit").length,
    delivered: labels.filter(l => l.delivery_status === "delivered").length,
    pending_label: labels.filter(l => l.label_status === "pending").length,
  };

  const TABS: { key: typeof tab; label: string; count: number }[] = [
    { key: "all", label: "All Shipments", count: labels.length },
    { key: "pending", label: "Pending Label", count: stats.pending_label },
    { key: "in_transit", label: "In Transit", count: stats.in_transit },
    { key: "delivered", label: "Delivered", count: stats.delivered },
  ];

  const STAT_CARDS = [
    { label: "Total Shipments", value: stats.total, icon: <PackageIcon size={20} color="#1A5CFF" />, color: "#1A5CFF" },
    { label: "In Transit", value: stats.in_transit, icon: <TruckIcon size={20} color="#1A5CFF" />, color: "#1A5CFF" },
    { label: "Delivered", value: stats.delivered, icon: <CheckCircleIcon size={20} color="#059669" />, color: "#059669" },
    { label: "Pending Label", value: stats.pending_label, icon: <TagIcon size={20} color="#D97706" />, color: "#D97706" },
  ];

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>SHIPPING LABELS</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Manage shipments, print labels & packing slips · {stats.total} shipped orders</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={{ background: "#F4F3EF", color: "#2A2830", border: "1px solid #E2E0DA", padding: "10px 18px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            ↓ Export CSV
          </button>
          <button style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <PrinterIcon size={14} color="#fff" /> Print All
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="admin-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {STAT_CARDS.map(c => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "18px 20px", display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: `rgba(${c.color === "#059669" ? "5,150,105" : c.color === "#D97706" ? "217,119,6" : "26,92,255"},.1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#2A2830", lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: "12px", color: "#7A7880", marginTop: "3px" }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", background: "#F4F3EF", padding: "4px", borderRadius: "8px", width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ background: tab === t.key ? "#fff" : "transparent", color: tab === t.key ? "#2A2830" : "#7A7880", border: "none", padding: "7px 16px", borderRadius: "6px", fontWeight: 700, fontSize: "12px", cursor: "pointer", boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,.08)" : "none", transition: "all .15s" }}>
            {t.label} <span style={{ marginLeft: "4px", background: tab === t.key ? "#F4F3EF" : "rgba(0,0,0,.08)", color: "#7A7880", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 700 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#FAFAF8", borderBottom: "2px solid #E2E0DA" }}>
              {["Order #", "Company", "Package Type", "Weight (lbs)", "Courier", "Tracking #", "Label", "Delivery", "Shipped", "Actions"].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "left" as const, fontSize: "11px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase" as const, letterSpacing: ".06em", whiteSpace: "nowrap" as const }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: "56px", textAlign: "center" as const }}>
                  <div style={{ marginBottom: "10px" }}><TruckIcon size={32} color="#aaa" /></div>
                  <div style={{ fontSize: "14px", color: "#aaa", fontWeight: 600 }}>No shipments found</div>
                  <div style={{ fontSize: "12px", color: "#bbb", marginTop: "4px" }}>Shipped orders will appear here</div>
                </td>
              </tr>
            ) : filtered.map((l, i) => (
              <tr key={l.id}
                style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F0EDE8" : "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "12px 14px" }}>
                  <Link href={`/admin/orders/${l.id}`} style={{ color: "#1A5CFF", textDecoration: "none", fontFamily: "monospace", fontSize: "12px", fontWeight: 700 }}>
                    {l.order_number}
                  </Link>
                </td>
                <td style={{ padding: "12px 14px", color: "#2A2830", fontWeight: 600, maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{l.company_name}</td>

                {/* Package Type */}
                <td style={{ padding: "12px 14px" }}>
                  <select
                    value={pkgTypes[l.id] ?? "Box"}
                    onChange={e => setPkgTypes(prev => ({ ...prev, [l.id]: e.target.value }))}
                    style={{ border: "1px solid #E2E0DA", borderRadius: "5px", padding: "4px 8px", fontSize: "12px", color: "#2A2830", background: "#fff", cursor: "pointer" }}
                  >
                    {PKG_TYPES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </td>

                {/* Weight */}
                <td style={{ padding: "12px 14px" }}>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0.0"
                    value={weights[l.id] ?? ""}
                    onChange={e => setWeights(prev => ({ ...prev, [l.id]: e.target.value }))}
                    style={{ width: "68px", border: "1px solid #E2E0DA", borderRadius: "5px", padding: "4px 8px", fontSize: "12px", color: "#2A2830", textAlign: "right" as const }}
                  />
                </td>

                {/* Courier */}
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#2A2830" }}>{l.courier ?? "—"}</div>
                  {l.courier_service && <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "1px" }}>{l.courier_service}</div>}
                </td>

                {/* Tracking */}
                <td style={{ padding: "12px 14px" }}>
                  {l.tracking_number ? (
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#2A2830", background: "#F4F3EF", padding: "2px 6px", borderRadius: "4px" }}>{l.tracking_number}</span>
                  ) : (
                    <span style={{ color: "#bbb", fontSize: "12px" }}>—</span>
                  )}
                </td>

                {/* Label Status */}
                <td style={{ padding: "12px 14px" }}>
                  <Badge label={l.label_status === "printed" ? "Printed" : "Pending"} type={l.label_status} />
                </td>

                {/* Delivery Status */}
                <td style={{ padding: "12px 14px" }}>
                  <Badge
                    label={l.delivery_status === "in_transit" ? "In Transit" : l.delivery_status === "delivered" ? "Delivered" : "Pending"}
                    type={l.delivery_status}
                  />
                </td>

                {/* Shipped At */}
                <td style={{ padding: "12px 14px", color: "#7A7880", fontSize: "12px", whiteSpace: "nowrap" as const }}>
                  {l.shipped_at ? new Date(l.shipped_at).toLocaleDateString() : "—"}
                </td>

                {/* Actions */}
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: "5px", flexWrap: "nowrap" as const }}>
                    <button
                      style={{ background: "rgba(26,92,255,.08)", color: "#1A5CFF", border: "none", padding: "5px 11px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, display: "inline-flex", alignItems: "center", gap: "4px" }}
                      onClick={() => window.print()}
                    >
                      <PrinterIcon size={11} color="#1A5CFF" /> Label
                    </button>
                    <button
                      style={{ background: "#F4F3EF", color: "#2A2830", border: "1px solid #E2E0DA", padding: "5px 11px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, display: "inline-flex", alignItems: "center", gap: "4px" }}
                      onClick={() => window.print()}
                    >
                      <FileTextIcon size={11} color="#2A2830" /> Slip
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
