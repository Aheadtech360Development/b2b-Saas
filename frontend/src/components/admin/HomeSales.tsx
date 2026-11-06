"use client";

/**
 * Home's Sales, at the top of the page, as Shopify's Home shows it: a tab for
 * each number (sessions, total sales, orders, conversion rate, average order)
 * with its change against the same number of days just before, and the chosen
 * one over time below, the days before as a dashed line beside it.
 *
 * Money is counted as Reports counts it (services/report_view). Sessions are
 * the shop's visits, which the storefront reports from the day it began
 * counting (services/visits); conversion rate is the visits that placed an
 * order out of all of them, as Shopify counts it: 100 visits, 5 ordered, 5%.
 * Days are the shop's own when it has set a time zone, else the viewer's.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { reportOffsetMinutes } from "@/lib/shopClock";
import { SalesChart, Sparkline } from "./SalesChart";

type Range = "today" | "7d" | "30d" | "90d" | "all" | "custom";
type Metric = "sessions" | "total" | "orders" | "conversion_rate" | "average";
type Unit = "hour" | "day" | "week" | "month";

interface Step {
  start: string;
  total: number;
  orders: number;
  average: number;
  sessions: number | null;
  converted: number | null;
  conversion_rate: number | null;
}

interface Sales {
  range: Range;
  from: string | null;
  to: string;
  total: number;
  orders: number;
  average: number;
  sessions: number | null;
  converted_sessions: number | null;
  conversion_rate: number | null;
  counted_since: string | null;
  granularity?: Unit | null;
  series?: Step[] | null;
  previous?: { from: string; to: string; series: Step[] } | null;
  changes?: Partial<Record<Metric, number | null>> | null;
}

const RANGES: [Exclude<Range, "custom">, string][] = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["all", "All time"]];
const RANGE_WORDS: Record<Exclude<Range, "custom">, string> = {
  today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time",
};
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const money = (n: number) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (n: number) => Number(n || 0).toLocaleString("en-US");
const percent = (n: number) => `${Number(n.toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const compact = (n: number) => n >= 1_000_000 ? `${Number((n / 1_000_000).toFixed(1))}M` : n >= 10_000 ? `${Number((n / 1000).toFixed(1))}K` : count(n);
const shortDay = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Each number: its tab, what its chart is called, how it is counted, how it reads. */
const METRICS: { key: Metric; label: string; title: string; about: string; show: (v: number) => string; axis: (v: number) => string }[] = [
  { key: "sessions", label: "Sessions", title: "Sessions over time",
    about: "Visits to your online store. A new visit starts after 30 minutes away.", show: count, axis: compact },
  { key: "total", label: "Total sales", title: "Total sales over time",
    about: "What customers spent on orders placed: order totals with shipping and tax. Cancelled and refunded orders are left out.",
    show: money, axis: (v) => `$${compact(v)}` },
  { key: "orders", label: "Orders", title: "Orders over time",
    about: "Orders placed. Cancelled and refunded orders are left out.", show: count, axis: compact },
  { key: "conversion_rate", label: "Conversion rate", title: "Conversion rate over time",
    about: "Share of online store visits that placed an order.", show: percent, axis: (v) => `${Number(v.toFixed(1))}%` },
  { key: "average", label: "Average order", title: "Average order over time",
    about: "Total sales divided by orders.", show: money, axis: (v) => `$${compact(v)}` },
];

/** The value of a number in one step; null where there is none to show. */
function valueOf(step: Step, m: Metric): number | null {
  if (m === "average") return step.orders ? step.average : null;
  return step[m];
}

/** The number for the whole days chosen. */
function totalOf(s: Sales, m: Metric): number | null {
  return m === "sessions" ? s.sessions : m === "conversion_rate" ? s.conversion_rate : s[m];
}

const dateOf = (start: string) => new Date(start.length > 10 ? `${start}:00` : `${start}T00:00:00`);
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", o);

/** The words under a step on the chart's date line. */
function tickWord(start: string, unit: Unit): string {
  const d = dateOf(start);
  if (unit === "hour") return d.toLocaleTimeString("en-US", { hour: "numeric" });
  if (unit === "month") return fmt(d, { month: "short", year: "numeric" });
  return fmt(d, { month: "short", day: "numeric" });
}

