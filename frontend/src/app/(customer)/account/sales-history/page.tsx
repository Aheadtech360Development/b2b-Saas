"use client";

/**
 * Reports, Purchase history: what the company bought in a year, by product,
 * line by line at the price paid, or by month. Cancelled and refunded orders
 * are left out (the API does). Loads on its own and again when the year or
 * the view changes; exports what is on screen.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { brandFileName } from "@/lib/brand";
import { useBranding } from "@/components/providers/BrandingProvider";
import { day, money } from "@/lib/customerWords";
import { Banner, Empty, Loading, PageHead, saveCsv } from "@/components/portal/ui";
import { ReportTabs } from "@/components/portal/ReportTabs";

interface ByProduct {
  product_name: string;
  units_sold: number;
  total_revenue: number;
  variants?: { color: string; size: string; units_sold: number; total_revenue: number }[];
}

interface Line {
  order_number: string;
  product_name: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  ordered_at: string | null;
}

type View = "product" | "price" | "month";

export default function PurchaseHistoryPage() {
  const branding = useBranding();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [view, setView] = useState<View>("product");
  const [products, setProducts] = useState<ByProduct[] | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const display = view === "product" ? "product" : "price";
    setError(null);
    setProducts(null);
    setLines(null);
    apiClient.get<{ items: (ByProduct | Line)[] }>(`/api/v1/account/sales-history?year=${year}&display=${display}`)
      .then((d) => {
        if (display === "product") setProducts(d.items as ByProduct[]);
        else setLines(d.items as Line[]);
      })
      .catch(() => { setError("This report could not be loaded."); setProducts([]); setLines([]); });
  }, [year, view]);

  const months = useMemo(() => {
    if (view !== "month" || !lines) return null;
    const by = new Map<string, { orders: Set<string>; qty: number; spent: number }>();
    for (const l of lines) {
      const key = (l.ordered_at ?? "").slice(0, 7) || "Unknown";
      const m = by.get(key) ?? { orders: new Set<string>(), qty: 0, spent: 0 };
      m.orders.add(l.order_number);
      m.qty += l.quantity;
      m.spent += l.line_total;
      by.set(key, m);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [view, lines]);

  const monthName = (key: string) => {
    const [y, m] = key.split("-");
    return y && m ? new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : key;
  };

  function exportCsv() {
    const name = brandFileName(branding.store_name, `purchases-${year}-${view}.csv`);
    if (view === "product" && products) {
      saveCsv(name, ["Product", "Quantity", "Spent"], products.map((p) => [p.product_name, p.units_sold, p.total_revenue.toFixed(2)]));
    } else if (view === "month" && months) {
      saveCsv(name, ["Month", "Orders", "Quantity", "Spent"], months.map(([k, m]) => [monthName(k), m.orders.size, m.qty, m.spent.toFixed(2)]));
    } else if (lines) {
      saveCsv(name, ["Order", "Product", "SKU", "Color", "Size", "Qty", "Unit price", "Line total", "Date"],
        lines.map((l) => [l.order_number, l.product_name, l.sku, l.color, l.size, l.quantity, l.unit_price.toFixed(2), l.line_total.toFixed(2), (l.ordered_at ?? "").slice(0, 10)]));
    }
  }

  const loading = view === "product" ? products === null : lines === null;
  const empty = view === "product" ? !products?.length : !lines?.length;
  const years = Array.from({ length: 6 }, (_, i) => String(thisYear - i));

  return (
    <>
      <PageHead eyebrow="Reports" title="Purchase history" sub="What you bought, by product, by price or by month."
        actions={<button type="button" className="cp-btn" onClick={exportCsv} disabled={loading || empty}>Export CSV</button>} />
      <ReportTabs on="history" />
      <div className="cp-filters">
        <label className="cp-label" htmlFor="r-year">Year</label>
        <select id="r-year" className="cp-select" value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="cp-label" htmlFor="r-view">View</label>
        <select id="r-view" className="cp-select" value={view} onChange={(e) => setView(e.target.value as View)}>
          <option value="product">By product</option>
          <option value="price">By price paid</option>
          <option value="month">By month</option>
        </select>
      </div>
      {error && <div style={{ marginBottom: 16 }}><Banner tone="bad">{error}</Banner></div>}
      <div className="cp-card" style={{ overflow: "hidden" }}>
        {loading ? <Loading what="Loading report" /> : empty ? (
          <Empty title={`No purchases to show for ${year}`}>Cancelled and refunded orders are left out of this report.</Empty>
        ) : (
          <div className="cp-tbl-wrap">
            {view === "product" && products && (
              <table className="cp-tbl">
                <thead><tr><th>Product</th><th className="cp-num">Quantity</th><th className="cp-num">Spent</th></tr></thead>
                <tbody>
                  {products.map((p) => {
                    const isOpen = open.has(p.product_name);
                    const many = (p.variants?.length ?? 0) > 1;
                    return (
                      <Fragment key={p.product_name}>
                        <tr>
                          <td>
                            {many ? (
                              <button type="button" className="cp-link" aria-expanded={isOpen} onClick={() => setOpen((s) => {
                                const n = new Set(s); if (n.has(p.product_name)) n.delete(p.product_name); else n.add(p.product_name); return n;
                              })}>{isOpen ? "▾" : "▸"} {p.product_name}</button>
                            ) : <span className="cp-strong">{p.product_name}</span>}
                          </td>
                          <td className="cp-num">{p.units_sold}</td>
                          <td className="cp-num">{money(p.total_revenue)}</td>
                        </tr>
                        {isOpen && p.variants?.map((v) => (
                          <tr key={`${p.product_name}-${v.color}-${v.size}`}>
                            <td className="cp-muted" style={{ paddingLeft: 36 }}>{[v.color, v.size].filter((x) => x && x !== "—").join(" / ") || "Standard"}</td>
                            <td className="cp-num cp-muted">{v.units_sold}</td>
                            <td className="cp-num cp-muted">{money(v.total_revenue)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
            {view === "price" && lines && (
              <table className="cp-tbl">
                <thead><tr><th>Order</th><th>Product</th><th>SKU</th><th className="cp-num">Qty</th><th className="cp-num">Unit price</th><th className="cp-num">Total</th><th>Date</th></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={`${l.order_number}-${l.sku}-${i}`}>
                      <td className="cp-strong">{l.order_number}</td>
                      <td>{l.product_name} <span className="cp-muted">{[l.color, l.size].filter((x) => x && x !== "—").join(" / ")}</span></td>
                      <td className="cp-mono cp-muted">{l.sku}</td>
                      <td className="cp-num">{l.quantity}</td>
                      <td className="cp-num">{money(l.unit_price)}</td>
                      <td className="cp-num">{money(l.line_total)}</td>
                      <td>{day(l.ordered_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view === "month" && months && (
              <table className="cp-tbl" style={{ minWidth: 480 }}>
                <thead><tr><th>Month</th><th className="cp-num">Orders</th><th className="cp-num">Quantity</th><th className="cp-num">Spent</th></tr></thead>
                <tbody>
                  {months.map(([k, m]) => (
                    <tr key={k}><td className="cp-strong">{monthName(k)}</td><td className="cp-num">{m.orders.size}</td><td className="cp-num">{m.qty}</td><td className="cp-num">{money(m.spent)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      <p className="cp-note" style={{ marginTop: 12 }}>Cancelled and refunded orders are left out of this report.</p>
    </>
  );
}
