"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
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

interface AdminAbandonedCart {
  id: string;
  company_name: string;
  company_id: string;
  customer_email: string | null;
  abandoned_at: string;
  total: number;
  item_count: number;
  items: CartItem[];
  is_recovered: boolean;
  recovered_at: string | null;
}

type FilterMode = "all" | "active" | "recovered";

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

export default function AdminAbandonedCartsPage() {
  const hasLoaded = useRef(false);
  const [carts, setCarts] = useState<AdminAbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);
  const [reminderMsg, setReminderMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadCarts();
  }, []);

  async function loadCarts() {
    setLoading(true);
    try {
      const data = await apiClient.get<AdminAbandonedCart[]>("/api/v1/admin/abandoned-carts");
      setCarts(data);
    } finally {
      setLoading(false);
    }
  }

  async function sendReminder(companyId: string) {
    setReminding(companyId);
    setReminderMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/abandoned-carts/${companyId}/remind`, {});
      setReminderMsg({ id: companyId, ok: true, text: "Reminder sent" });
    } catch {
      setReminderMsg({ id: companyId, ok: false, text: "Failed to send" });
    } finally {
      setReminding(null);
      setTimeout(() => setReminderMsg(null), 4000);
    }
  }

  const filtered = carts.filter((c) => {
    if (filter === "active") return !c.is_recovered;
    if (filter === "recovered") return c.is_recovered;
    return true;
  });

  const totalAbandoned = carts.filter((c) => !c.is_recovered).length;
  const totalRecovered = carts.filter((c) => c.is_recovered).length;
  const lostRevenue = carts
    .filter((c) => !c.is_recovered)
    .reduce((sum, c) => sum + c.total, 0);
  const recoveredRevenue = carts
    .filter((c) => c.is_recovered)
    .reduce((sum, c) => sum + c.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Abandoned Carts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Company carts inactive for 24+ hours across all accounts.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Active Abandoned</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{totalAbandoned}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Recovered</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{totalRecovered}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">At-Risk Revenue</p>
          <p className="text-2xl font-bold text-red-600 mt-1">${lostRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Recovered Revenue</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">${recoveredRevenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "active", "recovered"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
              filter === mode
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
          <div className="mb-3 flex justify-center"><ShoppingCartIcon size={40} color="#9CA3AF" /></div>
          <p className="text-gray-500 font-medium">No carts found</p>
          <p className="text-gray-400 text-sm mt-1">
            {filter === "all"
              ? "No abandoned carts detected yet."
              : `No ${filter} carts.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cart) => (
            <div key={cart.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Header row */}
              <div className="px-5 py-4 flex items-center justify-between">
                <button
                  onClick={() => setExpandedId(expandedId === cart.id ? null : cart.id)}
                  className="text-left flex-1"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        cart.is_recovered
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {cart.is_recovered ? "Recovered" : "Active"}
                    </span>
                    <span className="font-semibold text-gray-900">{cart.company_name}</span>
                    <span className="text-gray-400 text-sm">
                      {cart.item_count} item{cart.item_count !== 1 ? "s" : ""}
                      {" — "}
                      <span className="text-blue-600">${cart.total.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 ml-0">
                    Abandoned {formatDate(cart.abandoned_at)}
                    {cart.recovered_at && (
                      <span className="ml-3 text-green-600">
                        Recovered {formatDate(cart.recovered_at)}
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  {!cart.is_recovered && (
                    <button
                      onClick={() => sendReminder(cart.company_id)}
                      disabled={reminding === cart.company_id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors"
                      style={{
                        background: reminding === cart.company_id ? "#f3f4f6" : "#1A5CFF",
                        color: reminding === cart.company_id ? "#9ca3af" : "#fff",
                        borderColor: reminding === cart.company_id ? "#e5e7eb" : "#1A5CFF",
                        cursor: reminding === cart.company_id ? "not-allowed" : "pointer",
                      }}
                    >
                      {reminding === cart.company_id ? "Sending…" :
                        reminderMsg?.id === cart.company_id ? (reminderMsg.ok ? "✓ Sent" : "✕ Failed") :
                        "Send Reminder"}
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === cart.id ? null : cart.id)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    {expandedId === cart.id ? "Hide ▲" : "View items ▼"}
                  </button>
                </div>
              </div>

              {/* Expandable items */}
              {expandedId === cart.id && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-sm">
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
