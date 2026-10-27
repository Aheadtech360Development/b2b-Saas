"use client";

/**
 * Home's Sales, at the top of the page: total sales, orders, average order,
 * sessions and conversion rate for the days chosen, custom days included.
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

type Range = "today" | "7d" | "30d" | "all" | "custom";

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
}

const RANGES: [Exclude<Range, "custom">, string][] = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All time"]];
const RANGE_WORDS: Record<Exclude<Range, "custom">, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (n: number) => Number(n || 0).toLocaleString();
const shortDay = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const percent = (n: number) => `${Number(n.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

export function HomeSales() {
  const [range, setRange] = useState<Range>("all");
  const [dates, setDates] = useState({ from: "", to: "" });
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [picking, setPicking] = useState(false);
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
      const p = new URLSearchParams({ range, utc_offset: String(await reportOffsetMinutes()) });
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
        <div className="pc-kpis" aria-busy={!fresh} data-shown={fresh ? key : undefined} style={{ opacity: fresh || !shown ? 1 : 0.6, transition: "opacity .15s" }}>
          <div className="pc-kpi" data-kpi="total">
            <div className="pc-stat-l">Total sales</div>
            <div className="pc-kpi-v">{shown ? money(shown.total) : "–"}</div>
          </div>
          <div className="pc-kpi" data-kpi="orders">
            <div className="pc-stat-l">Orders</div>
            <div className="pc-kpi-v">{shown ? count(shown.orders) : "–"}</div>
          </div>
          <div className="pc-kpi" data-kpi="average">
            <div className="pc-stat-l">Average order</div>
            <div className="pc-kpi-v">{shown ? money(shown.average) : "–"}</div>
          </div>
          <div className="pc-kpi" data-kpi="sessions">
            <div className="pc-stat-l">Sessions</div>
            <div className="pc-kpi-v">{shown && shown.sessions != null ? count(shown.sessions) : "–"}</div>
            {sinceNote && <div className="pc-kpi-note">{sinceNote}</div>}
          </div>
          <div className="pc-kpi" data-kpi="conversion">
            <div className="pc-stat-l">Conversion rate</div>
            <div className="pc-kpi-v">{shown && shown.conversion_rate != null ? percent(shown.conversion_rate) : "–"}</div>
            {shown && shown.sessions ? (
              <div className="pc-kpi-note">{count(shown.converted_sessions ?? 0)} of {count(shown.sessions)} sessions placed an order</div>
            ) : null}
          </div>
        </div>
      )}

      <div style={{ marginTop: "14px" }}><Link href="/admin/reports" className="pc-link">Open Reports</Link></div>
    </section>
  );
}
