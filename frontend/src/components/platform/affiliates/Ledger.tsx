"use client";

import { useEffect, useState } from "react";

import { LineChip } from "@/components/partners/states";
import { Banner, Count, Empty, Field, Icon, Modal, Skeleton, errorText, useToast } from "@/components/partners/ui";
import { day, money } from "@/lib/partnerApi";
import { aff, SHOP_PLANS } from "./api";
import type { Go } from "./AffiliatesTab";

type Line = {
  id: string; kind: string; earned_at: string; shop_name: string; plan_name: string; base_cents: number; rate: string;
  amount_cents: number; state: string; detail: string; partner_id: string; partner_name: string; payable_on: string;
  hold_reason: string | null; note: string | null; invoice: string | null; in_batch: boolean;
};
type LedgerData = {
  totals: { pending: number; payable: number; on_hold: number; clawbacks: number };
  counts: Record<string, number>; total: number; page: number; pages: number; rows: Line[];
};
type Who = { id: string; name: string; status: string };

const STATES: [string, string][] = [["all", "All"], ["pending", "Pending"], ["payable", "Payable"], ["on_hold", "On hold"],
  ["paid", "Paid"], ["void", "Void"], ["clawback", "Clawback"]];
const HOLD_REASONS = ["Under review", "Possible self referral", "Payment dispute", "Other"];

