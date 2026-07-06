"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  overview: {
    total_revenue: number;
    total_orders: number;
    average_order_value: number;
    total_customers: number;
    new_customers: number;
    returning_customers: number;
    guest_orders: number;
    wholesale_orders: number;
    revenue_change_percent: number;
    orders_change_percent: number;
    customers_change_percent: number;
    conversion_rate?: number;
  };
  revenue_chart: { date: string; revenue: number; orders: number }[];
  order_status_breakdown: { status: string; count: number; revenue: number }[];
  top_products: { product_name: string; units_sold: number; revenue: number; slug: string }[];
  top_customers: { company_name: string; company_id: string; orders: number; total_spend: number }[];
  orders_by_state: { state: string; orders: number; revenue: number }[];
  new_vs_returning: { new: number; returning: number };
}

type Period = "today" | "7d" | "30d" | "90d" | "custom";

// ── Style constants ───────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "20px",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  confirmed: "#1A5CFF",
  processing: "#06B6D4",
  ready_for_pickup: "#F97316",
  shipped: "#8B5CF6",
  delivered: "#059669",
  cancelled: "#E8242A",
  refunded: "#9CA3AF",
};

const PIE_COLORS = ["#1A5CFF", "#059669", "#F59E0B", "#E8242A", "#8B5CF6", "#06B6D4", "#F97316"];

// ── Helper components ─────────────────────────────────────────────────────────
function StatCard({
  label, value, change, color = "#2A2830", prefix = "", suffix = "",
}: {
  label: string; value: string | number; change?: number;
  color?: string; prefix?: string; suffix?: string;
}) {
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#7A7880" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color, lineHeight: 1, letterSpacing: ".02em" }}>
        {prefix}{typeof value === "number" ? value.toLocaleString() : value}{suffix}
      </div>
      {change !== undefined && (
        <div style={{ fontSize: "12px", fontWeight: 600, color: change >= 0 ? "#059669" : "#E8242A", display: "flex", alignItems: "center", gap: "3px" }}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs prev period
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ ...card, height: "100px", background: "#F4F3EF", animation: "pulse 1.5s ease-in-out infinite" }} />
  );
}

