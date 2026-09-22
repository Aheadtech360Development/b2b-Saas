// frontend/src/app/(admin)/admin/products/categories/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  product_count?: number;
  image?: string | null;      // legacy fallback
  image_url?: string | null;  // from CategoryOut schema
  is_active?: boolean;
  sort_order?: number;
}

const labelStyle: React.CSSProperties = {
  fontSize: "12.5px", fontWeight: 600, color: "#4A4850", marginBottom: "7px", display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", border: "1px solid #E2E2E4", borderRadius: "10px", background: "#FCFCFC",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function CategoriesPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", image_url: "", sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadCollections() {
    setIsLoading(true);
    try {
      const res = await apiClient.get<Collection[]>("/api/v1/products/categories");
      setCollections(res ?? []);
    } catch {
      setCollections([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadCollections(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", slug: "", description: "", image_url: "", sort_order: 0 });
    setShowModal(true);
  }

  function openEdit(col: Collection) {
    setEditingId(col.id);
    setForm({ name: col.name, slug: col.slug, description: col.description ?? "", image_url: col.image_url ?? col.image ?? "", sort_order: col.sort_order ?? 0 });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm({ name: "", slug: "", description: "", image_url: "", sort_order: 0 });
  }

  async function handleImageFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiClient.postForm<{ url: string }>("/api/v1/admin/products/upload-image", fd);
      setForm(f => ({ ...f, image_url: res.url }));
    } catch {
      alert("Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || generateSlug(form.name),
        description: form.description || null,
        image_url: form.image_url.trim() || null,
        sort_order: form.sort_order || 0,
      };
      if (editingId) {
        await apiClient.patch(`/api/v1/admin/products/categories/${editingId}`, payload);
      } else {
        await apiClient.post("/api/v1/admin/products/categories", payload);
      }
      closeModal();
      await loadCollections();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save category";
      console.error("Categories save error:", err);
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete category "${name}"? Products won't be deleted.`)) return;
    try {
      await apiClient.delete(`/api/v1/admin/products/categories/${id}`);
      await loadCollections();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete category";
      console.error("Categories delete error:", err);
      alert(msg);
    }
  }

  const primaryBtn: React.CSSProperties = {
    background: "#1A1A1A", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "10px",
    fontWeight: 700, cursor: "pointer", fontSize: "13px", fontFamily: "var(--font-jakarta)",
  };
  const rowBtn: React.CSSProperties = {
    background: "#fff", border: "1px solid #E6E6E6", borderRadius: "9px", padding: "7px 12px",
    fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-jakarta)", color: "#1A1A1A",
  };

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap", marginBottom: "22px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#9A98A0", letterSpacing: ".04em", marginBottom: "6px" }}>Catalogue</div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1.1, margin: 0 }}>Categories</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "6px" }}>The filters customers browse by in your store · {collections.length} categor{collections.length === 1 ? "y" : "ies"}</p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>+ Create Category</button>
      </div>

      {/* Content */}
      {isLoading && collections.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #ECECEC", borderRadius: "14px", padding: "22px" }}>
          {[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}
        </div>
      ) : collections.length === 0 ? (
        <div style={{ background: "#fff", border: "1px dashed #DADADA", borderRadius: "14px", padding: "56px 24px", textAlign: "center" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#F4F4F5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: "24px" }}>🗂️</div>
          <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1A1A1A", margin: "0 0 6px" }}>No categories yet</h3>
          <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "18px" }}>Categories are how customers filter your store. Collections, which can fill themselves from rules, live under Collections.</p>
          <button onClick={openCreate} style={primaryBtn}>+ Create your first category</button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #ECECEC", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
          {collections.map((col, i) => {
            const img = col.image_url ?? col.image;
            const active = col.is_active !== false;
            return (
              <div
                key={col.id}
                onClick={() => openEdit(col)}
                style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 18px", borderTop: i ? "1px solid #F4F4F4" : "none", cursor: "pointer", flexWrap: "wrap", transition: "background .15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#FAFAFA"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
              >
                <div style={{ width: "64px", height: "64px", borderRadius: "12px", overflow: "hidden", background: "#F4F2EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={col.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "24px", opacity: 0.35 }}>🗂️</span>
                  )}
                </div>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "15px", fontWeight: 700, color: "#1A1A1A" }}>{col.name}</span>
                    <span style={{
                      padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                      background: active ? "rgba(5,150,105,.1)" : "rgba(156,163,175,.16)",
                      color: active ? "#059669" : "#6B7280",
                    }}>{active ? "Active" : "Hidden"}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#8A8890", marginTop: "3px" }}>
                    {col.product_count ?? 0} product{(col.product_count ?? 0) === 1 ? "" : "s"} · /{col.slug}
                  </div>
                  {col.description && (
                    <div style={{ fontSize: "12px", color: "#A4A2A8", marginTop: "4px", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                      {col.description}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                  <a href={`/products?category=${col.slug}`} target="_blank" rel="noreferrer" style={{ ...rowBtn, textDecoration: "none" }}>
                    View in store ↗
                  </a>
                  <button onClick={() => openEdit(col)} style={rowBtn}>Edit</button>
                  <button onClick={() => handleDelete(col.id, col.name)} style={{ ...rowBtn, color: "#E8242A", borderColor: "#F6D0D1" }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={closeModal}
        >
          <div
            style={{ background: "#fff", borderRadius: "16px", width: "520px", maxWidth: "calc(100vw - 32px)", padding: "26px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px" }}>
              <h2 style={{ fontFamily: "var(--font-jakarta)", fontSize: "19px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.01em", margin: 0 }}>
                {editingId ? "Edit category" : "Create category"}
              </h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Category Name <span style={{ color: "#E8242A" }}>*</span></label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: editingId ? f.slug : generateSlug(e.target.value) }))}
                placeholder="e.g. T-Shirts, Hoodies, Summer Collection"
                style={{ ...inputStyle, fontSize: "15px" }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Slug (URL)</label>
              <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #E3E3E3", borderRadius: "8px", overflow: "hidden" }}>
                <span style={{ padding: "10px 12px", background: "#F6F6F7", fontSize: "13px", color: "#aaa", borderRight: "1px solid #E3E3E3", whiteSpace: "nowrap", flexShrink: 0 }}>
                  /products?category=
                </span>
                <input
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
                  style={{ flex: 1, padding: "10px 12px", border: "none", fontSize: "13px", fontFamily: "monospace", outline: "none" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Optional description for this collection…"
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>

            <div style={{ marginBottom: "22px" }}>
              <label style={labelStyle}>Collection Image</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {form.image_url && (
                  <div style={{ width: "64px", height: "64px", borderRadius: "6px", overflow: "hidden", border: "1px solid #E3E3E3", flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.image_url} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    padding: "9px 18px", border: "1.5px dashed #E3E3E3", borderRadius: "8px",
                    background: uploading ? "#f9fafb" : "#fff", cursor: uploading ? "not-allowed" : "pointer",
                    fontSize: "13px", fontWeight: 600, color: uploading ? "#aaa" : "#1A1A1A",
                    fontFamily: "var(--font-jakarta)",
                  }}
                >
                  {uploading ? "Uploading…" : form.image_url ? "Replace Image" : "Upload Image"}
                </button>
                {form.image_url && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                    style={{ padding: "9px 14px", border: "1px solid #E3E3E3", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "13px", color: "#7A7880", fontFamily: "var(--font-jakarta)" }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: "22px" }}>
              <label style={labelStyle}>Sort Order</label>
              <input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                style={inputStyle}
                placeholder="0"
              />
              <p style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>Lower numbers appear first</p>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={closeModal}
                style={{ padding: "11px 22px", border: "1px solid #E3E3E3", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                style={{ padding: "11px 22px", background: saving ? "#aaa" : "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "14px", opacity: (!form.name.trim()) ? 0.5 : 1 }}
              >
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Collection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
