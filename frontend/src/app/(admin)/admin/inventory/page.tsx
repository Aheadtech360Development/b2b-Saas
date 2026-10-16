"use client";

/**
 * Inventory: which products count their stock, and how many of each size there
 * are (Products), or the stock records by warehouse (By warehouse, the screen
 * as it was before).
 *
 * Brands saw "stock 0" here and orders still coming in: a variant with no
 * stock record was drawn as 0 and sold without a limit, and nothing said which
 * products are limited by stock. Each product now has its own Count stock
 * switch, and this screen says what every product does.
 */
import { useState } from "react";
import { InventoryProducts } from "@/components/admin/InventoryProducts";
import { InventoryByWarehouse } from "@/components/admin/InventoryByWarehouse";

type View = "products" | "warehouse";

export default function AdminInventoryPage() {
  const [view, setView] = useState<View>("products");

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            A product that counts its stock sells only what you have, and is sold out at 0. One that
            does not count it sells without a limit. Gang sheets and made-to-order products are printed
            when ordered, so they have nothing to count.
          </p>
        </div>
        <div role="tablist" aria-label="View" className="inline-flex rounded-md border border-gray-300 overflow-hidden">
          {([["products", "Products"], ["warehouse", "By warehouse"]] as [View, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`px-3 py-1.5 text-sm ${view === key ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "products" ? <InventoryProducts /> : <InventoryByWarehouse />}
    </div>
  );
}