export function Ledger({ go }: { go: Go }) {
  const [state, setState] = useState("all");
  const [partner, setPartner] = useState("");
  const [plan, setPlan] = useState("");
  const [months, setMonths] = useState(6);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerData | null>(null);
  const [people, setPeople] = useState<Who[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "hold" | "release" | "void" | "adjust">(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    const p = new URLSearchParams({ state, months: String(months), page: String(page) });
    if (partner) p.set("partner_id", partner);
    if (plan) p.set("plan", plan);
    if (q.trim()) p.set("q", q.trim());
    return aff.get<LedgerData>(`/ledger?${p}`).then((d) => { setData(d); setPicked(new Set()); }).catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, partner, plan, months, q, page]);
  useEffect(() => { aff.get<{ rows: Who[] }>("/affiliates").then((r) => setPeople(r.rows)).catch(() => undefined); }, []);

  const rows = data?.rows ?? [];
  const chosen = rows.filter((r) => picked.has(r.id));
  const sum = chosen.reduce((a, r) => a + r.amount_cents, 0);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));

  return (
    <>
      <div className="ph">
        <div>
          <h1>Ledger</h1>
          <p>Every commission line. Each one is tied to a Stripe invoice and stores the rate it used.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => aff.save("/ledger.csv", "ledger.csv").catch((e) => toast.show(errorText(e)))}><Icon name="download" />Export CSV</button>
          <button className="btn pri" onClick={() => setDialog("adjust")}><Icon name="plus" />Add adjustment</button>
        </div>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <div className="g4">
        <div className="card tile"><span className="k">Pending</span><span className="v">{money(data?.totals.pending)}</span><span className="s">Inside the hold</span></div>
        <div className="card tile"><span className="k">Payable</span><span className="v">{money(data?.totals.payable)}</span><span className="s">Ready to pay</span></div>
        <div className="card tile"><span className="k">On hold</span><span className="v">{money(data?.totals.on_hold)}</span><span className="s">Needs a decision</span></div>
        <div className="card tile"><span className="k">Open clawbacks</span><span className="v">{money(data?.totals.clawbacks)}</span><span className="s">Net against next payout</span></div>
      </div>

      {chosen.length ? (
        <div className="bulk" role="region" aria-label="Selected lines">
          <b>{chosen.length} line{chosen.length === 1 ? "" : "s"} selected, {money(sum)}</b>
          <div className="sp" />
          <button className="btn sm" onClick={() => setDialog("hold")}><Icon name="pause" size="s" />Hold</button>
          <button className="btn sm" onClick={() => setDialog("release")}><Icon name="check" size="s" />Release</button>
          <button className="btn sm" onClick={() => setDialog("void")}><Icon name="ban" size="s" />Void</button>
          <span className="sm" style={{ color: "#B6C5DA" }}>A reason is asked for every action</span>
        </div>
      ) : null}

      <section className="card">
        <div className="filters">
          <div className="ig"><Icon name="search" />
            <input className="input" type="search" placeholder="Search shop or invoice" aria-label="Search the ledger" value={q}
                   onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          {STATES.map(([key, label]) => (
            <button key={key} className={`pill${state === key ? " on" : ""}`} aria-pressed={state === key} onClick={() => { setState(key); setPage(1); }}>
              {label}{key !== "all" ? <Count n={data?.counts[key] ?? 0} tone="mut" /> : null}
            </button>
          ))}
          <select className="select" style={{ width: 180 }} aria-label="Affiliate" value={partner} onChange={(e) => { setPartner(e.target.value); setPage(1); }}>
            <option value="">Affiliate: all</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} aria-label="Plan" value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }}>
            <option value="">Plan: all</option>
            {SHOP_PLANS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          <select className="select" style={{ width: 160 }} aria-label="Period" value={months} onChange={(e) => { setMonths(Number(e.target.value)); setPage(1); }}>
            <option value={6}>Last 6 months</option><option value={12}>Last 12 months</option><option value={0}>All time</option>
          </select>
        </div>
        {!data ? <div className="pad col">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={44} />)}</div>
          : rows.length === 0 ? <div className="pad"><Empty icon="dollar" title="No lines here">Lines appear as referred shops pay their plans.</Empty></div>
            : (
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th><input type="checkbox" aria-label="Select every line on this page" checked={all}
                                 onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                      <th>Earned</th><th>Affiliate</th><th>Shop</th><th className="num">Base</th><th className="num">Rate</th>
                      <th className="num">Amount</th><th>Status</th><th>Payable on</th>
                    </tr>
                  </thead>
                  <tbody>{rows.map((l) => (
                    <tr key={l.id} className={picked.has(l.id) ? "sel" : ""}>
                      <td><input type="checkbox" aria-label={`Select ${l.shop_name} ${day(l.earned_at)}`} checked={picked.has(l.id)} onChange={() => toggle(l.id)} /></td>
                      <td>{day(l.earned_at)}</td>
                      <td className="ink"><a href={`#affiliates/affiliates/${l.partner_id}`} onClick={(e) => { e.preventDefault(); go("affiliates", l.partner_id); }}>{l.partner_name}</a></td>
                      <td title={l.invoice ?? undefined}>{l.shop_name}</td>
                      <td className="num">{l.kind === "adjustment" ? "" : money(l.base_cents)}</td>
                      <td className="num">{l.rate}</td>
                      <td className={`num b${l.amount_cents < 0 ? " neg" : ""}`}>{money(l.amount_cents)}</td>
                      <td><span className="row nw" style={{ gap: 6 }}><LineChip state={l.state} />
                        {l.state === "on_hold" && l.hold_reason ? <span className="xs muted">{l.hold_reason}</span> : null}
                        {l.state === "void" && l.note ? <span className="xs muted">{l.note.slice(0, 40)}</span> : null}
                        {l.kind === "clawback" && l.state !== "void" ? <span className="xs muted">Refund</span> : null}</span></td>
                      <td className="muted">{l.state === "void" ? "Forfeited" : l.state === "clawback" ? "Nets next payout" : l.detail}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        <div className="tfoot">
          <span>Showing {rows.length} of {data?.total ?? 0} lines</span>
          {data && data.pages > 1 ? (
            <div className="pager">
              <button className="btn sm ico" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="cl" /></button>
              <button className="btn sm ico" aria-label="Next page" disabled={page >= data.pages} onClick={() => setPage(page + 1)}><Icon name="cr" /></button>
            </div>
          ) : null}
        </div>
      </section>

      {dialog === "hold" || dialog === "release" || dialog === "void" ? (
        <LinesDialog what={dialog} lines={chosen} onClose={() => setDialog(null)}
                     onDone={(n) => { setDialog(null); toast.show(`${n} line${n === 1 ? "" : "s"} changed`); void load(); }} />
      ) : null}
      {dialog === "adjust" ? <AdjustDialog people={people} onClose={() => setDialog(null)}
                                           onDone={() => { setDialog(null); toast.show("Adjustment added"); void load(); }} /> : null}
      {toast.node}
    </>
  );
}

function LinesDialog({ what, lines, onClose, onDone }: { what: "hold" | "release" | "void"; lines: Line[]; onClose: () => void; onDone: (n: number) => void }) {
  const [reason, setReason] = useState(HOLD_REASONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titles = { hold: `Hold ${lines.length} line${lines.length === 1 ? "" : "s"}`, release: `Release ${lines.length} line${lines.length === 1 ? "" : "s"}`,
                   void: `Void ${lines.length} line${lines.length === 1 ? "" : "s"}` };
  const subs = { hold: "Held lines are skipped by payouts until released.", release: "Released lines are payable again once their hold has passed.",
                 void: "A void is permanent and the line forfeits. Its clawbacks are voided with it." };
  const needsNote = what !== "hold" || reason === "Other";

  async function go() {
    setError(null);
    try {
      const r = await aff.post<{ changed: number }>(`/ledger/${what}`, { ids: lines.map((l) => l.id), reason: what === "hold" ? reason : null, note: note || null });
      onDone(r.changed);
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <Modal title={titles[what]} sub={subs[what]} onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
             <button className={`btn ${what === "void" ? "dng fill" : "pri"}`} disabled={needsNote && !note.trim()} onClick={go}>
               {what === "hold" ? "Hold lines" : what === "release" ? "Release lines" : "Void lines"}</button></>}>
      {what === "hold" ? (
        <Field label="Reason, required" htmlFor="ln-why">
          <select id="ln-why" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {HOLD_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label={what === "hold" ? (reason === "Other" ? "Note, required" : "Internal note") : "Reason, required"} htmlFor="ln-note" error={error}>
        <textarea id="ln-note" className="area" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Saved in the activity log" />
      </Field>
      <p className="xs muted">{what === "hold" ? "Only open lines not already in a batch are held." : what === "release" ? "Only held lines are released." : "Lines already paid or in a batch are not voided."}</p>
    </Modal>
  );
}

function AdjustDialog({ people, onClose, onDone }: { people: Who[]; onClose: () => void; onDone: () => void }) {
  const [partnerId, setPartnerId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents === 0) { setError("Give an amount other than zero, like 25 or -19.40."); return; }
    try {
      await aff.post("/adjustments", { partner_id: partnerId, amount_cents: cents, reason });
      onDone();
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <Modal title="Add adjustment" sub="Adds a new line, payable now. Existing lines are never edited." onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
             <button className="btn pri" disabled={!partnerId || !amount || !reason.trim()} onClick={save}>Add adjustment</button></>}>
      <div className="g2">
        <Field label="Affiliate" htmlFor="aj-p">
          <select id="aj-p" className="select" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">Choose an affiliate</option>
            {people.filter((p) => p.status !== "terminated").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Amount, plus or minus" htmlFor="aj-amt">
          <span className="unit"><input id="aj-amt" className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /><i>USD</i></span>
        </Field>
      </div>
      <Field label="Reason, required" htmlFor="aj-why" error={error}>
        <textarea id="aj-why" className="area" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Saved in the activity log" />
      </Field>
    </Modal>
  );
}
