"use client";

import { useEffect, useMemo, useState } from "react";

import { METHODS } from "@/components/partners/states";
import { Banner, Chip, Count, Empty, Field, Icon, Modal, Skeleton, errorText, useToast } from "@/components/partners/ui";
import { day, money, moneyShort } from "@/lib/partnerApi";
import { aff } from "./api";
import type { Go } from "./AffiliatesTab";

type Payable = {
  partner_id: string; name: string; payable_cents: number; lines: number; clawback_cents: number;
  method: keyof typeof METHODS | null; has_w9: boolean; ready: "ready" | "blocked" | "under_min" | "held"; ready_words: string; paused: boolean;
  /** An ended partnership: its last balance is paid whatever the minimum. */
  final: boolean;
};
type Payables = {
  rows: Payable[]; ready_total_cents: number; on_hold_cents: number; payable_total_cents: number; minimum_cents: number;
  w9_required_from_cents: number; form_1099_threshold_cents: number;
};
type Batch = {
  id: string; name: string; note: string | null; status: "open" | "paid" | "cancelled"; created_by: string | null;
  created_at: string; closed_at: string | null; total_cents: number; partners: number; recorded: number;
  waiting?: { partner_id: string; name: string; payout_method: keyof typeof METHODS | null; amount_cents: number; lines: number; has_w9: boolean;
              w9_needed: boolean }[];
};
type Paid = { id: string; paid_on: string; amount_cents: number; method: keyof typeof METHODS; reference: string | null; recorded_by: string | null;
  w9_override_reason: string | null; partner_id: string; partner_name: string; batch: string | null; lines: number };
type Year = { year: number; id: string; name: string; email: string; cents: number; payouts: number; has_w9: boolean; form_1099: boolean };

type Tab = "payables" | "batches" | "history" | "yearly";

