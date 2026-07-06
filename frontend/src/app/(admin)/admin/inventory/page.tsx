"use client";

import { useEffect, useMemo, useState } from "react";
import { adminService } from "@/services/admin.service";
import { StockAdjustmentModal } from "@/components/admin/StockAdjustmentModal";

interface InventoryRow {
  variant_id: string;
  sku: string;
  color?: string;
  size?: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  low_stock_threshold: number;
}

function exportInventoryToCsv(rows: InventoryRow[]) {
  const header = ["SKU", "Color", "Size", "Warehouse", "Quantity", "Low Stock Threshold"];
  const lines = rows.map(r => [
    r.sku, r.color ?? "", r.size ?? "", r.warehouse_name, r.quantity, r.low_stock_threshold,
  ]);
  const csv = [header, ...lines].map(row => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "inventory.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminInventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<InventoryRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");

  async function load() {
    setIsLoading(true);
    try {
      const data = await adminService.listInventory({ low_stock_only: lowStockOnly }) as InventoryRow[];
      setRows(data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [lowStockOnly]);

  const warehouses = useMemo(() => {
    const names = new Set(rows.map(r => r.warehouse_name));
    return Array.from(names).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.sku.toLowerCase().includes(q) ||
        (r.color ?? "").toLowerCase().includes(q) ||
        (r.size ?? "").toLowerCase().includes(q)
      );
    }
    if (warehouseFilter) {
      list = list.filter(r => r.warehouse_name === warehouseFilter);
    }
    return list;
  }, [rows, search, warehouseFilter]);

  const lowCount = filtered.filter(r => r.quantity <= r.low_stock_threshold).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} records{lowCount > 0 ? ` · ${lowCount} low stock` : ""}
          </p>
        </div>
        <button
          onClick={() => exportInventoryToCsv(filtered)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by SKU, color, size…"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-64"
        />
        <select
          value={warehouseFilter}
          onChange={e => setWarehouseFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">All Warehouses</option>
          {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="rounded"
          />
          Low stock only
        </label>
        {(search || warehouseFilter) && (
          <button
            onClick={() => { setSearch(""); setWarehouseFilter(""); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">SKU</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Color</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Size</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Warehouse</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">Qty</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">No inventory records</td></tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={i} className={`border-b border-gray-100 last:border-0 ${row.quantity <= row.low_stock_threshold ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.sku}</td>
                  <td className="px-4 py-3 text-gray-700">{row.color ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{row.size ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{row.warehouse_name}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${row.quantity <= row.low_stock_threshold ? "text-red-600" : "text-gray-900"}`}>
                    {row.quantity}
                    {row.quantity <= row.low_stock_threshold && (
                      <span className="ml-1 text-xs font-normal text-red-400">(low)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setAdjustTarget(row)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Adjust
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {adjustTarget && (
        <StockAdjustmentModal
          sku={adjustTarget.sku}
          currentQty={adjustTarget.quantity}
          variantId={adjustTarget.variant_id}
          warehouseId={adjustTarget.warehouse_id}
          onClose={() => setAdjustTarget(null)}
          onSuccess={() => { setAdjustTarget(null); load(); }}
        />
      )}
    </div>
  );
}
