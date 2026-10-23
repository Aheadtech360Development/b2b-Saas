"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ask } from "@/lib/dialog";
import { GangSheetProductEditor } from "@/components/admin/GangSheetProductEditor";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";
import {
  gangSheetsService,
  type GangSheetSize,
  type GangSheetLibraryDesign,
  type GangSheetProduct,
  type GangSheetSetup,
  type GangSheetConfig,
  type GangSheetTier,
  type GangSheetSettings,
} from "@/services/gangSheets.service";

// The new admin's look (admin-shell.css tokens), for the tabs not redone yet.
const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid var(--pc-line)",
  borderRadius: "12px",
  padding: "20px",
};
/** A section's title, in the admin's display font. */
const H2: React.CSSProperties = {
  fontFamily: "var(--pc-display)",
  fontSize: "18px",
  fontWeight: 600,
  letterSpacing: "-.01em",
  color: "var(--pc-ink)",
  margin: 0,
};
/** The three ways a brand can sell a gang sheet, named once. */
type GSType = "gang_sheet" | "upload_by_size" | "upload_own";
const TYPE_LABEL: Record<string, string> = {
  gang_sheet: "Gang Sheet",
  upload_by_size: "Upload By Size",
  upload_own: "Upload Your Own Gang Sheet",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--pc-line)",
  borderRadius: "8px",
  fontSize: "14px",
  fontFamily: "inherit",
  color: "var(--pc-ink)",
  background: "#fff",
  boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "13.5px",
  fontWeight: 600,
  color: "var(--pc-ink)",
  marginBottom: "6px",
};
/** The admin's main button: the theme's blue. */
const BTN: React.CSSProperties = {
  background: "var(--pc-blue)",
  color: "#fff",
  border: "1px solid var(--pc-blue)",
  padding: "0 16px",
  height: "42px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
};
/** The admin's plain button: white, the ink's colour. */
const BTN_LIGHT: React.CSSProperties = { ...BTN, background: "#fff", color: "var(--pc-ink)", border: "1px solid var(--pc-line)" };

const EMPTY_SIZE = {
  name: "",
  width_in: 22,
  height_in: 60,
  price_per_sheet: 0,
  bleed_in: 0.125,
  spacing_in: 0.25,
  is_active: true,
  sort_order: 0,
  pricing_mode: "fixed" as "fixed" | "custom_length",
  price_per_inch: 0,
  min_length_in: 12,
  max_length_in: 240,
  max_upload_mb: null as number | null,
};

// One-click seed of the sizes ~95% of DTF stores offer (22" wide).
const STANDARD_DTF_SIZES = [
  { name: "22 × 24", height_in: 24, price_per_sheet: 12.99 },
  { name: "22 × 36", height_in: 36, price_per_sheet: 18.99 },
  { name: "22 × 48", height_in: 48, price_per_sheet: 24.99 },
  { name: "22 × 60", height_in: 60, price_per_sheet: 29.99 },
  { name: "22 × 72", height_in: 72, price_per_sheet: 35.99 },
  { name: "22 × 84", height_in: 84, price_per_sheet: 41.99 },
  { name: "22 × 96", height_in: 96, price_per_sheet: 47.99 },
];

// The classic "N feet" gang-sheet ladder (22" wide) most DTF stores sell.
const STANDARD_FEET_SIZES = [
  { name: "2 feet", height_in: 24, price_per_sheet: 15 },
  { name: "3 feet", height_in: 36, price_per_sheet: 21 },
  { name: "4 feet", height_in: 48, price_per_sheet: 26 },
  { name: "5 feet", height_in: 60, price_per_sheet: 32 },
  { name: "6 feet", height_in: 72, price_per_sheet: 36 },
  { name: "7 feet", height_in: 84, price_per_sheet: 42 },
  { name: "8 feet", height_in: 96, price_per_sheet: 48 },
  { name: "10 feet", height_in: 120, price_per_sheet: 54 },
  { name: "12 feet", height_in: 144, price_per_sheet: 62 },
  { name: "15 feet", height_in: 180, price_per_sheet: 76 },
  { name: "20 feet", height_in: 240, price_per_sheet: 105 },
];

interface SizeRow { id?: string; name: string; width_in: number; height_in: number; price_per_sheet: number; }

