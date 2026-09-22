"use client";

// Product templates — list + inline editor, the same pattern as PagesManager,
// so it renders the same in its own route and inside the new admin shell.
import { useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { productTemplatesService as api, type ProductTemplateRow } from "@/services/productTemplates.service";
import { useAuthStore } from "@/stores/auth.store";
import { canWrite } from "@/lib/permissions";
import ProductTemplateEditor, { STATUS_CHIP } from "@/components/admin/ProductTemplateEditor";

const card: React.CSSProperties = { background: "#fff", border: "1px solid #E3E3E3", borderRadius: "12px" };
const input: React.CSSProperties = { border: "1px solid #E3E3E3", borderRadius: "8px", padding: "10px 12px", fontSize: "14px", outline: "none", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { background: "#1A1A1A", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const chipBase: React.CSSProperties = { fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: ".04em" };

export default function ProductTemplatesManager() {
  const { user } = useAuthStore();
  const writable = canWrite(user?.role, "storefront", user?.scopes, user?.read_only);
  const [rows, setRows] = useState<ProductTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.list()
      .then(setRows)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "Failed to load product templates."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true); setError(null);
    try {
      const t = await api.create(name, copyFrom || undefined);
      setShowNew(false); setNewName(""); setCopyFrom("");
      setEditingId(t.id);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not create the template.");
    } finally { setCreating(false); }
  }

  async function remove(t: ProductTemplateRow) {
    const note = t.product_count ? ` Its ${t.product_count} product${t.product_count === 1 ? "" : "s"} will go back to the default template.` : "";
    if (!confirm(`Delete "${t.name}"?${note} This can't be undone.`)) return;
    try { await api.remove(t.id); load(); }
    catch (e) { setError(e instanceof ApiClientError ? e.message : "Could not delete the template."); }
  }

  if (editingId) return <ProductTemplateEditor id={editingId} onBack={() => { setEditingId(null); load(); }} />;

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "920px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "32px", color: "#2A2830", letterSpacing: "-0.01em", lineHeight: 1 }}>Product templates</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px", maxWidth: "620px", lineHeight: 1.5 }}>
            Decide what shows around a product&apos;s title, price and add to cart — a stripe bar under the title, a guarantee under the price, sections further down. Assign a template to some products and another to others.
          </p>
        </div>
        {writable && <button onClick={() => setShowNew(true)} style={btnPrimary}>+ New template</button>}
      </div>

      {!writable && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
          <strong>👁 View-only access</strong> — your role can look at templates but not change them.
        </div>
      )}
      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}

      {showNew && writable && (
        <div style={{ ...card, padding: "18px", marginBottom: "18px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".04em" }}>New template</label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input autoFocus style={{ ...input, flex: "1 1 220px" }} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="e.g. Tees with shipping note" />
            {rows.length > 0 && (
              <select style={{ ...input, flex: "0 1 220px" }} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="Start from">
                <option value="">Start from the standard layout</option>
                {rows.map((t) => <option key={t.id} value={t.id}>Copy of {t.name}</option>)}
              </select>
            )}
            <button onClick={create} disabled={creating || !newName.trim()} style={{ ...btnPrimary, opacity: creating || !newName.trim() ? 0.6 : 1 }}>{creating ? "Creating…" : "Create & edit"}</button>
            <button onClick={() => { setShowNew(false); setNewName(""); }} style={{ background: "#fff", border: "1px solid #E3E3E3", color: "#555", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", color: "#888", fontSize: "14px" }}>Loading templates…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, padding: "48px 24px", textAlign: "center" }}>
          <p style={{ fontSize: "15px", color: "#7A7880", marginBottom: "6px" }}>No product templates yet.</p>
          <p style={{ fontSize: "13px", color: "#aaa" }}>Every product uses the standard product page until you create and publish one.</p>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          {rows.map((t, i) => {
            const chip = STATUS_CHIP[t.status];
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 18px", borderTop: i === 0 ? "none" : "1px solid #F2F1EC", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "15px", fontWeight: 700, color: "#2A2830" }}>{t.name}</span>
                    <span style={{ ...chipBase, color: chip.color, background: chip.bg }}>{chip.text}</span>
                    {t.is_default && <span style={{ ...chipBase, color: "#555", background: "#F0EFEA" }}>Default</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "3px" }}>
                    {t.product_count} product{t.product_count === 1 ? "" : "s"}{t.is_default ? " + every product without a template" : ""}
                    {t.published_at ? ` · published ${new Date(t.published_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <button onClick={() => setEditingId(t.id)} style={{ background: "#F6F6F7", border: "1px solid #C9D6E8", color: "#1A1A1A", padding: "7px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                  {writable ? "Edit" : "View"}
                </button>
                {writable && <button onClick={() => remove(t)} title="Delete" style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer", padding: "4px 6px" }}>🗑</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
