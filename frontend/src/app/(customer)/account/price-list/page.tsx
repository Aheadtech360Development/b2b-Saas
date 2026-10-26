"use client";

/**
 * Price list: what this company pays for everything it can order, at its
 * tier, beside the retail price. Loads on its own; search and the product and
 * size filters work on the whole list, a few hundred rows are drawn at a time,
 * and Export takes everything that matches.
 */
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { accountService } from "@/services/account.service";
import { brandFileName } from "@/lib/brand";
import { useBranding } from "@/components/providers/BrandingProvider";
import { money } from "@/lib/customerWords";
import { Banner, Empty, Loading, PageHead, saveCsv } from "@/components/portal/ui";
import type { FullProfile } from "@/components/portal/data";

interface PriceRow {
  product_id: string;
  product_name: string;
  sku: string;
  color: string;
  size: string;
  retail_price: number;
  unit_price: number;
}

const STEP = 300;

export default function PriceListPage() {
  const branding = useBranding();
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  const [discount, setDiscount] = useState(0);
  const [tier, setTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [product, setProduct] = useState("");
  const [size, setSize] = useState("");
  const [shown, setShown] = useState(STEP);

  function load() {
    setError(null);
    apiClient.get<{ items: PriceRow[]; discount_percent: number }>("/api/v1/account/price-list-report")
      .then((d) => { setRows(d.items); setDiscount(d.discount_percent || 0); })
      .catch(() => { setRows([]); setError("Your price list could not be loaded."); });
    (accountService.getFullProfile() as Promise<FullProfile>)
      .then((p) => setTier(p.company?.pricing_tier_name ?? null)).catch(() => {});
  }
  useEffect(load, []);
  useEffect(() => setShown(STEP), [q, product, size]);

  const products = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows ?? []) if (!seen.has(r.product_id)) seen.set(r.product_id, r.product_name);
    return [...seen.entries()];
  }, [rows]);
  const sizes = useMemo(() => [...new Set((rows ?? []).filter((r) => !product || r.product_id === product).map((r) => r.size))].filter((s) => s && s !== "—"), [rows, product]);
  const matching = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (!product || r.product_id === product) && (!size || r.size === size)
      && (!term || r.sku.toLowerCase().includes(term) || r.product_name.toLowerCase().includes(term) || r.color.toLowerCase().includes(term)));
  }, [rows, q, product, size]);

  const save = (r: PriceRow) => (r.retail_price > 0 ? Math.round((1 - r.unit_price / r.retail_price) * 100) : 0);

  return (
    <>
      <PageHead eyebrow="Price list" title="Price list" sub="Prices for the products you can order, at your tier."
        actions={<button type="button" className="cp-btn" disabled={!matching.length}
          onClick={() => saveCsv(brandFileName(branding.store_name, "price-list.csv"), ["SKU", "Product", "Color", "Size", "Retail", "Your price", "You save %"],
            matching.map((r) => [r.sku, r.product_name, r.color, r.size, r.retail_price.toFixed(2), r.unit_price.toFixed(2), save(r)]))}>Export CSV</button>} />

      {rows !== null && !error && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info">
            {discount > 0
              ? `Your tier${tier ? `, ${tier},` : ""} takes ${discount}% off retail. The Your price column is what you pay.`
              : "You pay the shop's own prices. Ask the shop about a pricing tier if you order in volume."}
          </Banner>
        </div>
      )}
      {error && <div style={{ marginBottom: 16 }}><Banner tone="bad" onRetry={load}>{error}</Banner></div>}

      <div className="cp-filters">
        <label className="cp-sr" htmlFor="pl-q">Search by SKU or product</label>
        <input id="pl-q" className="cp-input cp-grow" type="search" placeholder="Search by SKU or product" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="cp-sr" htmlFor="pl-product">Product</label>
        <select id="pl-product" className="cp-select" value={product} onChange={(e) => { setProduct(e.target.value); setSize(""); }} style={{ maxWidth: 280 }}>
          <option value="">Product: All</option>
          {products.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <label className="cp-sr" htmlFor="pl-size">Size</label>
        <select id="pl-size" className="cp-select" value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">Size: All</option>
          {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="cp-card" style={{ overflow: "hidden" }}>
        {rows === null ? <Loading what="Loading your prices" /> : matching.length === 0 ? (
          <Empty title={rows.length ? "Nothing matches" : "No products to show"}>{rows.length ? "Try another search or filter." : "Products you can order appear here."}</Empty>
        ) : (
          <div className="cp-tbl-wrap">
            <table className="cp-tbl">
              <thead><tr><th>SKU</th><th>Product</th><th>Size</th><th className="cp-num">Retail</th><th className="cp-num">Your price</th><th className="cp-num">You save</th></tr></thead>
              <tbody>
                {matching.slice(0, shown).map((r, i) => (
                  <tr key={`${r.sku}-${i}`}>
                    <td className="cp-mono cp-muted">{r.sku}</td>
                    <td>{r.product_name}{r.color && r.color !== "—" ? <span className="cp-muted"> · {r.color}</span> : null}</td>
                    <td>{r.size}</td>
                    <td className="cp-num cp-muted">{money(r.retail_price)}</td>
                    <td className="cp-num cp-strong">{money(r.unit_price)}</td>
                    <td className="cp-num">{save(r) > 0 ? `${save(r)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="cp-actions" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <span className="cp-note">{rows ? `${Math.min(shown, matching.length)} of ${matching.length} price${matching.length === 1 ? "" : "s"}` : ""}</span>
        {matching.length > shown && <button type="button" className="cp-btn" onClick={() => setShown((n) => n + STEP)}>Show more</button>}
      </div>
    </>
  );
}
