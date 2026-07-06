"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { ShoppingCartIcon } from "@/components/ui/icons";

interface CartItem {
  variant_id: string;
  product_name: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface AbandonedCart {
  id: string;
  abandoned_at: string;
  total: number;
  item_count: number;
  items: CartItem[];
  is_recovered: boolean;
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function AbandonedCartsPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const hasLoaded = useRef(false);
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadCarts();
  }, [isLoading]);

  async function loadCarts() {
    setLoading(true);
    try {
      const data = await apiClient.get<AbandonedCart[]>("/api/v1/account/abandoned-carts");
      setCarts(data);
    } catch {
      setMessage({ type: "error", text: "Failed to load abandoned carts." });
    } finally {
      setLoading(false);
    }
  }

  async function handleRecover(cartId: string) {
    setRecovering(cartId);
    setMessage(null);
    try {
      await apiClient.post(`/api/v1/account/abandoned-carts/${cartId}/recover`, {});
      setMessage({ type: "success", text: "Cart recovered! Redirecting to cart…" });
      setTimeout(() => router.push("/cart"), 1500);
    } catch {
      setMessage({ type: "error", text: "Failed to recover cart." });
      setRecovering(null);
    }
  }

  async function handleDelete(cartId: string) {
    if (!confirm("Delete this abandoned cart?")) return;
    try {
      await apiClient.delete(`/api/v1/account/abandoned-carts/${cartId}`);
      setCarts((prev) => prev.filter((c) => c.id !== cartId));
    } catch {
      setMessage({ type: "error", text: "Failed to delete cart." });
    }
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Abandoned Carts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carts inactive for 24+ hours. Recover them to continue shopping.
        </p>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-md text-sm font-medium ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {carts.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
          <div className="mb-3 flex justify-center"><ShoppingCartIcon size={40} color="#9CA3AF" /></div>
          <p className="text-gray-500 font-medium">No abandoned carts</p>
          <p className="text-gray-400 text-sm mt-1">
            Carts left inactive for 24+ hours will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {carts.map((cart) => (
            <div key={cart.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Header */}
              <div className="abandoned-cart-header px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <button
                  onClick={() => setExpandedId(expandedId === cart.id ? null : cart.id)}
                  className="text-left"
                >
                  <p className="font-semibold text-gray-900">
                    {cart.item_count} item{cart.item_count !== 1 ? "s" : ""}
                    <span className="text-gray-400 font-normal mx-2">—</span>
                    <span className="text-blue-600">${cart.total.toFixed(2)}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Abandoned {formatDate(cart.abandoned_at)}
                  </p>
                </button>

                <div className="abandoned-cart-actions flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setExpandedId(expandedId === cart.id ? null : cart.id)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    {expandedId === cart.id ? "Hide ▲" : "View items ▼"}
                  </button>
                  <button
                    onClick={() => handleRecover(cart.id)}
                    disabled={recovering === cart.id}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {recovering === cart.id ? "Recovering…" : "Recover Cart"}
                  </button>
                  <button
                    onClick={() => handleDelete(cart.id)}
                    className="px-3 py-2 border border-red-200 text-red-500 rounded-md text-sm font-medium hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Expandable items */}
              {expandedId === cart.id && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: "500px" }}>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-5 py-2 text-xs text-gray-500 font-medium">Product</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">SKU</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Color / Size</th>
                        <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Qty</th>
                        <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Price</th>
                        <th className="text-right px-5 py-2 text-xs text-gray-500 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {cart.items.map((item, idx) => (
                        <tr key={`${item.variant_id}-${idx}`} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">{item.product_name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku}</td>
                          <td className="px-4 py-3 text-gray-500">
                            {[item.color, item.size].filter(Boolean).join(" / ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-600">${item.unit_price.toFixed(2)}</td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">
                            ${item.line_total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-gray-700">
                          Cart Total:
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-gray-900">
                          ${cart.total.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
