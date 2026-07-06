"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface TaxRate {
  id: string;
  name: string;
  region: string;
  rate: number;
  is_enabled: boolean;
  applies_to: string;
}

const APPLIES_OPTIONS = [
  { value: "all", label: "All Orders" },
  { value: "retail_only", label: "Retail Only" },
  { value: "wholesale_only", label: "Wholesale Only" },
];

const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "District of Columbia" },
];

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA",
  borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 700,
  color: "#555", marginBottom: "5px", textTransform: "uppercase", letterSpacing: ".05em",
};

const blankForm = { name: "", region: "", rate: "", applies_to: "all" };

export default function TaxesPage() {
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/admin/taxes");
      setRates((res as any).data ?? res ?? []);
    } catch {
      setRates([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditId(null);
    setForm(blankForm);
    setError(null);
    setShowModal(true);
  }

  function openEdit(t: TaxRate) {
    setEditId(t.id);
    setForm({ name: t.name, region: t.region, rate: String(t.rate), applies_to: t.applies_to });
    setError(null);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.region || !form.rate) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { name: form.name, region: form.region, rate: parseFloat(form.rate), applies_to: form.applies_to };
      if (editId) {
        await apiClient.patch(`/api/v1/admin/taxes/${editId}`, payload);
      } else {
        await apiClient.post("/api/v1/admin/taxes", payload);
      }
      setShowModal(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(t: TaxRate) {
    try {
      await apiClient.patch(`/api/v1/admin/taxes/${t.id}`, { is_enabled: !t.is_enabled });
      setRates(prev => prev.map(r => r.id === t.id ? { ...r, is_enabled: !r.is_enabled } : r));
    } catch { /* silent */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tax rate?")) return;
    try {
      await apiClient.delete(`/api/v1/admin/taxes/${id}`);
      setRates(prev => prev.filter(r => r.id !== id));
    } catch { /* silent */ }
  }

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#2A2830", marginBottom: "4px" }}>Taxes &amp; Duties</h1>
          <p style={{ fontSize: "13px", color: "#7A7880" }}>Configure tax rates by region applied at checkout.</p>
        </div>
        <button
          onClick={openNew}
          style={{ background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
        >
          + Add Tax Rate
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#aaa" }}>Loading…</div>
      ) : rates.length === 0 ? (
        <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "12px", padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🧾</div>
          <p style={{ color: "#7A7880", fontSize: "14px" }}>No tax rates configured yet.</p>
          <button onClick={openNew} style={{ marginTop: "16px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            Add Your First Rate
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E0DA", background: "#F9F8F5" }}>
                {["Region", "Name", "Rate", "Applies To", "Enabled", ""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rates.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: i < rates.length - 1 ? "1px solid #F4F3EF" : "none" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ background: "#F4F3EF", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 700, fontFamily: "monospace" }}>{t.region}</span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "#2A2830", fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "#2A2830", fontFamily: "monospace" }}>{t.rate}%</td>
                  <td style={{ padding: "14px 16px", fontSize: "12px", color: "#7A7880" }}>
                    {APPLIES_OPTIONS.find(o => o.value === t.applies_to)?.label ?? t.applies_to}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      onClick={() => toggleEnabled(t)}
                      style={{
                        width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer",
                        background: t.is_enabled ? "#059669" : "#D1D5DB", position: "relative", transition: "background .2s",
                      }}
                      title={t.is_enabled ? "Disable" : "Enable"}
                    >
                      <span style={{
                        position: "absolute", top: "3px", width: "16px", height: "16px", borderRadius: "50%",
                        background: "#fff", transition: "left .2s", left: t.is_enabled ? "21px" : "3px",
                      }} />
                    </button>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => openEdit(t)} style={{ fontSize: "12px", color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Edit</button>
                      <button onClick={() => handleDelete(t.id)} style={{ fontSize: "12px", color: "#E8242A", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 60px rgba(0,0,0,.15)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#2A2830", marginBottom: "20px" }}>
              {editId ? "Edit Tax Rate" : "Add Tax Rate"}
            </h2>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Name</label>
                <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Texas Sales Tax" required />
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Region (State Code)</label>
                <select style={{ ...inp }} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} required>
                  <option value="">Select state…</option>
                  {US_STATES.map(s => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Rate (%)</label>
                <input type="number" step="0.01" min="0" max="30" style={inp} value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="e.g. 8.25" required />
              </div>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Applies To</label>
                <select style={{ ...inp }} value={form.applies_to} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value }))}>
                  {APPLIES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {error && <p style={{ fontSize: "13px", color: "#E8242A", marginBottom: "12px" }}>{error}</p>}
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "10px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: "10px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
