// frontend/src/app/(admin)/admin/products/collections/page.tsx
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
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", marginBottom: "6px", display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function CollectionsPage() {
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
      const msg = err instanceof Error ? err.message : "Failed to save collection";
      console.error("Collections save error:", err);
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete collection "${name}"? Products won't be deleted.`)) return;
    try {
      await apiClient.delete(`/api/v1/admin/products/categories/${id}`);
      await loadCollections();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete collection";
      console.error("Collections delete error:", err);
      alert(msg);
    }
  }

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>COLLECTIONS</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Group products into collections for easy browsing · {collections.length} collections</p>
        </div>
        <button
          onClick={openCreate}
          style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}
        >
          + Create Collection
        </button>
      </div>

      {/* Content */}
      {isLoading && collections.length === 0 ? (
  <div style={{ textAlign: "center", padding: "60px", color: "#aaa", fontSize: "14px" }}>Loading…</div>
) : collections.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🗂️</div>
          <h3 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", marginBottom: "8px" }}>NO COLLECTIONS YET</h3>
          <p style={{ fontSize: "14px", color: "#7A7880", marginBottom: "20px" }}>Create collections to organize your products for customers.</p>
          <button
            onClick={openCreate}
            style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}
          >
            + Create First Collection
          </button>
        </div>
      ) : (
        <div className="admin-collections-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
          {collections.map(col => (
            <div
              key={col.id}
              style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden", transition: "all .2s" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.08)"; e.currentTarget.style.borderColor = "#bbb"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#E2E0DA"; }}
            >
              {/* Image / placeholder */}
              <div style={{ height: "140px", background: "linear-gradient(135deg,#f0ede8,#e8e4df)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                {(col.image_url ?? col.image) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(col.image_url ?? col.image)!} alt={col.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: "40px", opacity: 0.3 }}>🗂️</span>
                )}
                {/* Action buttons overlay */}
                <div style={{ position: "absolute", top: "10px", right: "10px", display: "flex", gap: "6px" }}>
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(col); }}
                    style={{ background: "rgba(255,255,255,.92)", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "5px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(col.id, col.name); }}
                    style={{ background: "rgba(255,255,255,.92)", border: "1px solid #FECACA", borderRadius: "6px", padding: "5px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#E8242A" }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Info */}
              <div style={{ padding: "16px 18px" }}>
                <div style={{ fontFamily: "var(--font-bebas)", fontSize: "18px", color: "#2A2830", marginBottom: "4px", letterSpacing: ".02em" }}>{col.name}</div>
                <div style={{ fontSize: "12px", color: "#7A7880", marginBottom: "8px" }}>
                  {col.product_count ?? 0} products · /{col.slug}
                </div>
                {col.description && (
                  <div style={{ fontSize: "12px", color: "#aaa", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {col.description}
                  </div>
                )}
                <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <a
                    href={`/products?category=${col.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, textDecoration: "none" }}
                  >
                    View in store →
                  </a>
                  <span style={{
                    padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700,
                    background: col.is_active !== false ? "rgba(5,150,105,.1)" : "rgba(156,163,175,.15)",
                    color: col.is_active !== false ? "#059669" : "#9CA3AF",
                  }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3.5" fill={col.is_active !== false ? "#059669" : "#9CA3AF"}/></svg>
                      {col.is_active !== false ? "Active" : "Hidden"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={closeModal}
        >
          <div
            style={{ background: "#fff", borderRadius: "12px", width: "520px", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px" }}>
              <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "24px", color: "#2A2830", letterSpacing: ".04em" }}>
                {editingId ? "EDIT COLLECTION" : "CREATE COLLECTION"}
              </h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Collection Name <span style={{ color: "#E8242A" }}>*</span></label>
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
              <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #E2E0DA", borderRadius: "8px", overflow: "hidden" }}>
                <span style={{ padding: "10px 12px", background: "#F4F3EF", fontSize: "13px", color: "#aaa", borderRight: "1px solid #E2E0DA", whiteSpace: "nowrap", flexShrink: 0 }}>
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
                  <div style={{ width: "64px", height: "64px", borderRadius: "6px", overflow: "hidden", border: "1px solid #E2E0DA", flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.image_url} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    padding: "9px 18px", border: "1.5px dashed #E2E0DA", borderRadius: "8px",
                    background: uploading ? "#f9fafb" : "#fff", cursor: uploading ? "not-allowed" : "pointer",
                    fontSize: "13px", fontWeight: 600, color: uploading ? "#aaa" : "#1A5CFF",
                    fontFamily: "var(--font-jakarta)",
                  }}
                >
                  {uploading ? "Uploading…" : form.image_url ? "Replace Image" : "Upload Image"}
                </button>
                {form.image_url && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                    style={{ padding: "9px 14px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "13px", color: "#7A7880", fontFamily: "var(--font-jakarta)" }}
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
                style={{ padding: "11px 22px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                style={{ padding: "11px 22px", background: saving ? "#aaa" : "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "14px", opacity: (!form.name.trim()) ? 0.5 : 1 }}
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
