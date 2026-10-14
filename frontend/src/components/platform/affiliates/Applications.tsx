"use client";

import { useEffect, useMemo, useState } from "react";

import { Banner, Chip, Count, Empty, Field, Icon, Modal, Skeleton, errorText, useToast } from "@/components/partners/ui";
import { day, initials, money } from "@/lib/partnerApi";
import { aff } from "./api";
import type { Go } from "./AffiliatesTab";
import { Flags } from "./shared";

type Row = {
  id: string; name: string; email: string; business_name: string | null; website: string | null;
  promote_how: string | null; audience_size: string | null; flags: string[]; created_at: string;
  status: string; waiting_days: number | null;
};

const TABS: [string, string][] = [["waiting", "Waiting"], ["info_requested", "Info requested"],
  ["approved", "Approved"], ["rejected", "Rejected"]];

export function Applications({ go }: { go: Go }) {
  const [tab, setTab] = useState("waiting");
  const [flagged, setFlagged] = useState(false);
  const [old, setOld] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ rows: Row[]; counts: Record<string, number> } | null>(null);
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ tab, flagged: String(flagged) });
      if (q.trim()) p.set("q", q.trim());
      aff.get<{ rows: Row[]; counts: Record<string, number> }>(`/applications?${p}`).then(setData).catch((e) => setError(errorText(e)));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [tab, flagged, q]);

  useEffect(() => {
    aff.get<{ settings: { auto_approve: boolean } }>("/settings").then((s) => setAutoApprove(s.settings.auto_approve)).catch(() => undefined);
  }, []);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !old || (r.waiting_days ?? 0) > 2), [data, old]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Applications</h1>
          <p>People who applied on printcopilot.co/partners.</p>
        </div>
      </div>
      {autoApprove !== null ? (
        <Banner icon={autoApprove ? "zap" : "info"} action={<a className="btn sm" href="#affiliates/settings">Change</a>}>
          {autoApprove ? "Auto approve is on. Flagged applications still wait for you." : "Auto approve is off."}
        </Banner>
      ) : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <section className="card">
        <div className="tabs" style={{ padding: "0 16px" }}>
          {TABS.map(([key, label]) => (
            <button key={key} className={`tab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>
              {label}<Count n={data?.counts[key] ?? 0} tone={key === "waiting" ? "warn" : "mut"} />
            </button>
          ))}
        </div>
        <div className="filters">
          <div className="ig"><Icon name="search" />
            <input className="input" type="search" placeholder="Search applications" aria-label="Search applications"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className={`pill${flagged ? " on" : ""}`} aria-pressed={flagged} onClick={() => setFlagged(!flagged)}><Icon name="flag" size="s" />Flagged only</button>
          {tab === "waiting" ? (
            <button className={`pill${old ? " on" : ""}`} aria-pressed={old} onClick={() => setOld(!old)}><Icon name="clock" size="s" />Waiting over 2 days</button>
          ) : null}
        </div>
        {!data ? <div className="pad col">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
          : rows.length === 0 ? <div className="pad"><Empty icon="file" title="No applications here">New applications from the program page show up in Waiting.</Empty></div>
            : (
              <div className="tw">
                <table className="tbl stk">
                  <thead><tr><th>Applicant</th><th>Business</th><th>Website</th><th>How they promote</th><th>Applied</th><th>Flags</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="ink" data-l="Applicant">
                          <div>{r.name}</div><div className="xs muted">{r.email}</div>
                        </td>
                        <td data-l="Business">{r.business_name ?? <span className="muted">None given</span>}</td>
                        <td className="mono" data-l="Website">{r.website ?? ""}</td>
                        <td className="wrap" data-l="How they promote" style={{ maxWidth: 260 }}>{(r.promote_how ?? "").slice(0, 80)}{(r.promote_how ?? "").length > 80 ? "..." : ""}</td>
                        <td data-l="Applied">{day(r.created_at)} {r.waiting_days ? <span className="xs muted">{r.waiting_days} days</span> : <span className="xs muted">Today</span>}</td>
                        <td data-l="Flags"><Flags flags={r.flags} /></td>
                        <td className="tr"><button className="btn sm" onClick={() => go("applications", r.id)}>Review</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        <div className="tfoot">
          <span>{rows.length} {TABS.find((t) => t[0] === tab)?.[1].toLowerCase()}</span>
          <span>Each decision sends an email and writes to the activity log.</span>
        </div>
      </section>
    </>
  );
}

type Detail = Row & {
  partner_id: string | null; terms_version: number | null; terms_accepted_at: string | null;
  info_request: string | null; decided_by: string | null; decided_at: string | null; decision_reason: string | null;
  checks: { ok: boolean; words: string }[];
  notes: { at: string; actor_name: string; reason: string }[];
  rate_plans: { id: string; key: string; name: string; rate_bps: number; rate: string; examples: Record<string, number> }[];
  suggested_code: string | null;
};

const STATUS_CHIP: Record<string, { label: string; tone: "warn" | "info" | "ok" | "mut" }> = {
  waiting: { label: "Waiting", tone: "warn" }, info_requested: { label: "Info requested", tone: "info" },
  approved: { label: "Approved", tone: "ok" }, rejected: { label: "Rejected", tone: "mut" },
};

export function ApplicationDetail({ id, go, onChanged }: { id: string; go: Go; onChanged: () => void }) {
  const [app, setApp] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [dialog, setDialog] = useState<null | "approve" | "info" | "reject">(null);
  const toast = useToast();

  const load = () => aff.get<Detail>(`/applications/${id}`).then(setApp).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, [id]);

  async function saveNote() {
    try {
      await aff.post(`/applications/${id}/notes`, { note });
      setNote("");
      toast.show("Note saved");
      void load();
    } catch (e) {
      toast.show(errorText(e));
    }
  }

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!app) return <><Skeleton h={30} w={300} /><Skeleton h={320} /></>;
  const open = app.status === "waiting" || app.status === "info_requested";
  const chip = STATUS_CHIP[app.status];

  return (
    <>
      <div className="crumbs"><a href="#affiliates/applications">Applications</a><Icon name="cr" size="s" /><span>{app.name}</span></div>
      <div className="ph">
        <div className="row nw" style={{ gap: 14 }}>
          <span className="av l">{initials(app.name)}</span>
          <div>
            <h1>{app.name}</h1>
            <p>{app.business_name ? `${app.business_name}. ` : ""}Applied {day(app.created_at)}{open && app.waiting_days ? `, waiting ${app.waiting_days} days` : ""}.</p>
          </div>
        </div>
        {chip ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}
      </div>

      {app.flags.includes("existing_customer") ? (
        <Banner tone="warn" icon="flag">Existing PrintCoPilot customer. Approving is fine, but a shop of their own never earns them commission: it is held as a self referral.</Banner>
      ) : null}
      {app.flags.includes("duplicate_email") ? <Banner tone="warn" icon="flag">This email is already used by another affiliate or application.</Banner> : null}
      {app.flags.includes("spam") ? <Banner tone="bad" icon="alert">This application failed the spam check. It was not emailed and does not count as waiting long.</Banner> : null}
      {app.status === "info_requested" && app.info_request ? <Banner icon="mail">Asked: {app.info_request}</Banner> : null}
      {app.status === "rejected" && app.decision_reason ? <Banner icon="x">Rejected by {app.decided_by}: {app.decision_reason}</Banner> : null}

      <div className="split">
        <div className="col" style={{ gap: 24 }}>
          <section className="card">
            <div className="card-h"><h2>Application</h2><span className="sm muted">Terms version {app.terms_version ?? "none"}</span></div>
            <dl className="kv pad">
              <dt>Full name</dt><dd>{app.name}</dd>
              <dt>Email</dt><dd>{app.email}</dd>
              <dt>Business name</dt><dd>{app.business_name ?? "None given"}</dd>
              <dt>Website</dt><dd>{app.website ? <a href={app.website.startsWith("http") ? app.website : `https://${app.website}`} target="_blank" rel="noreferrer noopener">{app.website}</a> : "None given"}</dd>
              <dt>How they promote</dt><dd style={{ whiteSpace: "pre-wrap" }}>{app.promote_how}</dd>
              <dt>Audience size</dt><dd>{app.audience_size ?? "Not given"}</dd>
              <dt>Terms accepted</dt><dd>{app.terms_accepted_at ? `Version ${app.terms_version}, ${day(app.terms_accepted_at, true)}` : "No"}</dd>
              <dt>Spam check</dt><dd>{app.flags.includes("spam") ? <Chip tone="bad">Failed</Chip> : <Chip tone="ok">Passed</Chip>}</dd>
            </dl>
          </section>
          <section className="card">
            <div className="card-h"><h2>Internal notes</h2></div>
            <div className="pad col">
              {app.notes.map((n, i) => (
                <div key={i} className="opt" style={{ flexDirection: "column", gap: 4 }}>
                  <span className="sm" style={{ whiteSpace: "pre-wrap" }}>{n.reason}</span>
                  <span className="xs muted">{n.actor_name}, {day(n.at, true)}</span>
                </div>
              ))}
              <Field label="Add a note" htmlFor="ap-note">
                <textarea id="ap-note" className="area" placeholder="Only admins see this" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div><button className="btn sm" disabled={!note.trim()} onClick={saveNote}>Save note</button></div>
            </div>
          </section>
        </div>
        <div className="col" style={{ gap: 24 }}>
          {open ? (
            <section className="card pad col">
              <h2>Decision</h2>
              <button className="btn pri blk" onClick={() => setDialog("approve")}><Icon name="check" />Approve</button>
              <button className="btn blk" onClick={() => setDialog("info")}><Icon name="mail" />Request info</button>
              <button className="btn dng blk" onClick={() => setDialog("reject")}><Icon name="x" />Reject</button>
              <p className="sm muted">Approving sends an email invite with a link to set a password.</p>
            </section>
          ) : app.partner_id ? (
            <section className="card pad col">
              <h2>Approved</h2>
              <p className="sm muted">By {app.decided_by} on {day(app.decided_at, true)}.</p>
              <button className="btn blk" onClick={() => go("affiliates", app.partner_id!)}>Open the affiliate</button>
            </section>
          ) : null}
          <section className="card pad col" style={{ gap: 10 }}>
            <h3>Checks</h3>
            {app.checks.map((c, i) => (
              <div key={i} className="row nw sm" style={{ gap: 10, color: c.ok ? "var(--ok)" : "var(--warn)" }}>
                <Icon name={c.ok ? "check" : "alert"} size="s" /><span style={{ color: "var(--text)" }}>{c.words}</span>
              </div>
            ))}
          </section>
        </div>
      </div>

      {dialog === "approve" ? <ApproveDialog app={app} onClose={() => setDialog(null)}
        onDone={(partnerId) => { setDialog(null); onChanged(); toast.show("Approved"); go("affiliates", partnerId); }} /> : null}
      {dialog === "info" ? <AskDialog app={app} onClose={() => setDialog(null)}
        onDone={() => { setDialog(null); onChanged(); toast.show("Question sent"); void load(); }} /> : null}
      {dialog === "reject" ? <RejectDialog app={app} onClose={() => setDialog(null)}
        onDone={() => { setDialog(null); onChanged(); toast.show("Rejected"); void load(); }} /> : null}
      {toast.node}
    </>
  );
}

function ApproveDialog({ app, onClose, onDone }: { app: Detail; onClose: () => void; onDone: (partnerId: string) => void }) {
  const [planId, setPlanId] = useState(app.rate_plans.find((p) => p.key === "standard")?.id ?? app.rate_plans[0]?.id ?? "");
  const [code, setCode] = useState(app.suggested_code ?? "");
  const [invite, setInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = app.rate_plans.find((p) => p.id === planId);
  const total = plan ? Object.values(plan.examples).reduce((a, b) => a + b, 0) : 0;

  async function approve() {
    setBusy(true); setError(null);
    try {
      const r = await aff.post<{ partner_id: string }>(`/applications/${app.id}/approve`, { rate_plan_id: planId, code, send_invite: invite });
      onDone(r.partner_id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Approve ${app.name}`} sub={invite ? "Pick a rate plan. An invite email goes out right away." : "Pick a rate plan."} onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
             <button className="btn pri" disabled={busy || !planId} onClick={approve}>{invite ? "Approve and send invite" : "Approve"}</button></>}>
      <Field label="Rate plan" htmlFor="apv-plan">
        <select id="apv-plan" className="select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {app.rate_plans.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.rate}</option>)}
        </select>
      </Field>
      {plan ? (
        <div className="card pad-s" style={{ background: "var(--soft)" }}>
          <div className="eyebrow">One shop on each plan earns them</div>
          <p style={{ marginTop: 6 }}>Starter {money(plan.examples.starter)}, Wholesale {money(plan.examples.wholesale)}, Scale {money(plan.examples.scale)}</p>
          <p className="b ink" style={{ marginTop: 6 }}>{money(total)} a month</p>
        </div>
      ) : null}
      <Field label="Referral code" htmlFor="apv-code" hint="Letters and numbers. They can be asked to change it later.">
        <input id="apv-code" className="input mono" value={code} maxLength={20}
               onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
      </Field>
      <label className="chk"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />Send the invite email now</label>
      {app.flags.length ? (
        <Banner tone="warn" icon="flag">This applicant is flagged ({app.flags.map((f) => f.replace(/_/g, " ")).join(", ")}). Approving is logged with your name.</Banner>
      ) : null}
      {error ? <span className="errt">{error}</span> : null}
    </Modal>
  );
}

function AskDialog({ app, onClose, onDone }: { app: Detail; onClose: () => void; onDone: () => void }) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function send() {
    try {
      await aff.post(`/applications/${app.id}/request-info`, { question });
      onDone();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <Modal title={`Ask ${app.name.split(" ")[0]} a question`} sub="Emailed to the applicant. Their answer comes back to the platform inbox." onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={!question.trim()} onClick={send}>Send question</button></>}>
      <Field label="Question" htmlFor="ask-q" error={error}>
        <textarea id="ask-q" className="area" value={question} onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Which shops would you share PrintCoPilot with?" />
      </Field>
    </Modal>
  );
}

function RejectDialog({ app, onClose, onDone }: { app: Detail; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function reject() {
    try {
      await aff.post(`/applications/${app.id}/reject`, { reason, notify });
      onDone();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <Modal title={`Reject ${app.name}`} sub="The reason stays internal. The applicant only hears that they were not added." onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn dng fill" disabled={!reason.trim()} onClick={reject}>Reject</button></>}>
      <Field label="Reason, required" htmlFor="rj-why" error={error}>
        <textarea id="rj-why" className="area" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Saved in the activity log" />
      </Field>
      <label className="chk"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email the applicant</label>
    </Modal>
  );
}