// ── Currency formatter ────────────────────────────────────────────────────────
function fmt(n: number) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtShort(n: number) {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"daily" | "weekly">("daily");

  const fetchData = useCallback(async (p: Period, cs?: string, ce?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: p });
      if (p === "custom" && cs && ce) {
        params.set("start_date", cs);
        params.set("end_date", ce);
      }
      const res = await apiClient.get<AnalyticsData>(`/api/v1/admin/analytics?${params}`);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(period); }, [period, fetchData]);

  function handleCustomApply() {
    if (customStart && customEnd) fetchData("custom", customStart, customEnd);
  }

  // ── Weekly aggregation for chart ──────────────────────────────────────────
  function toWeekly(daily: { date: string; revenue: number; orders: number }[]) {
    const weeks: { date: string; revenue: number; orders: number }[] = [];
    let i = 0;
    while (i < daily.length) {
      const chunk = daily.slice(i, i + 7);
      if (!chunk[0]) { i += 7; continue; }
      weeks.push({
        date: chunk[0].date,
        revenue: chunk.reduce((s, d) => s + d.revenue, 0),
        orders: chunk.reduce((s, d) => s + d.orders, 0),
      });
      i += 7;
    }
    return weeks;
  }

  const chartData = data
    ? (chartView === "weekly" ? toWeekly(data.revenue_chart) : data.revenue_chart)
    : [];

  const PERIOD_BTNS: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "Last 7 Days" },
    { key: "30d", label: "Last 30 Days" },
    { key: "90d", label: "Last 90 Days" },
    { key: "custom", label: "Custom Range" },
  ];

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
    border: `1.5px solid ${active ? "#1A5CFF" : "#E2E0DA"}`,
    background: active ? "rgba(26,92,255,.08)" : "#fff",
    color: active ? "#1A5CFF" : "#555",
    cursor: "pointer", transition: "all .15s",
  });

  return (
    <div style={{ fontFamily: "var(--font-jakarta)", maxWidth: "1200px" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1, marginBottom: "4px" }}>
          ANALYTICS
        </h1>
        <p style={{ fontSize: "13px", color: "#7A7880" }}>Revenue, orders, and customer insights</p>
      </div>

      {/* ── Date range selector ── */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "24px" }}>
        {PERIOD_BTNS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setPeriod(key)} style={pillStyle(period === key)}>
            {label}
          </button>
        ))}
        {period === "custom" && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              style={{ padding: "6px 10px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "12px", outline: "none" }}
            />
            <span style={{ fontSize: "12px", color: "#aaa" }}>to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              style={{ padding: "6px 10px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "12px", outline: "none" }}
            />
            <button
              type="button"
              onClick={handleCustomApply}
              disabled={!customStart || !customEnd}
              style={{ padding: "6px 16px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: (!customStart || !customEnd) ? 0.5 : 1 }}
            >
              Apply
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => fetchData(period, customStart, customEnd)}
          style={{ marginLeft: "auto", padding: "7px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "12px", fontWeight: 600, color: "#555", cursor: "pointer" }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid #FECACA", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#E8242A" }}>
          {error}
        </div>
      )}

      {/* ── Overview cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }} className="analytics-grid-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : data ? (
          <>
            <StatCard
              label="Total Revenue"
              value={fmtShort(data.overview.total_revenue)}
              change={data.overview.revenue_change_percent}
              color="#059669"
            />
            <StatCard
              label="Total Orders"
              value={data.overview.total_orders}
              change={data.overview.orders_change_percent}
              color="#1A5CFF"
            />
            <StatCard
              label="Avg Order Value"
              value={fmt(data.overview.average_order_value)}
              color="#2A2830"
            />
            <StatCard
              label="Total Customers"
              value={data.overview.total_customers}
              change={data.overview.customers_change_percent}
              color="#8B5CF6"
            />
            <StatCard
              label="New Customers"
              value={data.overview.new_customers}
              color="#F97316"
            />
            <StatCard
              label="Conversion Rate"
              value={`${data.overview.conversion_rate ?? 0}%`}
              color="#06B6D4"
            />
            {/* Guest vs Wholesale */}
            <div style={{ ...card }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#7A7880", marginBottom: "10px" }}>
                Order Type
              </div>
              <div style={{ display: "flex", gap: "16px" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-bebas)", fontSize: "26px", color: "#1A5CFF", lineHeight: 1 }}>{data.overview.wholesale_orders}</div>
                  <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "2px" }}>Wholesale</div>
                </div>
                <div style={{ width: "1px", background: "#E2E0DA" }} />
                <div>
                  <div style={{ fontFamily: "var(--font-bebas)", fontSize: "26px", color: "#F97316", lineHeight: 1 }}>{data.overview.guest_orders}</div>
                  <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "2px" }}>Guest / Retail</div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Revenue & Orders chart ── */}
      <div style={{ ...card, marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <div style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".08em", color: "#2A2830" }}>REVENUE & ORDERS</div>
            {!loading && data && (
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>
                {fmt(data.overview.total_revenue)} total · {data.overview.total_orders} orders
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["daily", "weekly"] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setChartView(v)}
                style={{
                  padding: "5px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                  border: `1.5px solid ${chartView === v ? "#1A5CFF" : "#E2E0DA"}`,
                  background: chartView === v ? "rgba(26,92,255,.08)" : "#fff",
                  color: chartView === v ? "#1A5CFF" : "#555",
                  cursor: "pointer",
                }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ height: "280px", background: "#F4F3EF", borderRadius: "8px" }} />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F3EF" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#7A7880" }}
                tickFormatter={v => {
                  const d = new Date(v + "T00:00:00");
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                interval="preserveStartEnd"
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#7A7880" }} tickFormatter={fmtShort} width={56} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#7A7880" }} width={36} />
              <Tooltip
                formatter={(value, name) =>
                  name === "revenue" ? [fmt(Number(value)), "Revenue"] : [value, "Orders"]
                }
                labelFormatter={l => {
                  const d = new Date(l + "T00:00:00");
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                }}
                contentStyle={{ fontSize: "12px", border: "1px solid #E2E0DA", borderRadius: "6px" }}
              />
              <Bar yAxisId="right" dataKey="orders" fill="rgba(26,92,255,.15)" radius={[3, 3, 0, 0]} name="orders" />
              <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#1A5CFF" strokeWidth={2} dot={false} name="revenue" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Status breakdown + New vs Returning ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }} className="analytics-grid-2">

        {/* Order Status Donut */}
        <div style={card}>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".08em", color: "#2A2830", marginBottom: "16px" }}>ORDER STATUS BREAKDOWN</div>
          {loading ? (
            <div style={{ height: "200px", background: "#F4F3EF", borderRadius: "8px" }} />
          ) : data && data.order_status_breakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={data.order_status_breakdown}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                  >
                    {data.order_status_breakdown.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#9CA3AF"} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, _n, props) => [v + " orders", (props as { payload?: { status?: string } }).payload?.status ?? ""]}
                    contentStyle={{ fontSize: "12px", border: "1px solid #E2E0DA", borderRadius: "6px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                {data.order_status_breakdown.map(s => (
                  <div key={s.status} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: STATUS_COLORS[s.status] ?? "#9CA3AF", flexShrink: 0, display: "inline-block" }} />
                      <span style={{ textTransform: "capitalize", color: "#2A2830", fontWeight: 600 }}>{s.status.replace(/_/g, " ")}</span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", color: "#7A7880" }}>
                      <span>{s.count}</span>
                      <span style={{ minWidth: "60px", textAlign: "right" }}>{fmt(s.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: "13px" }}>No orders in this period</div>
          )}
        </div>

        {/* New vs Returning */}
        <div style={card}>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".08em", color: "#2A2830", marginBottom: "16px" }}>NEW VS RETURNING CUSTOMERS</div>
          {loading ? (
            <div style={{ height: "200px", background: "#F4F3EF", borderRadius: "8px" }} />
          ) : data ? (() => {
            const total = data.new_vs_returning.new + data.new_vs_returning.returning;
            const pieData = [
              { name: "New", value: data.new_vs_returning.new },
              { name: "Returning", value: data.new_vs_returning.returning },
            ];
            return (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                      <Cell fill="#1A5CFF" />
                      <Cell fill="#059669" />
                    </Pie>
                    <Tooltip
                      formatter={(v, n) => [`${v} (${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%)`, String(n)]}
                      contentStyle={{ fontSize: "12px", border: "1px solid #E2E0DA", borderRadius: "6px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: "24px", justifyContent: "center", marginTop: "12px" }}>
                  {pieData.map((item, i) => (
                    <div key={item.name} style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-bebas)", fontSize: "26px", color: i === 0 ? "#1A5CFF" : "#059669", lineHeight: 1 }}>{item.value}</div>
                      <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "2px" }}>
                        {item.name} · {total ? ((item.value / total) * 100).toFixed(0) : 0}%
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })() : null}
        </div>
      </div>

      {/* ── Top Products table ── */}
      <div style={{ ...card, marginBottom: "20px" }}>
        <div style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".08em", color: "#2A2830", marginBottom: "16px" }}>TOP PRODUCTS</div>
        {loading ? (
          <div style={{ height: "200px", background: "#F4F3EF", borderRadius: "8px" }} />
        ) : data && data.top_products.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E2E0DA" }}>
                {["#", "Product", "Units Sold", "Revenue", ""].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: h === "Revenue" || h === "Units Sold" ? "right" : "left", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.top_products.map((p, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #F4F3EF", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "#aaa", width: "32px" }}>{i + 1}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#2A2830" }}>{p.product_name}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#2A2830" }}>{p.units_sold.toLocaleString()}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmt(p.revenue)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {p.slug && (
                      <a
                        href={`/admin/products/${p.slug}/edit`}
                        style={{ fontSize: "11px", color: "#1A5CFF", fontWeight: 600, textDecoration: "none" }}
                      >
                        View →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: "13px" }}>No product data in this period</div>
        )}
      </div>

      {/* ── Top Customers + Orders by State ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }} className="analytics-grid-2">

        {/* Top Customers */}
        <div style={card}>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".08em", color: "#2A2830", marginBottom: "16px" }}>TOP CUSTOMERS</div>
          {loading ? (
            <div style={{ height: "200px", background: "#F4F3EF", borderRadius: "8px" }} />
          ) : data && data.top_customers.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E2E0DA" }}>
                  {["Company", "Orders", "Total Spend"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: h !== "Company" ? "right" : "left", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.top_customers.map((c, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid #F4F3EF", cursor: "pointer", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}
                    onClick={() => router.push(`/admin/customers/${c.company_id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(26,92,255,.04)")}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#FAFAFA")}
                  >
                    <td style={{ padding: "8px 8px", fontWeight: 600, color: "#1A5CFF" }}>{c.company_name}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", color: "#7A7880" }}>{c.orders}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmt(c.total_spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: "13px" }}>No customer data in this period</div>
          )}
        </div>

        {/* Orders by State */}
        <div style={card}>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".08em", color: "#2A2830", marginBottom: "16px" }}>ORDERS BY STATE</div>
          {loading ? (
            <div style={{ height: "200px", background: "#F4F3EF", borderRadius: "8px" }} />
          ) : data && data.orders_by_state.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, data.orders_by_state.length * 32)}>
              <BarChart
                data={data.orders_by_state}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F3EF" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#7A7880" }} />
                <YAxis type="category" dataKey="state" tick={{ fontSize: 11, fill: "#7A7880" }} width={36} />
                <Tooltip
                  formatter={(v) => [v + " orders", "Orders"]}
                  contentStyle={{ fontSize: "12px", border: "1px solid #E2E0DA", borderRadius: "6px" }}
                />
                <Bar dataKey="orders" fill="#1A5CFF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: "13px" }}>No state data available</div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
        @media (max-width: 900px) {
          .analytics-grid-3 { grid-template-columns: repeat(2, 1fr) !important; }
          .analytics-grid-2 { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 540px) {
          .analytics-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
