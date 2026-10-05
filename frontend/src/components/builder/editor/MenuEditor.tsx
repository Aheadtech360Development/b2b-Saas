"use client";

/**
 * A menu's links, edited where the menu is used.
 *
 * Menus are the shop's own — the same records the admin's Menus page edits and
 * the storefront reads — so this saves through the same service, and creates
 * nothing of its own. A footer with four columns is four menus; each column
 * chooses one, and this is where its links are added, renamed, reordered and
 * removed.
 *
 * One thing differs from the rest of the builder and is said in the dialog: a
 * menu is not part of the draft. Saving it changes the links everywhere the
 * menu is shown, the live shop included.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2 } from "lucide-react";
import { menusService } from "@/services/menus.service";
import type { BuilderNode, MenuItem, SiteDoc } from "@/lib/builder/types";
import type { PickCollection, PickMenu, PickProduct } from "@/services/builder.service";
import { walk } from "@/lib/builder/tree";
import { Modal, confirmAction } from "./ui";

export type MenuDialog =
  | { mode: "edit"; id: string }
  | { mode: "new"; name?: string; onMade?: (id: string) => void };

interface Place { label: string; href: string }

/** Where a link can go, by name: the shop's own pages, collections and products. */
function usePlaces(doc: SiteDoc, collections: PickCollection[], searchProducts: (q: string) => Promise<PickProduct[]>) {
  const [products, setProducts] = useState<PickProduct[]>([]);
  useEffect(() => {
    let live = true;
    searchProducts("").then((rows) => { if (live) setProducts(rows.filter((p) => p.status === "active")); }).catch(() => {});
    return () => { live = false; };
  }, [searchProducts]);
  return useMemo(() => ({
    pages: [
      { label: "Home", href: "/" }, { label: "All products", href: "/products" }, { label: "Search", href: "/search" },
      { label: "Cart", href: "/cart" }, { label: "My account", href: "/account" },
      ...Object.entries(doc.pages ?? {}).map(([slug, p]) => ({ label: p.title || slug, href: `/${slug}` })),
    ] as Place[],
    collections: collections.filter((c) => c.active).map((c) => ({ label: c.name, href: `/collections/${c.slug}` })) as Place[],
    products: products.map((p) => ({ label: p.name, href: `/products/${p.slug}` })) as Place[],
  }), [doc.pages, collections, products]);
}

