"use client";

import { useEffect, useState } from "react";

import { Banner, Chip, Count, Empty, Field, Icon, Modal, Skeleton, errorText, useToast } from "@/components/partners/ui";
import { day, initials, money } from "@/lib/partnerApi";
import { aff, defaultPlanId, type RatePlan } from "./api";
import type { Go } from "./AffiliatesTab";
import { StatusChip } from "./shared";

type Row = {
  id: string; name: string; email: string; code: string; status: string; rate: string; rate_plan: string;
  shops: number; payable_cents: number; on_hold_cents: number; payable_note: string | null; has_w9: boolean;
  invited: boolean; joined: string;
};

const STATUSES: [string, string][] = [["all", "All"], ["active", "Active"], ["paused", "Paused"],
  ["suspended", "Suspended"], ["terminated", "Terminated"]];

export function AffiliatesList({ go, adding }: { go: Go; adding?: boolean }) {
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [noW9, setNoW9] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ rows: Row[]; counts: Record<string, number>; rate_plans: { key: string; name: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState(!!adding);
  const toast = useToast();

  const load = () => {
    const p = new URLSearchParams({ status, rate_plan: plan, w9_missing: String(noW9) });
    if (q.trim()) p.set("q", q.trim());
    return aff.get<typeof data & object>(`/affiliates?${p}`).then(setData).catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, plan, noW9, q]);
  useEffect(() => { setAdd(!!adding); }, [adding]);

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <>
      <div className="ph">
        <div>
          <h1>Affiliates</h1>
          <p>Everyone in the program, with balance and rate.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => aff.save("/affiliates.csv", "affiliates.csv").catch((e) => toast.show(errorText(e)))}>
            <Icon name="download" />Export
          </button>
          <button className="btn pri" onClick={() => setAdd(true)}><Icon name="plus" />Add affiliate</button>
        </div>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <section className="card">
        <div className="filters">
          {STATUSES.map(([key, label]) => (
            <button key={key} className={`pill${status === key ? " on" : ""}`} aria-pressed={status === key} onClick={() => setStatus(key)}>
              {label}<Count n={key === "all" ? total : data?.counts[key] ?? 0} tone="mut" />
            </button>
          ))}
          <select className="select" style={{ width: 170 }} aria-label="Rate plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="all">Rate plan: all</option>
            {(data?.rate_plans ?? []).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <button className={`pill${noW9 ? " on" : ""}`} aria-pressed={noW9} onClick={() => setNoW9(!noW9)}><Icon name="file" size="s" />W-9 missing</button>
          <div className="ig"><Icon name="search" />
            <input className="input" type="search" placeholder="Search name, email or code" aria-label="Search affiliates"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {!data ? <div className="pad col">{[0, 1, 2].map((i) => <Skeleton key={i} h={52} />)}</div>
          : data.rows.length === 0 ? <div className="pad"><Empty icon="users" title="No affiliates here">Approve an application or add someone by hand.</Empty></div>
            : (
              <div className="tw">
                <table className="tbl stk">
                  <thead><tr><th>Affiliate</th><th>Code</th><th>Status</th><th>Rate</th><th className="num">Referred shops</th><th className="num">Payable</th><th>W-9</th><th>Joined</th><th /></tr></thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => go("affiliates", r.id)}>
                        <td className="ink" data-l="Affiliate">
                          <span className="row nw" style={{ gap: 10 }}>
                            <span className="av">{initials(r.name)}</span>
                            <span><span className="b">{r.name}</span><br /><span className="xs muted">{r.email}</span></span>
                          </span>
                        </td>
                        <td className="mono" data-l="Code">{r.code}</td>
                        <td data-l="Status"><span className="row nw" style={{ gap: 4 }}><StatusChip status={r.status} />{r.invited ? <Chip tone="mut">Invited</Chip> : null}</span></td>
                        <td data-l="Rate">{r.rate}</td>
                        <td className="num" data-l="Referred shops">{r.shops}</td>
                        <td className="num" data-l="Payable">
                          <b>{money(r.payable_cents)}</b>
                          {r.payable_note === "Under min" ? <> <Chip tone="mut">Under min</Chip></> : null}
                          {r.payable_note === "On hold" ? <> <Chip tone="warn">On hold {money(r.on_hold_cents)}</Chip></> : null}
                        </td>
                        <td data-l="W-9">{r.has_w9 ? <Chip tone="ok">On file</Chip> : <Chip tone="warn">Missing</Chip>}</td>
                        <td data-l="Joined">{day(r.joined)}</td>
                        <td className="tr"><Icon name="cr" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </section>
      {add ? <AddAffiliate onClose={() => { setAdd(false); if (adding) go("affiliates"); }}
                           onDone={(id) => { setAdd(false); toast.show("Added. The invite is on its way."); go("affiliates", id); }} /> : null}
      {toast.node}
    </>
  );
}

function AddAffiliate({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [form, setForm] = useState({ name: "", email: "", rate_plan_id: "", code: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    aff.get<{ rate_plans: RatePlan[] }>("/settings").then((s) => {
      setPlans(s.rate_plans);
      setForm((f) => ({ ...f, rate_plan_id: defaultPlanId(s.rate_plans) }));
    }).catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await aff.post<{ partner_id: string }>("/affiliates", { ...form, code: form.code || null });
      onDone(r.partner_id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Add affiliate" sub="Skips the application. They get an invite email." onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
             <button className="btn pri" disabled={busy || !form.name.trim() || !form.email.trim() || !form.reason.trim()} onClick={save}>Add and send invite</button></>}>
      <div className="g2">
        <Field label="Name" htmlFor="ad-name"><input id="ad-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email" htmlFor="ad-email"><input id="ad-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Rate plan" htmlFor="ad-plan">
          <select id="ad-plan" className="select" value={form.rate_plan_id} onChange={(e) => setForm({ ...form, rate_plan_id: e.target.value })}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.rate}</option>)}
          </select>
        </Field>
        <Field label="Code" htmlFor="ad-code">
          <input id="ad-code" className="input mono" placeholder="Auto" value={form.code} maxLength={20}
                 onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
        </Field>
      </div>
      <Field label="Reason, required" htmlFor="ad-why" error={error}>
        <textarea id="ad-why" className="area" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Saved in the activity log" />
      </Field>
    </Modal>
  );
}
