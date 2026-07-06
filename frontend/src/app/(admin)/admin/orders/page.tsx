"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminService } from "@/services/admin.service";

interface AdminOrder {
  id: string;
  order_number: string;
  company_name: string | null;
  status: string;
  payment_status: string;
  po_number: string | null;
  total: string;
  item_count: number;
  created_at: string;
  is_guest_order?: boolean;
  guest_email?: string | null;
  guest_name?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending:           "bg-yellow-100 text-yellow-700",
  confirmed:         "bg-blue-100 text-blue-700",
  processing:        "bg-indigo-100 text-indigo-700",
  ready_for_pickup:  "bg-teal-100 text-teal-700",
  shipped:           "bg-purple-100 text-purple-700",
  delivered:         "bg-green-100 text-green-700",
  cancelled:         "bg-red-100 text-red-700",
};

const PAYMENT_COLORS: Record<string, string> = {
  unpaid:  "bg-red-100 text-red-700",
  pending: "bg-orange-100 text-orange-700",
  due:     "bg-orange-100 text-orange-700",
  failed:  "bg-red-100 text-red-700",
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "guest">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const PAGE_SIZE = 50;

  async function load() {
    setIsLoading(true);
    try {
      const params: Record<string, string | undefined> = {
        q: q || undefined,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page: String(page),
      };
      if (activeTab === "guest") params.guest_only = "true";
      const data = await adminService.listOrders(params) as { items: AdminOrder[]; total: number };
      setOrders(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally { setIsLoading(false); }
  }

  useEffect(() => { load(); }, [q, statusFilter, activeTab, dateFrom, dateTo, page]);

  async function handleExport() {
    setExportLoading(true);
    try {
      await adminService.exportOrdersCsv({
        q: q || undefined,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
    } catch { /* ignore */ } finally { setExportLoading(false); }
  }

  function clearFilters() {
    setQ(""); setStatusFilter(""); setDateFrom(""); setDateTo(""); setPage(1);
  }

  const hasFilters = q || statusFilter || dateFrom || dateTo;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total orders</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
            {exportLoading ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(["all", "guest"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {tab === "all" ? "All Orders" : "Guest Orders"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search order # or PO…"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">From</label>
          <input
            type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">To</label>
          <input
            type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Order #</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Company</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">Total</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && orders.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>Loading…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">No orders found</td></tr>
            ) : orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-gray-800">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    {o.order_number}
                    {o.is_guest_order && <span style={{ background: '#E8F4FD', color: '#1A6FA8', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px' }}>Retail</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {o.is_guest_order ? (
                    <div>
                      <div className="text-sm font-medium">{o.guest_name || "Guest"}</div>
                      <div className="text-xs text-gray-400">{o.guest_email}</div>
                    </div>
                  ) : (o.company_name ?? "—")}
                </td>
                <td className="px-4 py-3">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {o.status}
                    </span>
                    {o.payment_status !== "paid" && PAYMENT_COLORS[o.payment_status] && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_COLORS[o.payment_status]}`}>
                        {o.payment_status}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-700 font-medium">${Number(o.total).toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${o.order_number}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">Prev</button>
          <span className="text-sm text-gray-600">{page} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
        </div>
      )}
    </div>
  );
}
