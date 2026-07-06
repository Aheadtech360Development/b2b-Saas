"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface StyleSheet {
  id: string;
  style_number: string;
  image_url: string | null;
  pdf_url: string | null;
  sort_order: number;
  is_active: boolean;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA",
  borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 700,
  color: "#555", marginBottom: "5px", textTransform: "uppercase", letterSpacing: ".05em",
};

const blankForm = { style_number: "", image_url: "", pdf_url: "", sort_order: "0", is_active: true };

export default function AdminStyleSheetsPage() {
  const [sheets, setSheets] = useState<StyleSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/admin/style-sheets");
      setSheets((res as any).data ?? res ?? []);
    } catch {
      setSheets([]);
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

  function openEdit(s: StyleSheet) {
    setEditId(s.id);
    setForm({
      style_number: s.style_number,
      image_url: s.image_url ?? "",
      pdf_url: s.pdf_url ?? "",
      sort_order: String(s.sort_order),
      is_active: s.is_active,
    });
    setError(null);
    setShowModal(true);
  }

  async function uploadFile(file: File, field: "image_url" | "pdf_url") {
    const setter = field === "image_url" ? setUploadingImage : setUploadingPdf;
    setter(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiClient.postForm<{ url: string }>("/api/v1/upload", fd);
      setForm(f => ({ ...f, [field]: (data as any).url ?? data }));
    } catch {
      setError("File upload failed. Try again.");
    } finally {
      setter(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.style_number) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        style_number: form.style_number,
        image_url: form.image_url || null,
        pdf_url: form.pdf_url || null,
        sort_order: parseInt(form.sort_order) || 0,
        is_active: form.is_active,
      };
      if (editId) {
        await apiClient.patch(`/api/v1/admin/style-sheets/${editId}`, payload);
      } else {
        await apiClient.post("/api/v1/admin/style-sheets", payload);
      }
      setShowModal(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: StyleSheet) {
    try {
      await apiClient.patch(`/api/v1/admin/style-sheets/${s.id}`, { is_active: !s.is_active });
      setSheets(prev => prev.map(r => r.id === s.id ? { ...r, is_active: !r.is_active } : r));
    } catch { /* silent */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this style sheet?")) return;
    try {
      await apiClient.delete(`/api/v1/admin/style-sheets/${id}`);
      setSheets(prev => prev.filter(r => r.id !== id));
    } catch { /* silent */ }
  }

  return (
    <div style={{ maxWidth: "960px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#2A2830", marginBottom: "4px" }}>Style Sheets</h1>
          <p style={{ fontSize: "13px", color: "#7A7880" }}>Manage downloadable style sheet PDFs shown on the Style Sheets page.</p>
        </div>
        <button onClick={openNew} style={{ background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
          + Add Style Sheet
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#aaa" }}>Loading…</div>
      ) : sheets.length === 0 ? (
        <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "12px", padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📄</div>
          <p style={{ color: "#7A7880", fontSize: "14px" }}>No style sheets added yet.</p>
          <button onClick={openNew} style={{ marginTop: "16px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            Add First Style Sheet
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E0DA", background: "#F9F8F5" }}>
                {["Image", "Style #", "PDF", "Sort", "Active", ""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheets.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: i < sheets.length - 1 ? "1px solid #F4F3EF" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    {s.image_url ? (
                      <img src={s.image_url} alt={s.style_number} style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "6px", border: "1px solid #E2E0DA" }} />
                    ) : (
                      <div style={{ width: "48px", height: "48px", background: "#F4F3EF", borderRadius: "6px", border: "1px solid #E2E0DA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>—</div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ background: "#F4F3EF", padding: "2px 8px", borderRadius: "4px", fontSize: "13px", fontWeight: 700, fontFamily: "monospace" }}>{s.style_number}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {s.pdf_url ? (
                      <a href={s.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 600 }}>View PDF</a>
                    ) : (
                      <span style={{ fontSize: "12px", color: "#bbb" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#7A7880", fontFamily: "monospace" }}>{s.sort_order}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => toggleActive(s)}
                      style={{ width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer", background: s.is_active ? "#059669" : "#D1D5DB", position: "relative", transition: "background .2s" }}
                    >
                      <span style={{ position: "absolute", top: "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left .2s", left: s.is_active ? "21px" : "3px" }} />
                    </button>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => openEdit(s)} style={{ fontSize: "12px", color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Edit</button>
                      <button onClick={() => handleDelete(s.id)} style={{ fontSize: "12px", color: "#E8242A", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Delete</button>
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
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "460px", boxShadow: "0 20px 60px rgba(0,0,0,.15)", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#2A2830", marginBottom: "20px" }}>
              {editId ? "Edit Style Sheet" : "Add Style Sheet"}
            </h2>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Style Number</label>
                <input style={inp} value={form.style_number} onChange={e => setForm(f => ({ ...f, style_number: e.target.value }))} placeholder="e.g. 5000" required />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Product Image</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input style={{ ...inp, flex: 1 }} value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://... or upload below" />
                  <button type="button" onClick={() => imageRef.current?.click()} disabled={uploadingImage}
                    style={{ flexShrink: 0, padding: "9px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#F4F3EF", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    {uploadingImage ? "…" : "Upload"}
                  </button>
                  <input ref={imageRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], "image_url"); }} />
                </div>
                {form.image_url && <img src={form.image_url} alt="preview" style={{ marginTop: "8px", width: "64px", height: "64px", objectFit: "cover", borderRadius: "6px", border: "1px solid #E2E0DA" }} />}
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>PDF URL</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input style={{ ...inp, flex: 1 }} value={form.pdf_url} onChange={e => setForm(f => ({ ...f, pdf_url: e.target.value }))} placeholder="https://... or upload below" />
                  <button type="button" onClick={() => pdfRef.current?.click()} disabled={uploadingPdf}
                    style={{ flexShrink: 0, padding: "9px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#F4F3EF", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    {uploadingPdf ? "…" : "Upload"}
                  </button>
                  <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], "pdf_url"); }} />
                </div>
                {form.pdf_url && <a href={form.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#1A5CFF", display: "inline-block", marginTop: "6px" }}>View uploaded PDF</a>}
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Sort Order</label>
                <input type="number" style={inp} value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
              </div>

              <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                <label htmlFor="is_active" style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830", cursor: "pointer" }}>Active (visible on website)</label>
              </div>

              {error && <p style={{ fontSize: "13px", color: "#E8242A", marginBottom: "12px" }}>{error}</p>}
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "10px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
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
