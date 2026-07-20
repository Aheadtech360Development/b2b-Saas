"use client";

import { useEffect, useState } from "react";
import { menusService, type NavMenu } from "@/services/menus.service";
import { productsService } from "@/services/products.service";
import { pagesService, type StorefrontPageRecord } from "@/services/pages.service";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";
import { MenuLinkField, type LinkPickerProduct } from "@/components/admin/MenuLinkField";
import type { MenuItem } from "@/components/providers/BrandingProvider";
import type { Category } from "@/types/product.types";

const label: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".04em" };
const input: React.CSSProperties = { border: "1px solid #E2E0DA", borderRadius: "8px", padding: "10px 12px", fontSize: "14px", outline: "none", boxSizing: "border-box", background: "#fff" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px", padding: "20px", marginBottom: "18px" };
const btnPrimary: React.CSSProperties = { background: "#1C3557", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "#F0F4FA", border: "1px solid #C9D6E8", color: "#1C3557", padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" };

export default function MenusPage() {
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role);
  const [menus, setMenus] = useState<NavMenu[]>([]);
  const [draft, setDraft] = useState<NavMenu | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [products, setProducts] = useState<LinkPickerProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pages, setPages] = useState<StorefrontPageRecord[]>([]);

  useEffect(() => {
    menusService.list().then((m) => { setMenus(m); if (m[0]) setDraft(structuredClone(m[0])); }).catch(() => setError("Failed to load menus.")).finally(() => setLoading(false));
    apiClient.get<LinkPickerProduct[]>("/api/v1/admin/products?page_size=200").then((l) => setProducts(l || [])).catch(() => {});
    productsService.getCategories().then((c) => setCategories(c || [])).catch(() => {});
    pagesService.list().then(setPages).catch(() => {});
  }, []);

  function selectMenu(m: NavMenu) {
    if (dirty && !confirm("Discard unsaved changes to this menu?")) return;
    setDraft(structuredClone(m)); setDirty(false); setError(null);
  }
  function patchItems(items: MenuItem[]) { setDraft((d) => (d ? { ...d, items } : d)); setDirty(true); }

  // Item ops
  function setItem(i: number, patch: Partial<MenuItem>) { if (!draft) return; const m = [...draft.items]; m[i] = { ...m[i], ...patch } as MenuItem; patchItems(m); }
  function addItem() { if (!draft) return; patchItems([...draft.items, { label: "New Link", href: "/products" }]); }
  function removeItem(i: number) { if (!draft) return; patchItems(draft.items.filter((_, x) => x !== i)); }
  function moveItem(i: number, dir: -1 | 1) { if (!draft) return; const j = i + dir; if (j < 0 || j >= draft.items.length) return; const m = [...draft.items]; const a = m[i], b = m[j]; if (!a || !b) return; m[i] = b; m[j] = a; patchItems(m); }
  function addChild(i: number) { if (!draft) return; const m = [...draft.items]; const cur = m[i]; if (!cur) return; m[i] = { ...cur, children: [...(cur.children ?? []), { label: "Sub Link", href: "/products" }] }; patchItems(m); }
  function setChild(i: number, j: number, patch: Partial<MenuItem>) { if (!draft) return; const m = [...draft.items]; const cur = m[i]; if (!cur) return; const kids = [...(cur.children ?? [])]; kids[j] = { ...kids[j], ...patch } as MenuItem; m[i] = { ...cur, children: kids }; patchItems(m); }
  function removeChild(i: number, j: number) { if (!draft) return; const m = [...draft.items]; const cur = m[i]; if (!cur) return; m[i] = { ...cur, children: (cur.children ?? []).filter((_, x) => x !== j) }; patchItems(m); }

  async function handleCreate() {
    const name = newName.trim(); if (!name) return;
    try {
      const m = await menusService.create(name);
      setMenus((prev) => [...prev, m]); setDraft(structuredClone(m)); setDirty(false);
      setShowNew(false); setNewName("");
    } catch { setError("Could not create menu."); }
  }
  async function handleSave() {
    if (!draft) return;
    setSaving(true); setError(null);
    try {
      const saved = await menusService.update(draft.id, { name: draft.name, items: draft.items });
      setMenus((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      setDraft(structuredClone(saved)); setDirty(false);
    } catch { setError("Failed to save menu."); }
    finally { setSaving(false); }
  }
  async function handleDelete(m: NavMenu) {
    if (!confirm(`Delete menu "${m.name}"? Any header/footer using it will fall back to default.`)) return;
    try {
      await menusService.remove(m.id);
      const rest = menus.filter((x) => x.id !== m.id);
      setMenus(rest);
      if (draft?.id === m.id) { setDraft(rest[0] ? structuredClone(rest[0]) : null); setDirty(false); }
    } catch { setError("Could not delete menu."); }
  }

  if (loading) return <div style={{ padding: "40px", color: "#888", fontSize: "14px" }}>Loading menus…</div>;

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "920px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "22px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "32px", color: "#2A2830", letterSpacing: ".03em", lineHeight: 1 }}>Menus</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Build navigation menus, then choose which one shows in your header &amp; footer (Storefront → Header/Footer menu).</p>
        </div>
        {!readOnly && <button onClick={() => setShowNew(true)} style={btnPrimary}>+ New Menu</button>}
      </div>

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}

      {showNew && !readOnly && (
        <div style={{ ...card, display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} placeholder="Menu name (e.g. Main menu, Footer menu)" style={{ ...input, flex: 1, minWidth: "220px" }} />
          <button onClick={handleCreate} disabled={!newName.trim()} style={{ ...btnPrimary, opacity: newName.trim() ? 1 : 0.6 }}>Create</button>
          <button onClick={() => { setShowNew(false); setNewName(""); }} style={{ background: "#fff", border: "1px solid #E2E0DA", color: "#555", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
        </div>
      )}

      {/* Menu tabs */}
      {menus.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          {menus.map((m) => (
            <button key={m.id} onClick={() => selectMenu(m)} style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", border: draft?.id === m.id ? "2px solid #1C3557" : "1px solid #E2E0DA", background: draft?.id === m.id ? "#F0F4FA" : "#fff", color: "#2A2830" }}>
              {m.name} <span style={{ color: "#aaa", fontWeight: 500 }}>({m.items.length})</span>
            </button>
          ))}
        </div>
      )}

      {menus.length === 0 ? (
        <div style={{ ...card, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>🧭</div>
          <p style={{ fontSize: "15px", color: "#7A7880" }}>No menus yet.</p>
          <p style={{ fontSize: "13px", color: "#aaa", marginTop: "4px" }}>Create a menu (e.g. &quot;Main menu&quot;) to control your storefront navigation.</p>
        </div>
      ) : draft && (
        <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
          <div style={card}>
            {/* Name + delete */}
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "18px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={label}>Menu Name</label>
                <input style={{ ...input, width: "100%" }} value={draft.name} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setDirty(true); }} />
              </div>
              {!readOnly && <button onClick={() => handleDelete(draft)} style={{ background: "#fff", border: "1px solid #F1C4C4", color: "#B91C1C", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Delete Menu</button>}
            </div>

            {/* Items */}
            <label style={label}>Menu Items</label>
            {draft.items.length === 0 && <p style={{ fontSize: "13px", color: "#aaa", marginBottom: "10px" }}>No items yet — add your first link.</p>}
            {draft.items.map((m, i) => (
              <div key={i} style={{ border: "1px solid #EEE", borderRadius: "8px", padding: "12px", marginBottom: "12px", background: "#FAFAF8" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <button onClick={() => moveItem(i, -1)} disabled={i === 0} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "5px", cursor: i === 0 ? "not-allowed" : "pointer", opacity: i === 0 ? 0.4 : 1, fontSize: "11px", padding: "1px 6px" }}>↑</button>
                    <button onClick={() => moveItem(i, 1)} disabled={i === draft.items.length - 1} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "5px", cursor: i === draft.items.length - 1 ? "not-allowed" : "pointer", opacity: i === draft.items.length - 1 ? 0.4 : 1, fontSize: "11px", padding: "1px 6px" }}>↓</button>
                  </div>
                  <input style={{ ...input, flex: "0 0 170px", padding: "8px 10px" }} value={m.label} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="Label (e.g. Shop)" />
                  <MenuLinkField href={m.href} onChange={(v) => setItem(i, { href: v })} products={products} categories={categories} pages={pages} />
                  <button onClick={() => removeItem(i)} title="Remove" style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer" }}>×</button>
                </div>
                {/* Sub-items */}
                <div style={{ marginTop: "8px", paddingLeft: "20px", borderLeft: "2px solid #EEE" }}>
                  {(m.children ?? []).map((c, j) => (
                    <div key={j} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{ color: "#bbb", fontSize: "12px" }}>↳</span>
                      <input style={{ ...input, flex: "0 0 150px", padding: "7px 10px" }} value={c.label} onChange={(e) => setChild(i, j, { label: e.target.value })} placeholder="Sub label" />
                      <MenuLinkField href={c.href} onChange={(v) => setChild(i, j, { href: v })} products={products} categories={categories} pages={pages} compact />
                      <button onClick={() => removeChild(i, j)} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "16px", cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => addChild(i)} style={{ background: "transparent", border: "none", color: "#1C3557", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "4px 0" }}>+ Add sub-menu item</button>
                </div>
              </div>
            ))}
            <button onClick={addItem} style={{ ...btnGhost, marginTop: "4px" }}>+ Add Menu Item</button>
          </div>

          {!readOnly && (
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginBottom: "40px" }}>
              {dirty && <span style={{ fontSize: "13px", color: "#B45309" }}>Unsaved changes</span>}
              <button onClick={handleSave} disabled={saving || !dirty} style={{ ...btnPrimary, padding: "12px 28px", fontSize: "14px", opacity: saving || !dirty ? 0.55 : 1, cursor: saving || !dirty ? "not-allowed" : "pointer" }}>{saving ? "Saving…" : "Save Menu"}</button>
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
