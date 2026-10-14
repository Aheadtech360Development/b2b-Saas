"use client";

import { useEffect, useState } from "react";

import { Banner, Icon, Skeleton, Switch, errorText, useToast } from "@/components/partners/ui";
import { initials, money } from "@/lib/partnerApi";
import { aff } from "./api";
import type { Go } from "./AffiliatesTab";

type OverviewData = {
  applications: { open: number; old: number };
  affiliates: { active: number; paused: number; suspended: number; terminated: number };
  active_shops: number; pending_cents: number; payable_cents: number; on_hold_cents: number;
  paid_month_cents: number; paid_month_count: number;
  attention: { kind: string; title: string; detail: string; action: string }[];
  top: { id: string; name: string; rate: string; shops: number; earned_cents: number }[];
  month: string;
  switches: Record<"accepting_applications" | "accepting_referrals" | "earning" | "auto_approve", boolean>;
  stripe: { last_received: string | null; processed_24h: number; replays_24h: number; failed: number };
};

export function ago(value: string | null): string {
  if (!value) return "Never";
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

const SWITCHES: { key: keyof OverviewData["switches"]; label: string; note?: string }[] = [
  { key: "accepting_applications", label: "Accepting applications" },
  { key: "accepting_referrals", label: "Accepting new referrals" },
  { key: "earning", label: "Earning", note: "Off stops all new commission lines." },
  { key: "auto_approve", label: "Auto approve applications" },
];

export function Overview({ go }: { go: Go }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = () => aff.get<OverviewData>("/overview").then(setData).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, []);

  async function flip(key: keyof OverviewData["switches"], value: boolean) {
    if (!data) return;
    setData({ ...data, switches: { ...data.switches, [key]: value } });
    try {
      await aff.put("/settings", { [key]: value });
      toast.show("Saved");
    } catch (e) {
      toast.show(errorText(e));
      void load();
    }
  }

  function act(kind: string) {
    if (kind === "applications") go("applications");
    else if (kind === "batch") go("payouts");
    else if (kind === "w9") go("affiliates");
    else if (kind === "self_referral") go("referrals", "review");
    else if (kind === "stripe") go("stripe");
  }

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!data) return <><Skeleton h={34} w={260} /><div className="g3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={112} />)}</div></>;

  const a = data.affiliates;
  return (
    <>
      <div className="ph">
        <div>
          <h1>Affiliates overview</h1>
          <p>PrintCoPilot partner program. All amounts in USD.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => go("affiliates", "new")}><Icon name="plus" />Add affiliate</button>
          <button className="btn pri" onClick={() => go("applications")}>Review applications</button>
        </div>
      </div>

      <div className="g3">
        <div className="card tile"><span className="k"><Icon name="file" size="s" />New applications</span>
          <span className="v">{data.applications.open}</span>
          <span className="s">{data.applications.old ? `${data.applications.old} waiting over 2 days` : "None waiting long"}</span></div>
        <div className="card tile"><span className="k"><Icon name="users" size="s" />Active affiliates</span>
          <span className="v">{a.active}</span>
          <span className="s">{a.paused} paused, {a.suspended} suspended</span></div>
        <div className="card tile"><span className="k"><Icon name="bld" size="s" />Active referred shops</span>
          <span className="v">{data.active_shops}</span><span className="s">On a paid plan</span></div>
        <div className="card tile"><span className="k"><Icon name="clock" size="s" />Pending total</span>
          <span className="v">{money(data.pending_cents)}</span><span className="s">Inside the hold</span></div>
        <div className="card tile"><span className="k"><Icon name="wallet" size="s" />Payable total</span>
          <span className="v">{money(data.payable_cents)}</span>
          <span className="s">{data.on_hold_cents ? `Excludes ${money(data.on_hold_cents)} on hold` : "Nothing on hold"}</span></div>
        <div className="card tile"><span className="k"><Icon name="checkc" size="s" />Paid this month</span>
          <span className="v">{money(data.paid_month_cents)}</span>
          <span className="s">{data.paid_month_count} payout{data.paid_month_count === 1 ? "" : "s"} recorded</span></div>
      </div>

      <div className="split">
        <div className="col" style={{ gap: 24 }}>
          <section className="card">
            <div className="card-h"><h2>Needs attention</h2>{data.attention.length ? <span className="cnt warn">{data.attention.length}</span> : null}</div>
            {data.attention.length === 0 ? <p className="pad muted">Nothing needs you right now.</p> : data.attention.map((x, i) => (
              <div className="setrow" key={i}>
                <div className="l"><b>{x.title}</b><span>{x.detail}</span></div>
                <div className="r">
                  <button className={`btn sm${x.action === "create_batch" ? " pri" : ""}`} onClick={() => act(x.kind)}>
                    {x.action === "create_batch" ? "Create batch" : x.action === "review" ? "Review" : "Open"}
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-h"><h2>Top 5 affiliates this month</h2><span className="sm muted">Commission earned in {data.month}</span></div>
            {data.top.length === 0 ? <p className="pad muted">No commission earned this month yet.</p> : (
              <div className="tw">
                <table className="tbl">
                  <thead><tr><th>Affiliate</th><th>Rate plan</th><th className="num">Active shops</th><th className="num">Earned</th></tr></thead>
                  <tbody>
                    {data.top.map((t) => (
                      <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => go("affiliates", t.id)}>
                        <td className="ink"><span className="row nw" style={{ gap: 10 }}><span className="av">{initials(t.name)}</span>{t.name}</span></td>
                        <td>{t.rate}</td><td className="num">{t.shops}</td><td className="num b">{money(t.earned_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <div className="col" style={{ gap: 24 }}>
          <section className="card">
            <div className="card-h"><h2>Program switches</h2><a className="btn gh sm" href="#affiliates/settings">Settings</a></div>
            {SWITCHES.map((s) => (
              <div className="setrow" key={s.key} style={{ flexWrap: "nowrap" }}>
                <div className="l" style={{ minWidth: 0 }}><b>{s.label}</b>{s.note ? <span>{s.note}</span> : null}</div>
                <div className="r"><Switch label={s.label} checked={data.switches[s.key]} onChange={(v) => flip(s.key, v)} /></div>
              </div>
            ))}
          </section>
          <section className="card pad col" style={{ gap: 10 }}>
            <h2>Stripe handlers</h2>
            <dl className="kv" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <dt>Last event received</dt><dd className="b">{ago(data.stripe.last_received)}</dd>
              <dt>Processed, last 24h</dt><dd className="b">{data.stripe.processed_24h}</dd>
              <dt>Replays ignored</dt><dd className="b">{data.stripe.replays_24h}</dd>
              <dt>Failed</dt><dd>{data.stripe.failed ? <span className="cnt bad">{data.stripe.failed}</span> : <b>0</b>}</dd>
            </dl>
          </section>
        </div>
      </div>
      {toast.node}
    </>
  );
}
