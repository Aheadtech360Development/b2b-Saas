"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { accountService } from "@/services/account.service";
import { useAuthStore } from "@/stores/auth.store";

interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: string;
  po_number: string | null;
  item_count: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  processing: "bg-indigo-100 text-indigo-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-600",
};

export default function AccountOrdersPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuthStore();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [welcomeBanner, setWelcomeBanner] = useState(false);

  // Show welcome banner when redirected from activation
  useEffect(() => {
    if (searchParams.get("activated") === "true") {
      setWelcomeBanner(true);
      const t = setTimeout(() => setWelcomeBanner(false), 6000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (authLoading || !isAuthenticated()) return;
    async function load() {
      setIsLoading(true);
      try {
        const data = await accountService.getOrders({
          q: debouncedQuery || undefined,
          status: statusFilter || undefined,
        }) as { items: Order[] };
        setOrders(data.items ?? []);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [authLoading, statusFilter, debouncedQuery]); // isAuthenticated excluded — stable reference

  return (
    <div>
      {welcomeBanner && (
        <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: "8px", padding: "14px 18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>🎉</span>
          <p style={{ margin: 0, fontSize: "14px", color: "#065f46", fontWeight: 600 }}>
            Welcome! Your account has been activated. Here are your orders.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Orders</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search order # or PO #…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "560px" }}>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Order #</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">PO #</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Status</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs">Items</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs">Total</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && orders.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#7A7880", fontSize: "14px" }}>Loading…</td></tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-400">
                  {debouncedQuery || statusFilter ? "No orders match your search" : "No orders yet"}
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">
                    {o.order_number}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{o.po_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{o.item_count}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">
                    ${Number(o.total).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/account/orders/${o.order_number}`}
                      className="text-xs font-medium text-brand-600 hover:text-brand-800"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
