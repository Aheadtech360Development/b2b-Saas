"use client";

/**
 * Inventory — one of the Products tabs, in two views:
 * - Products (the default, components/admin/InventoryProducts): every product
 *   with its Count stock switch and each size's count, saved in place.
 * - SKUs: every SKU of the stocked products (services/stock_view.py on the
 *   server), with what it has, what open orders hold and what is coming on
 *   purchase orders. The old inventory report is this view now.
 *
 * Available is what is left to sell, Reserved what open orders still hold
 * (taken off Available when they were placed), On hand the two together. A
 * product that counts its stock (products.track_inventory) is sold out at 0;
 * one that does not sells without a limit, whatever its number says.
 *
 * Adjust opens the SKU's drawer: its count in each warehouse, a change with a
 * reason, and every change made to it, by whom and why.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { downloadCsv } from "@/services/admin.service";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";
import { InventoryProducts } from "@/components/admin/InventoryProducts";

interface Row {
  variant_id: string; product_id: string; product_name: string; product_slug: string | null;
  sku: string; color: string | null; size: string | null; counted: boolean;
  available: number; reserved: number | null; on_hand: number; threshold: number; state: "zero" | "low" | "in" | "free";
}
interface Board {
  items: Row[]; total: number; page: number; page_size: number;
  stats: { skus: number; counted: number; zero: number; low: number; available: number; reserved: number; incoming: { units: number; orders: number } };
  products: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
}
interface History {
  variant_id: string; sku: string; color: string | null; size: string | null; product_name: string; reserved: number;
  warehouses: { warehouse_id: string; warehouse: string; quantity: number; threshold: number }[];
  changes: { at: string | null; warehouse: string; before: number; after: number; change: number; reason: string; notes: string | null; by: string | null }[];
}

const PAGE_SIZE = 50;
const REASONS: [string, string][] = [["received", "Received"], ["correction", "Count correction"], ["damaged", "Damaged or lost"], ["returned", "Returned"]];
const REASON_WORD: Record<string, string> = { received: "Received", correction: "Count correction", damaged: "Damaged or lost", returned: "Returned", sold: "Sold", migration: "Imported" };

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading inventory…</div></div>}>
      <InventoryViews />
    </Suspense>
  );
}

const VIEWS: [string, string][] = [["products", "Products"], ["skus", "SKUs"]];

/** Products (each product's Count stock switch and counts) or SKUs (the list
 *  with what open orders hold and each SKU's history), kept in the address. */
function InventoryViews() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "skus" ? "skus" : "products";
  const views = (
    <div className="pc-seg" role="group" aria-label="View" style={{ marginBottom: "16px" }}>
      {VIEWS.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={view === key} data-view={key}
          onClick={() => router.replace(key === "products" ? pathname : `${pathname}?view=${key}`, { scroll: false })}>{label}</button>
      ))}
    </div>
  );
  if (view === "skus") return <Inventory views={views} />;
  return (
    <ProductsFrame active="inventory" title="Inventory"
      sub="A product that counts its stock sells only what you have, and is sold out at 0. One that does not count it sells without a limit. Gang sheets and made to order products are printed when ordered, so they have nothing to count.">
      {views}
      <InventoryProducts />
    </ProductsFrame>
  );
}

