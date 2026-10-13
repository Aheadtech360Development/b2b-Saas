/**
 * The Reports screen: sales, customers and production for a stretch of days
 * (api/v1/admin/reports.py, services/report_view.py).
 *
 * Days are the viewer's: the browser sends its offset from UTC, so "today" and
 * the same-day cutoff mean what they mean on the Production screen.
 */
import { apiClient } from "@/lib/api-client";
import { downloadCsv } from "@/services/admin.service";

export type ReportRange = "today" | "7d" | "30d" | "90d" | "12m" | "custom";
export type ReportTab = "sales" | "customers" | "production";

export const RANGE_OPTIONS: [ReportRange, string][] = [
  ["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["12m", "Last 12 months"],
];

export interface ReportQuery { range: ReportRange; from?: string; to?: string }

export interface ReportOverview {
  range: ReportRange; label: string; from: string; to: string; days: number;
  sales: {
    orders: number; revenue: number; average: number;
    /** Percent against the days just before; null when there is nothing fair to compare with. */
    change: { revenue: number | null; orders: number | null; average: number | null };
  };
  by_status: { status: string; orders: number; amount: number }[];
  /** id is a company's id, or "guest:<email>". */
  top_customers: { id: string; name: string; kind: "retail" | "wholesale" | "guest"; orders: number; spent: number }[];
  top_products: { product_id: string | null; name: string; units: number; revenue: number }[];
  by_kind: { kind: "retail" | "wholesale" | "guest"; orders: number; revenue: number }[];
  customers: { buyers: number; new: number; returning: number };
  by_state: { state: string; orders: number; revenue: number }[];
  production: {
    in_review_paid: number; in_review: number;
    columns: { review: number; approved: number; production: number; ready: number };
    sheets_printed: number; jobs_printed: number;
    /** "HH:MM", or null when the shop has no same-day cutoff. */
    cutoff: string | null;
    measured: number; on_time: number; on_time_percent: number | null;
  };
}

function params(q: ReportQuery): URLSearchParams {
  const p = new URLSearchParams({ range: q.range, utc_offset: String(-new Date().getTimezoneOffset()) });
  if (q.range === "custom") { p.set("date_from", q.from ?? ""); p.set("date_to", q.to ?? ""); }
  return p;
}

export const reportsService = {
  overview: (q: ReportQuery) => apiClient.get<ReportOverview>(`/api/v1/admin/reports/overview?${params(q)}`),
  export: (tab: ReportTab, q: ReportQuery, filename: string) => {
    const p = params(q);
    p.set("tab", tab);
    return downloadCsv(`/api/v1/admin/reports/export?${p}`, filename);
  },
};