function LinkTo({ href, onChange, places, label }: {
  href: string; onChange: (href: string) => void; places: ReturnType<typeof usePlaces>; label: string;
}) {
  const known = [...places.pages, ...places.collections, ...places.products].some((p) => p.href === href);
  const [custom, setCustom] = useState(!known && href !== "");
  return (
    <div className="sbe-row" style={{ flex: "1 1 220px", flexWrap: "wrap", gap: 6 }}>
      <select className="sbe-in" style={{ flex: "1 1 150px" }} aria-label={`Where “${label}” goes`}
              value={custom ? "__custom" : known ? href : ""}
              onChange={(e) => {
                if (e.target.value === "__custom") { setCustom(true); return; }
                setCustom(false);
                onChange(e.target.value);
              }}>
        <option value="">Choose where it goes…</option>
        <optgroup label="Pages">{places.pages.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}</optgroup>
        {places.collections.length > 0 && <optgroup label="Collections">{places.collections.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}</optgroup>}
        {places.products.length > 0 && <optgroup label="Products">{places.products.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}</optgroup>}
        <option value="__custom">Another address…</option>
      </select>
      {custom && (
        <input className="sbe-in" style={{ flex: "1 1 150px" }} value={href} placeholder="/any-page or https://…" aria-label={`Address for “${label}”`}
               onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** How many times a menu is placed on the site being edited. */
function usesOf(doc: SiteDoc, menuId: string): number {
  let n = 0;
  const count = (tree: BuilderNode | null | undefined) => walk(tree ?? null, (node) => {
    if (node.type === "menu" && (node.props as Record<string, unknown> | undefined)?.menuId === menuId) n++;
  });
  for (const part of Object.values(doc.parts ?? {})) count(part);
  for (const group of Object.values(doc.templates ?? {})) for (const tpl of Object.values(group ?? {})) count(tpl?.tree);
  for (const page of Object.values(doc.pages ?? {})) count(page.tree);
  for (const g of Object.values(doc.globals ?? {})) count(g.tree);
  return n;
}

export function MenuEditor({ dialog, menus, doc, collections, searchProducts, onClose, onChanged, onDeleted }: {
  dialog: MenuDialog;
  menus: PickMenu[];
  doc: SiteDoc;
  collections: PickCollection[];
  searchProducts: (q: string) => Promise<PickProduct[]>;
  onClose: () => void;
  /** A menu was made or saved: the list the builder draws from is updated with it. */
  onChanged: (menu: PickMenu) => void;
  onDeleted: (id: string) => void;
}) {
  const existing = dialog.mode === "edit" ? menus.find((m) => m.id === dialog.id) ?? null : null;
  const [id, setId] = useState<string | null>(existing?.id ?? null);
  const [name, setName] = useState(existing?.name ?? (dialog.mode === "new" ? dialog.name ?? "" : ""));
  const [items, setItems] = useState<MenuItem[]>(() => structuredClone(existing?.items ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const places = usePlaces(doc, collections, searchProducts);
  const used = id ? usesOf(doc, id) : 0;

  const change = (next: MenuItem[]) => { setItems(next); setDirty(true); };
  const setItem = (i: number, patch: Partial<MenuItem>) => change(items.map((it, x) => (x === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    change(next);
  };
  const setChild = (i: number, j: number, patch: Partial<MenuItem>) =>
    setItem(i, { children: (items[i]?.children ?? []).map((c, x) => (x === j ? { ...c, ...patch } : c)) });
  const moveChild = (i: number, j: number, d: -1 | 1) => {
    const kids = [...(items[i]?.children ?? [])];
    const k = j + d;
    if (k < 0 || k >= kids.length) return;
    [kids[j], kids[k]] = [kids[k]!, kids[j]!];
    setItem(i, { children: kids });
  };

  const close = () => { if (!dirty || confirmAction("Close without saving the changes to this menu?")) onClose(); };

  async function save() {
    const clean = name.trim();
    if (!clean) { setError("Give the menu a name — it is how you pick it for a column."); return; }
    const links = items
      .map((it) => ({ label: it.label.trim(), href: it.href.trim(), children: (it.children ?? []).map((c) => ({ label: c.label.trim(), href: c.href.trim() })).filter((c) => c.label) }))
      .filter((it) => it.label)
      .map((it) => (it.children.length ? it : { label: it.label, href: it.href }));
    setBusy(true);
    setError("");
    try {
      let menuId = id;
      if (!menuId) {
        const made = await menusService.create(clean);
        menuId = made.id;
        setId(menuId);
      }
      const saved = await menusService.update(menuId, { name: clean, items: links });
      onChanged({ id: saved.id, name: saved.name, items: saved.items ?? [] });
      if (dialog.mode === "new") dialog.onMade?.(saved.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!id) return;
    const where = used ? ` It is used ${used === 1 ? "once" : `${used} times`} on this site — those spots will be empty until another menu is chosen.` : "";
    if (!confirmAction(`Delete the menu “${name}”?${where} This cannot be undone.`)) return;
    setBusy(true);
    try {
      await menusService.remove(id);
      onDeleted(id);
      onClose();
    } catch {
      setError("That menu could not be deleted.");
      setBusy(false);
    }
  }

  return (
    <Modal wide title={id ? "Edit menu" : "New menu"} onClose={close}
           footer={(
             <>
               {id && <button type="button" className="sbe-btn danger" onClick={remove} disabled={busy} style={{ marginRight: "auto" }}><Trash2 size={14} /> Delete menu</button>}
               <button type="button" className="sbe-btn" onClick={close} disabled={busy}>Cancel</button>
               <button type="button" className="sbe-btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : id ? "Save menu" : "Create menu"}</button>
             </>
           )}>
      <div className="sbe-field">
        <label htmlFor="sbe-menu-name">Menu name</label>
        <input id="sbe-menu-name" className="sbe-in" value={name} maxLength={80} autoFocus={!id} placeholder="e.g. Footer — Shop, Footer — Help"
               onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <div className="sbe-help">Only you see this name. It is how you pick the menu for a header or a footer column.</div>
      </div>

      {id && (
        <div className="sbe-note warn" role="note">
          A menu belongs to your shop, not to this draft. Saving changes its links everywhere it is shown{used ? ` — ${used === 1 ? "one place" : `${used} places`} on this site` : ""} — <b>on your live shop too</b>, straight away.
        </div>
      )}

      <div className="sbe-h" style={{ marginTop: 14 }}><span>Links</span><span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>{items.length} {items.length === 1 ? "link" : "links"}</span></div>
      {items.length === 0 && <div className="sbe-help" style={{ marginBottom: 10 }}>No links yet. Add the first one.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} className="sbe-menu-row" data-menu-link={i}>
            <div className="sbe-row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button type="button" className="sbe-icon sm" style={{ width: 24, height: 18 }} aria-label={`Move “${it.label || "link"}” up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></button>
                <button type="button" className="sbe-icon sm" style={{ width: 24, height: 18 }} aria-label={`Move “${it.label || "link"}” down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></button>
              </div>
              <input className="sbe-in" style={{ flex: "1 1 140px" }} value={it.label} placeholder="What the link says" aria-label={`Link ${i + 1} text`}
                     onChange={(e) => setItem(i, { label: e.target.value })} />
              <LinkTo href={it.href} onChange={(href) => setItem(i, { href })} places={places} label={it.label || `link ${i + 1}`} />
              <button type="button" className="sbe-icon sm" aria-label={`Remove “${it.label || "link"}”`} style={{ color: "#B42318" }}
                      onClick={() => change(items.filter((_, x) => x !== i))}><Trash2 size={14} /></button>
            </div>
            {(it.children ?? []).map((c, j) => (
              <div key={j} className="sbe-row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6, paddingLeft: 30 }}>
                <CornerDownRight size={14} style={{ color: "#9AA0AC", flex: "0 0 auto" }} aria-hidden />
                <input className="sbe-in" style={{ flex: "1 1 120px" }} value={c.label} placeholder="A link under it" aria-label={`Link under ${it.label || `link ${i + 1}`}, ${j + 1}`}
                       onChange={(e) => setChild(i, j, { label: e.target.value })} />
                <LinkTo href={c.href} onChange={(href) => setChild(i, j, { href })} places={places} label={c.label || "link"} />
                <button type="button" className="sbe-icon sm" aria-label="Move up" disabled={j === 0} onClick={() => moveChild(i, j, -1)}><ArrowUp size={12} /></button>
                <button type="button" className="sbe-icon sm" aria-label="Move down" disabled={j === (it.children?.length ?? 0) - 1} onClick={() => moveChild(i, j, 1)}><ArrowDown size={12} /></button>
                <button type="button" className="sbe-icon sm" aria-label={`Remove “${c.label || "link"}”`} style={{ color: "#B42318" }}
                        onClick={() => setItem(i, { children: (it.children ?? []).filter((_, x) => x !== j) })}><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" className="sbe-btn sm ghost" style={{ marginTop: 6, marginLeft: 26 }}
                    onClick={() => setItem(i, { children: [...(it.children ?? []), { label: "", href: "" }] })}>
              <Plus size={12} /> Add a link under this one
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="sbe-btn" style={{ marginTop: 10 }} onClick={() => change([...items, { label: "", href: "" }])}>
        <Plus size={14} /> Add link
      </button>
      {error && <div className="sbe-note warn" role="alert" style={{ marginTop: 12, borderColor: "#F1C4BF", background: "#FEF3F2", color: "#912018" }}>{error}</div>}
    </Modal>
  );
}
