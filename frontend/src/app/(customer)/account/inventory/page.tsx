"use client";

/**
 * Reports, Stock levels: what the shop has on hand of what this company can
 * order, by warehouse, product and colour. Pick the filters and show it;
 * exports the rows shown.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { brandFileName } from "@/lib/brand";
import { useBranding } from "@/components/providers/BrandingProvider";
import { Banner, Empty, Loading, PageHead, saveCsv } from "@/components/portal/ui";
import { ReportTabs } from "@/components/portal/ReportTabs";

interface InventoryItem {
  variant_id: string;
  sku: string;
  product_id: string;
  product_name: string;
  color: string;
  size: string;
  warehouse_id: string;
  warehouse_name: string;
  available: number;
}

interface InventoryResponse {
  items: InventoryItem[];
  warehouses: { id: string; name: string }[];
  products: { id: string; name: string }[];
  colors: string[];
}

export default function StockLevelsPage() {
  const branding = useBranding();
  const [options, setOptions] = useState<Omit<InventoryResponse, "items"> | null>(null);
  const [warehouse, setWarehouse] = useState("all");
  const [product, setProduct] = useState("all");
  const [color, setColor] = useState("all");
  const [colors, setColors] = useState<string[]>([]);
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<InventoryResponse>("/api/v1/account/inventory-report")
      .then((d) => { setOptions({ warehouses: d.warehouses, products: d.products, colors: d.colors }); setColors(d.colors); })
      .catch(() => setError("Stock levels could not be loaded."));
  }, []);

  useEffect(() => setColor("all"), [product]);

  async function show() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (warehouse !== "all") params.set("warehouse_id", warehouse);
      if (product !== "all") params.set("product_id", product);
      if (color !== "all") params.set("color", color);
      const qs = params.toString();
      const d = await apiClient.get<InventoryResponse>(`/api/v1/account/inventory-report${qs ? `?${qs}` : ""}`);
      setItems(d.items);
      setColors(d.colors);
    } catch {
      setError("Stock levels could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  const grouped = useMemo(() => {
    const by = new Map<string, { name: string; rows: InventoryItem[] }>();
    for (const it of items ?? []) {
      const g = by.get(it.product_id) ?? { name: it.product_name, rows: [] };
      g.rows.push(it);
      by.set(it.product_id, g);
    }
    return [...by.values()];
  }, [items]);

  return (
    <>
      <PageHead eyebrow="Reports" title="Stock levels" sub="What is on hand of what you can order."
        actions={<button type="button" className="cp-btn" disabled={!items?.length}
          onClick={() => saveCsv(brandFileName(branding.store_name, "stock-levels.csv"), ["SKU", "Product", "Color", "Size", "Available", "Warehouse"],
            (items ?? []).map((i) => [i.sku, i.product_name, i.color, i.size, i.available, i.warehouse_name]))}>Export CSV</button>} />
      <ReportTabs on="stock" />
      {error && <div style={{ marginBottom: 16 }}><Banner tone="bad">{error}</Banner></div>}
      {!options && !error ? <Loading /> : options && (
        <form className="cp-filters" onSubmit={(e) => { e.preventDefault(); show(); }}>
          <label className="cp-sr" htmlFor="i-wh">Warehouse</label>
          <select id="i-wh" className="cp-select" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="all">Warehouse: All</option>
            {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <label className="cp-sr" htmlFor="i-product">Product</label>
          <select id="i-product" className="cp-select" value={product} onChange={(e) => setProduct(e.target.value)} style={{ maxWidth: 280 }}>
            <option value="all">Product: All</option>
            {options.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="cp-sr" htmlFor="i-color">Color</label>
          <select id="i-color" className="cp-select" value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="all">Color: All</option>
            {colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" className="cp-btn cp-btn-p" disabled={loading}>{loading ? "Loading…" : "Show stock"}</button>
        </form>
      )}
      {items !== null && (
        <div className="cp-card" style={{ overflow: "hidden" }}>
          {grouped.length === 0 ? <Empty title="Nothing found">Try other filters.</Empty> : (
            <div className="cp-tbl-wrap">
              <table className="cp-tbl">
                <thead><tr><th>SKU</th><th>Color</th><th>Size</th><th className="cp-num">Available</th><th>Warehouse</th></tr></thead>
                <tbody>
                  {grouped.map((g) => (
                    <Fragment key={g.name}>
                      <tr><td colSpan={5} className="cp-strong" style={{ background: "var(--cp-panel)" }}>{g.name}</td></tr>
                      {g.rows.map((r, i) => (
                        <tr key={`${r.variant_id}-${r.warehouse_id}-${i}`}>
                          <td className="cp-mono cp-muted">{r.sku}</td>
                          <td>{r.color}</td>
                          <td>{r.size}</td>
                          <td className="cp-num" style={r.available <= 0 ? { color: "var(--cp-bad)" } : undefined}>{r.available}</td>
                          <td className="cp-muted">{r.warehouse_name}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
