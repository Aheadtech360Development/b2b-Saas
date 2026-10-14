"use client";

import { useEffect, useRef, useState } from "react";

import { Banner, Chip, Field, Icon, Modal, Skeleton, Switch, errorText, useToast } from "@/components/partners/ui";
import { day, money, moneyShort } from "@/lib/partnerApi";
import { aff, type RatePlan } from "./api";

type Settings = {
  accepting_applications: boolean; accepting_referrals: boolean; earning: boolean; auto_approve: boolean; show_standard_rate: boolean;
  hold_days: number; minimum_payout_cents: number; cookie_days: number; return_window_days: number;
  commissionable_plans: string[]; support_email: string; captions: { title: string; text: string }[];
};
type Data = {
  settings: Settings;
  rate_plans: (RatePlan & { is_public: boolean; is_default: boolean })[];
  plans: { key: string; name: string; price_cents: number }[];
  terms: { version: number; clauses: { title: string; text: string }[]; changes: string | null; published_at: string } | null;
  assets: { id: string; title: string; width: number | null; height: number | null; mime: string; size_bytes: number; created_at: string }[];
};
type Tab = "program" | "rates" | "payout" | "terms" | "emails" | "assets";

const TABS: [Tab, string][] = [["program", "Program"], ["rates", "Rates and plans"], ["payout", "Payout rules"],
  ["terms", "Terms"], ["emails", "Emails"], ["assets", "Assets"]];