function Inventory({ views }: { views: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const product = params.get("product") ?? "";
  const warehouse = params.get("warehouse") ?? "";
  const stock = params.get("stock") ?? "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const here = params.toString();

  const [data, setData] = useState<Board | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [qText, setQText] = useState(q);
  const [pop, setPop] = useState<"product" | "warehouse" | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const seq = useRef(0);

  const setParams = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    if (!("page" in next)) p.delete("page");
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => { setQText(q); }, [q]);
  useEffect(() => {
    if (qText === q) return;
    const t = setTimeout(() => setParams({ q: qText.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [qText, q, setParams]);

  const query = useCallback((extra: Record<string, string> = {}) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (product) s.set("product", product);
    if (warehouse) s.set("warehouse", warehouse);
    if (stock !== "all") s.set("stock", stock);
    for (const [k, v] of Object.entries(extra)) s.set(k, v);
    return s.toString();
  }, [q, product, warehouse, stock]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const d = await apiClient.get<Board>(`/api/v1/admin/inventory/board?${query({ page: String(page), page_size: String(PAGE_SIZE) })}`);
      if (mine !== seq.current) return;
      setData(d); setError("");
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e instanceof Error ? e.message : "The inventory could not be loaded.");
    }
    setShownFor(here);
  }, [query, page, here]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".pc-pop-wrap")) setPop(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [pop]);

  const s = data?.stats;
  const rows = data?.items ?? [];
  const loaded = shownFor === here;
  const first = (page - 1) * PAGE_SIZE + 1;
  const productName = data?.products.find((p) => p.id === product)?.name;
  const warehouseName = data?.warehouses.find((w) => w.id === warehouse)?.name;

  return (
    <ProductsFrame active="inventory" title="Inventory" sub="Every SKU of the products sold by colour and size. Made to order products never appear here."
      actions={<button type="button" className="pc-btn" onClick={() => { downloadCsv(`/api/v1/admin/inventory/board/export?${query()}`, "inventory.csv").catch(() => setFlash({ text: "The export did not download.", bad: true })); }}>Export</button>}>
      {views}
      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)}><X size={16} /></button>
        </div>
      )}

      {s && s.zero > 0 && (
        <div className="pc-note" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }} data-zero-note>
          <span>
            {s.zero === s.counted ? `All ${s.counted} counted SKUs are sold out.` : `${s.zero} of ${s.counted} counted SKUs are sold out.`}
            {" "}Customers cannot order them until you add stock with Adjust. A product you do not want limited by stock can have Count stock switched off in the Products view.
          </span>
          {stock !== "zero" && <button type="button" className="pc-btn" onClick={() => setParams({ stock: "zero" })}>Show them</button>}
        </div>
      )}

      <div className="pc-stats4" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }} data-inventory-stats>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{s ? s.counted.toLocaleString() : "…"}</div><div className="pc-stat4-l">Counted SKUs</div>
          {s && <div className="pc-stat4-s">{s.skus - s.counted ? `${(s.skus - s.counted).toLocaleString()} more sell without a limit` : `${s.reserved.toLocaleString()} units on open orders`}</div>}</div>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{s ? s.zero.toLocaleString() : "…"}</div><div className="pc-stat4-l">Sold out</div>
          {s && <div className="pc-stat4-s">{s.low} low, at or under their line</div>}</div>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{s ? s.incoming.units.toLocaleString() : "…"}</div><div className="pc-stat4-l">Incoming</div>
          {s && <div className="pc-stat4-s">{s.incoming.orders ? <Link href="/admin/purchase-orders" className="pc-link">on {s.incoming.orders} purchase {s.incoming.orders === 1 ? "order" : "orders"}</Link> : "No purchase orders on the way"}</div>}</div>
      </div>

      <div className="pc-filters">
        <label className="pc-field" style={{ flex: "1 1 320px", maxWidth: "none" }}>
          <Search size={17} strokeWidth={2} />
          <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search by SKU, product, colour or size" aria-label="Search inventory" />
        </label>
        <div className="pc-pop-wrap">
          <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={pop === "product"} data-menu="product" onClick={() => setPop(pop === "product" ? null : "product")}>Product: {productName ?? "All"}</button>
          {pop === "product" && data && (
            <div className="pc-pop" role="menu" style={{ maxHeight: "320px", overflowY: "auto" }}>
              <button type="button" role="menuitemradio" aria-checked={!product} className="pc-pop-item" data-on={!product ? "" : undefined} onClick={() => { setParams({ product: null }); setPop(null); }}>All</button>
              {data.products.map((p) => (
                <button key={p.id} type="button" role="menuitemradio" aria-checked={product === p.id} className="pc-pop-item" data-on={product === p.id ? "" : undefined}
                  onClick={() => { setParams({ product: p.id }); setPop(null); }}>{p.name}</button>
              ))}
            </div>
          )}
        </div>
        <div className="pc-pop-wrap">
          <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={pop === "warehouse"} data-menu="warehouse" onClick={() => setPop(pop === "warehouse" ? null : "warehouse")}>Warehouse: {warehouseName ?? "All"}</button>
          {pop === "warehouse" && data && (
            <div className="pc-pop" role="menu">
              <button type="button" role="menuitemradio" aria-checked={!warehouse} className="pc-pop-item" data-on={!warehouse ? "" : undefined} onClick={() => { setParams({ warehouse: null }); setPop(null); }}>All</button>
              {data.warehouses.map((w) => (
                <button key={w.id} type="button" role="menuitemradio" aria-checked={warehouse === w.id} className="pc-pop-item" data-on={warehouse === w.id ? "" : undefined}
                  onClick={() => { setParams({ warehouse: w.id }); setPop(null); }}>{w.name}</button>
              ))}
              <Link href="/admin/inventory/warehouses" className="pc-pop-item" style={{ borderTop: "1px solid var(--pc-line)" }}>Manage warehouses</Link>
            </div>
          )}
        </div>
        <button type="button" className="pc-btn" aria-pressed={stock === "low"} data-on={stock === "low" ? "" : undefined}
          onClick={() => setParams({ stock: stock === "low" ? null : "low" })}>Low stock only</button>
      </div>
      {(stock === "zero" || stock === "free") && (
        <div className="pc-chips"><span className="pc-chip" style={{ paddingLeft: "12px" }}>{stock === "zero" ? "Sold out" : "Not counted"} <button type="button" className="pc-x" aria-label="Show every SKU" onClick={() => setParams({ stock: null })}><X size={14} /></button></span></div>
      )}

      <div className="pc-card" data-shown={shownFor ?? undefined} aria-busy={!loaded} data-inventory>
        {error ? <div className="pc-empty">{error} <button type="button" className="pc-link" onClick={() => void load()}>Try again</button></div>
          : !data ? <div className="pc-empty">Loading inventory…</div>
          : rows.length === 0 ? (
            <div className="pc-empty">
              {q || product || stock !== "all" ? "No SKU matches these filters."
                : <>No stocked products yet. Inventory is kept for stocked items (colour and size variants). <Link href="/admin/products/new" className="pc-link">Add one</Link></>}
            </div>
          ) : (
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "860px" }}>
                <thead><tr><th>Product</th><th>SKU</th><th>Colour</th><th>Size</th><th className="pc-num">On hand</th><th className="pc-num">Reserved</th><th className="pc-num">Available</th><th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.variant_id} data-sku={r.sku}>
                      <td><Link href={r.product_slug ? `/admin/products/${r.product_slug}/edit?tab=variants` : "#"} className="pc-row-title">{r.product_name}</Link></td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.sku}</td>
                      <td>{r.color || "—"}</td>
                      <td>{r.size || "—"}</td>
                      <td className="pc-num">{r.on_hand}</td>
                      <td className="pc-num">{r.reserved ?? "—"}</td>
                      <td className="pc-num">
                        {r.state === "in" ? r.available
                          : r.state === "free" ? <span className="pc-pill" style={{ textTransform: "none" }} title="Count stock is off for this product: it sells without a limit">No limit</span>
                          : r.state === "zero" ? <span className="pc-pill" data-tone="red" style={{ textTransform: "none" }} title="Customers cannot order it until you add stock">Sold out</span>
                          : <span className="pc-pill" data-tone="amber" title={`At or under its low stock line (${r.threshold})`}>{r.available}</span>}
                      </td>
                      <td style={{ textAlign: "right" }}><button type="button" className="pc-btn" onClick={() => setOpen(r)} data-adjust={r.sku}>Adjust</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {data && data.total > 0 && (
          <div className="pc-table-foot">
            <span>Showing {first}–{Math.min(first + rows.length - 1, data.total)} of {data.total}</span>
            <span style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="pc-btn" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button>
              <button type="button" className="pc-btn" disabled={first + rows.length - 1 >= data.total} onClick={() => setParams({ page: String(page + 1) })}>Next</button>
            </span>
          </div>
        )}
      </div>
      <p className="pc-sub-line" style={{ fontSize: "13px", marginTop: "10px" }}>
        Adjust opens the SKU&apos;s history: every change, who made it and why. Reserved is what open orders still hold; it came off Available when they were placed.
      </p>

      {open && (
        <AdjustDrawer row={open} warehouses={data?.warehouses ?? []} onClose={() => setOpen(null)}
          onSaved={(text) => { setFlash({ text }); void load(); }} />
      )}
    </ProductsFrame>
  );
}

