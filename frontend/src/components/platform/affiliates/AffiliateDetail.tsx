"use client";

import { Fragment, useEffect, useState } from "react";

import { LineChip, ShopChip, METHODS } from "@/components/partners/states";
import { Banner, Chip, Empty, Field, Icon, Modal, Skeleton, errorText, useToast } from "@/components/partners/ui";
import { day, initials, money } from "@/lib/partnerApi";
import { aff } from "./api";
import type { Go } from "./AffiliatesTab";
import { StatusChip, actorWords, activityWords, diffLines, type Activity } from "./shared";

type Affiliate = {
  id: string; name: string; email: string; code: string; status: string; status_reason: string | null;
  business_name: string | null; website: string | null; link: string; since: string; last_sign_in: string | null;
  invited: boolean; terms: { accepted: number | null; latest: number | null };
  payout_method: keyof typeof METHODS | null; payout_account: string | null; has_w9: boolean; two_factor: boolean;
  money: { balances: { pending: number; payable: number; clawbacks: number; on_hold: number }; paid_count: number; paid_cents: number;
           readiness: { state: string; words: string } };
  shops: { total: number; active: number; trial: number };
  rate: { bps: number; words: string; from: "plan" | "override"; plan_id: string; plan: string; custom_bps: number | null; custom_ends_on: string | null };
  rate_plans: { id: string; key: string; name: string; rate_bps: number }[];
};

type Tab = "overview" | "rate" | "referrals" | "ledger" | "payouts" | "tax" | "activity";
const TABS: [Tab, string][] = [["overview", "Overview"], ["rate", "Rate and status"], ["referrals", "Referrals"],
  ["ledger", "Ledger"], ["payouts", "Payouts"], ["tax", "Tax and payout details"], ["activity", "Activity"]];

