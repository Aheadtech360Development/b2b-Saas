"use client";

import { useEffect, useState } from "react";

import { LineChip } from "@/components/partners/states";
import { Banner, Count, Empty, Icon, Skeleton, errorText } from "@/components/partners/ui";
import { day, money, papi, partnerDownload } from "@/lib/partnerApi";

type Line = {
  id: string; kind: string; earned_at: string; shop_name: string; plan_name: string;
  base_cents: number; rate: string; amount_cents: number; state: string; detail: string;
};
type Earnings = {
  lines: Line[]; total: number; page: number; pages: number; counts: Record<string, number>;
  summary: {
    balances: { pending: number; payable: number; clawbacks: number };
    paid_count: number; paid_cents: number; hold_days: number;
  };
};

const FILTERS: [string, string][] = [["all", "All"], ["pending", "Pending"], ["payable", "Payable"],
  ["paid", "Paid"], ["clawback", "Clawback"], ["on_hold", "On hold"]];

export default function EarningsPage() {
  const [state, setState] = useState("all");
  const [months, setMonths] = useState(6);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams({ state, page: String(page), months: String(months) });
      if (q.trim()) params.set("q", q.trim());
      papi<Earnings>(`/partners/me/earnings?${params}`).then(setData).catch((e) => setError(errorText(e)));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [state, page, months, q]);

  const s = data?.summary;
  return (
    <>
      <div className="ph">
        <div>
          <h1>Earnings</h1>
          <p>Every commission line, with the rate it used.</p>
        </div>
        <button className="btn" onClick={() => partnerDownload("/partners/me/earnings.csv", "earnings.csv")}>
          <Icon name="download" />Export my earnings (CSV)
        </button>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <div className="g3">
        <div className="card tile">
          <span className="k"><Icon name="clock" size="s" />Pending</span>
          <span className="v">{s ? money(s.balances.pending) : "..."}</span>
          <span className="s">Becomes payable after the {s?.hold_days ?? 30} day hold</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="wallet" size="s" />Payable now</span>
          <span className="v">{s ? money(s.balances.payable) : "..."}</span>
          <span className="s">{s && s.balances.clawbacks ? `After the ${money(-s.balances.clawbacks)} clawback` : "In the next batch"}</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="checkc" size="s" />Paid to date</span>
          <span className="v">{s ? money(s.paid_cents) : "..."}</span>
          <span className="s">{s ? `${s.paid_count} payout${s.paid_count === 1 ? "" : "s"}` : ""}</span>
        </div>
      </div>

      <section className="card">
        <div className="filters">
          {FILTERS.map(([key, label]) => (
            <button key={key} className={`pill${state === key ? " on" : ""}`} aria-pressed={state === key}
                    onClick={() => { setState(key); setPage(1); }}>
              {label}{data ? <Count n={data.counts[key] ?? 0} tone="mut" /> : null}
            </button>
          ))}
          <div className="sp" />
          <select className="select" style={{ width: 160 }} aria-label="Period" value={months}
                  onChange={(e) => { setMonths(Number(e.target.value)); setPage(1); }}>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={0}>All time</option>
          </select>
          <div className="ig">
            <Icon name="search" />
            <input className="input" type="search" placeholder="Search earnings" aria-label="Search earnings"
                   value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        {!data ? (
          <div className="pad col">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={40} />)}</div>
        ) : data.lines.length === 0 ? (
          <div className="pad"><Empty icon="dollar" title="No lines here">
            Commission shows here when a shop you referred pays its plan.
          </Empty></div>
        ) : (
          <div className="tw">
            <table className="tbl stk">
              <thead>
                <tr>
                  <th>Date</th><th>Shop</th><th>Plan</th><th className="num">Base fee</th><th className="num">Rate</th>
                  <th className="num">Amount</th><th>Status</th><th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.id}>
                    <td data-l="Date">{day(l.earned_at)}</td>
                    <td className="ink" data-l="Shop">{l.shop_name}</td>
                    <td data-l="Plan">{l.plan_name}</td>
                    <td className="num" data-l="Base fee">{l.kind === "adjustment" ? "" : money(l.base_cents)}</td>
                    <td className="num" data-l="Rate">{l.rate}</td>
                    <td className={`num b${l.amount_cents < 0 ? " neg" : ""}`} data-l="Amount">{money(l.amount_cents)}</td>
                    <td data-l="Status"><LineChip state={l.state} /></td>
                    <td className="muted" data-l="Detail">{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="tfoot">
          <span>{data ? `${data.total} line${data.total === 1 ? "" : "s"}` : ""}. Base fee only. Gang Sheet Builder and add-ons never count.</span>
          {data && data.pages > 1 ? (
            <div className="pager">
              <button className="btn sm ico" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="cl" /></button>
              <button className="btn sm ico" aria-label="Next page" disabled={page >= data.pages} onClick={() => setPage(page + 1)}><Icon name="cr" /></button>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
