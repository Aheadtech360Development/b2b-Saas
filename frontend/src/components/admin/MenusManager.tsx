"use client";

import { ask } from "@/lib/dialog";
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


export default function MenusManager() {
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role, user?.read_only);
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

  async function selectMenu(m: NavMenu) {
    if (dirty && !await ask("Discard unsaved changes to this menu?")) return;
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
    if (!await ask(`Delete menu "${m.name}"? Any header/footer using it will fall back to default.`)) return;
    try {
      await menusService.remove(m.id);
      const rest = menus.filter((x) => x.id !== m.id);
      setMenus(rest);
      if (draft?.id === m.id) { setDraft(rest[0] ? structuredClone(rest[0]) : null); setDirty(false); }
    } catch { setError("Could not delete menu."); }
  }

  if (loading) return <div className="pc-page"><div className="pc-card pc-empty">Loading menus…</div></div>;

  return (
    <div className="pc-page" data-menus>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Storefront</div>
          <h1 className="pc-h1">Menus</h1>
          <p className="pc-sub-line">Build navigation menus, then choose which one shows in your header and footer (Website builder, Header and Footer).</p>
        </div>
        {!readOnly && !showNew && <button type="button" className="pc-btn" data-kind="primary" onClick={() => setShowNew(true)}>New menu</button>}
      </div>

      {error && <div className="pc-flash" data-bad="" role="alert">{error}</div>}

      {showNew && !readOnly && (
        <div className="pc-card pc-pad" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
          <input className="pc-input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Menu name (Main menu, Footer menu)" aria-label="Menu name" style={{ flex: 1, minWidth: "220px" }} />
          <button type="button" className="pc-btn" data-kind="primary" onClick={handleCreate} disabled={!newName.trim()}>Create</button>
          <button type="button" className="pc-btn" onClick={() => { setShowNew(false); setNewName(""); }}>Cancel</button>
        </div>
      )}

      {menus.length > 0 && (
        <div className="pc-seg" role="group" aria-label="Menus" style={{ marginBottom: "16px", flexWrap: "wrap" }}>
          {menus.map((m) => (
            <button key={m.id} type="button" aria-pressed={draft?.id === m.id} onClick={() => selectMenu(m)}>
              {m.name} <span style={{ opacity: 0.7, fontWeight: 500 }}>({m.items.length})</span>
            </button>
          ))}
        </div>
      )}

      {menus.length === 0 ? (
        <div className="pc-card pc-empty">No menus yet. Make one (for example &quot;Main menu&quot;) to set your shop&apos;s navigation.</div>
      ) : draft && (
        <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
          <section className="pc-card pc-pad" style={{ display: "grid", gap: "14px", marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: "200px", display: "grid", gap: "6px" }}>
                <span className="pc-label">Menu name</span>
                <input className="pc-input" value={draft.name} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setDirty(true); }} />
              </label>
              {!readOnly && <button type="button" className="pc-btn" style={{ color: "var(--pc-red)" }} onClick={() => handleDelete(draft)}>Delete menu</button>}
            </div>

            <span className="pc-label">Menu items</span>
            {draft.items.length === 0 && <p className="pc-sub-line" style={{ margin: 0 }}>No items yet. Add the first link.</p>}
            {draft.items.map((m, i) => (
              <div key={i} data-menu-item={i} style={{ border: "1px solid var(--pc-line)", borderRadius: "10px", padding: "12px", background: "#F8FAFC" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <button type="button" className="pc-x" aria-label="Move up" onClick={() => moveItem(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="pc-x" aria-label="Move down" onClick={() => moveItem(i, 1)} disabled={i === draft.items.length - 1}>↓</button>
                  </div>
                  <input className="pc-input" aria-label="Label" style={{ flex: "0 0 170px" }} value={m.label} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="Label (Shop)" />
                  <MenuLinkField href={m.href} onChange={(v) => setItem(i, { href: v })} products={products} categories={categories} pages={pages} />
                  <button type="button" className="pc-x" style={{ color: "var(--pc-red)" }} aria-label="Remove" onClick={() => removeItem(i)}>×</button>
                </div>
                <div style={{ marginTop: "8px", paddingLeft: "20px", borderLeft: "2px solid var(--pc-line)" }}>
                  {(m.children ?? []).map((c, j) => (
                    <div key={j} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--pc-faint)", fontSize: "12px" }}>↳</span>
                      <input className="pc-input" aria-label="Sub label" style={{ flex: "0 0 150px", height: "38px" }} value={c.label} onChange={(e) => setChild(i, j, { label: e.target.value })} placeholder="Sub label" />
                      <MenuLinkField href={c.href} onChange={(v) => setChild(i, j, { href: v })} products={products} categories={categories} pages={pages} compact />
                      <button type="button" className="pc-x" style={{ color: "var(--pc-red)" }} aria-label="Remove the sub item" onClick={() => removeChild(i, j)}>×</button>
                    </div>
                  ))}
                  <button type="button" className="pc-link" style={{ background: "none", border: 0, padding: "4px 0", fontSize: "13px" }} onClick={() => addChild(i)}>+ Add sub-menu item</button>
                </div>
              </div>
            ))}
            <div><button type="button" className="pc-btn" onClick={addItem}>+ Add menu item</button></div>
          </section>

          {!readOnly && (
            <div className="pc-row-actions" style={{ justifyContent: "flex-end", marginBottom: "40px" }}>
              {dirty && <span style={{ fontSize: "13px", color: "var(--pc-amber)" }}>Unsaved changes</span>}
              <button type="button" className="pc-btn" data-kind="primary" onClick={handleSave} disabled={saving || !dirty}>{saving ? "Saving…" : "Save menu"}</button>
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
