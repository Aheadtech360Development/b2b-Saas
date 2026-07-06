"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

interface SalesByProductVariant {
  color: string;
  size: string;
  units_sold: number;
  total_revenue: number;
}

interface SalesByProduct {
  product_name: string;
  units_sold: number;
  total_revenue: number;
  variants?: SalesByProductVariant[];
}

interface SalesByPrice {
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

type SalesItem = SalesByProduct | SalesByPrice;

interface SalesHistoryResponse {
  items: SalesItem[];
  year: number | null;
  display: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export default function SalesHistoryPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasLoaded = useRef(false);

  const [selectedYear, setSelectedYear] = useState<string>(String(CURRENT_YEAR));
  const [display, setDisplay] = useState<"product" | "price">("product");
  const [items, setItems] = useState<SalesItem[]>([]);
  const [resultDisplay, setResultDisplay] = useState<"product" | "price">("product");
  const [resultYear, setResultYear] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [productExpanded, setProductExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    hasLoaded.current = true;
  }, [isLoading]);

  async function handleGenerateReport() {
    setLoading(true);
    setGenerated(false);
    try {
      const params = new URLSearchParams();
      params.set("year", selectedYear);
      params.set("display", display);
      const data = await apiClient.get<SalesHistoryResponse>(
        `/api/v1/account/sales-history?${params.toString()}`
      );
      setItems(data.items);
      setResultDisplay(display);
      setResultYear(selectedYear);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }

  function handleExportCSV() {
    if (!items.length) return;
    let headers: string[];
    let rows: string[][];

    if (resultDisplay === "price") {
      headers = ["Order #", "Product", "SKU", "Color", "Size", "Qty", "Unit Price", "Line Total", "Date"];
      rows = (items as SalesByPrice[]).map((item) => [
        item.order_number,
        item.product_name,
        item.sku,
        item.color,
        item.size,
        String(item.quantity),
        `$${item.unit_price.toFixed(2)}`,
        `$${item.line_total.toFixed(2)}`,
        item.ordered_at ? new Date(item.ordered_at).toLocaleDateString() : "—",
      ]);
    } else {
      headers = ["Product", "Units Sold", "Total Revenue"];
      rows = (items as SalesByProduct[]).map((item) => [
        item.product_name,
        String(item.units_sold),
        `$${item.total_revenue.toFixed(2)}`,
      ]);
    }

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `af-apparel-sales-${resultYear}-${resultDisplay}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const totalRevenue = generated && resultDisplay === "product"
    ? (items as SalesByProduct[]).reduce((s, i) => s + i.total_revenue, 0)
    : generated && resultDisplay === "price"
      ? (items as SalesByPrice[]).reduce((s, i) => s + i.line_total, 0)
      : 0;

  const totalUnits = generated && resultDisplay === "product"
    ? (items as SalesByProduct[]).reduce((s, i) => s + i.units_sold, 0)
    : generated && resultDisplay === "price"
      ? (items as SalesByPrice[]).reduce((s, i) => s + i.quantity, 0)
      : 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900">Purchase History</h1>

      {/* Controls card */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="sales-history-controls grid grid-cols-2 divide-x divide-gray-200">
          {/* Step 1: Display Options */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
              1. Select Display Options
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase For</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Display</label>
                <div className="flex gap-3">
                  {(["product", "price"] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="display"
                        value={opt}
                        checked={display === opt}
                        onChange={() => setDisplay(opt)}
                        className="h-4 w-4 text-blue-600 border-gray-300"
                      />
                      <span className="text-sm text-gray-700">
                        {opt === "product" ? "Purchase by Product" : "Purchase by Price"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Generate */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
              2. Generate Report
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleGenerateReport}
                disabled={loading}
                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Generating…" : "Generate Report"}
              </button>
              {generated && items.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Empty state before generate */}
      {!generated && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg text-gray-400">
          <svg className="mx-auto mb-2 w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <p className="text-sm">Select options and click Generate Report</p>
        </div>
      )}

      {generated && items.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-400">No purchases found for {resultYear}.</p>
        </div>
      )}

      {/* Results table */}
      {generated && items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto" id="print-area">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              {resultYear} — {resultDisplay === "product" ? "Purchase by Product" : "Purchase by Price"}
            </p>
            <div className="text-sm text-gray-500 flex gap-4">
              <span>Units: <span className="font-semibold text-gray-900">{totalUnits.toLocaleString()}</span></span>
              <span>Revenue: <span className="font-semibold text-gray-900">${totalRevenue.toFixed(2)}</span></span>
            </div>
          </div>

          {resultDisplay === "product" ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Product</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium text-xs uppercase">Units Sold</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium text-xs uppercase">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(items as SalesByProduct[]).map((item, idx) => {
                  const isExp = productExpanded.has(idx);
                  const hasVariants = (item.variants?.length ?? 0) > 0;
                  return (
                    <React.Fragment key={idx}>
                      <tr
                        className={`border-b border-gray-100 ${hasVariants ? "cursor-pointer hover:bg-blue-50" : ""} ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                        onClick={() => {
                          if (!hasVariants) return;
                          setProductExpanded(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; });
                        }}
                      >
                        <td className="px-4 py-3 text-gray-800 font-medium">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            {hasVariants && <span style={{ fontSize: "9px", color: "#9CA3AF", display: "inline-block", transform: isExp ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}>▶</span>}
                            {item.product_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{item.units_sold.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">${item.total_revenue.toFixed(2)}</td>
                      </tr>
                      {isExp && hasVariants && (item.variants ?? []).map((v, vi) => (
                        <tr key={`${idx}-v${vi}`} className="bg-blue-50 border-b border-blue-100">
                          <td className="py-2 text-gray-600 text-xs" style={{ paddingLeft: "36px" }}>{v.color} / {v.size}</td>
                          <td className="px-4 py-2 text-right text-gray-500 text-xs">{v.units_sold.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-gray-600 text-xs">${v.total_revenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                <tr className="bg-gray-800">
                  <td className="px-4 py-3 text-white font-bold text-sm">TOTAL</td>
                  <td className="px-4 py-3 text-right text-white font-bold text-sm">{totalUnits.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-white font-bold text-sm">${totalRevenue.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Order #</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Product</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">SKU</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Color</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Size</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium text-xs uppercase">Qty</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium text-xs uppercase">Unit Price</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium text-xs uppercase">Total</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {(items as SalesByPrice[]).map((item, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-gray-100 hover:bg-blue-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.order_number}</td>
                    <td className="px-4 py-2.5 text-gray-800">{item.product_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.sku}</td>
                    <td className="px-4 py-2.5 text-gray-700">{item.color}</td>
                    <td className="px-4 py-2.5 text-gray-700">{item.size}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">${item.unit_price.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">${item.line_total.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                      {item.ordered_at ? new Date(item.ordered_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-800">
                  <td colSpan={5} className="px-4 py-3 text-white font-bold text-sm">TOTAL</td>
                  <td className="px-4 py-3 text-right text-white font-bold text-sm">{totalUnits.toLocaleString()}</td>
                  <td />
                  <td className="px-4 py-3 text-right text-white font-bold text-sm">${totalRevenue.toFixed(2)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