/** What a step is called in the chart's box and the table. */
function stepName(steps: Step[], i: number, unit: Unit, lastDay: string): string {
  const d = dateOf(steps[i]!.start);
  if (unit === "hour") return `${fmt(d, { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  if (unit === "day") return fmt(d, { month: "short", day: "numeric", year: "numeric" });
  if (unit === "month") return fmt(d, { month: "long", year: "numeric" });
  const next = steps[i + 1] ? dateOf(steps[i + 1]!.start) : dateOf(lastDay);
  if (steps[i + 1]) next.setDate(next.getDate() - 1);
  return `${fmt(d, { month: "short", day: "numeric" })} – ${fmt(next, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** "Sep 7 – Nov 6, 2026", or one day. */
function spanWords(first: string, last: string): string {
  const a = dateOf(first), b = dateOf(last);
  if (first.slice(0, 10) === last.slice(0, 10)) return fmt(a, { month: "short", day: "numeric", year: "numeric" });
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${fmt(a, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })} – ${fmt(b, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** The date each step would be written under the chart (the chart picks as many as fit). */
function tickLabels(steps: Step[], unit: Unit): string[] {
  return steps.map((s) => tickWord(s.start, unit));
}

function Change({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0, flat = pct === 0;
  return (
    <span className="pc-change" data-dir={flat ? "flat" : up ? "up" : "down"}>
      <span aria-hidden="true">{flat ? "" : up ? "↑" : "↓"}</span>
      {`${Math.abs(pct).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`}
      <span className="pc-sr">{flat ? " no change" : up ? " up" : " down"} on the days before</span>
    </span>
  );
}

export function HomeSales() {
  const [range, setRange] = useState<Range>("30d");
  const [dates, setDates] = useState({ from: "", to: "" });
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [picking, setPicking] = useState(false);
  const [metric, setMetric] = useState<Metric>("total");
  const [table, setTable] = useState(false);
  const [offset, setOffset] = useState(0);
  // The last answer and the days it was for: while new days load, the old
  // numbers stay, dimmed, rather than the card emptying.
  const [result, setResult] = useState<{ key: string; sales: Sales } | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(0);
  const key = range === "custom" ? `custom|${dates.from}|${dates.to}` : range;

  useEffect(() => {
    if (range === "custom" && !(ISO_DAY.test(dates.from) && ISO_DAY.test(dates.to))) return;
    const mine = ++asked.current;
    setFailed(false);
    (async () => {
      const off = await reportOffsetMinutes();
      setOffset(off);
      const p = new URLSearchParams({ range, utc_offset: String(off) });
      if (range === "custom") { p.set("date_from", dates.from); p.set("date_to", dates.to); }
      return apiClient.get<Sales>(`/api/v1/admin/home/sales?${p}`);
    })()
      .then((d) => { if (mine === asked.current) setResult({ key, sales: d }); })
      .catch(() => { if (mine === asked.current) setFailed(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const shown = result?.sales ?? null;
  const fresh = result?.key === key;
  const period = range === "custom" ? (dates.from && dates.to ? `${shortDay(dates.from)} to ${shortDay(dates.to)}` : "Custom") : RANGE_WORDS[range];
  // Visits were not counted before the storefront began reporting them: say
  // so when the days chosen reach back past that.
  const since = shown?.counted_since?.slice(0, 10) ?? null;
  const sinceNote = !shown || shown.sessions == null ? null
    : !since ? "Counted from today on"
    : !shown.from || shown.from < since ? `Counted since ${shortDay(since)}` : null;

  const unit = shown?.granularity ?? "day";
  const steps = shown?.series ?? null;
  const before = shown?.previous ?? null;
  // Today's hours still to come are not zeros: they are not drawn yet.
  const nowLocal = new Date(Date.now() + offset * 60_000).toISOString().slice(0, 16);
  const line = (m: Metric) => (steps ?? []).map((s) => (unit === "hour" && s.start > nowLocal ? null : valueOf(s, m)));
  const def = METRICS.find((m) => m.key === metric)!;
  const lastDay = shown?.to ?? "";

  return (
    <section className="pc-card pc-home-sales" aria-labelledby="sales-title" data-home-sales>
      <div className="pc-home-sales-head">
        <div>
          <h2 className="pc-h2" id="sales-title">Sales</h2>
          <div className="pc-stat-l" style={{ marginTop: "2px" }} data-period>{period}</div>
        </div>
        <div className="pc-seg" role="group" aria-label="Period">
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={range === k} onClick={() => { setRange(k); setPicking(false); }}>{label}</button>
          ))}
          <button type="button" aria-pressed={range === "custom"} aria-expanded={picking}
            onClick={() => { setDraft(dates); setPicking((v) => !v); }} data-custom>Custom</button>
        </div>
      </div>

      {picking && (
        <form className="pc-home-dates" data-custom-dates
          onSubmit={(e) => { e.preventDefault(); if (draft.from && draft.to) { setDates(draft); setRange("custom"); setPicking(false); } }}>
          <div>
            <label className="pc-label" htmlFor="home-from">From</label>
            <input id="home-from" type="date" className="pc-input" value={draft.from} max={draft.to || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </div>
          <div>
            <label className="pc-label" htmlFor="home-to">To</label>
            <input id="home-to" type="date" className="pc-input" value={draft.to} min={draft.from || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </div>
          <button type="submit" className="pc-btn" data-kind="primary" disabled={!draft.from || !draft.to}>Apply</button>
          <button type="button" className="pc-btn" onClick={() => setPicking(false)}>Cancel</button>
        </form>
      )}

      {failed ? (
        <p className="pc-sub-line" style={{ margin: "16px 0 0" }}>Sales could not be loaded. Reload to try again.</p>
      ) : (
        <div aria-busy={!fresh} data-shown={fresh ? key : undefined} style={{ opacity: fresh || !shown ? 1 : 0.6, transition: "opacity .15s" }}>
          <div className="pc-kpis" role="tablist" aria-label="Numbers">
            {METRICS.map((m) => {
              const total = shown ? totalOf(shown, m.key) : null;
              const on = metric === m.key;
              return (
                <button key={m.key} type="button" role="tab" aria-selected={on} className="pc-kpi" data-kpi={m.key === "conversion_rate" ? "conversion" : m.key}
                  onClick={() => setMetric(m.key)}>
                  <span className="pc-stat-l">{m.label}</span>
                  <span className="pc-kpi-row">
                    <span className="pc-kpi-v">{total !== null && total !== undefined ? m.show(total) : "–"}</span>
                    {steps && <Sparkline values={line(m.key)} on={on} />}
                  </span>
                  <Change pct={shown?.changes?.[m.key]} />
                  {m.key === "sessions" && sinceNote && <span className="pc-kpi-note">{sinceNote}</span>}
                  {m.key === "conversion_rate" && shown && shown.sessions ? (
                    <span className="pc-kpi-note">{count(shown.converted_sessions ?? 0)} of {count(shown.sessions)} sessions placed an order</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {shown && steps && (
            <div className="pc-sales-chart" role="tabpanel" data-metric={metric}>
              <div className="pc-sales-chart-head">
                <div>
                  <div className="pc-sales-hero">
                    <span>{totalOf(shown, metric) != null ? def.show(totalOf(shown, metric)!) : "–"}</span>
                    <Change pct={shown.changes?.[metric]} />
                  </div>
                  <div className="pc-sales-title">{def.title}</div>
                  <div className="pc-sub-line">{def.about}</div>
                </div>
                <button type="button" className="pc-btn" aria-pressed={table} onClick={() => setTable((v) => !v)} data-table-toggle>
                  {table ? "Hide table" : "Show table"}
                </button>
              </div>
              <SalesChart
                title={`${def.title}, ${spanWords(steps[0]!.start, lastDay)}`}
                now={{ values: line(metric), names: steps.map((_, i) => stepName(steps, i, unit, lastDay)),
                       legend: spanWords(steps[0]!.start, lastDay) }}
                before={before ? { values: before.series.map((s) => valueOf(s, metric)),
                                   names: before.series.map((_, i) => stepName(before.series, i, unit, before.to)),
                                   legend: spanWords(before.from, before.to) } : null}
                labels={tickLabels(steps, unit)} format={def.show} axisFormat={def.axis} />
              {table && (
                <div className="pc-scroll-x" style={{ marginTop: 12 }}>
                  <table className="pc-table" data-sales-table>
                    <thead><tr><th>{unit === "hour" ? "Hour" : unit === "week" ? "Week" : unit === "month" ? "Month" : "Day"}</th><th>{def.label}</th>
                      {before && <><th>Days before</th><th>{def.label}</th></>}</tr></thead>
                    <tbody>
                      {steps.map((s, i) => {
                        const v = line(metric)[i];
                        const b = before?.series[i];
                        const bv = b ? valueOf(b, metric) : null;
                        return (
                          <tr key={s.start}>
                            <td>{stepName(steps, i, unit, lastDay)}</td>
                            <td style={{ fontVariantNumeric: "tabular-nums" }}>{v != null ? def.show(v) : "–"}</td>
                            {before && <><td>{b ? stepName(before.series, i, unit, before.to) : "–"}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{bv != null ? def.show(bv) : "–"}</td></>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "14px" }}><Link href="/admin/reports" className="pc-link">Open Reports</Link></div>
    </section>
  );
}