export function Payouts({ go }: { go: Go }) {
  const [tab, setTab] = useState<Tab>("payables");
  const [payables, setPayables] = useState<Payables | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [history, setHistory] = useState<Paid[] | null>(null);
  const [yearly, setYearly] = useState<Year[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overrideFor, setOverrideFor] = useState<Payable | null>(null);
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState<{ batch: Batch; row: NonNullable<Batch["waiting"]>[number] } | null>(null);
  const [cancelling, setCancelling] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const loadPayables = () => aff.get<Payables>("/payouts/payables").then((p) => { setPayables(p); setPicked(new Set()); }).catch((e) => setError(errorText(e)));
  const loadBatches = () => aff.get<Batch[]>("/payouts/batches").then(setBatches).catch((e) => setError(errorText(e)));
  useEffect(() => { void loadPayables(); void loadBatches(); }, []);
  useEffect(() => {
    if (tab === "history" && !history) aff.get<Paid[]>("/payouts/history").then(setHistory).catch((e) => setError(errorText(e)));
    if (tab === "yearly" && !yearly) aff.get<Year[]>("/payouts/yearly").then(setYearly).catch((e) => setError(errorText(e)));
  }, [tab, history, yearly]);

  const selectable = (r: Payable) => r.ready === "ready" || (r.ready === "blocked" && !!overrides[r.partner_id]);
  const chosen = useMemo(() => (payables?.rows ?? []).filter((r) => picked.has(r.partner_id)), [payables, picked]);
  const sum = chosen.reduce((a, r) => a + r.payable_cents, 0);
  const lineCount = chosen.reduce((a, r) => a + r.lines, 0);
  const openBatches = (batches ?? []).filter((b) => b.status === "open");

  return (
    <>
      <div className="ph">
        <div>
          <h1>Payouts</h1>
          <p>Nothing pays automatically. You pay outside the system, then record it here.</p>
        </div>
        <button className="btn" onClick={() => aff.save("/payouts.csv", "payouts.csv").catch((e) => toast.show(errorText(e)))}><Icon name="download" />Export CSV</button>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <section className="card pad">
        <div className="steps">
          {["Review payables", "Create a batch, lines lock", "Pay outside, PayPal or Wise", "Record paid date, method, reference", "Statement emailed"]
            .map((t, i) => <span key={t} className={`step${i === 0 ? " on" : ""}`}><b>{i + 1}</b>{t}</span>)}
        </div>
      </section>

      <section className="card">
        <div className="tabs" style={{ padding: "0 16px" }}>
          <button className={`tab${tab === "payables" ? " on" : ""}`} onClick={() => setTab("payables")}>Payables<Count n={payables?.rows.length ?? 0} /></button>
          <button className={`tab${tab === "batches" ? " on" : ""}`} onClick={() => setTab("batches")}>Batches<Count n={openBatches.length} tone="warn" /></button>
          <button className={`tab${tab === "history" ? " on" : ""}`} onClick={() => setTab("history")}>Paid history</button>
          <button className={`tab${tab === "yearly" ? " on" : ""}`} onClick={() => setTab("yearly")}>Yearly totals for 1099</button>
        </div>

        {tab === "payables" ? (
          <div className="col" style={{ gap: 0 }}>
            {chosen.length ? (
              <div style={{ padding: 16 }}>
                <div className="bulk">
                  <b>{chosen.length} affiliate{chosen.length === 1 ? "" : "s"} selected, {money(sum)}</b>
                  <span className="sm" style={{ color: "#B6C5DA" }}>Net of clawbacks. All above the {moneyShort(payables?.minimum_cents)} minimum
                    {chosen.some((r) => r.final) ? " or a final payout" : ""}
                    {chosen.some((r) => overrides[r.partner_id]) ? ", W-9 overridden where missing."
                      : chosen.every((r) => r.has_w9) ? " with a W-9." : ", with a W-9 where one is needed."}</span>
                  <div className="sp" />
                  <button className="btn sm" onClick={() => setCreating(true)}><Icon name="layers" size="s" />Create batch</button>
                </div>
              </div>
            ) : null}
            {!payables ? <div className="pad col">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
              : payables.rows.length === 0 ? <div className="pad"><Empty icon="wallet" title="Nothing payable yet">Lines become payable when their hold ends.</Empty></div>
                : (
                  <div className="tw">
                    <table className="tbl">
                      <thead><tr><th /><th>Affiliate</th><th className="num">Payable, net</th><th className="num">Lines</th><th className="num">Clawback</th><th>Method</th><th>W-9</th><th>Ready?</th></tr></thead>
                      <tbody>{payables.rows.map((r) => (
                        <tr key={r.partner_id} className={picked.has(r.partner_id) ? "sel" : ""}>
                          <td><input type="checkbox" aria-label={`Select ${r.name}`} disabled={!selectable(r)} checked={picked.has(r.partner_id)}
                                     onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.partner_id)) n.delete(r.partner_id); else n.add(r.partner_id); return n; })} /></td>
                          <td className="ink"><a href={`#affiliates/affiliates/${r.partner_id}`} onClick={(e) => { e.preventDefault(); go("affiliates", r.partner_id); }}>{r.name}</a></td>
                          <td className="num b">{money(r.payable_cents)}</td>
                          <td className="num">{r.lines}</td>
                          <td className={`num${r.clawback_cents ? " neg" : ""}`}>{money(r.clawback_cents)}</td>
                          <td>{r.method ? METHODS[r.method] : <span className="muted">Not set</span>}</td>
                          <td>{r.has_w9 ? <Chip tone="ok">On file</Chip> : <Chip tone="warn">Missing</Chip>}</td>
                          <td>
                            <span className="row nw" style={{ gap: 8 }}>
                              {r.ready === "ready" ? <Chip tone="ok"><Icon name="check" size="s" />Ready</Chip>
                                : r.ready === "blocked" ? (overrides[r.partner_id] ? <Chip tone="warn">W-9 overridden</Chip> : <Chip tone="bad"><Icon name="lock" size="s" />Blocked</Chip>)
                                  : <Chip tone="mut">{r.ready_words}</Chip>}
                              {r.paused && r.ready === "ready" ? <span className="xs muted">Paused, still paid</span> : null}
                              {r.ready === "blocked" && !overrides[r.partner_id] ? <button className="btn gh sm" onClick={() => setOverrideFor(r)}>Override</button> : null}
                            </span>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
            <div className="tfoot">
              <span>Payable total {money(payables?.payable_total_cents)}{payables?.on_hold_cents ? ` excludes ${money(payables.on_hold_cents)} on hold` : ""}</span>
              <span>{payables?.w9_required_from_cents
                ? `Once a partner's payouts in a year reach ${moneyShort(payables.w9_required_from_cents)}, recording is blocked without a W-9 unless overridden, with a reason.`
                : "Recording is blocked without a W-9 unless overridden, with a reason."}</span>
            </div>
          </div>
        ) : null}

        {tab === "batches" ? (
          !batches ? <div className="pad"><Skeleton h={120} /></div>
            : batches.length === 0 ? <div className="pad"><Empty icon="layers" title="No batches yet">Select payable affiliates and create a batch.</Empty></div>
              : (
                <div className="col" style={{ gap: 0 }}>
                  {batches.map((b) => (
                    <div className="sec col" key={b.id} style={{ gap: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div>
                          <h3>{b.name} <Chip tone={b.status === "open" ? "warn" : b.status === "paid" ? "ok" : "mut"}>{b.status === "open" ? "Waiting to be recorded" : b.status === "paid" ? "Paid" : "Cancelled"}</Chip></h3>
                          <p className="sm muted">Created {day(b.created_at, true)}{b.created_by ? ` by ${b.created_by}` : ""}. {b.partners} affiliate{b.partners === 1 ? "" : "s"}, {money(b.total_cents)}.{b.note ? ` ${b.note}` : ""}</p>
                        </div>
                        {b.status === "open" ? <button className="btn sm dng" onClick={() => setCancelling(b)}>Cancel batch</button> : null}
                      </div>
                      {b.status === "open" && b.waiting?.length ? (
                        <div className="tw">
                          <table className="tbl">
                            <thead><tr><th>Affiliate</th><th className="num">Amount</th><th className="num">Lines</th><th>Method</th><th>W-9</th><th /></tr></thead>
                            <tbody>{b.waiting.map((w) => (
                              <tr key={w.partner_id}>
                                <td className="ink">{w.name}</td><td className="num b">{money(w.amount_cents)}</td><td className="num">{w.lines}</td>
                                <td>{w.payout_method ? METHODS[w.payout_method] : "Not set"}</td>
                                <td>{w.has_w9 ? <Chip tone="ok">On file</Chip> : <Chip tone="warn">Missing</Chip>}</td>
                                <td className="tr"><button className="btn pri sm" onClick={() => setRecording({ batch: b, row: w })}>Record payout</button></td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )
        ) : null}

        {tab === "history" ? (
          !history ? <div className="pad"><Skeleton h={120} /></div>
            : history.length === 0 ? <div className="pad"><Empty icon="checkc" title="No payouts recorded yet" /></div>
              : (
                <div className="tw">
                  <table className="tbl stk">
                    <thead><tr><th>Paid on</th><th>Affiliate</th><th className="num">Amount</th><th>Method</th><th>Reference</th><th className="num">Lines</th><th>Batch</th><th>Recorded by</th></tr></thead>
                    <tbody>{history.map((h) => (
                      <tr key={h.id}>
                        <td data-l="Paid on">{day(h.paid_on, true)}</td><td className="ink" data-l="Affiliate">{h.partner_name}</td>
                        <td className="num b" data-l="Amount">{money(h.amount_cents)}</td><td data-l="Method">{METHODS[h.method] ?? h.method}</td>
                        <td className="mono" data-l="Reference">{h.reference ?? ""}</td><td className="num" data-l="Lines">{h.lines}</td>
                        <td data-l="Batch">{h.batch ?? ""}</td>
                        <td data-l="Recorded by">{h.recorded_by ?? ""}{h.w9_override_reason ? <> <Chip tone="warn">W-9 overridden</Chip></> : null}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )
        ) : null}

        {tab === "yearly" ? (
          !yearly ? <div className="pad"><Skeleton h={120} /></div>
            : yearly.length === 0 ? <div className="pad"><Empty icon="file" title="No payouts yet" /></div>
              : (
                <>
                  <div className="tw">
                    <table className="tbl stk">
                      <thead><tr><th>Year</th><th>Affiliate</th><th>Email</th><th className="num">Paid</th><th className="num">Payouts</th><th>W-9</th></tr></thead>
                      <tbody>{yearly.map((y) => (
                        <tr key={`${y.year}-${y.id}`}>
                          <td className="ink" data-l="Year">{y.year}</td><td data-l="Affiliate">{y.name}</td><td data-l="Email">{y.email}</td>
                          <td className="num b" data-l="Paid">{money(y.cents)}{y.form_1099 ? <> <Chip tone="info">1099</Chip></> : null}</td>
                          <td className="num" data-l="Payouts">{y.payouts}</td>
                          <td data-l="W-9">{y.has_w9 ? <Chip tone="ok">On file</Chip> : <Chip tone="warn">Missing</Chip>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className="tfoot"><span>Paid in each calendar year, by the day each payout was paid. Your accountant files the 1099s from these.
                    {payables?.form_1099_threshold_cents ? ` Marked 1099: paid ${moneyShort(payables.form_1099_threshold_cents)} or more in the year.` : ""}</span></div>
                </>
              )
        ) : null}
      </section>

      {overrideFor ? (
        <OverrideDialog who={overrideFor} onClose={() => setOverrideFor(null)}
                        onDone={(reason) => { setOverrides({ ...overrides, [overrideFor.partner_id]: reason }); setOverrideFor(null); }} />
      ) : null}
      {creating ? (
        <BatchDialog count={chosen.length} lines={lineCount} total={sum} onClose={() => setCreating(false)}
                     onCreate={async (name, note) => {
                       const ids = chosen.map((r) => r.partner_id);
                       const ov = Object.fromEntries(ids.filter((id) => overrides[id]).map((id) => [id, overrides[id]]));
                       await aff.post("/payouts/batches", { partner_ids: ids, name, note, w9_overrides: ov });
                       setCreating(false); toast.show("Batch created. Pay it outside, then record each payout.");
                       setOverrides({}); setTab("batches"); void loadPayables(); void loadBatches();
                     }} />
      ) : null}
      {recording ? (
        <RecordDialog batch={recording.batch} row={recording.row} override={overrides[recording.row.partner_id]} onClose={() => setRecording(null)}
                      onDone={() => { setRecording(null); toast.show("Payout recorded. The statement is on its way."); setHistory(null); setYearly(null); void loadBatches(); }} />
      ) : null}
      {cancelling ? (
        <CancelDialog batch={cancelling} onClose={() => setCancelling(null)}
                      onDone={() => { setCancelling(null); toast.show("Batch cancelled, lines unlocked"); void loadBatches(); void loadPayables(); }} />
      ) : null}
      {toast.node}
    </>
  );
}

function OverrideDialog({ who, onClose, onDone }: { who: Payable; onClose: () => void; onDone: (reason: string) => void }) {
  const [ok, setOk] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Modal title="W-9 missing" sub={`${who.name} has no W-9. Recording is blocked unless you override.`} onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={!ok || !reason.trim()} onClick={() => onDone(reason.trim())}>Override and continue</button></>}>
      <label className="chk"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />Override the W-9 requirement for this payout</label>
      <Field label="Reason, required" htmlFor="ov-why">
        <textarea id="ov-why" className="area" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it safe to pay without one?" />
      </Field>
    </Modal>
  );
}

function BatchDialog({ count, lines, total, onClose, onCreate }: { count: number; lines: number; total: number; onClose: () => void; onCreate: (name: string, note: string) => Promise<void> }) {
  const now = new Date();
  const [name, setName] = useState(`B-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Create batch" sub={`Locks ${lines} line${lines === 1 ? "" : "s"} for ${count} affiliate${count === 1 ? "" : "s"} until you record the payout or cancel.`} onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
             <button className="btn pri" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); setError(null); try { await onCreate(name.trim(), note); } catch (e) { setError(errorText(e)); setBusy(false); } }}>Create batch</button></>}>
      <div className="g2">
        <Field label="Batch name" htmlFor="bt-name"><input id="bt-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Total, net of clawbacks" htmlFor="bt-total"><input id="bt-total" className="input" readOnly value={money(total)} /></Field>
      </div>
      <Field label="Note" htmlFor="bt-note" error={error}><textarea id="bt-note" className="area" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function RecordDialog({ batch, row, override, onClose, onDone }: {
  batch: Batch; row: NonNullable<Batch["waiting"]>[number]; override?: string; onClose: () => void; onDone: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<keyof typeof METHODS>(row.payout_method ?? "paypal");
  const [reference, setReference] = useState("");
  const [why, setWhy] = useState(override ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Under the program's W-9 amount for the year a payout needs none (Payout rules).
  const w9Ok = row.has_w9 || !row.w9_needed;

  async function record() {
    setBusy(true); setError(null);
    try {
      await aff.post(`/payouts/batches/${batch.id}/record`, { partner_id: row.partner_id, paid_on: paidOn, method, reference: reference || null,
                                                             w9_override_reason: w9Ok ? null : why || null });
      onDone();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <Modal title="Record payout" sub="Record it after you have paid outside the system. A statement is emailed to the affiliate." onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
             <button className="btn pri" disabled={busy || !paidOn || (!w9Ok && !why.trim())} onClick={record}>Record and email statement</button></>}>
      <div className="g2">
        <Field label="Affiliate" htmlFor="rc-who"><input id="rc-who" className="input" readOnly value={row.name} /></Field>
        <Field label="Amount" htmlFor="rc-amt"><input id="rc-amt" className="input" readOnly value={money(row.amount_cents)} /></Field>
        <Field label="Paid on" htmlFor="rc-on"><input id="rc-on" className="input" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label="Method" htmlFor="rc-m">
          <select id="rc-m" className="select" value={method} onChange={(e) => setMethod(e.target.value as keyof typeof METHODS)}>
            <option value="paypal">PayPal</option><option value="wise">Wise</option><option value="bank">Bank transfer</option>
          </select>
        </Field>
      </div>
      <Field label="Reference" htmlFor="rc-ref"><input id="rc-ref" className="input mono" placeholder="Transaction id" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      {row.has_w9 ? <Banner tone="ok" icon="check">W-9 is on file.</Banner>
        : !row.w9_needed ? <Banner icon="info">No W-9 on file, and none is needed yet: this year&apos;s payouts stay under the W-9 amount.</Banner> : (
        <>
          <Banner tone="warn" icon="alert">No W-9 on file. Recording needs an override reason.</Banner>
          <Field label="Override reason, required" htmlFor="rc-why"><textarea id="rc-why" className="area" value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
        </>
      )}
      {error ? <span className="errt">{error}</span> : null}
    </Modal>
  );
}

function CancelDialog({ batch, onClose, onDone }: { batch: Batch; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Cancel ${batch.name}`} sub="Its unpaid lines unlock and become payable again. Payouts already recorded stay." onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Keep the batch</button>
             <button className="btn dng fill" disabled={!reason.trim()} onClick={async () => { try { await aff.post(`/payouts/batches/${batch.id}/cancel`, { reason }); onDone(); } catch (e) { setError(errorText(e)); } }}>Cancel batch</button></>}>
      <Field label="Reason, required" htmlFor="cb-why" error={error}><textarea id="cb-why" className="area" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
