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

const PILL: Record<State, { text: string; bg: string; fg: string }> = {
  in_stock: { text: "In stock", bg: "#ECFDF5", fg: "#047857" },
  low: { text: "Low stock", bg: "#FFFBEB", fg: "#B45309" },
  out: { text: "Sold out", bg: "#FEF2F2", fg: "#B91C1C" },
  not_counted: { text: "Not counted", bg: "#F3F4F6", fg: "#4B5563" },
  made: { text: "Made to order", bg: "#EFF6FF", fg: "#1D4ED8" },
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
  return (
    <span data-pill={state} style={{ display: "inline-block", padding: "2px 9px", borderRadius: "999px", fontSize: "12px", fontWeight: 600, background: p.bg, color: p.fg, whiteSpace: "nowrap" }}>
      {p.text}
    </span>
  );
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
      <div role="tablist" aria-label="Which products" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm border ${tab === t.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            {t.label}{data ? ` (${data.counts[t.key] ?? 0})` : ""}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Search products by name or code…"
        aria-label="Search products"
        className="rounded-md border border-gray-300 px-3 py-2 text-sm w-full max-w-sm mb-4"
      />

      {error && <p role="alert" className="text-sm text-red-700 mb-3">{error}</p>}

      {!data && loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-sm text-gray-400">Loading…</div>
      ) : data && data.items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-sm text-gray-500">
          {query ? `No products match “${query}”.` : "No products here."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {data?.items.map((item) => <ProductStock key={item.id} item={item} onChange={replace} />)}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>Page {data.page} of {data.pages} · {data.total} products</span>
          <span className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border border-gray-300 rounded-md px-3 py-1.5 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="border border-gray-300 rounded-md px-3 py-1.5 disabled:opacity-40">Next</button>
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
    <section data-product={item.id} data-state={item.state} className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        {item.image
          ? <img src={item.image} alt="" width={40} height={40} className="w-10 h-10 rounded object-cover border border-gray-200" />
          : <span aria-hidden className="w-10 h-10 rounded bg-gray-100 border border-gray-200 inline-block" />}
        <div className="min-w-0" style={{ flex: "1 1 220px" }}>
          <Link href={`/admin/products/${item.slug}/edit`} className="font-semibold text-gray-900 hover:text-blue-700">
            {item.name}
          </Link>
          <div className="text-xs text-gray-500">
            {item.made_to_order
              ? item.made_to_order
              : `${item.variants.length} ${item.variants.length === 1 ? "size" : "sizes"}${item.status === "draft" ? " · Draft" : ""}`}
          </div>
        </div>
        <Pill state={item.state} />
        {counted && <span className="text-sm text-gray-700 whitespace-nowrap">{item.total} in stock</span>}
        {!item.made_to_order && (
          <TrackStockSwitch productId={item.id} productName={item.name} tracked={item.track_inventory} onChange={switched} />
        )}
      </div>

      {item.made_to_order ? (
        <p className="px-4 pb-3 text-xs text-gray-500">Printed when it is ordered, so there is no stock to count.</p>
      ) : !counted ? (
        <p className="px-4 pb-3 text-xs text-gray-500">
          Not counted: sells without a limit, even at 0. Switch on Count stock to limit each size to what you have.
        </p>
      ) : item.variants.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-gray-500">No sizes yet. Add them on the product page.</p>
      ) : (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "520px" }}>
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Colour</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Size</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">SKU</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">In stock</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {item.variants.map((v) => (
                <tr key={v.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-700">{v.color || "—"}</td>
                  <td className="px-4 py-2 text-gray-700">{v.size || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{v.sku}</td>
                  <td className="px-4 py-2">
                    <CountBox productId={item.id} variant={v} onSaved={(n) => setCount(v.id, n)} />
                  </td>
                  <td className="px-4 py-2"><Pill state={variantState(v.quantity, v.low_stock_threshold)} /></td>
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
    <span className="inline-flex items-center gap-2">
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
        className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-center"
      />
      {note && <span className={`text-xs ${note.ok ? "text-green-700" : "text-red-700"}`}>{note.text}</span>}
    </span>
  );
}

export default InventoryProducts;
