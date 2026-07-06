"use client";

import { useEffect, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";

interface Manufacturer {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

const EMPTY: Omit<Manufacturer, "id"> = { name: "", contact_name: "", email: "", phone: "", address: "", notes: "" };

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Manufacturer | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await apiClient.get<Manufacturer[]>("/api/v1/admin/purchase-orders/manufacturers");
    setManufacturers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); }
  function openEdit(m: Manufacturer) { setEditing(m); setForm({ name: m.name, contact_name: m.contact_name || "", email: m.email || "", phone: m.phone || "", address: m.address || "", notes: m.notes || "" }); setShowModal(true); }

  async function save() {
    if (!form.name.trim() || !form.contact_name?.trim() || !form.email?.trim() || !form.phone?.trim() || !form.address?.trim()) {
      alert("Please fill all required fields: Name, Contact Name, Email, Phone, and Address");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiClient.put(`/api/v1/admin/purchase-orders/manufacturers/${editing.id}`, form);
      } else {
        await apiClient.post(`/api/v1/admin/purchase-orders/manufacturers`, form);
      }
      setShowModal(false);
      await load();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Failed to save");
    }
    setSaving(false);
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await apiClient.delete(`/api/v1/admin/purchase-orders/manufacturers/${id}`);
    await load();
  }

  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <a href="/admin/purchase-orders" style={{ fontSize: "13px", color: "#6B7280", textDecoration: "none" }}>← Purchase Orders</a>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1B3A5C", letterSpacing: ".04em", marginTop: "4px" }}>MANUFACTURERS</h1>
        </div>
        <button onClick={openNew} style={{ padding: "9px 18px", background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          + Add Manufacturer
        </button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["NAME", "CONTACT", "EMAIL", "PHONE", "ACTIONS"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".07em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>Loading…</td></tr>
            ) : manufacturers.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>No manufacturers yet.</td></tr>
            ) : manufacturers.map(m => (
              <tr key={m.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "14px 16px", fontWeight: 600, fontSize: "13px" }}>{m.name}</td>
                <td style={{ padding: "14px 16px", fontSize: "13px", color: "#6B7280" }}>{m.contact_name || "—"}</td>
                <td style={{ padding: "14px 16px", fontSize: "13px", color: "#6B7280" }}>{m.email || "—"}</td>
                <td style={{ padding: "14px 16px", fontSize: "13px", color: "#6B7280" }}>{m.phone || "—"}</td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => openEdit(m)} style={{ padding: "5px 12px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
                    <button onClick={() => del(m.id, m.name)} style={{ padding: "5px 12px", background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "32px", width: "480px", maxWidth: "95vw" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#1B3A5C", marginBottom: "20px" }}>
              {editing ? "Edit Manufacturer" : "Add Manufacturer"}
            </h2>
            <div style={{ display: "grid", gap: "14px" }}>
              {(["name", "contact_name", "email", "phone"] as const).map(field => (
                <div key={field}>
                  <label style={LBL}>{field === "contact_name" ? "Contact Name" : field.charAt(0).toUpperCase() + field.slice(1)} *</label>
                  <input value={form[field] || ""} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} style={INPUT} />
                </div>
              ))}
              <div>
                <label style={LBL}>Address *</label>
                <textarea value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} style={{ ...INPUT, resize: "vertical" }} />
              </div>
              <div>
                <label style={LBL}>Notes</label>
                <textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...INPUT, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "9px 20px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding: "9px 20px", background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const LBL: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" };
const INPUT: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: "7px", fontSize: "13px", boxSizing: "border-box", outline: "none" };
