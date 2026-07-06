"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface ProductSpec {
  id: string;
  title: string;
  description: string | null;
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

const blankForm = { title: "", description: "", pdf_url: "", sort_order: "0", is_active: true };

export default function AdminProductSpecsPage() {
  const [specs, setSpecs] = useState<ProductSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/admin/product-specs");
      setSpecs((res as any).data ?? res ?? []);
    } catch {
      setSpecs([]);
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

  function openEdit(p: ProductSpec) {
    setEditId(p.id);
    setForm({
      title: p.title,
      description: p.description ?? "",
      pdf_url: p.pdf_url ?? "",
      sort_order: String(p.sort_order),
      is_active: p.is_active,
    });
    setError(null);
    setShowModal(true);
  }

  async function uploadFile(file: File) {
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiClient.postForm<{ url: string }>("/api/v1/upload", fd);
      setForm(f => ({ ...f, pdf_url: (data as any).url ?? data }));
    } catch {
      setError("PDF upload failed. Try again.");
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        pdf_url: form.pdf_url || null,
        sort_order: parseInt(form.sort_order) || 0,
        is_active: form.is_active,
      };
      if (editId) {
        await apiClient.patch(`/api/v1/admin/product-specs/${editId}`, payload);
      } else {
        await apiClient.post("/api/v1/admin/product-specs", payload);
      }
      setShowModal(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: ProductSpec) {
    try {
      await apiClient.patch(`/api/v1/admin/product-specs/${p.id}`, { is_active: !p.is_active });
      setSpecs(prev => prev.map(r => r.id === p.id ? { ...r, is_active: !r.is_active } : r));
    } catch { /* silent */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product spec?")) return;
    try {
      await apiClient.delete(`/api/v1/admin/product-specs/${id}`);
      setSpecs(prev => prev.filter(r => r.id !== id));
    } catch { /* silent */ }
  }

  return (
    <div style={{ maxWidth: "960px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#2A2830", marginBottom: "4px" }}>Product Specs</h1>
          <p style={{ fontSize: "13px", color: "#7A7880" }}>Manage technical product specification PDFs shown on the Product Specs page.</p>
        </div>
        <button onClick={openNew} style={{ background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
          + Add Product Spec
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#aaa" }}>Loading…</div>
      ) : specs.length === 0 ? (
        <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "12px", padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📐</div>
          <p style={{ color: "#7A7880", fontSize: "14px" }}>No product specs added yet.</p>
          <button onClick={openNew} style={{ marginTop: "16px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            Add First Product Spec
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E0DA", background: "#F9F8F5" }}>
                {["Title", "Description", "PDF", "Sort", "Active", ""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {specs.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < specs.length - 1 ? "1px solid #F4F3EF" : "none" }}>
                  <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 700, color: "#2A2830", maxWidth: "200px" }}>{p.title}</td>
                  <td style={{ padding: "12px 16px", fontSize: "12px", color: "#7A7880", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.description ?? "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {p.pdf_url ? (
                      <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 600 }}>View PDF</a>
                    ) : (
                      <span style={{ fontSize: "12px", color: "#bbb" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#7A7880", fontFamily: "monospace" }}>{p.sort_order}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => toggleActive(p)}
                      style={{ width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer", background: p.is_active ? "#059669" : "#D1D5DB", position: "relative", transition: "background .2s" }}
                    >
                      <span style={{ position: "absolute", top: "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left .2s", left: p.is_active ? "21px" : "3px" }} />
                    </button>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => openEdit(p)} style={{ fontSize: "12px", color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Edit</button>
                      <button onClick={() => handleDelete(p.id)} style={{ fontSize: "12px", color: "#E8242A", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Delete</button>
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
              {editId ? "Edit Product Spec" : "Add Product Spec"}
            </h2>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Title</label>
                <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Gildan 5000 Heavy Cotton Tee" required />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Description</label>
                <textarea style={{ ...inp, minHeight: "80px", resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description of what's covered in this spec sheet…" />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>PDF URL</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input style={{ ...inp, flex: 1 }} value={form.pdf_url} onChange={e => setForm(f => ({ ...f, pdf_url: e.target.value }))} placeholder="https://... or upload below" />
                  <button type="button" onClick={() => pdfRef.current?.click()} disabled={uploadingPdf}
                    style={{ flexShrink: 0, padding: "9px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#F4F3EF", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    {uploadingPdf ? "…" : "Upload"}
                  </button>
                  <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); }} />
                </div>
                {form.pdf_url && <a href={form.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#1A5CFF", display: "inline-block", marginTop: "6px" }}>View uploaded PDF</a>}
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Sort Order</label>
                <input type="number" style={inp} value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
              </div>

              <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
                <input type="checkbox" id="spec_is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                <label htmlFor="spec_is_active" style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830", cursor: "pointer" }}>Active (visible on website)</label>
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
