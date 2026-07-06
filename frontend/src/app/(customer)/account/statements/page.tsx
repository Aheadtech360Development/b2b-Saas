// frontend/src/app/(customer)/account/statements/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

interface Transaction {
  id: string;
  date: string;
  description: string;
  type: "charge" | "payment" | "credit" | "refund";
  amount: number;
  reference: string | null;
  order_id: string | null;
  running_balance: number;
}

interface StatementData {
  items: Transaction[];
  summary: {
    total_charges: number;
    total_payments: number;
    current_balance: number;
  };
}

const TYPE_LABELS: Record<string, string> = {
  charge: "Invoice",
  payment: "Payment",
  credit: "Credit",
  refund: "Refund",
};

export default function StatementsPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const hasLoaded = useRef(false);
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [refSearch, setRefSearch] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadStatements();
  }, [isLoading]);

  async function loadStatements(from?: string, to?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("date_from", from);
      if (to) params.set("date_to", to);
      const qs = params.toString();
      const result = await apiClient.get<StatementData>(
        `/api/v1/account/statements${qs ? `?${qs}` : ""}`
      );
      setData(result);
    } catch {
      setMessage({ type: "error", text: "Failed to load statements." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncQB() {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await apiClient.post<{ message: string; synced: number }>(
        "/api/v1/account/statements/sync-qb",
        {}
      );
      setMessage({ type: "success", text: result.message });
      await loadStatements(dateFrom || undefined, dateTo || undefined);
    } catch {
      setMessage({ type: "error", text: "QB sync failed." });
    } finally {
      setSyncing(false);
    }
  }

  async function downloadPDF() {
    try {
      const session = sessionStorage.getItem("af_session");
      const token = session ? JSON.parse(session).token : null;
      if (!token) return;

      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const qs = params.toString();

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/account/statements/pdf${qs ? `?${qs}` : ""}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok) throw new Error("Failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Statement_${dateFrom || "All"}.pdf`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ type: "error", text: "Failed to download PDF." });
    }
  }

  async function handleEmailStatement() {
    setMessage(null);
    try {
      const result = await apiClient.post<{ message: string }>(
        "/api/v1/account/statements/email",
        { date_from: dateFrom || null, date_to: dateTo || null }
      );
      setMessage({ type: "success", text: result.message });
    } catch {
      setMessage({ type: "error", text: "Failed to email statement." });
    }
  }

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    loadStatements(dateFrom || undefined, dateTo || undefined);
  }

  const filteredItems = (data?.items ?? []).filter(txn => {
    if (typeFilter && txn.type !== typeFilter) return false;
    if (refSearch) {
      const q = refSearch.toLowerCase();
      const matchRef = txn.reference?.toLowerCase().includes(q);
      const matchDesc = txn.description?.toLowerCase().includes(q);
      if (!matchRef && !matchDesc) return false;
    }
    return true;
  });

  if (loading && !data) return <div className="py-12 text-center text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Statements</h1>
        <div className="flex gap-2 flex-wrap">
          {/* Sync QB hidden */}

          <button
            onClick={downloadPDF}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`px-4 py-3 rounded-md text-sm font-medium ${message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
            }`}
        >
          {message.text}
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Charges</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              ${data.summary.total_charges.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Payments</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              ${data.summary.total_payments.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div
            className={`border rounded-lg p-5 ${data.summary.current_balance > 0
                ? "bg-orange-50 border-orange-200"
                : "bg-green-50 border-green-200"
              }`}
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current Balance</p>
            <p
              className={`text-2xl font-bold mt-1 ${data.summary.current_balance > 0 ? "text-orange-600" : "text-green-600"
                }`}
            >
              ${data.summary.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            {data.summary.current_balance <= 0 && (
              <p className="text-xs text-green-600 mt-0.5">Paid in full</p>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleFilter} className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Transaction Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="charge">Invoice</option>
              <option value="payment">Payment</option>
              <option value="credit">Credit</option>
              <option value="refund">Refund</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reference / Description</label>
            <input
              type="text"
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
              placeholder="Search by ref or description…"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-800 text-white rounded-md text-sm font-medium hover:bg-gray-900"
          >
            Apply Filter
          </button>
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setTypeFilter("");
              setRefSearch("");
              loadStatements();
            }}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Clear All
          </button>
        </div>
      </form>

      {/* Transactions table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Transactions {data ? `(${filteredItems.length}${filteredItems.length !== data.items.length ? ` of ${data.items.length}` : ""})` : ""}
          </h2>
          {(typeFilter || refSearch) && (
            <span className="text-xs text-blue-600">Filtered</span>
          )}
        </div>

        {!data || filteredItems.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p>No transactions found.</p>
            {(typeFilter || refSearch) ? (
              <p className="text-xs mt-1">Try adjusting your filters.</p>
            ) : (
              <p className="text-xs mt-1">Place an order or sync QB payments to see transactions.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Date</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Description</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Type</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Reference</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs">Charges</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs">Credits</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((txn) => (
                  <tr key={txn.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{txn.date}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {txn.order_id ? (
                        <button
                          onClick={() => router.push(`/account/orders/${txn.order_id}`)}
                          className="text-blue-600 hover:underline text-left"
                        >
                          {txn.description}
                        </button>
                      ) : (
                        txn.description
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${txn.type === "charge"
                            ? "bg-red-50 text-red-600"
                            : "bg-green-50 text-green-600"
                          }`}
                      >
                        {TYPE_LABELS[txn.type] ?? txn.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {txn.reference ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600 text-sm">
                      {txn.type === "charge" ? `$${txn.amount.toFixed(2)}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 text-sm">
                      {txn.type !== "charge" ? `$${txn.amount.toFixed(2)}` : ""}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium text-sm ${txn.running_balance > 0 ? "text-orange-600" : "text-green-600"
                        }`}
                    >
                      ${txn.running_balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