/** The page's tabs, in the address (?tab=), so a link, Back and a refresh all land on the same one.
 *  The builder's setup only: its print jobs live in Production. */
const TABS = [
  { key: "products", label: "Products" },
  { key: "sizes", label: "Sheet sizes" },
  { key: "library", label: "Design library" },
  { key: "settings", label: "Builder settings" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AdminGangSheetsPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading gang sheets…</div></div>}>
      <GangSheetsAdmin />
    </Suspense>
  );
}

function GangSheetsAdmin() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "products";

  // Old addresses: a job (?sheet=) has its own page; the Dashboard and Print
  // jobs tabs ("orders" before that) are All print jobs under Production now.
  useEffect(() => {
    const id = params.get("sheet");
    if (id) { window.location.replace(`/admin/production/${encodeURIComponent(id)}`); return; }
    if (raw === "dashboard" || raw === "jobs" || raw === "orders") {
      const st = params.get("status");
      window.location.replace(`/admin/production/all${st ? `?status=${encodeURIComponent(st)}` : ""}`);
    }
  }, [params, raw]);

  const href = (key: TabKey) => `/admin/gang-sheets?tab=${key}`;

  return (
    <ProductsFrame active="gang-sheets" title="Gang sheet setup" sub="Sizes, prices and builder rules. Print jobs live in Production."
      actions={<Link href="/admin/production" className="pc-btn">Open the print queue</Link>}>
    <div data-gang-sheets data-tab={tab}>
      <nav className="pc-subtabs" aria-label="Gang sheet setup">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} className="pc-subtab" data-tab={t.key}
            data-on={tab === t.key ? "" : undefined} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "products" ? <ProductsTab onGoToSizes={() => router.push(href("sizes"))} />
        : tab === "sizes" ? <SizesTab />
        : tab === "library" ? <LibraryTab />
        : <SettingsTab />}
    </div>
    </ProductsFrame>
  );
}

