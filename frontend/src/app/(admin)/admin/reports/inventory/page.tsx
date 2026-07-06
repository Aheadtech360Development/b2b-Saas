"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";

interface InventoryItem {
  sku: string;
  product_name: string;
  variant_name: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  available: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
}

interface InventoryReport {
  total_skus: number;
  low_stock_count: number;
  items: InventoryItem[];
  low_stock: InventoryItem[];
}

export default function InventoryReportPage() {
  const [data, setData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get(`/api/v1/admin/reports/inventory?low_stock_only=${lowStockOnly}`)
      .then((r: any) => setData(r))
      .finally(() => setLoading(false));
  }, [lowStockOnly]);

  function handleExport() {
    adminService.exportInventoryCsv().catch(() => {});
  }

  const filtered =
    data?.items.filter(
      (i) =>
        !search ||
        i.sku.toLowerCase().includes(search.toLowerCase()) ||
        i.product_name.toLowerCase().includes(search.toLowerCase())
    ) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
          <p className="text-sm text-gray-500 mt-1">Stock levels and low-stock alerts</p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-500">Total SKUs</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.total_skus}</p>
          </div>
          <div className={`border rounded-lg p-5 ${data.low_stock_count > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
            <p className="text-sm text-gray-500">Low Stock SKUs</p>
            <p className={`text-2xl font-bold mt-1 ${data.low_stock_count > 0 ? "text-red-700" : "text-gray-900"}`}>
              {data.low_stock_count}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Search SKU or product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-64"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          Low stock only
        </label>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">SKU</th>
                  <th className="px-6 py-3 text-left">Product</th>
                  <th className="px-6 py-3 text-left">Variant</th>
                  <th className="px-6 py-3 text-right">On Hand</th>
                  <th className="px-6 py-3 text-right">Reserved</th>
                  <th className="px-6 py-3 text-right">Available</th>
                  <th className="px-6 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      No inventory data found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, i) => (
                    <tr key={i} className={`hover:bg-gray-50 ${item.is_low_stock ? "bg-red-50" : ""}`}>
                      <td className="px-6 py-3 font-mono text-xs">{item.sku}</td>
                      <td className="px-6 py-3 font-medium">{item.product_name}</td>
                      <td className="px-6 py-3 text-gray-500">{item.variant_name}</td>
                      <td className="px-6 py-3 text-right">{item.quantity_on_hand}</td>
                      <td className="px-6 py-3 text-right text-orange-600">{item.quantity_reserved}</td>
                      <td className="px-6 py-3 text-right font-semibold">{item.available}</td>
                      <td className="px-6 py-3 text-center">
                        {item.is_low_stock ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