export function ProgramSettings() {
  const [tab, setTab] = useState<Tab>("program");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = () => aff.get<Data>("/settings").then(setData).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, []);

  async function save(changes: Partial<Settings> & { reason?: string }, done = "Saved") {
    try {
      const r = await aff.put<{ settings: Settings }>("/settings", changes);
      setData((d) => (d ? { ...d, settings: r.settings } : d));
      toast.show(done);
      return true;
    } catch (e) {
      toast.show(errorText(e));
      return false;
    }
  }

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!data) return <><Skeleton h={34} w={240} /><Skeleton h={360} /></>;
  const s = data.settings;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Program settings</h1>
          <p>Change any deal here. No developer needed. Rates apply to future lines only.</p>
        </div>
      </div>
      <section className="card">
        <div className="tabs" style={{ padding: "0 16px" }}>
          {TABS.map(([key, label]) => <button key={key} className={`tab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>{label}</button>)}
        </div>

        {tab === "program" ? (
          <>
            {([
              ["accepting_applications", "Accepting applications", "Off shows a closed message on the signup page."],
              ["accepting_referrals", "Accepting new referrals", "Off makes links show a not available page. Existing shops keep earning."],
              ["earning", "Earning", "Off stops new commission lines for everyone. Use rarely."],
              ["auto_approve", "Auto approve applications", "Skips the queue. Flagged applications still wait for you."],
              ["show_standard_rate", "Show the Standard rate on the signup page", "Preferred stays private."],
            ] as const).map(([key, title, text]) => (
              <div className="setrow" key={key}>
                <div className="l"><b>{title}</b><span>{text}</span></div>
                <div className="r"><Switch label={title} checked={s[key]} onChange={(v) => void save({ [key]: v })} /></div>
              </div>
            ))}
            <div className="setrow">
              <div className="l"><b>Commissionable plans</b><span>The Stripe prices that count. Add-ons, the Gang Sheet Builder commission and taxes never do.</span></div>
              <div className="r row" style={{ gap: 6 }}>
                {data.plans.map((p) => {
                  const on = s.commissionable_plans.includes(p.key);
                  return (
                    <button key={p.key} className={`pill${on ? " on" : ""}`} aria-pressed={on}
                            onClick={() => void save({ commissionable_plans: on ? s.commissionable_plans.filter((k) => k !== p.key) : [...s.commissionable_plans, p.key] })}>
                      {on ? <Icon name="check" size="s" /> : null}{p.name} {moneyShort(p.price_cents)}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        {tab === "rates" ? <RatesTab data={data} onChanged={() => { toast.show("Saved"); void load(); }} /> : null}
        {tab === "payout" ? <PayoutRules s={s} save={save} /> : null}
        {tab === "terms" ? <TermsTab data={data} onPublished={(v) => { toast.show(`Version ${v} published`); void load(); }} /> : null}
        {tab === "emails" ? <EmailsTab s={s} save={save} /> : null}
        {tab === "assets" ? <AssetsTab data={data} save={save} onChanged={() => void load()} toast={toast.show} /> : null}
      </section>
      {toast.node}
    </>
  );
}

function RatesTab({ data, onChanged }: { data: Data; onChanged: () => void }) {
  const [editing, setEditing] = useState<null | (RatePlan & { is_public: boolean }) | "new">(null);
  return (
    <div className="pad col">
      <p className="sm muted">A rate plan is what an affiliate is approved on. Changing a rate reaches only lines still to come: each line keeps the rate it was earned at. One plan can be shown on the program page.</p>
      <div className="tw">
        <table className="tbl">
          <thead><tr><th>Plan</th><th className="num">Rate</th><th>Shown on the program page</th><th>Example, one Scale shop</th><th /></tr></thead>
          <tbody>{data.rate_plans.map((p) => (
            <tr key={p.id}>
              <td className="ink">{p.name}{p.is_default ? <> <Chip tone="mut">Default</Chip></> : null}</td>
              <td className="num b">{p.rate ?? `${p.rate_bps / 100}%`}</td>
              <td>{p.is_public ? <Chip tone="ok">Shown</Chip> : <Chip tone="mut">Private</Chip>}</td>
              <td>{money(Math.round((49700 * p.rate_bps) / 10000))} a month</td>
              <td className="tr"><button className="btn sm" onClick={() => setEditing(p)}><Icon name="edit" size="s" />Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div><button className="btn sm" onClick={() => setEditing("new")}><Icon name="plus" size="s" />Add rate plan</button></div>
      {editing ? <RatePlanDialog plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChanged(); }} /> : null}
    </div>
  );
}

function RatePlanDialog({ plan, onClose, onDone }: { plan: (RatePlan & { is_public: boolean }) | null; onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState(plan?.name ?? "");
  const [pct, setPct] = useState(plan ? String(plan.rate_bps / 100) : "");
  const [isPublic, setPublic] = useState(plan?.is_public ?? false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const bps = Math.round(Number(pct) * 100);
    if (!Number.isFinite(bps) || bps < 0 || bps > 10000) { setError("A rate is from 0% to 100%."); return; }
    try {
      if (plan) await aff.put(`/rate-plans/${plan.id}`, { name, rate_bps: bps, is_public: isPublic, reason });
      else await aff.post("/rate-plans", { key, name, rate_bps: bps, is_public: false, reason });
      onDone();
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <Modal title={plan ? `Edit ${plan.name}` : "Add rate plan"} sub="Rates apply to future lines only." onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={!name.trim() || !pct || !reason.trim() || (!plan && !key)} onClick={save}>Save</button></>}>
      {!plan ? <Field label="Key" htmlFor="rp-key" hint="Lower case letters, numbers, - and _. It never changes.">
        <input id="rp-key" className="input mono" value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} /></Field> : null}
      <div className="g2">
        <Field label="Name" htmlFor="rp-name"><input id="rp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Rate" htmlFor="rp-pct"><span className="unit"><input id="rp-pct" className="input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /><i>%</i></span></Field>
      </div>
      {plan ? <label className="chk"><input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />Show this rate on the program page (only one plan is shown)</label> : null}
      <Field label="Reason, required" htmlFor="rp-why" error={error}><input id="rp-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

function PayoutRules({ s, save }: { s: Settings; save: (c: Partial<Settings> & { reason?: string }, done?: string) => Promise<boolean> }) {
  const [v, setV] = useState({ hold: String(s.hold_days), min: String(s.minimum_payout_cents / 100), cookie: String(s.cookie_days), back: String(s.return_window_days) });
  const [reason, setReason] = useState("");
  const rows: [keyof typeof v, string, string, string][] = [
    ["hold", "Hold", "Days a line waits before it is payable. Refunds inside the hold never reach a payout.", "days"],
    ["min", "Minimum payout", "Smaller balances roll over to the next batch.", "USD"],
    ["cookie", "Cookie window", "Days a click keeps a shop with the partner until it signs up.", "days"],
    ["back", "Return window", "A shop that cancels and pays again within this many days stays with its partner.", "days"],
  ];
  return (
    <>
      {rows.map(([k, title, text, unit]) => (
        <div className="setrow" key={k}>
          <div className="l"><b>{title}</b><span>{text}</span></div>
          <div className="r"><span className="unit"><input className="input" aria-label={title} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /><i>{unit}</i></span></div>
        </div>
      ))}
      <div className="pad row" style={{ alignItems: "flex-end" }}>
        <Field label="Reason, required" htmlFor="pr-why"><input id="pr-why" className="input" style={{ width: 320 }} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="btn pri" disabled={!reason.trim()} onClick={async () => {
          const ok = await save({ hold_days: Math.round(Number(v.hold)), minimum_payout_cents: Math.round(Number(v.min) * 100),
                                  cookie_days: Math.round(Number(v.cookie)), return_window_days: Math.round(Number(v.back)), reason });
          if (ok) setReason("");
        }}>Save payout rules</button>
      </div>
      <p className="pad sm muted" style={{ paddingTop: 0 }}>A new hold or minimum applies to lines earned from now on; lines already earned keep the payable date they were given.</p>
    </>
  );
}

function TermsTab({ data, onPublished }: { data: Data; onPublished: (v: number) => void }) {
  const [clauses, setClauses] = useState(data.terms?.clauses ?? []);
  const [changes, setChanges] = useState("");
  const [notify, setNotify] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = (data.terms?.version ?? 0) + 1;
  const edited = JSON.stringify(clauses) !== JSON.stringify(data.terms?.clauses ?? []);

  async function publish() {
    setError(null);
    try {
      const r = await aff.post<{ version: number }>("/terms", { clauses, changes, notify });
      setConfirm(false); setChanges(""); onPublished(r.version);
    } catch (e) { setError(errorText(e)); setConfirm(false); }
  }

  return (
    <div className="pad col">
      {data.terms ? (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className="sm">Live: <b className="ink">version {data.terms.version}</b>, published {day(data.terms.published_at, true)}.</p>
          <button className="btn sm" onClick={() => aff.save(`/terms/${data.terms!.version}.pdf`, `partner-terms-v${data.terms!.version}.pdf`)}><Icon name="download" size="s" />PDF</button>
        </div>
      ) : null}
      {clauses.some((c) => /\[[A-Z ]+\]/.test(c.text)) ? <Banner tone="warn" icon="alert">The terms still have a placeholder for your lawyer&apos;s text. Replace it before launch.</Banner> : null}
      {clauses.map((c, i) => (
        <div className="card pad-s col" key={i} style={{ gap: 8 }}>
          <div className="row nw">
            <span className="b ink">{i + 1}.</span>
            <input className="input" aria-label={`Clause ${i + 1} title`} value={c.title} onChange={(e) => setClauses(clauses.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <button className="btn ico sm" aria-label={`Remove clause ${i + 1}`} onClick={() => setClauses(clauses.filter((_, j) => j !== i))}><Icon name="trash" /></button>
          </div>
          <textarea className="area" aria-label={`Clause ${i + 1} text`} value={c.text} onChange={(e) => setClauses(clauses.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
        </div>
      ))}
      <div><button className="btn sm" onClick={() => setClauses([...clauses, { title: "", text: "" }])}><Icon name="plus" size="s" />Add clause</button></div>
      <Field label="What changed, required" htmlFor="tm-changes" hint="Shown to partners with the new version, and in their email.">
        <textarea id="tm-changes" className="area" value={changes} onChange={(e) => setChanges(e.target.value)} />
      </Field>
      <label className="chk"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email every active and paused partner to accept it</label>
      {error ? <span className="errt">{error}</span> : null}
      <div><button className="btn pri" disabled={!edited || !changes.trim() || clauses.some((c) => !c.text.trim())} onClick={() => setConfirm(true)}>Publish version {next}</button></div>
      <p className="xs muted">Partners must accept a new version to keep earning on referrals made after it. Commission already earned is never reduced.</p>
      {confirm ? (
        <Modal title={`Publish version ${next}?`} sub="It cannot be edited once published; a change is a new version." onClose={() => setConfirm(false)}
               footer={<><button className="btn" onClick={() => setConfirm(false)}>Cancel</button><button className="btn pri" onClick={publish}>Publish</button></>}>
          <p className="sm">{notify ? "Every active and paused partner gets an email asking them to accept it." : "No email goes out. Partners see it when they next sign in."}</p>
        </Modal>
      ) : null}
    </div>
  );
}

const EMAILS: [string, string][] = [
  ["Application received", "To the applicant, when they apply."],
  ["A question about your application", "When you request more information."],
  ["Welcome, set your password", "When an application is approved or an affiliate is added. The link works 7 days."],
  ["Application declined", "When you reject and choose to tell them."],
  ["New referral", "When a shop signs up through their link or code, if they kept it on."],
  ["You earned", "When a paid invoice makes a commission line, if they kept it on."],
  ["Payout recorded", "Always, with the statement attached."],
  ["Partner terms changed", "Always, when you publish a version and choose to tell them."],
  ["Account paused, suspended, ended or active again", "When you change their status and choose to tell them."],
  ["Reset your password", "When they ask for it. The link works one hour."],
];

function EmailsTab({ s, save }: { s: Settings; save: (c: Partial<Settings>, done?: string) => Promise<boolean> }) {
  const [support, setSupport] = useState(s.support_email);
  return (
    <div className="pad col">
      <Field label="Support email" htmlFor="em-support" hint="Shown on the sign in page, the program page and every partner email. Empty uses the platform's support address.">
        <div className="row nw">
          <input id="em-support" className="input" type="email" value={support} onChange={(e) => setSupport(e.target.value)} />
          <button className="btn" onClick={() => void save({ support_email: support.trim() })}>Save</button>
        </div>
      </Field>
      <h3>What partners are sent</h3>
      <p className="sm muted">Sent in the platform&apos;s own name, never a shop&apos;s. The wording is part of the product, so nothing about a partner&apos;s money can be changed by accident.</p>
      <div className="tw">
        <table className="tbl"><thead><tr><th>Email</th><th>When</th></tr></thead>
          <tbody>{EMAILS.map(([t, w]) => <tr key={t}><td className="ink">{t}</td><td className="wrap">{w}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function AssetsTab({ data, save, onChanged, toast }: { data: Data; save: (c: Partial<Settings>, done?: string) => Promise<boolean>; onChanged: () => void; toast: (t: string) => void }) {
  const [title, setTitle] = useState("");
  const [captions, setCaptions] = useState(data.settings.captions);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const made: string[] = [];
    data.assets.forEach((a) => {
      aff.objectUrl(`/assets/${a.id}`).then((u) => { made.push(u); setPreviews((p) => ({ ...p, [a.id]: u })); }).catch(() => undefined);
    });
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [data.assets]);

  async function upload(f: File) {
    const form = new FormData();
    form.append("title", title.trim() || f.name.replace(/\.[^.]+$/, ""));
    form.append("file", f);
    try { await aff.form("/assets", form); setTitle(""); toast("Banner added"); onChanged(); } catch (e) { toast(errorText(e)); }
  }

  async function remove(id: string) {
    try { await aff.del(`/assets/${id}`); toast("Banner removed"); onChanged(); } catch (e) { toast(errorText(e)); }
  }

  return (
    <div className="pad col">
      <h3>Banners</h3>
      <p className="sm muted">Partners download these from Link and assets. Kept with the program, not in a shop&apos;s media library. PNG, JPG, GIF or WebP, up to 3 MB.</p>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <Field label="Title" htmlFor="as-title"><input id="as-title" className="input" style={{ width: 280 }} placeholder="Social 1200 x 628" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
               onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        <button className="btn" onClick={() => file.current?.click()}><Icon name="upload" />Upload banner</button>
      </div>
      {data.assets.length ? (
        <div className="g3">{data.assets.map((a) => (
          <div className="card" key={a.id} style={{ overflow: "hidden" }}>
            <div className="imgph" style={{ borderRadius: 0, border: 0, minHeight: 110, padding: 0 }}>
              {previews[a.id] ? <img src={previews[a.id]} alt={a.title} style={{ maxWidth: "100%", maxHeight: 140 }} /> : "Loading"}
            </div>
            <div className="row pad-s" style={{ justifyContent: "space-between" }}>
              <div><div className="b ink sm">{a.title}</div><div className="xs muted">{a.width && a.height ? `${a.width} x ${a.height}, ` : ""}{Math.round(a.size_bytes / 1024)} KB</div></div>
              <button className="btn sm ico" aria-label={`Remove ${a.title}`} onClick={() => remove(a.id)}><Icon name="trash" /></button>
            </div>
          </div>
        ))}</div>
      ) : <p className="muted sm">No banners yet.</p>}

      <h3 style={{ marginTop: 12 }}>Captions</h3>
      <p className="sm muted">Partners copy these. Keep the commission disclosure in each, and [YOUR LINK] where their link goes.</p>
      {captions.map((c, i) => (
        <div className="card pad-s col" key={i} style={{ gap: 8 }}>
          <input className="input" aria-label={`Caption ${i + 1} title`} value={c.title} onChange={(e) => setCaptions(captions.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
          <textarea className="area" aria-label={`Caption ${i + 1} text`} value={c.text} onChange={(e) => setCaptions(captions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <div><button className="btn sm" onClick={() => setCaptions(captions.filter((_, j) => j !== i))}><Icon name="trash" size="s" />Remove</button></div>
        </div>
      ))}
      <div className="row">
        {captions.length < 6 ? <button className="btn sm" onClick={() => setCaptions([...captions, { title: "", text: "" }])}><Icon name="plus" size="s" />Add caption</button> : null}
        <button className="btn pri sm" onClick={() => void save({ captions }, "Captions saved")}>Save captions</button>
      </div>
    </div>
  );
}