// ── Set up: what is left before the builder sells ──────────────────────────
function SetupChecklist() {
  const [data, setData] = useState<GangSheetSetup | null>(null);
  useEffect(() => { gangSheetsService.adminSetup().then(setData).catch(() => setData(null)); }, []);
  if (!data) return null;
  const steps = [
    { done: !!data.has_products, title: "Turn the builder on for a product", desc: "Below: switch a product on and choose how it sells." },
    { done: !!data.has_sizes, title: "Add sheet sizes and prices", desc: "Sheet sizes: the sizes you offer, for every product or one." },
    { done: !!data.has_library, title: "Add ready-made designs (optional)", desc: "Design library: artwork customers can drop onto a sheet." },
    { done: !!data.has_designs, title: "Receive your first job", desc: "Customers build sheets on your storefront; they land in Production." },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (left === 0) return null;
  return (
    <div className="pc-card" style={{ marginBottom: "16px" }} data-gs-checklist>
      <div className="pc-card-head">
        <h2 className="pc-h2">Get the builder ready</h2>
        <span className="pc-sub-line" style={{ fontSize: "13px" }}>{steps.length - left} of {steps.length} done</span>
      </div>
      {steps.map((x) => (
        <div key={x.title} className="pc-step" data-done={x.done ? "" : undefined}>
          <span className="pc-step-dot" aria-hidden>{x.done ? "✓" : ""}</span>
          <span><span className="pc-step-title">{x.title}</span><span className="pc-step-detail" style={{ display: "block" }}>{x.desc}</span></span>
          {x.done && <span className="pc-step-done">Done</span>}
        </div>
      ))}
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────────────────
function ProductsTab({ onGoToSizes }: { onGoToSizes: () => void }) {
  const [products, setProducts] = useState<GangSheetProduct[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<GangSheetProduct | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    gangSheetsService.adminListProducts(showAll).then(setProducts).catch(() => setProducts([])).finally(() => setLoading(false));
  }, [showAll]);
  useEffect(load, [load]);

  async function patch(id: string, data: { gang_sheet_enabled?: boolean; gang_sheet_type?: string }) {
    setBusyId(id);
    try {
      const updated = await gangSheetsService.adminUpdateProduct(id, data);
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch { /* ignore */ } finally { setBusyId(null); }
  }

  if (editing) {
    return (
      <div className="pc-stack" style={{ gap: "16px" }} data-gs-product-editor={editing.slug}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <button type="button" className="pc-link" onClick={() => { setEditing(null); load(); }}>← All gang sheet products</button>
          <h2 style={{ ...H2, fontSize: "20px" }}>{editing.name}</h2>
          <span style={{ flex: 1 }} />
          <Link href={`/admin/products/${editing.slug}/edit?tab=pricing`} className="pc-link">Open the product</Link>
          <button type="button" className="pc-link" onClick={onGoToSizes}>Default sizes</button>
        </div>
        <GangSheetProductEditor productId={editing.id} productName={editing.name} kind={editing.gang_sheet_type} config={editing.gang_sheet_config} />
      </div>
    );
  }

  return (
    <>
      <SetupChecklist />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <p style={{ fontSize: "13px", color: "#6B6B6B", margin: 0, maxWidth: "620px" }}>
          Enable the gang-sheet builder on a product and choose its builder type. Configure each product&apos;s sizes &amp; prices with the <strong>edit</strong> button.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all products
        </label>
      </div>

      {loading ? (
        <div style={{ padding: "26px" }}>{[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}</div>
      ) : products.length === 0 ? (
        <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>
          {showAll ? "No products found." : "No gang-sheet products yet — tick “Show all products” to enable the builder on a product."}
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F6F6F7", borderBottom: "1px solid #E8E6E1" }}>
                {["Product", "Builder", "Type", "Sizes", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #F1EFEB", opacity: busyId === p.id ? 0.55 : 1 }}>
                  <td style={{ padding: "11px 14px", fontWeight: 600, color: "#2A2830" }}>{p.name}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <button
                      onClick={() => patch(p.id, { gang_sheet_enabled: !p.gang_sheet_enabled })}
                      style={{ background: p.gang_sheet_enabled ? "#DCFCE7" : "#F3F4F6", color: p.gang_sheet_enabled ? "#166534" : "#6B7280", border: "none", padding: "3px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                    >
                      {p.gang_sheet_enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <select
                      value={p.gang_sheet_type ?? ""}
                      onChange={(e) => patch(p.id, { gang_sheet_type: e.target.value })}
                      disabled={!p.gang_sheet_enabled}
                      style={{ ...INPUT, padding: "5px 8px", width: "auto", opacity: p.gang_sheet_enabled ? 1 : 0.5 }}
                    >
                      <option value="">— choose —</option>
                      <option value="gang_sheet">Gang Sheet</option>
                      <option value="upload_by_size">Upload By Size</option>
                      <option value="upload_own">Upload Your Own Gang Sheet</option>
                    </select>
                  </td>
                  <td style={{ padding: "11px 14px", color: "#6B6B6B" }}>{p.size_count}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <a href={`/products/${p.slug}`} target="_blank" rel="noopener noreferrer" title="View on store" style={{ textDecoration: "none", fontSize: "15px", marginRight: "12px" }}>👁</a>
                    <button title="Copy store link" onClick={() => { try { navigator.clipboard?.writeText(`${window.location.origin}/products/${p.slug}`); } catch { /* ignore */ } }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", marginRight: "12px" }}>🔗</button>
                    <button title="Edit builder & sizes" onClick={() => setEditing(p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1A1A1A", fontWeight: 700 }}>✎</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Sheet sizes ───────────────────────────────────────────────────────────────
function SizesTab() {
  const [sizes, setSizes] = useState<GangSheetSize[] | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY_SIZE });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Inline edit: which size is open, and its working values.
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<GangSheetSize>>({});
  // Which product these sizes belong to. "" = the brand's global default set.
  const [scopeProductId, setScopeProductId] = useState<string>("");
  const [products, setProducts] = useState<GangSheetProduct[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    gangSheetsService.adminListProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const load = useCallback(() => {
    gangSheetsService.adminListSizes(scopeProductId || undefined).then(setSizes).catch(() => setSizes([]));
  }, [scopeProductId]);
  useEffect(load, [load]);

  // A name used more than once in this set, ignoring case and spaces.
  const key = (n: string) => n.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  const counts = new Map<string, number>();
  for (const s of sizes ?? []) counts.set(key(s.name), (counts.get(key(s.name)) ?? 0) + 1);
  const repeated = (sizes ?? []).filter((s) => (counts.get(key(s.name)) ?? 0) > 1).length;
  const words = q.trim().toLowerCase();
  const shown = (sizes ?? []).filter((s) => !words || `${s.name} ${s.width_in}x${s.height_in}`.toLowerCase().includes(words));
  const unpriced = (s: GangSheetSize) => (s.pricing_mode === "custom_length" ? !s.price_per_inch : !s.price_per_sheet);

  async function create() {
    if (!draft.name.trim()) { setErr("Give the sheet size a name."); return; }
    setBusy(true); setErr(null);
    try {
      await gangSheetsService.adminCreateSize({ ...draft, product_id: scopeProductId || undefined });
      setFlash(`Added ${draft.name.trim()}.`);
      setDraft({ ...EMPTY_SIZE });
      load();
    } catch {
      setErr("Could not save this sheet size.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: GangSheetSize) {
    await gangSheetsService.adminUpdateSize(s.id, { is_active: !s.is_active }).catch(() => {});
    load();
  }

  async function remove(s: GangSheetSize) {
    if (!await ask(`Delete "${s.name}"? Jobs already made on it keep their sheet details.`, { title: "Delete sheet size", ok: "Delete", danger: true })) return;
    await gangSheetsService.adminDeleteSize(s.id).catch(() => {});
    load();
  }

  async function dedupe() {
    if (!await ask(`Remove the sizes that repeat another's name? One of each name is kept: an active one with a price first. A size a job was made on is hidden instead of deleted.`, { title: "Remove duplicates", ok: "Remove duplicates", danger: true })) return;
    setBusy(true); setErr(null);
    try {
      const r = await gangSheetsService.adminDedupeSizes(scopeProductId || undefined);
      setFlash(r.deleted || r.hidden ? `Removed ${r.deleted} ${r.deleted === 1 ? "size" : "sizes"}${r.hidden ? `, hid ${r.hidden} that jobs were made on` : ""}.` : "Nothing to remove.");
      load();
    } catch {
      setErr("The duplicates were not removed.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(s: GangSheetSize) {
    setEditId(s.id);
    setEditDraft({ name: s.name, width_in: s.width_in, height_in: s.height_in, price_per_sheet: s.price_per_sheet, bleed_in: s.bleed_in, spacing_in: s.spacing_in });
  }

  async function saveEdit(id: string) {
    setBusy(true);
    try {
      await gangSheetsService.adminUpdateSize(id, editDraft);
      setEditId(null);
      load();
    } catch {
      setErr("Could not update this sheet size.");
    } finally {
      setBusy(false);
    }
  }

  async function seedStandard() {
    if (!await ask("Add the 7 standard DTF sizes (22×24 … 22×96)?")) return;
    setBusy(true); setErr(null);
    try {
      for (const s of STANDARD_DTF_SIZES) {
        await gangSheetsService.adminCreateSize({ ...EMPTY_SIZE, name: s.name, height_in: s.height_in, price_per_sheet: s.price_per_sheet, product_id: scopeProductId || undefined });
      }
      setFlash("Added the 7 standard sizes.");
      load();
    } catch {
      setErr("Could not add the standard sizes.");
    } finally {
      setBusy(false);
    }
  }

  const isCustom = draft.pricing_mode === "custom_length";
  const num = (v: string) => Number(v);

  return (
    <div className="pc-cols" style={{ marginTop: 0 }} data-gs-sizes>
      <div style={{ minWidth: 0, display: "grid", gap: "16px", alignContent: "start" }}>
        {flash && <div className="pc-flash" role="status" style={{ marginBottom: 0 }}>{flash}</div>}
        <div className="pc-card pc-pad" data-sizes-for>
          <h2 className="pc-h2" style={{ marginBottom: "12px" }}>Sizes for</h2>
          <div className="pc-form2">
            <label><span className="pc-label">Show sizes for</span>
              <select className="pc-input" value={scopeProductId} onChange={(e) => { setScopeProductId(e.target.value); setEditId(null); }}>
                <option value="">Global default (every product)</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.gang_sheet_type ? ` — ${TYPE_LABEL[p.gang_sheet_type] ?? "Gang Sheet"}` : ""}</option>)}
              </select></label>
            <label><span className="pc-label">Search sizes</span>
              <span className="pc-field" style={{ maxWidth: "none" }}><Search size={16} strokeWidth={2} aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="22×10" aria-label="Search sizes" /></span></label>
          </div>
          <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: "8px 0 0" }}>
            {scopeProductId ? "This product's own sizes." : "The default set: used by a product with no sizes of its own."}
          </p>
          {repeated > 0 && (
            <div className="pc-note" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "12px", flexWrap: "wrap" }} data-dupes>
              <span>{sizes?.length} sizes, {repeated} of them sharing a name with another. Duplicates are flagged so you can remove them.</span>
              <button type="button" className="pc-btn" disabled={busy} onClick={() => void dedupe()}>Remove duplicates</button>
            </div>
          )}
        </div>

        <div className="pc-card" aria-busy={sizes === null}>
          {sizes === null ? <div className="pc-empty">Loading sizes…</div>
            : sizes.length === 0 ? <div className="pc-empty">No sheet sizes yet. Customers cannot order a gang sheet until there is an active one.</div>
            : shown.length === 0 ? <div className="pc-empty">No size matches that search.</div>
            : (
              <div className="pc-scroll-x">
                <table className="pc-table" style={{ minWidth: "720px" }}>
                  <thead><tr><th>Name</th><th>Mode</th><th>Price</th><th>Bleed / spacing</th><th>Active</th><th>Flag</th><th /></tr></thead>
                  <tbody>
                    {shown.map((s) => {
                      const dupe = (counts.get(key(s.name)) ?? 0) > 1;
                      if (editId === s.id) {
                        return (
                          <tr key={s.id} data-size={s.name} style={{ background: "#F8FAFF" }}>
                            <td><input className="pc-input" style={{ height: "34px" }} value={editDraft.name ?? ""} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} aria-label="Name" /></td>
                            <td colSpan={2}>
                              <span style={{ display: "inline-flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                                <input className="pc-input" style={{ height: "34px", width: "70px" }} type="number" step="0.25" value={editDraft.width_in ?? 0} onChange={(e) => setEditDraft({ ...editDraft, width_in: num(e.target.value) })} aria-label="Width" />×
                                <input className="pc-input" style={{ height: "34px", width: "70px" }} type="number" step="0.25" value={editDraft.height_in ?? 0} onChange={(e) => setEditDraft({ ...editDraft, height_in: num(e.target.value) })} aria-label="Height" />
                                $<input className="pc-input" style={{ height: "34px", width: "84px" }} type="number" step="0.01" value={editDraft.price_per_sheet ?? 0} onChange={(e) => setEditDraft({ ...editDraft, price_per_sheet: num(e.target.value) })} aria-label="Price per sheet" />
                              </span>
                            </td>
                            <td>
                              <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                                <input className="pc-input" style={{ height: "34px", width: "64px" }} type="number" step="0.025" value={editDraft.bleed_in ?? 0} onChange={(e) => setEditDraft({ ...editDraft, bleed_in: num(e.target.value) })} aria-label="Bleed" />/
                                <input className="pc-input" style={{ height: "34px", width: "64px" }} type="number" step="0.025" value={editDraft.spacing_in ?? 0} onChange={(e) => setEditDraft({ ...editDraft, spacing_in: num(e.target.value) })} aria-label="Spacing" />
                              </span>
                            </td>
                            <td colSpan={2} />
                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              <button type="button" className="pc-btn" data-kind="primary" style={{ height: "34px" }} disabled={busy} onClick={() => void saveEdit(s.id)}>Save</button>{" "}
                              <button type="button" className="pc-btn" style={{ height: "34px" }} onClick={() => setEditId(null)}>Cancel</button>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={s.id} data-size={s.name}>
                          <td style={{ fontWeight: 600 }}>{s.name}<span className="pc-sub-line" style={{ display: "block", fontSize: "12px", fontWeight: 400 }}>{s.pricing_mode === "custom_length" ? `${s.width_in}″ wide, ${s.min_length_in}–${s.max_length_in}″ long` : `${s.width_in}″ × ${s.height_in}″`}</span></td>
                          <td>{s.pricing_mode === "custom_length" ? "By the inch" : "Fixed"}</td>
                          <td>{s.pricing_mode === "custom_length" ? `$${s.price_per_inch.toFixed(2)}/in` : `$${s.price_per_sheet.toFixed(2)}`}</td>
                          <td style={{ color: "var(--pc-muted)" }}>{s.bleed_in}″ / {s.spacing_in}″</td>
                          <td>
                            <button type="button" className="pc-switch" role="switch" aria-checked={s.is_active} data-on={s.is_active ? "" : undefined}
                              aria-label={`${s.name} offered`} onClick={() => void toggle(s)} />
                          </td>
                          <td>
                            <span className="pc-pills">
                              {dupe && <span className="pc-pill" data-tone="amber">Duplicate</span>}
                              {unpriced(s) && <span className="pc-pill" data-tone="amber">$0.00</span>}
                            </span>
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button type="button" className="pc-link" onClick={() => startEdit(s)} style={{ marginRight: "12px" }}>Edit</button>
                            <button type="button" className="pc-link" style={{ color: "var(--pc-red)" }} onClick={() => void remove(s)}>Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>

      <div className="pc-card pc-pad" style={{ alignSelf: "start" }} data-add-size>
        <h2 className="pc-h2" style={{ marginBottom: "12px" }}>Add a size</h2>
        <div style={{ display: "grid", gap: "12px" }}>
          <label><span className="pc-label">Pricing mode</span>
            <select className="pc-input" value={draft.pricing_mode} onChange={(e) => setDraft({ ...draft, pricing_mode: e.target.value as "fixed" | "custom_length" })}>
              <option value="fixed">Fixed size and price</option>
              <option value="custom_length">Custom length, priced by the inch</option>
            </select></label>
          <label><span className="pc-label">Name</span>
            <input className="pc-input" value={draft.name} placeholder={isCustom ? "Custom gang sheet" : "22×10"} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <div className="pc-form2">
            <label><span className="pc-label">Width (in)</span>
              <input className="pc-input" type="number" step="0.25" min="0.25" value={draft.width_in} onChange={(e) => setDraft({ ...draft, width_in: num(e.target.value) })} /></label>
            {isCustom ? (
              <label><span className="pc-label">Price per inch</span>
                <input className="pc-input" type="number" step="0.01" min="0" value={draft.price_per_inch} onChange={(e) => setDraft({ ...draft, price_per_inch: num(e.target.value) })} /></label>
            ) : (
              <label><span className="pc-label">Height (in)</span>
                <input className="pc-input" type="number" step="0.25" min="0.25" value={draft.height_in} onChange={(e) => setDraft({ ...draft, height_in: num(e.target.value) })} /></label>
            )}
            {isCustom ? (<>
              <label><span className="pc-label">Shortest (in)</span>
                <input className="pc-input" type="number" step="1" min="1" value={draft.min_length_in} onChange={(e) => setDraft({ ...draft, min_length_in: num(e.target.value) })} /></label>
              <label><span className="pc-label">Longest (in)</span>
                <input className="pc-input" type="number" step="1" min="1" value={draft.max_length_in} onChange={(e) => setDraft({ ...draft, max_length_in: num(e.target.value) })} /></label>
            </>) : (
              <label className="pc-wide"><span className="pc-label">Price per sheet</span>
                <input className="pc-input" type="number" step="0.01" min="0" value={draft.price_per_sheet} onChange={(e) => setDraft({ ...draft, price_per_sheet: num(e.target.value) })} /></label>
            )}
            <label><span className="pc-label">Bleed (in)</span>
              <input className="pc-input" type="number" step="0.025" min="0" value={draft.bleed_in} onChange={(e) => setDraft({ ...draft, bleed_in: num(e.target.value) })} /></label>
            <label><span className="pc-label">Spacing (in)</span>
              <input className="pc-input" type="number" step="0.025" min="0" value={draft.spacing_in} onChange={(e) => setDraft({ ...draft, spacing_in: num(e.target.value) })} /></label>
          </div>
          {err && <div className="pc-note" data-tone="red" role="alert">{err}</div>}
          <button type="button" className="pc-btn" data-kind="primary" disabled={busy} onClick={() => void create()}>{busy ? "Saving…" : "Add size"}</button>
          <button type="button" className="pc-link" disabled={busy} onClick={() => void seedStandard()} style={{ justifySelf: "start" }}>Add the 7 standard DTF sizes</button>
          <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: 0 }}>{scopeProductId ? "Added to this product's own sizes." : "Added to the default set."}</p>
        </div>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsTab() {
  const [s, setS] = useState<GangSheetSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    gangSheetsService.adminGetSettings().then((d) => setS(d ?? {})).catch(() => setS({})).finally(() => setLoading(false));
  }, []);

  function set(k: keyof GangSheetSettings, v: unknown) {
    setS((prev) => ({ ...prev, [k]: v }) as GangSheetSettings);
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await gangSheetsService.adminSaveSettings(s);
      setMsg({ text: "Settings saved", ok: true });
    } catch {
      setMsg({ text: "Could not save", ok: false });
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: "26px" }}>{[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}</div>;

  // Plain render helpers (NOT components) so text inputs don't lose focus on re-render.
  // `onByDefault`: a setting that is on until the brand turns it off.
  const toggle = (k: keyof GangSheetSettings, label: string, desc?: string, onByDefault = false) => (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", padding: "6px 0" }}>
      <input type="checkbox" checked={onByDefault ? s[k] !== false : !!s[k]} onChange={(e) => set(k, e.target.checked)} style={{ marginTop: "2px" }} />
      <span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>{label}</span>
        {desc ? <span style={{ display: "block", fontSize: "12px", color: "#9CA3AF" }}>{desc}</span> : null}
      </span>
    </label>
  );
  const section = (title: string, children: React.ReactNode) => (
    <div style={{ ...CARD, marginBottom: "16px" }}>
      <div style={{ ...H2, marginBottom: "12px" }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: "820px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
        {msg && <span style={{ fontSize: "13px", fontWeight: 600, color: msg.ok ? "#166534" : "#B91C1C" }}>{msg.text}</span>}
        <button onClick={save} disabled={saving} style={BTN}>{saving ? "Saving…" : "Save settings"}</button>
      </div>

      {section("General", <>
        <label style={LABEL}>Design-edit request email</label>
        <input style={{ ...INPUT, marginBottom: "14px" }} value={s.design_edit_email ?? ""} onChange={(e) => set("design_edit_email", e.target.value)} placeholder="art@yourbrand.com" />
        <label style={LABEL}>Customer agreement</label>
        <textarea style={{ ...INPUT, minHeight: "90px", resize: "vertical" }} value={s.customer_agreement ?? ""} onChange={(e) => set("customer_agreement", e.target.value)} placeholder="Terms the customer must accept before ordering…" />
      </>)}

      {section("Print output", <>
        <label style={LABEL}>Print file-name format</label>
        <input style={{ ...INPUT, marginBottom: "14px" }} value={s.filename_format ?? ""} onChange={(e) => set("filename_format", e.target.value)} placeholder="{order}-{customer}-{design}" />
        <label style={LABEL}>File type</label>
        <select style={{ ...INPUT, width: "auto", marginBottom: "8px" }} value={s.file_type ?? "PNG"} onChange={(e) => set("file_type", e.target.value)}>
          <option value="PNG">PNG (keeps transparency)</option>
          <option value="PDF">PDF (keeps vectors)</option>
        </select>
        {toggle("print_order_label", "Print the order number and customer above each sheet",
          "A half-inch strip at the top of the print file, so sheets printed together can be cut apart and matched to their order. Nothing on the sheet moves.", true)}
        {toggle("auto_trim", "Auto-trim whitespace", "Trim empty space around artwork — saves film.")}
        {toggle("print_qr_logo", "Print QR / logo on the sheet")}
      </>)}

      {section("Builder behaviour", <>
        {toggle("auto_resize_300", "Auto-resize uploads to 300 DPI")}
        {toggle("warn_background", "Warn about backgrounds")}
        {toggle("warn_transparent", "Warn about partial transparency")}
        {toggle("enable_flip", "Enable flipping (mirror)", "Useful for iron-on transfers printed in reverse.")}
        {toggle("disable_text", "Disable the text tool")}
        {toggle("auto_build", "Enable Auto Build")}
        {toggle("folder_organization", "Folder organisation in uploads")}
        {toggle("require_login", "Require customer login")}
        {toggle("allow_reorder", "Allow reorder of past designs")}
        <div style={{ marginTop: "8px" }}>
          <label style={LABEL}>Minimum resolution (DPI) — reject below</label>
          <input type="number" style={{ ...INPUT, width: "120px" }} value={s.min_resolution ?? 72} onChange={(e) => set("min_resolution", Number(e.target.value))} />
        </div>
      </>)}

      {section("Appearance", <>
        {toggle("welcome_popup", "Show welcome popup")}
        <label style={{ ...LABEL, marginTop: "8px" }}>Welcome message</label>
        <textarea style={{ ...INPUT, minHeight: "70px", resize: "vertical", marginBottom: "14px" }} value={s.welcome_message ?? ""} onChange={(e) => set("welcome_message", e.target.value)} placeholder="Welcome! Build your gang sheet below." />
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <label style={LABEL}>Primary colour</label>
            <input type="color" value={s.theme_primary ?? "#1A1A1A"} onChange={(e) => set("theme_primary", e.target.value)} style={{ width: "56px", height: "34px", border: "1px solid #E3E3E3", borderRadius: "6px", cursor: "pointer", display: "block" }} />
          </div>
          <div>
            <label style={LABEL}>Text colour</label>
            <input type="color" value={s.theme_text ?? "#2A2830"} onChange={(e) => set("theme_text", e.target.value)} style={{ width: "56px", height: "34px", border: "1px solid #E3E3E3", borderRadius: "6px", cursor: "pointer", display: "block" }} />
          </div>
        </div>
      </>)}

      {section("Gallery", <>
        {toggle("show_gallery", "Show the design gallery in the builder")}
        {toggle("watermark_enabled", "Watermark gallery previews", "Discourages screenshots of your stock artwork.")}
        <label style={{ ...LABEL, marginTop: "8px" }}>Watermark text</label>
        <input style={INPUT} value={s.watermark_text ?? ""} onChange={(e) => set("watermark_text", e.target.value)} placeholder="Your store name" />
      </>)}
    </div>
  );
}

// ── Design Library ──────────────────────────────────────────────────────────────
// Ready-made designs buyers can drop straight onto a sheet in the builder's
// "Designs" tab. Admin uploads the file, then it's saved as a library entry.
function LibraryTab() {
  const [designs, setDesigns] = useState<GangSheetLibraryDesign[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  const load = useCallback(() => {
    gangSheetsService.adminListLibrary().then(setDesigns).catch(() => setDesigns([]));
  }, []);
  useEffect(load, [load]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const res = await gangSheetsService.uploadArtwork(file);
        await gangSheetsService.adminCreateLibrary({
          name: res.file_name,
          file_url: res.url,
          file_type: res.type,
          category: category.trim() || undefined,
          is_active: true,
        });
      }
      load();
    } catch {
      setError("Could not upload one of those files.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    await gangSheetsService.adminDeleteLibrary(id).catch(() => {});
    load();
  }

  return (
    <div style={CARD}>
      <div style={{ ...H2, marginBottom: "4px" }}>Ready-made designs</div>
      <p style={{ fontSize: "13px", color: "#777", marginBottom: "16px" }}>
        Upload artwork here and it appears in every buyer&apos;s builder under the <strong>Designs</strong> tab, ready to drop onto a sheet.
      </p>

      <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "18px" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={LABEL}>Category (optional)</label>
          <input style={INPUT} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Holidays, Sports" />
        </div>
        <label style={{ display: "inline-block" }}>
          <input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.svg" onChange={(e) => onFiles(e.target.files)} style={{ display: "none" }} />
          <span style={{ ...BTN, display: "inline-flex" }}>
            {uploading ? "Uploading…" : "＋ Upload designs"}
          </span>
        </label>
      </div>

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>{error}</div>}

      {designs.length === 0 ? (
        <div style={{ color: "#999", fontSize: "13px" }}>No designs yet. Upload some to get started.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px" }}>
          {designs.map((d) => (
            <div key={d.id} style={{ position: "relative", border: "1px solid #E8E6E1", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.file_url} alt={d.name} style={{ width: "100%", height: "110px", objectFit: "contain", background: "#F7F7F5" }} />
              <div style={{ padding: "6px 8px", fontSize: "11px", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
              <button onClick={() => remove(d.id)} title="Remove" style={{ position: "absolute", top: "5px", right: "5px", background: "rgba(255,255,255,.9)", border: "1px solid #F0C9C9", color: "#B91C1C", borderRadius: "6px", width: "24px", height: "24px", fontSize: "12px", fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
