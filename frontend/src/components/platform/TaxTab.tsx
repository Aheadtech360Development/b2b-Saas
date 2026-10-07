"use client";

/**
 * Taxes — what each brand has charged its customers in sales tax.
 *
 * There was no way to see this above a single brand: the manager had to open
 * each shop and add its orders up. Here every brand is one row for the dates
 * chosen — orders, sales, tax charged, tax given back with refunds, and what
 * is left — and a row opens to the same figures month by month and by tax
 * region, which is how tax is filed.
 *
 * "Paid orders" is the tax a brand is holding; "All orders" adds invoices not
 * paid yet.
 *
 * Dates are order dates in a time zone the viewer chooses. A brand has no time
 * zone of its own on record, and the person reading this may be half a world
 * from the shops — read in their own zone, a month would begin and end ten
 * hours away from the month the shop files for. So it starts on US Central
 * unless the viewer is in the Americas, says which zone it is using, and
 * remembers the choice.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { platformTaxService, type BrandTax, type TaxBasis, type TaxFigures, type TaxReport } from "@/services/platformTax.service";

const PANEL: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: "12px" };
const TH: React.CSSProperties = { padding: "11px 16px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "12px 16px", fontSize: "13px", color: "#3F3F46", textAlign: "right", whiteSpace: "nowrap" };
const FIELD: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #E4E4E7", color: "#18181B", padding: "8px 10px", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" };
const LABEL: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" };

type Preset = "all" | "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_year" | "last_year" | "custom";
const PRESETS: [Preset, string][] = [
  ["all", "All time"], ["this_month", "This month"], ["last_month", "Last month"], ["this_quarter", "This quarter"],
  ["last_quarter", "Last quarter"], ["this_year", "This year"], ["last_year", "Last year"],
];

type SortKey = "name" | keyof TaxFigures;
const COLUMNS: [SortKey, string, string][] = [
  ["orders", "Orders", "Orders in these dates"],
  ["taxed_orders", "With tax", "Orders that carried any tax"],
  ["sales", "Sales", "Order subtotals, before shipping and tax"],
  ["tax", "Tax charged", "Sales tax charged on those orders"],
  ["tax_refunded", "Refunded", "Tax given back with refunds — in proportion when an order was partly refunded"],
  ["net_tax", "Net tax", "Tax charged, less tax refunded"],
];

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const ZONES: [string, string][] = [
  ["America/New_York", "US Eastern"], ["America/Chicago", "US Central"], ["America/Denver", "US Mountain"],
  ["America/Los_Angeles", "US Pacific"], ["UTC", "UTC"],
];
const ZONE_KEY = "pc_tax_zone";

function myZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}
/** The zone last chosen here; else the viewer's own when they are in the Americas; else US Central. */
function startingZone(): string {
  try {
    const kept = localStorage.getItem(ZONE_KEY);
    if (kept) return kept;
  } catch { /* storage blocked */ }
  const mine = myZone();
  return mine.startsWith("America/") || mine.startsWith("US/") ? mine : "America/Chicago";
}
/** Today's date where that zone is — it can be yesterday or tomorrow where the viewer sits. */
function todayIn(zone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const d = new Date(n("year"), n("month") - 1, n("day"));
    if (!Number.isNaN(d.getTime())) return d;
  } catch { /* a zone this browser does not know */ }
  return new Date();
}

/** The first and last day of a named range, on the calendar of the zone being used. */
function rangeFor(preset: Preset, zone: string): [string, string] {
  const now = todayIn(zone);
  const y = now.getFullYear(), m = now.getMonth(), q = Math.floor(m / 3) * 3;
  switch (preset) {
    case "this_month": return [day(new Date(y, m, 1)), day(now)];
    case "last_month": return [day(new Date(y, m - 1, 1)), day(new Date(y, m, 0))];
    case "this_quarter": return [day(new Date(y, q, 1)), day(now)];
    case "last_quarter": return [day(new Date(y, q - 3, 1)), day(new Date(y, q, 0))];
    case "this_year": return [day(new Date(y, 0, 1)), day(now)];
    case "last_year": return [day(new Date(y - 1, 0, 1)), day(new Date(y - 1, 11, 31))];
    default: return ["", ""];
  }
}

