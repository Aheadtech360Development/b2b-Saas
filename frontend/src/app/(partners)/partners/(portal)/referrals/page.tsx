"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { usePartner, type Partner } from "@/components/partners/PartnerShell";
import { ShopChip } from "@/components/partners/states";
import { Banner, Chip, Count, Drawer, Empty, Icon, Skeleton, errorText } from "@/components/partners/ui";
import { day, money, papi } from "@/lib/partnerApi";

type Shop = {
  id: string; shop_name: string; plan: string | null; plan_name: string; state: string; trial_ended: boolean;
  signed_up: string; monthly_cents: number | null; in_review: boolean;
  /** When the shop stops earning for you; null while it earns for as long as it pays. */
  earn_until: string | null;
};
type Detail = Shop & {
  source: string; campaign: string | null; earned_cents: number;
  timeline: { at: string; kind: string; words: string; amount_cents?: number }[];
};

const FILTERS: [string, string][] = [["all", "All"], ["active", "Active"], ["trial", "Trial"],
  ["past_due", "Past due"], ["canceled", "Canceled"]];

export default function ReferralsPage() {
  // The program's return window, from GET /partners/me.
  const back = (usePartner().partner as Partner & { return_window_days?: number }).return_window_days;
  const [state, setState] = useState("all");
  const [data, setData] = useState<{ rows: Shop[]; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);

  useEffect(() => {
    papi<{ rows: Shop[]; counts: Record<string, number> }>(`/partners/me/referrals?state=${state}`)
      .then(setData).catch((e) => setError(errorText(e)));
  }, [state]);

  async function show(id: string) {
    try {
      setOpen(await papi<Detail>(`/partners/me/referrals/${id}`));
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Referrals</h1>
          <p>Every shop you brought in. You see business name and plan only.</p>
        </div>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <section className="card">
        <div className="filters" role="tablist" aria-label="Filter shops">
          {FILTERS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={state === key} className={`pill${state === key ? " on" : ""}`}
                    onClick={() => setState(key)}>
              {label}{data ? <Count n={data.counts[key] ?? 0} tone="mut" /> : null}
            </button>
          ))}
        </div>
        {!data ? (
          <div className="pad col">{[0, 1, 2].map((i) => <Skeleton key={i} h={40} />)}</div>
        ) : data.rows.length === 0 ? (
          <div className="pad">
            <Empty icon="users" title={state === "all" ? "No referred shops yet" : "No shops here"}
                   action={state === "all" ? <Link className="btn pri" href="/partners/link">Get my link</Link> : undefined}>
              {state === "all" ? "Shops that sign up through your link or code are listed here." : "Try another filter."}
            </Empty>
          </div>
        ) : (
          <div className="tw">
            <table className="tbl stk">
              <thead>
                <tr><th>Business</th><th>Plan</th><th>Status</th><th>Signed up</th><th className="num">Monthly commission</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} onClick={() => show(r.id)} style={{ cursor: "pointer" }}>
                    <td className="ink" data-l="Business">
                      <button className="btn gh sm" style={{ padding: 0, minHeight: 0 }} onClick={(e) => { e.stopPropagation(); void show(r.id); }}>
                        {r.shop_name}
                      </button>
                      {r.in_review ? <> <Chip tone="mut">Held for review</Chip></> : null}
                    </td>
                    <td data-l="Plan">{r.plan_name}</td>
                    <td data-l="Status"><ShopChip state={r.state} trialEnded={r.trial_ended} /></td>
                    <td data-l="Signed up">{day(r.signed_up)}</td>
                    <td className="num" data-l="Monthly commission">
                      {r.monthly_cents !== null ? money(r.monthly_cents)
                        : r.state === "trial" ? <span className="muted">Starts at first paid invoice</span>
                          : <span className="muted">None</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="tfoot">
          {typeof back === "number" ? <span>If a canceled shop returns within {back} day{back === 1 ? "" : "s"}, it stays yours.</span> : null}
        </div>
      </section>

      {open ? (
        <Drawer title={open.shop_name} onClose={() => setOpen(null)}
                chips={<><Chip>{open.plan_name}</Chip><ShopChip state={open.state} trialEnded={open.trial_ended} /></>}>
          <dl className="kv">
            <dt>Source</dt><dd>{open.source}{open.campaign ? `, tag ${open.campaign}` : ""}</dd>
            <dt>Signed up</dt><dd>{day(open.signed_up, true)}</dd>
            {open.earn_until ? <><dt>Earns until</dt><dd>{day(open.earn_until, true)}</dd></> : null}
            <dt>Commission so far</dt><dd className="b">{money(open.earned_cents)}</dd>
          </dl>
          <div className="col" style={{ gap: 10 }}>
            <h3>Timeline</h3>
            <ul className="tl">
              {open.timeline.map((t, i) => (
                <li key={i} className={t.kind === "paid" ? "ok" : t.kind === "payment_failed" || t.kind === "clawback" ? "bad" : ""}>
                  {t.words}{typeof t.amount_cents === "number" ? `: ${money(t.amount_cents)}` : ""}
                  <small>{day(t.at, true)}</small>
                </li>
              ))}
            </ul>
          </div>
          <Banner icon="shield">
            You see the business name and plan only. The owner&apos;s details stay private.
          </Banner>
        </Drawer>
      ) : null}
    </>
  );
}
