"use client";

/**
 * Reports: sales, customers and production for a stretch of days.
 *
 * Every number is counted on the server in one place (services/report_view.py):
 * money leaves out drafts, cancelled and refunded orders; a buyer's kind is the
 * customer list's; top products include gang sheets and made-to-order lines;
 * a change against the days before shows only when the shop was selling then.
 * The tab and the days live in the address, so a report can be linked to.
 */
import Link from "next/link";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KIND_LABEL, KIND_TONE, money } from "@/lib/customerWords";
import { ApiClientError } from "@/lib/api-client";
import { PlanLock } from "@/components/admin/customers/CustomersFrame";
import { cutoffWords } from "@/services/production.service";
import {
  RANGE_OPTIONS, reportsService, type ReportOverview, type ReportQuery, type ReportRange, type ReportTab,
} from "@/services/reports.service";

const TABS: [ReportTab, string][] = [["sales", "Sales"], ["customers", "Customers"], ["production", "Production"]];
const LEDE: Record<ReportTab, string> = {
  sales: "Sales, customers and production in one place.",
  customers: "Who bought, who came back, and where orders go.",
  production: "Print jobs waiting, on time against the cutoff, and sheets printed.",
};
const STATUS_WORDS: Record<string, [string, string]> = {
  pending: ["Pending", "amber"], confirmed: ["Confirmed", "blue"], processing: ["Processing", "blue"],
  ready_for_pickup: ["Ready for pickup", "blue"], shipped: ["Shipped", "green"], delivered: ["Delivered", "green"],
  cancelled: ["Cancelled", ""], refunded: ["Refunded", ""],
};
const RANGES = new Set<string>(["today", "7d", "30d", "90d", "12m", "custom"]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const customerHref = (id: string) => (id.startsWith("guest:") ? `/admin/customers/guest?email=${encodeURIComponent(id.slice(6))}` : `/admin/customers/${id}`);

export default function ReportsPage() {
  // The address is read with useSearchParams, which wants a boundary above it.
  return <Suspense fallback={null}><Reports /></Suspense>;
}

function Reports() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (TABS.find(([k]) => k === sp.get("tab"))?.[0] ?? "sales") as ReportTab;
  const askedRange = sp.get("range") ?? "30d";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  // A custom range needs both days; without them it is the last 30 days.
  const range = (RANGES.has(askedRange) && (askedRange !== "custom" || (ISO_DAY.test(from) && ISO_DAY.test(to))) ? askedRange : "30d") as ReportRange;
  const query: ReportQuery = range === "custom" ? { range, from, to } : { range };
  const key = `${range}|${from}|${to}`;

  const [data, setData] = useState<ReportOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [pop, setPop] = useState(false);
  const [dates, setDates] = useState({ from, to });
  const [exporting, setExporting] = useState(false);
  const [flash, setFlash] = useState("");
  const asked = useRef(0);

  useEffect(() => {
    const mine = ++asked.current;
    setFailed(false);
    reportsService.overview(query)
      .then((d) => { if (mine === asked.current) { setData(d); setShownFor(key); } })
      .catch((e) => {
        if (mine !== asked.current) return;
        if (e instanceof ApiClientError && e.code === "FEATURE_NOT_IN_PLAN") setLocked(true); else setFailed(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { setDates({ from, to }); }, [from, to]);

  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".pc-pop-wrap")) setPop(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [pop]);

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  const tabHref = (t: ReportTab) => {
    const next = new URLSearchParams(sp.toString());
    if (t === "sales") next.delete("tab"); else next.set("tab", t);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  async function exportTab() {
    if (!data) return;
    setExporting(true);
    try { await reportsService.export(tab, query, `${tab}-${data.from}-to-${data.to}.csv`); }
    catch { setFlash("The export could not be made. Try again in a moment."); }
    setExporting(false);
  }

  const rangeLabel = range === "custom" ? `${shortDay(from)} to ${shortDay(to)}` : RANGE_OPTIONS.find(([k]) => k === range)?.[1] ?? "Last 30 days";
  const ready = data && shownFor === key;

  return (
    <div className="pc-page" data-reports={tab}>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Reports</div>
          <h1 className="pc-h1">Reports</h1>
          <p className="pc-sub-line">{LEDE[tab]}</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="pc-btn" onClick={exportTab} disabled={exporting || !ready}>{exporting ? "Exporting…" : "Export"}</button>
          <div className="pc-pop-wrap">
            <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={pop} onClick={() => setPop(!pop)} data-range-button>
              {rangeLabel} <span aria-hidden style={{ fontSize: "11px" }}>▾</span>
            </button>
            {pop && (
              <div className="pc-pop" role="menu" style={{ right: 0, left: "auto" }}>
                {RANGE_OPTIONS.map(([value, label]) => (
                  <button key={value} type="button" role="menuitemradio" aria-checked={range === value} className="pc-pop-item" data-on={range === value ? "" : undefined}
                    onClick={() => { go({ range: value === "30d" ? null : value, from: null, to: null }); setPop(false); }}>{label}</button>
                ))}
                <form className="pc-pop-form" style={{ borderTop: "1px solid var(--pc-line)" }}
                  onSubmit={(e) => { e.preventDefault(); if (dates.from && dates.to) { go({ range: "custom", from: dates.from, to: dates.to }); setPop(false); } }}>
                  <div>
                    <label className="pc-label" htmlFor="report-from">From</label>
                    <input id="report-from" type="date" className="pc-input" value={dates.from} max={dates.to || undefined} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} />
                  </div>
                  <div>
                    <label className="pc-label" htmlFor="report-to">To</label>
                    <input id="report-to" type="date" className="pc-input" value={dates.to} min={dates.from || undefined} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} />
                  </div>
                  <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
                    <button type="submit" className="pc-btn" data-kind="primary" style={{ height: "38px" }} disabled={!dates.from || !dates.to}>Apply</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="pc-tabs" aria-label="Reports">
        {TABS.map(([k, label]) => (
          <Link key={k} href={tabHref(k)} className="pc-tab" data-tab={k} scroll={false}
            data-on={tab === k ? "" : undefined} aria-current={tab === k ? "page" : undefined}>{label}</Link>
        ))}
      </nav>

      {flash && (
        <div className="pc-flash" data-bad="" role="status">
          <span>{flash}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash("")} style={{ color: "inherit" }}>×</button>
        </div>
      )}

      {locked && <PlanLock title="Reports are on a higher plan" blurb="See sales, customers and production for any stretch of days, and export each as a spreadsheet." />}
      {!locked && failed && <div className="pc-card pc-empty" style={{ padding: "28px" }}>The report could not be loaded. Reload to try again.</div>}
      {!locked && !failed && !data && <div className="pc-card" style={{ padding: "24px" }} aria-busy><div className="at-skel" style={{ height: "18px", width: "60%", borderRadius: "6px" }} /></div>}
      {!locked && !failed && data && (
        <div data-shown={ready ? key : undefined} aria-busy={!ready} style={{ opacity: ready ? 1 : 0.6, transition: "opacity .15s" }}>
          {tab === "sales" && <SalesTab d={data} />}
          {tab === "customers" && <CustomersTab d={data} />}
          {tab === "production" && <ProductionTab d={data} />}
        </div>
      )}
    </div>
  );
}

// ── Parts ────────────────────────────────────────────────────────────────────

function Stat({ value, label, sub, change }: { value: string | number; label: string; sub?: string; change?: number | null }) {
  return (
    <div className="pc-card pc-stat4" data-stat={label}>
      <div className="pc-stat4-v">{value}</div>
      <div className="pc-stat4-l">{label}</div>
      {/* Only against days the shop was selling: otherwise it compares with nothing. */}
      {change != null && (
        <div className="pc-stat4-s" data-change style={{ color: change > 0 ? "var(--pc-green, #15803d)" : change < 0 ? "var(--pc-red, #b91c1c)" : undefined }}>
          {change > 0 ? "+" : ""}{change}% against the days before
        </div>
      )}
      {sub && <div className="pc-stat4-s">{sub}</div>}
    </div>
  );
}

function Table({ title, head, empty, children, rows }: { title: string; head: [string, boolean?][]; empty: string; rows: number; children: ReactNode }) {
  return (
    <section className="pc-card" data-report-table={title}>
      <div className="pc-card-head"><h2 className="pc-h2" style={{ margin: 0 }}>{title}</h2></div>
      <div className="pc-scroll-x">
        <table className="pc-table">
          <thead><tr>{head.map(([h, num]) => <th key={h} className={num ? "pc-num" : undefined}>{h}</th>)}</tr></thead>
          <tbody>
            {rows === 0 ? <tr><td colSpan={head.length} className="pc-empty">{empty}</td></tr> : children}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const pill = (label: string, tone: string) => <span className="pc-pill" data-tone={tone || undefined} style={{ textTransform: "none" }}>{label}</span>;

function TopCustomers({ d, limit = 10 }: { d: ReportOverview; limit?: number }) {
  const rows = d.top_customers.slice(0, limit);
  return (
    <Table title="Top customers" head={[["Customer"], ["Orders", true], ["Spent", true]]} rows={rows.length} empty="No orders in these days.">
      {rows.map((c) => (
        <tr key={c.id}>
          <td className="pc-td-clip" title={c.name}><Link href={customerHref(c.id)} className="pc-inline" style={{ fontWeight: 600 }}>{c.name}</Link></td>
          <td className="pc-num">{c.orders}</td>
          <td className="pc-num" style={{ fontWeight: 600 }}>{money(c.spent)}</td>
        </tr>
      ))}
    </Table>
  );
}

function ProductionCard({ p }: { p: ReportOverview["production"] }) {
  const onTime = p.on_time_percent != null ? `${p.on_time_percent}%` : "Not measured yet";
  const onTimeSub = !p.cutoff ? "Set a same-day cutoff on Production to measure this"
    : p.measured ? `Against the ${cutoffWords(p.cutoff)} cutoff, ${p.on_time} of ${p.measured} jobs`
    : `Against the ${cutoffWords(p.cutoff)} cutoff, from jobs approved from now on`;
  return (
    <section className="pc-card" style={{ padding: "18px 20px" }} data-production-card>
      <h2 className="pc-h2" style={{ margin: "0 0 14px" }}>Production</h2>
      <div className="pc-stats2" style={{ marginBottom: 0 }}>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{p.in_review_paid}</div><div className="pc-stat4-l">Paid jobs in review</div>
          {p.in_review > p.in_review_paid && <div className="pc-stat4-s">{p.in_review - p.in_review_paid} more not paid yet</div>}</div>
        <div className="pc-card pc-stat4" data-on-time><div className="pc-stat4-v" style={p.on_time_percent == null ? { fontSize: "20px" } : undefined}>{onTime}</div>
          <div className="pc-stat4-l">On time</div><div className="pc-stat4-s">{onTimeSub}</div></div>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{p.sheets_printed}</div><div className="pc-stat4-l">Sheets printed</div>
          <div className="pc-stat4-s">{p.jobs_printed} {p.jobs_printed === 1 ? "job" : "jobs"} in these days</div></div>
      </div>
    </section>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

/** Revenue (bars) and orders (line) on each day: the old Analytics page's chart. */
function RevenueChart({ d }: { d: ReportOverview }) {
  const days = d.by_day ?? [];
  const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <section className="pc-card" data-revenue-chart style={{ marginBottom: "18px" }}>
      <div className="pc-card-head">
        <h2 className="pc-h2" style={{ margin: 0 }}>Revenue by day</h2>
        <span className="pc-sub-line" style={{ margin: 0, fontSize: "13px" }}>Bars are revenue, the line is orders</span>
      </div>
      {days.some((x) => x.revenue > 0 || x.orders > 0) ? (
        <div className="pc-pad" style={{ height: "280px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={days} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#EEF1F5" vertical={false} />
              <XAxis dataKey="date" tickFormatter={label} minTickGap={24} tickLine={false} axisLine={{ stroke: "#E3E8EF" }} tick={{ fontSize: 12, fill: "#667085" }} />
              <YAxis yAxisId="money" width={72} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#667085" }}
                tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
              <YAxis yAxisId="orders" orientation="right" width={34} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#667085" }} />
              <Tooltip labelFormatter={(v) => label(String(v))} formatter={(value, name) => (name === "Revenue" ? money(Number(value)) : String(value))} />
              <Bar yAxisId="money" dataKey="revenue" name="Revenue" fill="#1D5FD6" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line yAxisId="orders" dataKey="orders" name="Orders" type="monotone" stroke="#0C1F3F" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="pc-empty">No sales in these days.</div>}
    </section>
  );
}

function SalesTab({ d }: { d: ReportOverview }) {
  const s = d.sales;
  const paid = d.paid_share;
  return (
    <>
      <div className="pc-stats4">
        <Stat value={money(s.revenue)} label="Revenue" sub={d.label} change={s.change.revenue} />
        <Stat value={s.orders} label="Orders" change={s.change.orders} />
        <Stat value={money(s.average)} label="Average order" change={s.change.average} />
        <Stat value={paid?.percent != null ? `${paid.percent}%` : "–"} label="Conversion rate"
          sub={paid?.orders ? `${paid.paid} of ${paid.orders} orders paid` : "Paid orders out of all placed"} />
      </div>
      <RevenueChart d={d} />
      <div className="pc-cols" style={{ marginTop: 0 }}>
        <div style={{ display: "grid", gap: "18px", minWidth: 0 }}>
          <Table title="Orders by status" head={[["Status"], ["Orders", true], ["Amount", true]]} rows={d.by_status.length} empty="No orders in these days.">
            {d.by_status.map((r) => {
              const [label, tone] = STATUS_WORDS[r.status] ?? [r.status.replace(/_/g, " "), ""];
              return (
                <tr key={r.status}>
                  <td><Link href={`/admin/orders?status=${r.status}&from=${d.from}&to=${d.to}`} aria-label={`Open the ${label.toLowerCase()} orders`}>{pill(label, tone)}</Link></td>
                  <td className="pc-num">{r.orders}</td>
                  <td className="pc-num">{money(r.amount)}</td>
                </tr>
              );
            })}
          </Table>
          <ProductionCard p={d.production} />
        </div>
        <div style={{ display: "grid", gap: "18px", minWidth: 0 }}>
          <TopCustomers d={d} limit={5} />
          <Table title="Top products" head={[["Product"], ["Units", true], ["Sales", true]]} rows={d.top_products.length} empty="Nothing sold in these days.">
            {d.top_products.slice(0, 5).map((p) => (
              <tr key={p.product_id ?? p.name}>
                <td className="pc-td-clip" title={p.name}>{p.name}</td>
                <td className="pc-num">{p.units}</td>
                <td className="pc-num" style={{ fontWeight: 600 }}>{money(p.revenue)}</td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </>
  );
}

function CustomersTab({ d }: { d: ReportOverview }) {
  const c = d.customers;
  const orders = d.by_kind.reduce((n, k) => n + k.orders, 0);
  return (
    <>
      <div className="pc-stats3">
        <Stat value={c.buyers} label="Customers who ordered" sub={d.label} />
        <Stat value={c.new} label="First order" sub="Bought for the first time" />
        <Stat value={c.returning} label="Came back" sub="Had ordered before" />
      </div>
      <div className="pc-cols" style={{ marginTop: 0 }}>
        <div style={{ display: "grid", gap: "18px", minWidth: 0 }}>
          <TopCustomers d={d} />
          <Table title="Where orders ship" head={[["State"], ["Orders", true], ["Sales", true]]} rows={d.by_state.length} empty="No shipping addresses in these days.">
            {d.by_state.map((r) => (
              <tr key={r.state}><td style={{ fontWeight: 600 }}>{r.state}</td><td className="pc-num">{r.orders}</td><td className="pc-num">{money(r.revenue)}</td></tr>
            ))}
          </Table>
        </div>
        <Table title="Order type" head={[["Type"], ["Orders", true], ["Sales", true]]} rows={orders ? d.by_kind.length : 0} empty="No orders in these days.">
          {d.by_kind.map((k) => (
            <tr key={k.kind} data-kind={k.kind}>
              <td>{pill(KIND_LABEL[k.kind], KIND_TONE[k.kind])}</td>
              <td className="pc-num">{k.orders}{orders ? <span style={{ color: "var(--pc-muted)" }}> · {Math.round((k.orders / orders) * 100)}%</span> : null}</td>
              <td className="pc-num">{money(k.revenue)}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}

function ProductionTab({ d }: { d: ReportOverview }) {
  const p = d.production;
  const cols: [keyof typeof p.columns, string][] = [["review", "Artwork review"], ["approved", "Approved"], ["production", "Printing"], ["ready", "Ready to ship"]];
  return (
    <div className="pc-cols" style={{ marginTop: 0 }}>
      <ProductionCard p={p} />
      <section className="pc-card" data-report-table="In the queue now">
        <div className="pc-card-head">
          <h2 className="pc-h2" style={{ margin: 0 }}>In the queue now</h2>
          <Link href="/admin/production" className="pc-inline">Open Production</Link>
        </div>
        <table className="pc-table">
          <tbody>
            {cols.map(([k, label]) => (
              <tr key={k}><td>{label}</td><td className="pc-num" style={{ fontWeight: 600 }}>{p.columns[k]}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
