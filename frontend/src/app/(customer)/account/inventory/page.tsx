// frontend/src/app/(customer)/account/inventory/page.tsx
"use client";
import React from "react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { PackageIcon } from "@/components/ui/icons";

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

export default function InventoryListingPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasLoaded = useRef(false);

  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [selectedColor, setSelectedColor] = useState("all");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  // Load filter options on mount — do NOT load items
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    apiClient
      .get<InventoryResponse>("/api/v1/account/inventory-report")
      .then((data) => {
        setWarehouses(data.warehouses);
        setProducts(data.products);
        setColors(data.colors);
        // Do NOT setItems here — wait for Generate Report
      })
      .finally(() => setInitLoading(false));
  }, [isLoading]);

  // Reset color when product changes
  useEffect(() => {
    setSelectedColor("all");
  }, [selectedProduct]);

  async function handleGenerateReport() {
    setLoading(true);
    setGenerated(false);
    try {
      const params = new URLSearchParams();
      if (selectedWarehouse !== "all") params.set("warehouse_id", selectedWarehouse);
      if (selectedProduct !== "all") params.set("product_id", selectedProduct);
      if (selectedColor !== "all") params.set("color", selectedColor);
      const qs = params.toString();

      const data = await apiClient.get<InventoryResponse>(
        `/api/v1/account/inventory-report${qs ? `?${qs}` : ""}`
      );
      setItems(data.items);
      setColors(data.colors);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }

  function handleExportCSV() {
    if (!items.length) return;
    const headers = ["Style (SKU)", "Color", "Size", "Available", "Warehouse"];
    const rows = items.map((item) => [
      item.sku,
      item.color,
      item.size,
      item.available.toString(),
      item.warehouse_name,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    // importProductsModal - downloadTemplate  
    const a = document.createElement("a");
    a.href = url;
    a.download = "af-apparel-import-template.csv";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Group items by product_id
  const grouped = items.reduce(
    (acc, item) => {
      if (!acc[item.product_id]) {
        acc[item.product_id] = { product_name: item.product_name, variants: [] };
      }
      acc[item.product_id]!.variants.push(item);
      return acc;
    },
    {} as Record<string, { product_name: string; variants: InventoryItem[] }>
  );

  if (initLoading) return <div className="py-12 text-center text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900">Inventory Listing</h1>

      {/* 3-step filter card */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-gray-200 inventory-filter-grid">
          {/* Step 1 */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              1. Select A Warehouse
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              2. Select Product(s)
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Styles</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <select
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Colors</option>
                  {colors.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              3. Get Report
            </p>
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 mb-3"
            >
              {loading ? "Generating…" : "Generate Report"}
            </button>

            {generated && items.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleExportCSV}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Print
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty state — before generate */}
      {!generated && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg text-gray-400">
          <div className="mb-2 flex justify-center"><PackageIcon size={32} color="#9CA3AF" /></div>
          <p className="text-sm">Select filters and click Generate Report</p>
        </div>
      )}

      {/* Empty state — after generate, no results */}
      {generated && items.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-400">No inventory found for selected filters.</p>
        </div>
      )}

      {/* Results table */}
      {generated && items.length > 0 && (
        <div
          className="bg-white border border-gray-200 rounded-lg overflow-hidden"
          id="print-area"
        >
          {/* Print-only header */}
          <div className="hidden print:block px-5 py-4 border-b">
            <h2 className="text-lg font-bold">AF Apparels — Inventory Listing Report</h2>
            <p className="text-sm text-gray-500">
              Generated: {new Date().toLocaleDateString()}
            </p>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Style</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Color</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Size</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium text-xs uppercase">Available</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium text-xs uppercase">Warehouse</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([productId, group]) => (
                <React.Fragment key={productId}>
                  {/* Product header row */}
                  <tr className="bg-blue-50 border-b border-blue-100">
                    <td colSpan={5} className="px-4 py-2">
                      <span className="font-semibold text-blue-800 text-sm">
                        {group.product_name}
                      </span>
                    </td>
                  </tr>

                  {/* Variant rows */}
                  {group.variants.map((item, idx) => (
                    <tr
                      key={`${item.variant_id}-${item.warehouse_id}-${idx}`}
                      className={`border-b border-gray-100 hover:bg-blue-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                        }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.sku}</td>
                      <td className="px-4 py-2.5 text-gray-700">{item.color}</td>
                      <td className="px-4 py-2.5 text-gray-700">{item.size}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${item.available === 0
                        ? "text-red-500"
                        : item.available < 10
                          ? "text-orange-500"
                          : "text-gray-900"
                        }`}>
                        {item.available.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{item.warehouse_name}</td>
                    </tr>
                  ))}

                  {/* Product subtotal */}
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 font-medium">
                      Subtotal — {group.product_name}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-gray-700">
                      {group.variants.reduce((sum, v) => sum + v.available, 0).toLocaleString()}
                    </td>
                    <td />
                  </tr>
                </React.Fragment>
              ))}

              {/* Grand total */}
              <tr className="bg-gray-800">
                <td colSpan={3} className="px-4 py-3 text-white font-bold text-sm">TOTAL</td>
                <td className="px-4 py-3 text-right text-white font-bold text-sm">
                  {items.reduce((sum, i) => sum + i.available, 0).toLocaleString()}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          </div>
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