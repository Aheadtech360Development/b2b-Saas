"use client";

import { useEffect, useState } from "react";
import React from "react";
import { apiClient } from "@/lib/api-client";
import { AuditLogDetail } from "@/components/admin/AuditLogDetail";


interface AuditEntry {
  id: string;
  admin_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  created_at: string | null;
}

interface AuditResponse {
  total: number;
  page: number;
  page_size: number;
  items: AuditEntry[];
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

export default function AuditLogPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (entityType) qs.set("entity_type", entityType);
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);
    apiClient
      .get(`/api/v1/admin/audit-log?${qs}`)
      .then((r: any) => setData(r))
      .finally(() => setLoading(false));
  }, [page, entityType, dateFrom, dateTo]);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          All admin write operations are recorded here.
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilter} className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Entity Type</label>
          <input
            type="text"
            placeholder="e.g. products, orders"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Filter
        </button>
        <button
          type="button"
          onClick={() => { setEntityType(""); setDateFrom(""); setDateTo(""); setPage(1); }}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Clear
        </button>
      </form>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : data ? (
        <>
          <p className="text-sm text-gray-500">{data.total.toLocaleString()} entries</p>

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">When</th>
                    <th className="px-4 py-3 text-left">Action</th>
                    <th className="px-4 py-3 text-left">Entity</th>
                    <th className="px-4 py-3 text-left">Admin</th>
                    <th className="px-4 py-3 text-left">IP</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No audit entries found.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((entry) => (
                      <React.Fragment key={entry.id}>
                        <tr
                          key={entry.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        >
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                            {entry.created_at
                              ? new Date(entry.created_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[entry.action] ?? "bg-gray-100 text-gray-600"}`}
                            >
                              {entry.action}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium">{entry.entity_type}</span>
                            {entry.entity_id && (
                              <span className="ml-1 font-mono text-xs text-gray-400">
                                {entry.entity_id.slice(0, 8)}…
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">
                            {entry.admin_user_id ? entry.admin_user_id.slice(0, 8) + "…" : "system"}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {entry.ip_address ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-blue-500">
                            {(entry.old_values || entry.new_values)
                              ? expanded === entry.id
                                ? "▲ Hide"
                                : "▼ Diff"
                              : null}
                          </td>
                        </tr>
                        {expanded === entry.id && (
                          <tr key={`${entry.id}-detail`}>
                            <td colSpan={6} className="px-4 py-4 bg-gray-50 border-t border-gray-200">
                              <AuditLogDetail
                                oldValues={entry.old_values}
                                newValues={entry.new_values}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
