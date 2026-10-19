"use client";

/** Suppliers: the manufacturers stock is bought from, for purchase orders. */
import Link from "next/link";
import { ask, tell } from "@/lib/dialog";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
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
const LABELS: Record<"name" | "contact_name" | "email" | "phone", string> = { name: "Name", contact_name: "Contact name", email: "Email", phone: "Phone" };

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Manufacturer | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await apiClient.get<Manufacturer[]>("/api/v1/admin/purchase-orders/manufacturers").catch(() => []);
    setManufacturers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); }
  function openEdit(m: Manufacturer) { setEditing(m); setForm({ name: m.name, contact_name: m.contact_name || "", email: m.email || "", phone: m.phone || "", address: m.address || "", notes: m.notes || "" }); setShowModal(true); }

  async function save() {
    if (!form.name.trim() || !form.contact_name?.trim() || !form.email?.trim() || !form.phone?.trim() || !form.address?.trim()) {
      tell("Fill in the name, contact name, email, phone and address.");
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
      tell(err instanceof ApiClientError ? err.message : "It could not be saved.");
    }
    setSaving(false);
  }

  async function del(id: string, name: string) {
    if (!await ask(`Delete "${name}"? Its purchase orders keep their history.`, { ok: "Delete", danger: true })) return;
    await apiClient.delete(`/api/v1/admin/purchase-orders/manufacturers/${id}`);
    await load();
  }

  return (
    <div className="pc-page" data-suppliers-list>
      <Link href="/admin/purchase-orders" className="pc-back">← Purchase orders</Link>
      <div className="pc-head" style={{ marginTop: "10px" }}>
        <div>
          <div className="pc-eyebrow">Purchase orders</div>
          <h1 className="pc-h1">Suppliers</h1>
          <p className="pc-sub-line">The manufacturers and suppliers you buy stock from. A purchase order is emailed to the address here.</p>
        </div>
        <button type="button" className="pc-btn" data-kind="primary" onClick={openNew}>Add supplier</button>
      </div>

      <div className="pc-card">
        <div className="pc-scroll-x">
          <table className="pc-table" style={{ minWidth: "640px" }}>
            <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="pc-empty">Loading…</td></tr>
                : manufacturers.length === 0 ? <tr><td colSpan={5} className="pc-empty">No suppliers yet.</td></tr>
                : manufacturers.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td style={{ color: "var(--pc-muted)" }}>{m.contact_name || "—"}</td>
                    <td style={{ color: "var(--pc-muted)" }}>{m.email || "—"}</td>
                    <td style={{ color: "var(--pc-muted)" }}>{m.phone || "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="pc-btn" style={{ height: "34px", fontSize: "13px" }} onClick={() => openEdit(m)}>Edit</button>{" "}
                      <button type="button" className="pc-btn" style={{ height: "34px", fontSize: "13px", color: "var(--pc-red)" }} onClick={() => del(m.id, m.name)}>Delete</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setShowModal(false); }}>
          <div className="pc-modal" role="dialog" aria-label={editing ? "Edit supplier" : "Add supplier"} style={{ maxWidth: "480px" }}>
            <div className="pc-panel-head">
              <h2 className="pc-h2">{editing ? "Edit supplier" : "Add supplier"}</h2>
              <button type="button" className="pc-x" aria-label="Close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="pc-panel-body">
              {(["name", "contact_name", "email", "phone"] as const).map((field) => (
                <label key={field} style={{ display: "grid", gap: "6px" }}>
                  <span className="pc-label">{LABELS[field]}</span>
                  <input className="pc-input" type={field === "email" ? "email" : "text"} value={form[field] || ""} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
                </label>
              ))}
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Address</span>
                <textarea className="pc-input" rows={2} value={form.address || ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} style={{ height: "auto", padding: "10px 14px", resize: "vertical" }} />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Notes (optional)</span>
                <textarea className="pc-input" rows={2} value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={{ height: "auto", padding: "10px 14px", resize: "vertical" }} />
              </label>
              <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="pc-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="button" className="pc-btn" data-kind="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
