"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";

const PERIODS = [
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "quarter", label: "Last 90 Days" },
  { value: "year", label: "Last Year" },
];

interface CustomerReport {
  approval_rate: number;
  status_breakdown: Record<string, number>;
  registrations_trend: { day: string; count: number }[];
  aov_by_tier: { pricing_tier_id: string | null; avg_order_value: number; order_count: number }[];
  top_customers: { company_name: string; order_count: number; total_spend: number }[];
}

export default function CustomerReportPage() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<CustomerReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get(`/api/v1/admin/reports/customers?period=${period}`)
      .then((r: any) => setData(r))
      .finally(() => setLoading(false));
  }, [period]);

  function handleExport() {
    adminService.exportCustomersCsv(period).catch(() => {});
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            Registrations, approval rate, and spending by tier
          </p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {/* Period filter */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Period</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-sm text-gray-500">Application Approval Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.approval_rate}%</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-sm text-gray-500">Status Breakdown</p>
              <div className="flex gap-3 flex-wrap mt-2">
                {Object.entries(data.status_breakdown).map(([status, count]) => (
                  <span key={status} className="text-sm">
                    <span className="font-semibold text-gray-800">{count}</span>{" "}
                    <span className="text-gray-500 capitalize">{status}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Registrations Trend */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
              New Registrations
            </div>
            {data.registrations_trend.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-400">No registrations in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-6 py-3 text-left">Date</th>
                      <th className="px-6 py-3 text-right">New Companies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.registrations_trend.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-3">{row.day}</td>
                        <td className="px-6 py-3 text-right font-semibold">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AOV by Tier */}
          {data.aov_by_tier.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
                Average Order Value by Pricing Tier
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-6 py-3 text-left">Tier ID</th>
                      <th className="px-6 py-3 text-right">Orders</th>
                      <th className="px-6 py-3 text-right">Avg Order Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.aov_by_tier.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-mono text-xs">{row.pricing_tier_id ?? "—"}</td>
                        <td className="px-6 py-3 text-right">{row.order_count}</td>
                        <td className="px-6 py-3 text-right font-semibold">
                          ${row.avg_order_value.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top Customers */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
              Top Customers by Spend
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">#</th>
                    <th className="px-6 py-3 text-left">Company</th>
                    <th className="px-6 py-3 text-right">Orders</th>
                    <th className="px-6 py-3 text-right">Total Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.top_customers.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-6 py-3 font-medium">{row.company_name}</td>
                      <td className="px-6 py-3 text-right">{row.order_count}</td>
                      <td className="px-6 py-3 text-right font-semibold">
                        ${row.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
