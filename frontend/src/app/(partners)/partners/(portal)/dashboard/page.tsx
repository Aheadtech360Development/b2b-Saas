"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { usePartner } from "@/components/partners/PartnerShell";
import { ActivityChip, METHODS } from "@/components/partners/states";
import { Banner, Icon, Skeleton, copyText, errorText, useToast } from "@/components/partners/ui";
import { day, money, moneyShort, papi } from "@/lib/partnerApi";

type Dashboard = {
  balances: { pending: number; payable: number; clawbacks: number; on_hold: number; in_batch: number };
  paid_count: number; paid_cents: number; minimum_cents: number; hold_days: number;
  readiness: { state: string; words: string };
  active_shops: number; shops_total: number; shops_by_state: Record<string, number>;
  chart: { year: number; month: number; label: string; cents: number }[];
  recent: { at: string; words: string; state: string; chip: string }[];
  terms: { latest: number | null; published_at: string | null; needs_acceptance: boolean };
  cookie_days: number;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];


export default function DashboardPage() {
  const { partner } = usePartner();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    papi<Dashboard>("/partners/me/dashboard").then(setData).catch((e) => setError(errorText(e)));
  }, []);

  async function copyLink() {
    toast.show((await copyText(partner.link)) ? "Link copied" : "Could not copy. Select the link and copy it.");
  }

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!data) {
    return (
      <>
        <Skeleton h={34} w={220} />
        <div className="g4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={118} />)}</div>
        <Skeleton h={280} />
      </>
    );
  }

  const b = data.balances;
  const fresh = data.shops_total === 0 && data.paid_count === 0 && b.pending === 0 && b.payable === 0;
  const peak = Math.max(1, ...data.chart.map((m) => m.cents));
  const now = data.chart[data.chart.length - 1];
  const trial = data.shops_by_state.trial ?? 0;
  const pastDue = data.shops_by_state.past_due ?? 0;
  const shopNote = [trial ? `${trial} on trial` : "", pastDue ? `${pastDue} past due` : ""].filter(Boolean).join(", ");

  return (
    <>
      <div className="ph">
        <div>
          <h1>Dashboard</h1>
          <p>Your referrals and earnings at a glance.</p>
        </div>
        <button className="btn pri" onClick={copyLink}><Icon name="copy" />Copy my link</button>
      </div>

      {data.terms.needs_acceptance ? (
        <Banner tone="warn" icon="file" action={<Link className="btn sm" href="/partners/terms">Review terms</Link>}>
          The partner terms changed on {day(data.terms.published_at)}. Review and accept version {data.terms.latest} to
          keep earning on new referrals.
        </Banner>
      ) : null}

      <div className="g4">
        <div className="card tile dark">
          <span className="k"><Icon name="wallet" size="s" />Payable now</span>
          <span className="v">{money(b.payable)}</span>
          <span className="s">{b.clawbacks ? `Net of a ${money(-b.clawbacks)} clawback`
            : b.payable ? "Ready for the next batch" : "Nothing payable yet"}</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="clock" size="s" />Pending</span>
          <span className="v">{money(b.pending)}</span>
          <span className="s">Inside the {data.hold_days} day hold</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="checkc" size="s" />Paid to date</span>
          <span className="v">{money(data.paid_cents)}</span>
          <span className="s">{data.paid_count} payout{data.paid_count === 1 ? "" : "s"}</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="users" size="s" />Active shops</span>
          <span className="v">{data.active_shops}</span>
          <span className="s">{shopNote || (data.shops_total ? `${data.shops_total} referred` : "None yet")}</span>
        </div>
      </div>

      {fresh ? (
        <div className="g3">
          <div className="card pad col" style={{ gap: 10 }}>
            <span className="eyebrow">Step 1</span>
            <h3>Copy your link</h3>
            <p className="muted">Your link and code are ready.</p>
            <div><button className="btn pri sm" onClick={copyLink}><Icon name="copy" size="s" />Copy my link</button></div>
          </div>
          <div className="card pad col" style={{ gap: 10 }}>
            <span className="eyebrow">Step 2</span>
            <h3>Share it with a shop owner</h3>
            <p className="muted">Use a ready caption, a banner or the QR code.</p>
            <div><Link className="btn sm" href="/partners/link">Open captions</Link></div>
          </div>
          <div className="card pad col" style={{ gap: 10 }}>
            <span className="eyebrow">Step 3</span>
            <h3>Get your first referral</h3>
            <p className="muted">It shows up here the moment a shop signs up.</p>
          </div>
        </div>
      ) : (
        <div className="split">
          <section className="card">
            <div className="card-h">
              <h2>Commission earned, last 6 months</h2>
              <span className="sm muted">{MONTHS[(now?.month ?? 1) - 1]} so far <b className="ink">{money(now?.cents)}</b></span>
            </div>
            <div className="pad">
              <div className="bars" role="img" aria-label="Commission earned in each of the last six months">
                {data.chart.map((m, i) => (
                  <div className="c" key={`${m.year}-${m.month}`}>
                    <span className="v">{m.cents ? moneyShort(m.cents) : ""}</span>
                    <div className={`bar${i === data.chart.length - 1 ? " cur" : ""}`}
                         style={{ height: `${Math.max(2, (m.cents / peak) * 100)}%` }} />
                    <span className="m">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-h">
              <h2>Recent activity</h2>
              <Link className="btn gh sm" href="/partners/earnings">See earnings</Link>
            </div>
            {data.recent.length ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {data.recent.map((r, i) => (
                  <li key={i} className="row nw" style={{ padding: "12px 24px", borderBottom: "1px solid var(--line)", gap: 12 }}>
                    <span className="sm ink" style={{ flex: 1 }}>{r.words}</span>
                    <ActivityChip state={r.state} label={r.chip} />
                  </li>
                ))}
              </ul>
            ) : <p className="pad muted">Nothing yet.</p>}
          </section>
        </div>
      )}

      <div className="g2">
        <section className="card">
          <div className="card-h"><h2>Your referral link</h2></div>
          <div className="pad col">
            <div className="field">
              <label htmlFor="ref-link">Link</label>
              <div className="row nw">
                <input id="ref-link" className="input mono" readOnly value={partner.link} />
                <button className="btn ico" aria-label="Copy link" onClick={copyLink}><Icon name="copy" /></button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ref-code">Code</label>
              <div className="row nw">
                <input id="ref-code" className="input mono" readOnly value={partner.code} />
                <button className="btn ico" aria-label="Copy code"
                        onClick={async () => toast.show((await copyText(partner.code)) ? "Code copied" : "Could not copy")}>
                  <Icon name="copy" />
                </button>
              </div>
            </div>
            <p className="sm muted">
              Shops that click your link are saved to you for {data.cookie_days} days. They can also type your code at signup.
            </p>
            <Link className="btn gh sm" href="/partners/link" style={{ alignSelf: "flex-start" }}>
              Captions, banners and QR code<Icon name="cr" size="s" />
            </Link>
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Next payout</h2></div>
          <div className="pad col">
            <div className="tile" style={{ padding: 0 }}>
              <span className="k">Payable now</span>
              <span className="v">{money(b.payable)}</span>
            </div>
            <p className="sm">
              {data.readiness.state === "under_min"
                ? `Smaller balances roll over. You are paid in the first batch after you reach the ${moneyShort(data.minimum_cents)} minimum.`
                : data.readiness.state === "blocked"
                  ? "Add your W-9 to be paid. We cannot record a payout until it is on file."
                  : `You are above the ${moneyShort(data.minimum_cents)} minimum. Payouts are recorded by the PrintCoPilot team, and you get an email and a statement each time.`}
            </p>
            <div className="row" style={{ gap: 8 }}>
              {partner.has_w9
                ? <span className="chip ok"><Icon name="check" size="s" />W-9 on file</span>
                : <span className="chip warn"><Icon name="alert" size="s" />W-9 missing</span>}
              <span className="chip mut">{partner.payout_method ? METHODS[partner.payout_method] : "No payout method yet"}</span>
            </div>
            <Link className="btn gh sm" href="/partners/payouts" style={{ alignSelf: "flex-start" }}>
              Payouts and statements<Icon name="cr" size="s" />
            </Link>
          </div>
        </section>
      </div>
      {toast.node}
    </>
  );
}
