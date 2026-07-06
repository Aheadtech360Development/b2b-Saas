"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient, ApiClientError } from "@/lib/api-client";

interface LineItem {
  id: string;
  new_product_name: string | null;
  new_product_sku: string | null;
  new_product_color: string | null;
  new_product_size: string | null;
  variant_sku: string | null;
  variant_color: string | null;
  variant_size: string | null;
  qty_ordered: number;
  unit_cost_expected: number;
}

interface Receiving {
  items: { po_line_item_id: string; qty_received: number; }[];
}

interface PO {
  id: string;
  po_number: string;
  line_items: LineItem[];
  receivings: Receiving[];
}

interface ReceiveRow {
  po_line_item_id: string;
  qty_receiving: number;
  unit_cost_actual: number;
}

function alreadyReceived(po: PO, lineItemId: string): number {
  return po.receivings.reduce((sum, r) => {
    const match = r.items.find(i => i.po_line_item_id === lineItemId);
    return sum + (match?.qty_received || 0);
  }, 0);
}

export default function ReceiveItemsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ReceiveRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<PO>(`/api/v1/admin/purchase-orders/${id}`)
      .then((data: PO) => {
        setPo(data);
        setRows(data.line_items.map(li => ({
          po_line_item_id: li.id,
          qty_receiving: 0,
          unit_cost_actual: li.unit_cost_expected,
        })));
        setLoading(false);
      });
  }, [id]);

  function updateRow(lineItemId: string, field: "qty_receiving" | "unit_cost_actual", value: number) {
    setRows(r => r.map(row => row.po_line_item_id === lineItemId ? { ...row, [field]: value } : row));
  }

  async function submit() {
    const activeRows = rows.filter(r => r.qty_receiving > 0);
    if (activeRows.length === 0) { alert("Enter at least 1 qty to receive"); return; }
    setSaving(true);
    try {
      await apiClient.post(`/api/v1/admin/purchase-orders/${id}/receive`, {
        received_date: receivedDate,
        notes: notes || null,
        items: activeRows.map(row => ({
          po_line_item_id: row.po_line_item_id,
          qty_received: row.qty_receiving,
          unit_cost_actual: row.unit_cost_actual,
        })),
      });
      router.push(`/admin/purchase-orders/${id}`);
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Failed to record receiving");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: "32px", color: "#9CA3AF" }}>Loading…</div>;
  if (!po) return <div style={{ padding: "32px", color: "#EF4444" }}>PO not found.</div>;

  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: "13px" }}>← Back</button>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1B3A5C" }}>RECEIVE ITEMS</h1>
          <div style={{ fontSize: "13px", color: "#6B7280" }}>{po.po_number}</div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "28px", marginBottom: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
          <div>
            <label style={LBL}>Received Date</label>
            <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LBL}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" style={INPUT} />
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["PRODUCT", "QTY ORDERED", "ALREADY RECEIVED", "QTY RECEIVING NOW", "ACTUAL UNIT COST"].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".07em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {po.line_items.map(li => {
              const row = rows.find(r => r.po_line_item_id === li.id)!;
              const received = alreadyReceived(po, li.id);
              const remaining = li.qty_ordered - received;
              const label = li.new_product_name
                ? `${li.new_product_name}${li.new_product_color ? ` — ${li.new_product_color}` : ""}${li.new_product_size ? ` / ${li.new_product_size}` : ""}`
                : `${li.variant_color || ""} / ${li.variant_size || ""} (${li.variant_sku || "no SKU"})`;

              return (
                <tr key={li.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "12px 14px", fontSize: "13px" }}>{label}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", color: "#6B7280" }}>{li.qty_ordered}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", color: received > 0 ? "#059669" : "#9CA3AF" }}>{received}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <input
                      type="number" min={0} max={remaining}
                      value={row?.qty_receiving ?? 0}
                      onChange={e => updateRow(li.id, "qty_receiving", parseInt(e.target.value) || 0)}
                      style={{ ...INPUT, width: "80px" }}
                    />
                    {remaining > 0 && <span style={{ fontSize: "11px", color: "#9CA3AF", marginLeft: "6px" }}>of {remaining} remaining</span>}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <input
                      type="number" min={0} step={0.01}
                      value={row?.unit_cost_actual ?? li.unit_cost_expected}
                      onChange={e => updateRow(li.id, "unit_cost_actual", parseFloat(e.target.value) || 0)}
                      style={{ ...INPUT, width: "100px" }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
        <button onClick={() => router.back()} style={{ padding: "10px 20px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={submit} disabled={saving} style={{ padding: "10px 24px", background: "#059669", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          {saving ? "Saving…" : "Receive & Update Inventory"}
        </button>
      </div>
    </div>
  );
}

const LBL: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" };
const INPUT: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: "7px", fontSize: "13px", boxSizing: "border-box", outline: "none" };