function AdjustDrawer({ row, warehouses, onClose, onSaved }: {
  row: Row; warehouses: { id: string; name: string }[]; onClose: () => void; onSaved: (text: string) => void;
}) {
  const [h, setH] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [wh, setWh] = useState(warehouses[0]?.id ?? "");
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("received");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lineDraft, setLineDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { setH(await apiClient.get<History>(`/api/v1/admin/inventory/history/${row.variant_id}`)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "The history could not be loaded."); }
  }, [row.variant_id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, saving]);

  const here = h?.warehouses.find((w) => w.warehouse_id === wh);
  const n = Math.floor(Number(qty));
  const delta = !qty || !Number.isFinite(n) || n < 0 ? null : mode === "add" ? n : mode === "remove" ? -n : n - (here?.quantity ?? 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (delta === null || delta === 0 || !wh) return;
    setSaving(true); setError("");
    try {
      const r = await apiClient.post<{ quantity_after: number }>("/api/v1/admin/inventory/adjust", {
        variant_id: row.variant_id, warehouse_id: wh, quantity_delta: delta, reason, notes: notes.trim() || null,
      });
      setQty(""); setNotes("");
      await load();
      onSaved(`${row.sku}: ${delta > 0 ? `+${delta}` : delta} in ${warehouses.find((w) => w.id === wh)?.name ?? "the warehouse"}, now ${r.quantity_after}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change was not saved.");
    }
    setSaving(false);
  }

  async function saveLine(warehouseId: string) {
    const v = lineDraft[warehouseId];
    if (v === undefined) return;
    try {
      await apiClient.patch("/api/v1/admin/inventory/threshold", { variant_id: row.variant_id, warehouse_id: warehouseId, threshold: Number(v) });
      setLineDraft((d) => { const n2 = { ...d }; delete n2[warehouseId]; return n2; });
      await load();
      onSaved(`${row.sku} counts as low at ${v} or under.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The low stock line was not saved.");
    }
  }

  return (
    <div className="pc-drawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <aside className="pc-drawer" role="dialog" aria-label={`Adjust ${row.sku}`} data-adjust-drawer>
        <div className="pc-panel-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="pc-h2">{row.product_name}</h2>
            <p className="pc-sub-line" style={{ fontSize: "13px", margin: "2px 0 0" }}>{[row.sku, row.color, row.size].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="pc-panel-body">
          {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
          {warehouses.length === 0 ? (
            <div className="pc-note">There is no warehouse to keep stock in yet. <Link href="/admin/inventory/warehouses" className="pc-link">Add a warehouse</Link></div>
          ) : (<>
            <div>
              <div className="pc-label">In each warehouse</div>
              {!h ? <div className="pc-sub-line" style={{ fontSize: "13px" }}>Loading…</div> : h.warehouses.map((w) => (
                <div key={w.warehouse_id} className="pc-person" style={{ alignItems: "center" }}>
                  <span><b style={{ fontWeight: 600 }}>{w.warehouse}</b><span className="pc-sub-line" style={{ display: "block", fontSize: "12.5px" }}>{w.quantity} to sell</span></span>
                  <span style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "12.5px", color: "var(--pc-muted)" }}>
                    Low at
                    <input className="pc-input" type="number" min={0} style={{ width: "76px", height: "32px" }} aria-label={`Low stock line in ${w.warehouse}`}
                      value={lineDraft[w.warehouse_id] ?? String(w.threshold)} onChange={(e) => setLineDraft((d) => ({ ...d, [w.warehouse_id]: e.target.value }))} />
                    {lineDraft[w.warehouse_id] !== undefined && lineDraft[w.warehouse_id] !== String(w.threshold) &&
                      <button type="button" className="pc-btn" style={{ height: "32px" }} onClick={() => void saveLine(w.warehouse_id)}>Save</button>}
                  </span>
                </div>
              ))}
              {h && h.reserved > 0 && <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: "8px 0 0" }}>{h.reserved} more are on open orders, already taken off what is left to sell.</p>}
            </div>

            <form onSubmit={save} style={{ display: "grid", gap: "10px", borderTop: "1px solid var(--pc-line)", paddingTop: "14px" }} data-adjust-form>
              <div className="pc-label">Change the count</div>
              <div className="pc-seg" role="group" aria-label="How">
                <button type="button" aria-pressed={mode === "add"} onClick={() => { setMode("add"); setReason("received"); }}>Add</button>
                <button type="button" aria-pressed={mode === "remove"} onClick={() => { setMode("remove"); setReason("damaged"); }}>Remove</button>
                <button type="button" aria-pressed={mode === "set"} onClick={() => { setMode("set"); setReason("correction"); }}>Set the count</button>
              </div>
              <div className="pc-form2">
                {warehouses.length > 1 && (
                  <label><span className="pc-label">Warehouse</span>
                    <select className="pc-input" value={wh} onChange={(e) => setWh(e.target.value)}>
                      {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select></label>
                )}
                <label><span className="pc-label">{mode === "set" ? "Counted" : "How many"}</span>
                  <input className="pc-input" type="number" min={0} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required aria-label="Quantity" /></label>
                <label><span className="pc-label">Why</span>
                  <select className="pc-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></label>
                <label className="pc-wide"><span className="pc-label">Note (optional)</span>
                  <input className="pc-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="PO number, who counted, what broke…" /></label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button type="submit" className="pc-btn" data-kind="primary" disabled={saving || delta === null || delta === 0}>{saving ? "Saving…" : "Save change"}</button>
                {delta !== null && delta !== 0 && here && <span className="pc-sub-line" style={{ fontSize: "13px" }}>{here.quantity} → {Math.max(0, here.quantity + delta)}</span>}
                {mode === "set" && delta === 0 && <span className="pc-sub-line" style={{ fontSize: "13px" }}>That is already the count.</span>}
              </div>
            </form>
          </>)}

          <div style={{ borderTop: "1px solid var(--pc-line)", paddingTop: "14px" }} data-history>
            <div className="pc-label">Every change</div>
            {!h ? <div className="pc-sub-line" style={{ fontSize: "13px" }}>Loading…</div>
              : h.changes.length === 0 ? <p className="pc-sub-line" style={{ fontSize: "13px", margin: 0 }}>No changes yet.</p>
              : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "10px" }}>
                  {h.changes.map((c, i) => (
                    <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13.5px" }}>
                      <span style={{ minWidth: 0 }}>
                        <b style={{ fontWeight: 600 }}>{REASON_WORD[c.reason] ?? c.reason}</b>{h.warehouses.length > 1 ? ` · ${c.warehouse}` : ""}
                        <span className="pc-sub-line" style={{ display: "block", fontSize: "12.5px" }}>
                          {c.at ? new Date(c.at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                          {c.by ? ` · ${c.by}` : ""}{c.notes ? ` · ${c.notes}` : ""}
                        </span>
                      </span>
                      <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                        <b style={{ color: c.change > 0 ? "var(--pc-green)" : c.change < 0 ? "var(--pc-red)" : undefined }}>{c.change > 0 ? `+${c.change}` : c.change}</b>
                        <span className="pc-sub-line" style={{ display: "block", fontSize: "12px" }}>{c.before} → {c.after}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            <p className="pc-sub-line" style={{ fontSize: "12px", margin: "10px 0 0" }}>Orders take their units at checkout; they are not listed as changes.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