function money(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function monthName(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return y && m ? new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : key;
}
function sum(rows: TaxFigures[]): TaxFigures {
  const t: TaxFigures = { orders: 0, taxed_orders: 0, sales: 0, tax: 0, tax_refunded: 0, net_tax: 0 };
  for (const r of rows) for (const k of Object.keys(t) as (keyof TaxFigures)[]) t[k] += r[k];
  for (const k of ["sales", "tax", "tax_refunded", "net_tax"] as const) t[k] = Math.round(t[k] * 100) / 100;
  return t;
}

/** The six figures as table cells, the tax ones weighted. */
function Figures({ f, strong }: { f: TaxFigures; strong?: boolean }) {
  const w = strong ? 800 : 600;
  return (
    <>
      <td style={{ ...TD, fontWeight: strong ? 700 : 400 }}>{f.orders.toLocaleString()}</td>
      <td style={{ ...TD, fontWeight: strong ? 700 : 400 }}>{f.taxed_orders.toLocaleString()}</td>
      <td style={{ ...TD, fontWeight: strong ? 700 : 400 }}>{money(f.sales)}</td>
      <td style={{ ...TD, color: "#18181B", fontWeight: w }}>{money(f.tax)}</td>
      <td style={{ ...TD, color: f.tax_refunded > 0 ? "#B45309" : "#A1A1AA", fontWeight: strong ? 700 : 400 }}>{f.tax_refunded > 0 ? "−" + money(f.tax_refunded) : money(0)}</td>
      <td style={{ ...TD, color: f.net_tax > 0 ? "#047857" : "#71717A", fontWeight: w }}>{money(f.net_tax)}</td>
    </>
  );
}

function Breakdown({ title, empty, rows }: { title: string; empty: string; rows: { label: string; f: TaxFigures }[] }) {
  return (
    <div style={{ flex: "1 1 420px", minWidth: 0, border: "1px solid #E4E4E7", borderRadius: "10px", background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#18181B", borderBottom: "1px solid #E4E4E7" }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ padding: "16px 14px", fontSize: "12.5px", color: "#71717A" }}>{empty}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#FAFAFA" }}>
              <th style={{ ...TH, textAlign: "left", padding: "8px 14px" }}>{title.startsWith("By month") ? "Month" : "Region"}</th>
              {["Orders", "Tax charged", "Refunded", "Net tax"].map((h) => <th key={h} style={{ ...TH, padding: "8px 14px" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} style={{ borderTop: "1px solid #F4F4F5" }}>
                  <td style={{ ...TD, textAlign: "left", padding: "8px 14px", color: "#18181B", fontWeight: 600 }}>{r.label}</td>
                  <td style={{ ...TD, padding: "8px 14px" }}>{r.f.orders.toLocaleString()}</td>
                  <td style={{ ...TD, padding: "8px 14px" }}>{money(r.f.tax)}</td>
                  <td style={{ ...TD, padding: "8px 14px", color: r.f.tax_refunded > 0 ? "#B45309" : "#A1A1AA" }}>{r.f.tax_refunded > 0 ? "−" + money(r.f.tax_refunded) : money(0)}</td>
                  <td style={{ ...TD, padding: "8px 14px", color: r.f.net_tax > 0 ? "#047857" : "#71717A", fontWeight: 700 }}>{money(r.f.net_tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TaxTab() {
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [basis, setBasis] = useState<TaxBasis>("paid");
  const [zone, setZone] = useState(startingZone);
  const [query, setQuery] = useState("");
  const [onlyTaxed, setOnlyTaxed] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "net_tax", desc: true });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [data, setData] = useState<TaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const asked = useRef(0);

  useEffect(() => {
    // The newest request wins: a slow answer for dates already changed is dropped.
    const mine = ++asked.current;
    setLoading(true);
    setFailed(false);
    platformTaxService.report({ from: from || undefined, to: to || undefined, basis, tz: zone })
      .then((r) => { if (mine === asked.current) setData(r); })
      .catch(() => { if (mine === asked.current) { setData(null); setFailed(true); } })
      .finally(() => { if (mine === asked.current) setLoading(false); });
  }, [from, to, basis, zone]);

  function choose(p: Preset) {
    const [a, b] = rangeFor(p, zone);
    setPreset(p); setFrom(a); setTo(b);
  }
  /** Another zone: "this month" is that zone's month, so a named range is worked out again. */
  function changeZone(next: string) {
    setZone(next);
    try { localStorage.setItem(ZONE_KEY, next); } catch { /* storage blocked */ }
    if (preset !== "custom" && preset !== "all") {
      const [a, b] = rangeFor(preset, next);
      setFrom(a); setTo(b);
    }
  }
  const mine = myZone();
  const zones: [string, string][] = ZONES.some(([z]) => z === mine) ? ZONES : [...ZONES, [mine, `My time zone (${mine})`]];
  const zoneName = (zones.find(([z]) => z === zone)?.[1] ?? zone).replace(/^My time zone \((.*)\)$/, "$1");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.brands ?? []).filter((b) =>
      (!q || b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q)) && (!onlyTaxed || b.tax > 0));
    const dir = sort.desc ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      return dir * (a[sort.key] - b[sort.key]) || a.name.localeCompare(b.name);
    });
  }, [data, query, onlyTaxed, sort]);
  const shown = useMemo(() => sum(rows), [rows]);

  function exportCsv() {
    if (!data) return;
    const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["Brand", "Address", "Status", "Orders", "Orders with tax", "Sales", "Tax charged", "Tax refunded", "Net tax"];
    const lines = [head.join(",")];
    for (const b of rows) lines.push([b.name, b.slug, b.status, b.orders, b.taxed_orders, b.sales.toFixed(2), b.tax.toFixed(2), b.tax_refunded.toFixed(2), b.net_tax.toFixed(2)].map(cell).join(","));
    lines.push(["Total", "", "", shown.orders, shown.taxed_orders, shown.sales.toFixed(2), shown.tax.toFixed(2), shown.tax_refunded.toFixed(2), shown.net_tax.toFixed(2)].map(cell).join(","));
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-tax-by-brand_${data.range.from ?? "start"}_to_${data.range.to ?? day(new Date())}_${data.basis}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const period = !from && !to ? "all time" : from && to ? (from === to ? from : `${from} to ${to}`) : from ? `from ${from}` : `up to ${to}`;
  const cards = [
    { label: "Net tax", value: money(shown.net_tax), color: "#047857", note: "Charged, less refunded" },
    { label: "Tax charged", value: money(shown.tax), color: "#18181B", note: `${shown.taxed_orders.toLocaleString()} of ${shown.orders.toLocaleString()} orders carried tax` },
    { label: "Tax refunded", value: money(shown.tax_refunded), color: shown.tax_refunded > 0 ? "#B45309" : "#52525B", note: "Given back with refunds" },
    { label: "Sales", value: money(shown.sales), color: "#52525B", note: `${rows.filter((b) => b.tax > 0).length} of ${rows.length} brands charged tax` },
  ];

  return (
    <div>
      {/* Dates, which orders, which brands */}
      <div style={{ ...PANEL, padding: "16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }} role="group" aria-label="Dates">
          {PRESETS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => choose(key)} aria-pressed={preset === key}
              style={{ padding: "7px 12px", borderRadius: "999px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer",
                border: "1px solid " + (preset === key ? "#18181B" : "#E4E4E7"), background: preset === key ? "#18181B" : "#fff", color: preset === key ? "#fff" : "#3F3F46" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={LABEL} htmlFor="tax-from">From</label>
            <input id="tax-from" type="date" value={from} max={to || undefined} style={FIELD}
              onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} />
          </div>
          <div>
            <label style={LABEL} htmlFor="tax-to">To</label>
            <input id="tax-to" type="date" value={to} min={from || undefined} style={FIELD}
              onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} />
          </div>
          <div>
            <label style={LABEL} htmlFor="tax-basis">Orders counted</label>
            <select id="tax-basis" value={basis} onChange={(e) => setBasis(e.target.value as TaxBasis)} style={FIELD}>
              <option value="paid">Paid orders</option>
              <option value="all">All orders, unpaid included</option>
            </select>
          </div>
          <div>
            <label style={LABEL} htmlFor="tax-zone">Dates in</label>
            <select id="tax-zone" value={zone} onChange={(e) => changeZone(e.target.value)} style={FIELD}
              title="Which time zone a day begins and ends in. Use the zone the brands file their tax in.">
              {!zones.some(([z]) => z === zone) && <option value={zone}>{zone}</option>}
              {zones.map(([z, label]) => <option key={z} value={z}>{label}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 200px", minWidth: "160px" }}>
            <label style={LABEL} htmlFor="tax-brand">Brand</label>
            <input id="tax-brand" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a brand…" style={{ ...FIELD, width: "100%" }} />
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13px", color: "#3F3F46", padding: "8px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyTaxed} onChange={(e) => setOnlyTaxed(e.target.checked)} />
            Only brands that charged tax
          </label>
          <button type="button" onClick={exportCsv} disabled={!data || rows.length === 0}
            style={{ padding: "9px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, border: "1px solid #E4E4E7", background: "#fff", color: "#18181B",
              cursor: !data || rows.length === 0 ? "not-allowed" : "pointer", opacity: !data || rows.length === 0 ? 0.5 : 1 }}>
            Export CSV
          </button>
        </div>
      </div>

      {failed ? (
        <div style={{ ...PANEL, padding: "28px", textAlign: "center", color: "#B42318", fontSize: "13px" }}>
          The tax figures could not be loaded. Change a date to try again.
        </div>
      ) : !data ? (
        <div style={{ ...PANEL, padding: "40px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>Adding up the tax…</div>
      ) : (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }} aria-busy={loading}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "16px" }}>
            {cards.map((c) => (
              <div key={c.label} style={{ ...PANEL, padding: "16px 18px" }}>
                <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "8px" }}>{c.label}</div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontSize: "11.5px", color: "#A1A1AA", marginTop: "8px" }}>{c.note}</div>
              </div>
            ))}
          </div>

          <div style={{ ...PANEL, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #E4E4E7", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#18181B" }}>Sales tax by brand</span>
              <span style={{ fontSize: "12px", color: "#71717A" }}>
                {data.basis === "paid" ? "Paid orders" : "All orders"} · {period} · click a brand for its months and regions
              </span>
            </div>
            {rows.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>
                {data.brands.length === 0 ? "There are no brands yet." : "No brand matches that."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "860px" }}>
                  <thead><tr style={{ background: "#FAFAFA" }}>
                    <th style={{ ...TH, textAlign: "left" }} aria-sort={sort.key === "name" ? (sort.desc ? "descending" : "ascending") : undefined}>
                      <button type="button" onClick={() => setSort((s) => ({ key: "name", desc: s.key === "name" ? !s.desc : false }))}
                        style={{ all: "unset", cursor: "pointer" }}>Brand{sort.key === "name" ? (sort.desc ? " ↓" : " ↑") : ""}</button>
                    </th>
                    {COLUMNS.map(([key, label, help]) => (
                      <th key={key} style={TH} title={help} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
                        <button type="button" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
                          style={{ all: "unset", cursor: "pointer" }}>{label}{sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}</button>
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {rows.map((b: BrandTax) => {
                      const isOpen = open.has(b.id);
                      return (
                        <Fragment key={b.id}>
                          <tr onClick={() => setOpen((cur) => { const next = new Set(cur); if (next.has(b.id)) next.delete(b.id); else next.add(b.id); return next; })}
                            style={{ borderTop: "1px solid #F4F4F5", cursor: "pointer", background: isOpen ? "#FAFAFA" : "transparent" }}>
                            <td style={{ ...TD, textAlign: "left", whiteSpace: "normal" }}>
                              <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} the months and regions for ${b.name}`}
                                style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                                <span aria-hidden="true" style={{ display: "inline-block", width: "10px", color: "#A1A1AA", fontSize: "10px", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
                                <span>
                                  <span style={{ color: "#18181B", fontWeight: 700 }}>{b.name}</span>
                                  {b.status !== "active" && (
                                    <span style={{ marginLeft: "8px", fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#B45309", background: "#FFFBEB", borderRadius: "5px", padding: "2px 6px" }}>{b.status}</span>
                                  )}
                                  <span style={{ display: "block", fontSize: "11.5px", color: "#A1A1AA", marginTop: "2px" }}>{b.slug}</span>
                                </span>
                              </button>
                            </td>
                            <Figures f={b} />
                          </tr>
                          {isOpen && (
                            <tr style={{ background: "#FAFAFA" }}>
                              <td colSpan={7} style={{ padding: "4px 16px 16px 34px" }}>
                                {b.orders === 0 ? (
                                  <div style={{ fontSize: "12.5px", color: "#71717A", padding: "8px 0" }}>No orders from {b.name} in these dates.</div>
                                ) : (
                                  <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                                    <Breakdown title="By month" empty="No orders in these dates."
                                      rows={b.months.map((m) => ({ label: monthName(m.month), f: m }))} />
                                    <Breakdown title="By tax region" empty="None of these orders carried tax or a tax region."
                                      rows={b.regions.map((r) => ({ label: r.region || "No region recorded", f: r }))} />
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #E4E4E7", background: "#FAFAFA" }}>
                      <td style={{ ...TD, textAlign: "left", color: "#18181B", fontWeight: 800 }}>
                        Total{rows.length !== data.brands.length ? ` — ${rows.length} of ${data.brands.length} brands` : ` — ${rows.length} brand${rows.length === 1 ? "" : "s"}`}
                      </td>
                      <Figures f={shown} strong />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <p style={{ fontSize: "12px", color: "#71717A", lineHeight: 1.6, margin: "12px 2px 0" }}>
            Tax charged is the sales tax on each order. Refunded is the tax given back with refunds — all of it for an order refunded in full,
            and in proportion for one refunded in part. Dates are order dates in {zoneName} time{data.range.tz !== zone ? ` (read as ${data.range.tz})` : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
