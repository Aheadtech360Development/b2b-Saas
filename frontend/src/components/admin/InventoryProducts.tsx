"use client";

/**
 * Inventory by product, the Inventory screen's main view: whether each product
 * counts its stock, and how many of each colour and size it has.
 *
 * Every product type is listed, so a brand sees at a glance what is limited by
 * stock: a blank tee counts it, a gang sheet is printed when ordered. A count
 * saves when the box is left or Enter is pressed, through the same route the
 * product editor's stock column uses.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { TrackStockSwitch } from "@/components/admin/TrackStockSwitch";

type Tab = "all" | "counted" | "low" | "out" | "not_counted" | "made";
type State = "in_stock" | "low" | "out" | "not_counted" | "made";

export interface InventoryVariant {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  quantity: number;
  low_stock_threshold: number;
  state: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  image: string | null;
  made_to_order: string | null;
  track_inventory: boolean;
  state: State;
  total: number;
  variants: InventoryVariant[];
}

interface Answer {
  items: InventoryItem[];
  counts: Record<Tab, number>;
  total: number;
  page: number;
  pages: number;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "counted", label: "Counted" },
  { key: "low", label: "Low stock" },
  { key: "out", label: "Sold out" },
  { key: "not_counted", label: "Not counted" },
  { key: "made", label: "Made to order" },
];

// The admin's own pills (.pc-pill with a tone).
const PILL: Record<State, { text: string; tone: string }> = {
  in_stock: { text: "In stock", tone: "green" },
  low: { text: "Low stock", tone: "amber" },
  out: { text: "Sold out", tone: "red" },
  not_counted: { text: "Not counted", tone: "" },
  made: { text: "Made to order", tone: "blue" },
};

function variantState(quantity: number, threshold: number): State {
  if (quantity <= 0) return "out";
  return quantity <= threshold ? "low" : "in_stock";
}

function productState(variants: InventoryVariant[]): State {
  const states = variants.map((v) => variantState(v.quantity, v.low_stock_threshold));
  if (!states.length || states.every((s) => s === "out")) return "out";
  return states.some((s) => s !== "in_stock") ? "low" : "in_stock";
}

function Pill({ state }: { state: State }) {
  const p = PILL[state];
  return <span data-pill={state} className="pc-pill" data-tone={p.tone || undefined} style={{ textTransform: "none", whiteSpace: "nowrap" }}>{p.text}</span>;
}

export function InventoryProducts() {
  const [tab, setTab] = useState<Tab>("all");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Search after the typing stops, from the first page.
  useEffect(() => {
    const t = window.setTimeout(() => { setQuery(typed.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(t);
  }, [typed]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ show: tab, page: String(page), page_size: "20" });
      if (query) params.set("q", query);
      setData(await apiClient.get<Answer>(`/api/v1/admin/inventory/products?${params.toString()}`));
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not load your products.");
    } finally {
      setLoading(false);
    }
  }, [tab, page, query]);

  useEffect(() => { void load(); }, [load]);

  const replace = (next: InventoryItem) =>
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === next.id ? next : i)) } : d));

  return (
    <div data-inventory-products aria-busy={loading}>
      <div className="pc-tabs" role="tablist" aria-label="Which products">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" className="pc-tab" aria-selected={tab === t.key}
            data-on={tab === t.key ? "" : undefined} onClick={() => { setTab(t.key); setPage(1); }}>
            {t.label}{data ? <>{" "}<span className="pc-tab-count">{data.counts[t.key] ?? 0}</span></> : null}
          </button>
        ))}
      </div>

      <div className="pc-filters">
        <label className="pc-field">
          <Search size={17} strokeWidth={2} />
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder="Search products by name or code" aria-label="Search products" />
        </label>
      </div>

      {error && <div className="pc-flash" data-bad="" role="alert">{error}</div>}

      {!data && loading ? (
        <div className="pc-card pc-empty">Loading…</div>
      ) : data && data.items.length === 0 ? (
        <div className="pc-card pc-empty">{query ? `No products match “${query}”.` : "No products here."}</div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {data?.items.map((item) => <ProductStock key={item.id} item={item} onChange={replace} />)}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="pc-table-foot" style={{ borderTop: 0, padding: "14px 2px 0" }}>
          <span>Page {data.page} of {data.pages} · {data.total} products</span>
          <span style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="pc-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button type="button" className="pc-btn" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        </div>
      )}
    </div>
  );
}

/** One product: its switch, and when it counts its stock, each size's count. */
export function ProductStock({ item, onChange }: { item: InventoryItem; onChange: (next: InventoryItem) => void }) {
  const counted = !item.made_to_order && item.track_inventory;

  const setCount = (variantId: string, quantity: number) => {
    const variants = item.variants.map((v) =>
      v.id === variantId ? { ...v, quantity, state: variantState(quantity, v.low_stock_threshold) } : v);
    onChange({
      ...item, variants,
      total: variants.reduce((s, v) => s + Math.max(v.quantity, 0), 0),
      state: productState(variants),
    });
  };

  const switched = (next: boolean) => {
    const variants = item.variants.map((v) => ({
      ...v, state: next ? variantState(v.quantity, v.low_stock_threshold) : "not_counted",
    }));
    onChange({
      ...item, track_inventory: next, variants,
      total: next ? variants.reduce((s, v) => s + Math.max(v.quantity, 0), 0) : 0,
      state: next ? productState(variants) : "not_counted",
    });
  };

  return (
    <section data-product={item.id} data-state={item.state} className="pc-card">
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", flexWrap: "wrap" }}>
        {item.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.image} alt="" width={40} height={40} className="pc-thumb" style={{ width: "40px", height: "40px" }} />
          : <span aria-hidden className="pc-thumb" style={{ width: "40px", height: "40px" }} />}
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <Link href={`/admin/products/${item.slug}/edit`} className="pc-row-title">{item.name}</Link>
          <div className="pc-sub-line" style={{ fontSize: "12.5px", margin: 0 }}>
            {item.made_to_order
              ? item.made_to_order
              : `${item.variants.length} ${item.variants.length === 1 ? "size" : "sizes"}${item.status === "draft" ? " · Draft" : ""}`}
          </div>
        </div>
        <Pill state={item.state} />
        {counted && <span style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>{item.total} in stock</span>}
        {!item.made_to_order && (
          <TrackStockSwitch productId={item.id} productName={item.name} tracked={item.track_inventory} onChange={switched} />
        )}
      </div>

      {item.made_to_order ? (
        <p className="pc-sub-line" style={{ margin: 0, padding: "0 18px 14px", fontSize: "13px" }}>Printed when it is ordered, so there is no stock to count.</p>
      ) : !counted ? (
        <p className="pc-sub-line" style={{ margin: 0, padding: "0 18px 14px", fontSize: "13px" }}>
          Not counted: sells without a limit, even at 0. Switch on Count stock to limit each size to what you have.
        </p>
      ) : item.variants.length === 0 ? (
        <p className="pc-sub-line" style={{ margin: 0, padding: "0 18px 14px", fontSize: "13px" }}>No sizes yet. Add them on the product page.</p>
      ) : (
        <div className="pc-scroll-x" style={{ borderTop: "1px solid var(--pc-line)" }}>
          <table className="pc-table" style={{ minWidth: "520px" }}>
            <thead><tr><th>Colour</th><th>Size</th><th>SKU</th><th>In stock</th><th aria-label="State" /></tr></thead>
            <tbody>
              {item.variants.map((v) => (
                <tr key={v.id}>
                  <td>{v.color || "—"}</td>
                  <td>{v.size || "—"}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--pc-muted)", fontSize: "13px" }}>{v.sku}</td>
                  <td><CountBox productId={item.id} variant={v} onSaved={(n) => setCount(v.id, n)} /></td>
                  <td><Pill state={variantState(v.quantity, v.low_stock_threshold)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** A size's count: saved on leaving the box or Enter, only when it changed. */
function CountBox({ productId, variant, onSaved }: {
  productId: string;
  variant: InventoryVariant;
  onSaved: (quantity: number) => void;
}) {
  const [value, setValue] = useState(String(variant.quantity));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const label = [variant.color, variant.size].filter(Boolean).join(" ") || variant.sku;

  useEffect(() => { setValue(String(variant.quantity)); }, [variant.quantity]);

  async function save() {
    const text = value.trim();
    if (text === String(variant.quantity)) return;
    if (!/^\d+$/.test(text)) {
      setNote({ ok: false, text: "A whole number, 0 or more." });
      setValue(String(variant.quantity));
      return;
    }
    const quantity = parseInt(text, 10);
    setBusy(true);
    setNote(null);
    try {
      await apiClient.patch(`/api/v1/admin/products/${productId}/variants/${variant.id}`, { stock_quantity: quantity });
      onSaved(quantity);
      setNote({ ok: true, text: "Saved" });
    } catch (e) {
      setValue(String(variant.quantity));
      setNote({ ok: false, text: (e as { message?: string })?.message || "Not saved. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={`Stock for ${label}`}
        value={value}
        disabled={busy}
        onChange={(e) => { setValue(e.target.value); setNote(null); }}
        onBlur={() => void save()}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="pc-input"
        style={{ width: "84px", height: "36px", textAlign: "center", padding: "0 8px" }}
      />
      {note && <span style={{ fontSize: "12.5px", color: note.ok ? "var(--pc-green)" : "var(--pc-red)" }}>{note.text}</span>}
    </span>
  );
}

export default InventoryProducts;
