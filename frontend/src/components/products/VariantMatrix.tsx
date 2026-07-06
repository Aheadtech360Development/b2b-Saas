"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { cartService } from "@/services/cart.service";
import type { ProductVariant } from "@/types/product.types";

interface VariantMatrixProps {
  productId: string;
  variants: ProductVariant[];
}

type QuantityMap = Record<string, number>; // variant_id → qty

export function VariantMatrix({ productId, variants }: VariantMatrixProps) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Derive unique colors and sizes from variants
  const colors = useMemo(
    () => Array.from(new Set(variants.map((v) => v.color).filter(Boolean))).sort() as string[],
    [variants]
  );
  const sizes = useMemo(
    () => Array.from(new Set(variants.map((v) => v.size).filter(Boolean))).sort() as string[],
    [variants]
  );

  // Build color × size lookup map
  const variantMap = useMemo(() => {
    const map: Record<string, ProductVariant> = {};
    for (const v of variants) {
      const key = `${v.color ?? ""}::${v.size ?? ""}`;
      map[key] = v;
    }
    return map;
  }, [variants]);

  const handleChange = useCallback((variantId: string, value: string) => {
    const qty = parseInt(value, 10);
    setQuantities((prev) => {
      if (!qty || qty <= 0) {
        const next = { ...prev };
        delete next[variantId];
        return next;
      }
      return { ...prev, [variantId]: qty };
    });
  }, []);

  // Row totals (per color)
  const rowTotal = (color: string) =>
    sizes.reduce((sum, size) => {
      const v = variantMap[`${color}::${size}`];
      return sum + (v ? (quantities[v.id] ?? 0) : 0);
    }, 0);

  // Column totals (per size)
  const colTotal = (size: string) =>
    colors.reduce((sum, color) => {
      const v = variantMap[`${color}::${size}`];
      return sum + (v ? (quantities[v.id] ?? 0) : 0);
    }, 0);

  const grandTotal = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities]
  );

  async function handleAddAllToCart() {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([variant_id, quantity]) => ({ variant_id, quantity }));

    if (items.length === 0) {
      setError("Enter at least one quantity.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await cartService.addMatrix(productId, items);
      setSuccessMessage(`${items.length} variant${items.length !== 1 ? "s" : ""} added to cart!`);
      setQuantities({});
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add to cart");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sizes.length === 0 || colors.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No size/color variants available.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Order Quantities</h2>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full min-w-max">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 text-gray-600 font-medium sticky left-0 bg-white min-w-[90px]">
                Color / Size
              </th>
              {sizes.map((size) => (
                <th
                  key={size}
                  className="text-center py-2 px-2 text-gray-600 font-medium min-w-[70px]"
                >
                  {size}
                </th>
              ))}
              <th className="text-right py-2 pl-4 text-gray-600 font-medium min-w-[60px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {colors.map((color) => (
              <tr key={color} className="border-t border-gray-100">
                <td className="py-2 pr-4 text-gray-700 sticky left-0 bg-white font-medium">
                  {color}
                </td>
                {sizes.map((size) => {
                  const variant = variantMap[`${color}::${size}`];
                  if (!variant) {
                    return (
                      <td key={size} className="py-2 px-2 text-center text-gray-200">
                        —
                      </td>
                    );
                  }
                  const qty = quantities[variant.id] ?? "";
                  const outOfStock = (variant.stock_quantity ?? 0) === 0;
                  return (
                    <td key={size} className="py-2 px-2">
                      <input
                        type="number"
                        min="0"
                        max={variant.stock_quantity ?? undefined}
                        value={qty}
                        onChange={(e) => handleChange(variant.id, e.target.value)}
                        disabled={outOfStock}
                        title={outOfStock ? "Out of stock" : `Stock: ${variant.stock_quantity}`}
                        className="w-16 text-center rounded border border-gray-300 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </td>
                  );
                })}
                <td className="py-2 pl-4 text-right font-semibold text-gray-800">
                  {rowTotal(color) > 0 ? rowTotal(color) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300">
              <td className="py-2 pr-4 text-gray-600 font-medium sticky left-0 bg-white">
                Total
              </td>
              {sizes.map((size) => (
                <td key={size} className="py-2 px-2 text-center font-semibold text-gray-800">
                  {colTotal(size) > 0 ? colTotal(size) : "—"}
                </td>
              ))}
              <td className="py-2 pl-4 text-right font-bold text-brand-700">
                {grandTotal > 0 ? grandTotal : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {successMessage && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          {grandTotal > 0
            ? `${grandTotal} unit${grandTotal !== 1 ? "s" : ""} selected`
            : "No quantities entered"}
        </p>
        <button
          onClick={handleAddAllToCart}
          disabled={isSubmitting || grandTotal === 0}
          className="rounded-md bg-brand-600 text-white py-2.5 px-6 text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Adding…" : "Add All to Cart"}
        </button>
      </div>
    </div>
  );
}