export function AffiliateDetail({ id, go }: { id: string; go: Go }) {
  const [a, setA] = useState<Affiliate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [statusTo, setStatusTo] = useState<null | "active" | "paused" | "suspended" | "terminated">(null);
  const toast = useToast();

  const load = () => aff.get<Affiliate>(`/affiliates/${id}`).then(setA).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, [id]);

  async function viewAs() {
    try {
      const r = await aff.post<{ url: string }>(`/affiliates/${id}/view-as`);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.show(errorText(e));
    }
  }

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!a) return <><Skeleton h={30} w={320} /><Skeleton h={360} /></>;
  const ended = a.status === "terminated";

  return (
    <>
      <div className="crumbs"><a href="#affiliates/affiliates">Affiliates</a><Icon name="cr" size="s" /><span>{a.name}</span></div>
      <div className="ph">
        <div className="row nw" style={{ gap: 14 }}>
          <span className="av l">{initials(a.name)}</span>
          <div>
            <div className="row" style={{ gap: 8 }}><h1>{a.name}</h1><StatusChip status={a.status} /><Chip tone="mut">{a.code}</Chip>
              {a.invited ? <Chip tone="mut">Invited, no password yet</Chip> : null}</div>
            <p>{a.email}. Partner since {day(a.since, true)}.</p>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={viewAs}><Icon name="eye" />View as affiliate</button>
          {!ended ? (
            <>
              {a.status === "paused" || a.status === "suspended"
                ? <button className="btn" onClick={() => setStatusTo("active")}><Icon name="refresh" />Reactivate</button>
                : <button className="btn" onClick={() => setStatusTo("paused")}><Icon name="pause" />Pause</button>}
              {a.status !== "suspended" ? <button className="btn" onClick={() => setStatusTo("suspended")}><Icon name="ban" />Suspend</button> : null}
              <button className="btn dng" onClick={() => setStatusTo("terminated")}>Terminate</button>
            </>
          ) : null}
        </div>
      </div>
      {a.status_reason && a.status !== "active" ? <Banner tone="warn" icon="info">{a.status.charAt(0).toUpperCase() + a.status.slice(1)}: {a.status_reason}</Banner> : null}

      <section className="card">
        <div className="tabs" style={{ padding: "0 16px" }}>
          {TABS.map(([key, label]) => (
            <button key={key} className={`tab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>
              {label}{key === "referrals" ? <span className="cnt mut">{a.shops.total}</span> : null}
            </button>
          ))}
        </div>
        <div className="pad col" style={{ gap: 24 }}>
          {tab === "overview" && <OverviewTab a={a} onRate={() => setTab("rate")} />}
          {tab === "rate" && <RateTab a={a} onSaved={() => { toast.show("Saved"); void load(); }} onStatus={setStatusTo} />}
          {tab === "referrals" && <ShopsTab id={id} go={go} />}
          {tab === "ledger" && <LedgerTab id={id} go={go} />}
          {tab === "payouts" && <PayoutsTab id={id} />}
          {tab === "tax" && <TaxTab a={a} />}
          {tab === "activity" && <ActivityTab id={id} />}
        </div>
      </section>

      {statusTo ? <StatusDialog a={a} to={statusTo} onClose={() => setStatusTo(null)}
                                onDone={(msg) => { setStatusTo(null); toast.show(msg); void load(); }} /> : null}
      {toast.node}
    </>
  );
}

function OverviewTab({ a, onRate }: { a: Affiliate; onRate: () => void }) {
  const b = a.money.balances;
  const behind = (a.terms.accepted ?? 0) < (a.terms.latest ?? 0);
  return (
    <>
      <div className="g4">
        <div className="card tile"><span className="k">Payable now</span><span className="v">{money(b.payable)}</span>
          <span className="s">{b.clawbacks ? `Net of ${money(-b.clawbacks)} clawback` : a.money.readiness.words}</span></div>
        <div className="card tile"><span className="k">Pending</span><span className="v">{money(b.pending)}</span><span className="s">Inside the hold</span></div>
        <div className="card tile"><span className="k">Paid to date</span><span className="v">{money(a.money.paid_cents)}</span>
          <span className="s">{a.money.paid_count} payout{a.money.paid_count === 1 ? "" : "s"}</span></div>
        <div className="card tile"><span className="k">Referred shops</span><span className="v">{a.shops.total}</span>
          <span className="s">{a.shops.active} active, {a.shops.trial} trial</span></div>
      </div>
      <div className="split">
        <section className="card pad col">
          <h3>Details</h3>
          <dl className="kv">
            <dt>Business</dt><dd>{a.business_name ?? "None given"}</dd>
            <dt>Website</dt><dd>{a.website ?? "None given"}</dd>
            <dt>Referral link</dt><dd className="mono">{a.link}</dd>
            <dt>Last sign in</dt><dd>{a.last_sign_in ? day(a.last_sign_in, true) : "Never"}</dd>
            <dt>Terms accepted</dt><dd>{a.terms.accepted ? `Version ${a.terms.accepted}` : "None"}
              {behind ? <> <Chip tone="warn">Version {a.terms.latest} not accepted</Chip></> : null}</dd>
            <dt>Payout method</dt><dd>{a.payout_method ? METHODS[a.payout_method] : "Not set"}</dd>
            <dt>Two step sign in</dt><dd>{a.two_factor ? "On" : "Off"}</dd>
          </dl>
        </section>
        <section className="card pad col">
          <h3>Effective rate</h3>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ font: "600 40px/44px var(--pcp-display), Inter, sans-serif", color: "var(--ink)" }}>{a.rate.words}</span>
            <Chip>{a.rate.from === "override" ? "Custom override" : `${a.rate.plan} rate plan`}</Chip>
          </div>
          <p className="sm muted">
            {a.rate.from === "override"
              ? `Override${a.rate.custom_ends_on ? ` until ${day(a.rate.custom_ends_on, true)}` : ", no end date"}. Then the ${a.rate.plan} plan applies.`
              : "No custom override. New lines use the rate plan."} Lines already earned keep the rate they stored.
          </p>
          <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={onRate}>Change rate or status</button>
        </section>
      </div>
    </>
  );
}

function RateTab({ a, onSaved, onStatus }: { a: Affiliate; onSaved: () => void; onStatus: (s: "active" | "paused" | "suspended" | "terminated") => void }) {
  const [planId, setPlanId] = useState(a.rate.plan_id);
  const [override, setOverride] = useState(a.rate.custom_bps !== null);
  const [pct, setPct] = useState(a.rate.custom_bps !== null ? String(a.rate.custom_bps / 100) : "");
  const [ends, setEnds] = useState(a.rate.custom_ends_on ?? "");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState(a.code);
  const [codeWhy, setCodeWhy] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function saveRate() {
    setError(null);
    const bps = override ? Math.round(Number(pct) * 100) : null;
    if (override && (!Number.isFinite(Number(pct)) || Number(pct) < 0 || Number(pct) > 100)) { setError("An override rate is from 0% to 100%."); return; }
    try {
      await aff.put(`/affiliates/${a.id}/rate`, { rate_plan_id: planId, custom_rate_bps: bps, custom_rate_ends_on: override && ends ? ends : null, reason });
      setReason("");
      onSaved();
    } catch (e) { setError(errorText(e)); }
  }

  async function saveCode() {
    setError(null);
    try {
      await aff.put(`/affiliates/${a.id}/code`, { code, reason: codeWhy });
      setCodeWhy("");
      onSaved();
    } catch (e) { setError(errorText(e)); }
  }

  async function resend() {
    try { await aff.post(`/affiliates/${a.id}/invite`); onSaved(); } catch (e) { setError(errorText(e)); }
  }

  return (
    <>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <section className="card pad col">
        <h3>Rate</h3>
        <p className="sm muted">Rates apply to future lines only. Lines already earned keep the rate they stored.</p>
        <div className="g2">
          <Field label="Rate plan" htmlFor="rt-plan">
            <select id="rt-plan" className="select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {a.rate_plans.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.rate_bps / 100}%</option>)}
            </select>
          </Field>
          <div className="field">
            <span className="lbl">Custom override</span>
            <label className="chk" style={{ minHeight: 44, alignItems: "center" }}>
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />Use a different rate for this affiliate
            </label>
          </div>
          {override ? (
            <>
              <Field label="Override rate" htmlFor="rt-pct">
                <span className="unit"><input id="rt-pct" className="input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /><i>%</i></span>
              </Field>
              <Field label="Ends on" htmlFor="rt-ends" hint="Leave empty for no end date. The last day is included.">
                <input id="rt-ends" className="input" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        <Field label="Reason, required" htmlFor="rt-why">
          <input id="rt-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Saved in the activity log" />
        </Field>
        <div><button className="btn pri" disabled={!reason.trim()} onClick={saveRate}>Save rate</button></div>
      </section>
      <section className="card pad col">
        <h3>Referral code</h3>
        <p className="sm muted">Changing the code changes the link. Shops already referred stay with this affiliate; the old link stops working.</p>
        <div className="g2">
          <Field label="Code" htmlFor="rt-code"><input id="rt-code" className="input mono" value={code} maxLength={20}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></Field>
          <Field label="Reason, required" htmlFor="rt-code-why"><input id="rt-code-why" className="input" value={codeWhy} onChange={(e) => setCodeWhy(e.target.value)} /></Field>
        </div>
        <div><button className="btn" disabled={!codeWhy.trim() || code === a.code} onClick={saveCode}>Change code</button></div>
      </section>
      <section className="card pad col">
        <h3>Status</h3>
        <p className="sm">Now: <StatusChip status={a.status} /></p>
        {a.status !== "terminated" ? (
          <div className="row">
            {a.status !== "active" ? <button className="btn" onClick={() => onStatus("active")}>Reactivate</button> : null}
            {a.status !== "paused" ? <button className="btn" onClick={() => onStatus("paused")}>Pause</button> : null}
            {a.status !== "suspended" ? <button className="btn" onClick={() => onStatus("suspended")}>Suspend</button> : null}
            <button className="btn dng" onClick={() => onStatus("terminated")}>Terminate</button>
          </div>
        ) : <p className="sm muted">This partnership has ended and cannot be changed.</p>}
        {a.invited ? <div><button className="btn sm" onClick={resend}><Icon name="send" size="s" />Send the invite again</button></div> : null}
      </section>
    </>
  );
}

const STATUS_COPY: Record<"active" | "paused" | "suspended" | "terminated", { title: string; sub: string; button: string; danger: boolean }> = {
  active: { title: "Reactivate", sub: "The link works again and held lines are released.", button: "Reactivate", danger: false },
  paused: { title: "Pause", sub: "The link stops tracking new shops. Shops already referred keep earning, and payouts carry on.", button: "Pause affiliate", danger: false },
  suspended: { title: "Suspend", sub: "No sign in, the link stops working and every unpaid line is held.", button: "Suspend affiliate", danger: true },
  terminated: { title: "Terminate", sub: "The partnership ends: no new lines. What was earned is paid, unless you forfeit it below.", button: "Terminate", danger: true },
};

function StatusDialog({ a, to, onClose, onDone }: { a: Affiliate; to: "active" | "paused" | "suspended" | "terminated"; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [forfeit, setForfeit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = STATUS_COPY[to];

  async function go() {
    try {
      const r = await aff.post<{ lines_changed: number }>(`/affiliates/${a.id}/status`, { status: to, reason, notify, forfeit });
      onDone(`${copy.title} done${r.lines_changed ? `, ${r.lines_changed} line${r.lines_changed === 1 ? "" : "s"} changed` : ""}`);
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <Modal title={`${copy.title} ${a.name}`} sub={copy.sub} onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
             <button className={`btn ${copy.danger ? "dng fill" : "pri"}`} disabled={!reason.trim()} onClick={go}>{copy.button}</button></>}>
      <Field label="Reason, required" htmlFor="st-why" error={error}>
        <textarea id="st-why" className="area" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Saved in the activity log" />
      </Field>
      {to === "terminated" ? (
        <label className="chk"><input type="checkbox" checked={forfeit} onChange={(e) => setForfeit(e.target.checked)} />
          The partnership ended for breaking the terms: forfeit commission still inside its hold</label>
      ) : null}
      <label className="chk"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email the affiliate</label>
    </Modal>
  );
}

function ShopsTab({ id, go }: { id: string; go: Go }) {
  const [rows, setRows] = useState<{ id: string; shop_name: string; plan_name: string; state: string; trial_ended: boolean; signed_up: string; monthly_cents: number | null; in_review: boolean }[] | null>(null);
  useEffect(() => { aff.get<typeof rows & object>(`/affiliates/${id}/referrals`).then(setRows).catch(() => setRows([])); }, [id]);
  if (!rows) return <Skeleton h={120} />;
  if (!rows.length) return <Empty icon="users" title="No referred shops yet" />;
  return (
    <div className="tw">
      <table className="tbl stk">
        <thead><tr><th>Shop</th><th>Plan</th><th>Status</th><th>Signed up</th><th className="num">Monthly commission</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => go("referrals", r.id)}>
            <td className="ink" data-l="Shop">{r.shop_name}{r.in_review ? <> <Chip tone="warn">Review</Chip></> : null}</td>
            <td data-l="Plan">{r.plan_name}</td>
            <td data-l="Status"><ShopChip state={r.state} trialEnded={r.trial_ended} /></td>
            <td data-l="Signed up">{day(r.signed_up, true)}</td>
            <td className="num" data-l="Monthly">{r.monthly_cents !== null ? money(r.monthly_cents) : <span className="muted">None yet</span>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function LedgerTab({ id, go }: { id: string; go: Go }) {
  const [rows, setRows] = useState<{ id: string; earned_at: string; shop_name: string; base_cents: number; rate: string; amount_cents: number; state: string; detail: string; kind: string }[] | null>(null);
  useEffect(() => {
    aff.get<{ rows: NonNullable<typeof rows> }>(`/ledger?partner_id=${id}&months=0`).then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, [id]);
  if (!rows) return <Skeleton h={120} />;
  if (!rows.length) return <Empty icon="dollar" title="No commission lines yet" />;
  return (
    <>
      <div className="tw">
        <table className="tbl stk">
          <thead><tr><th>Earned</th><th>Shop</th><th className="num">Base</th><th className="num">Rate</th><th className="num">Amount</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((l) => (
            <tr key={l.id}>
              <td data-l="Earned">{day(l.earned_at)}</td><td className="ink" data-l="Shop">{l.shop_name}</td>
              <td className="num" data-l="Base">{l.kind === "adjustment" ? "" : money(l.base_cents)}</td><td className="num" data-l="Rate">{l.rate}</td>
              <td className={`num b${l.amount_cents < 0 ? " neg" : ""}`} data-l="Amount">{money(l.amount_cents)}</td>
              <td data-l="Status"><LineChip state={l.state} /></td><td className="muted" data-l="Detail">{l.detail}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => go("ledger")}>Open the ledger</button>
    </>
  );
}

function PayoutsTab({ id }: { id: string }) {
  const [rows, setRows] = useState<{ id: string; paid_on: string; amount_cents: number; method: keyof typeof METHODS; reference: string | null; batch: string | null; lines: number; recorded_by: string | null; w9_override_reason: string | null }[] | null>(null);
  useEffect(() => { aff.get<NonNullable<typeof rows>>(`/affiliates/${id}/payouts`).then(setRows).catch(() => setRows([])); }, [id]);
  if (!rows) return <Skeleton h={120} />;
  if (!rows.length) return <Empty icon="wallet" title="No payouts yet" />;
  return (
    <div className="tw">
      <table className="tbl stk">
        <thead><tr><th>Paid on</th><th className="num">Amount</th><th>Method</th><th>Reference</th><th>Batch</th><th className="num">Lines</th><th>Recorded by</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id}>
            <td className="ink" data-l="Paid on">{day(p.paid_on, true)}</td><td className="num b" data-l="Amount">{money(p.amount_cents)}</td>
            <td data-l="Method">{METHODS[p.method] ?? p.method}</td><td className="mono" data-l="Reference">{p.reference ?? ""}</td>
            <td data-l="Batch">{p.batch ?? ""}</td><td className="num" data-l="Lines">{p.lines}</td>
            <td data-l="Recorded by">{p.recorded_by ?? ""}{p.w9_override_reason ? <> <Chip tone="warn">W-9 overridden</Chip></> : null}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TaxTab({ a }: { a: Affiliate }) {
  const [docs, setDocs] = useState<{ id: string; filename: string | null; size_bytes: number | null; uploaded_at: string; replaced_at: string | null }[] | null>(null);
  const toast = useToast();
  useEffect(() => { aff.get<NonNullable<typeof docs>>(`/affiliates/${a.id}/documents`).then(setDocs).catch(() => setDocs([])); }, [a.id]);
  return (
    <>
      <section className="card pad col">
        <h3>Payout details</h3>
        <dl className="kv">
          <dt>Method</dt><dd>{a.payout_method ? METHODS[a.payout_method] : "Not set"}</dd>
          <dt>Account</dt><dd>{a.payout_account ?? "Not set"}</dd>
        </dl>
      </section>
      <section className="card pad col">
        <h3>W-9</h3>
        <p className="sm muted">Stored encrypted. Every download is written to the activity log with your name.</p>
        {!docs ? <Skeleton h={60} /> : !docs.length ? <Banner tone="warn">No W-9 on file. Recording a payout is blocked until it is uploaded or overridden.</Banner> : (
          <div className="tw">
            <table className="tbl">
              <thead><tr><th>File</th><th>Uploaded</th><th>State</th><th /></tr></thead>
              <tbody>{docs.map((d) => (
                <tr key={d.id}>
                  <td className="ink">{d.filename ?? "W-9"}</td><td>{day(d.uploaded_at, true)}</td>
                  <td>{d.replaced_at ? <Chip tone="mut">Replaced</Chip> : <Chip tone="ok">Current</Chip>}</td>
                  <td className="tr"><button className="btn sm" onClick={() => aff.save(`/affiliates/${a.id}/documents/${d.id}`, d.filename ?? "w9.pdf").catch((e) => toast.show(errorText(e)))}>
                    <Icon name="download" size="s" />Download</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {toast.node}
    </>
  );
}

function ActivityTab({ id }: { id: string }) {
  const [rows, setRows] = useState<(Activity & { at: string; id: number })[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { aff.get<{ rows: NonNullable<typeof rows> }>(`/affiliates/${id}/activity`).then((r) => setRows(r.rows)).catch(() => setRows([])); }, [id]);
  if (!rows) return <Skeleton h={120} />;
  if (!rows.length) return <Empty icon="history" title="Nothing yet" />;
  return (
    <div className="tw">
      <table className="tbl">
        <thead><tr><th>When</th><th>By</th><th>What</th><th>Reason</th></tr></thead>
        <tbody>{rows.map((r) => (
          <Fragment key={r.id}>
            <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: r.before || r.after ? "pointer" : undefined }}>
              <td>{day(r.at, true)}</td><td>{actorWords(r)}</td><td className="ink wrap">{activityWords(r)}</td><td className="wrap muted">{r.reason ?? ""}</td>
            </tr>
            {open === r.id && (r.before || r.after) ? (
              <tr><td colSpan={4} style={{ height: "auto", padding: 12 }}>
                <div className="g2">
                  <div><div className="eyebrow">Before</div><div className="diff">{diffLines(r.before) || "Nothing"}</div></div>
                  <div><div className="eyebrow">After</div><div className="diff">{diffLines(r.after) || "Nothing"}</div></div>
                </div>
              </td></tr>
            ) : null}
          </Fragment>
        ))}</tbody>
      </table>
    </div>
  );
}
