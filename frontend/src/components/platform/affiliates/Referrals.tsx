"use client";

import { useEffect, useMemo, useState } from "react";

import { ShopChip } from "@/components/partners/states";
import { Banner, Chip, Count, Drawer, Empty, Field, Icon, Modal, Skeleton, errorText, useToast } from "@/components/partners/ui";
import { day, money } from "@/lib/partnerApi";
import { aff } from "./api";
import type { Go } from "./AffiliatesTab";
import { Flags } from "./shared";

type Row = {
  id: string; shop_name: string; shop_tenant_id: string; partner_id: string; partner_name: string; plan: string | null;
  plan_name: string; state: string; source: "code" | "cookie" | "manual"; attributed_at: string; flags: string[];
  review: boolean; excluded: boolean;
  /** The end of the earning period the referral was made under; null earns for as long as the shop pays. */
  earn_until: string | null;
};
type Detail = Row & {
  owner_email: string | null; source_words: string; stripe_customer: string | null; held_lines: number; held_cents: number;
  message: string | null; decided_by: string | null; decision_reason: string | null;
};
type Who = { id: string; name: string; status: string };

const TABS: [string, string][] = [["all", "All"], ["review", "Review queue"], ["excluded", "Excluded"], ["manual", "Manual"]];
const SOURCE: Record<string, string> = { code: "Code", cookie: "Cookie", manual: "Manual" };

export function Referrals({ go, openId, onChanged }: { go: Go; openId?: string; onChanged: () => void }) {
  const [tab, setTab] = useState(openId === "review" ? "review" : "all");
  const [partner, setPartner] = useState("");
  const [plan, setPlan] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ rows: Row[]; counts: Record<string, number> } | null>(null);
  const [people, setPeople] = useState<Who[]>([]);
  const [open, setOpen] = useState<Detail | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    const p = new URLSearchParams({ tab });
    if (partner) p.set("partner_id", partner);
    if (plan) p.set("plan", plan);
    if (source) p.set("source", source);
    if (q.trim()) p.set("q", q.trim());
    return aff.get<{ rows: Row[]; counts: Record<string, number> }>(`/referrals?${p}`).then(setData).catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, partner, plan, source, q]);

  useEffect(() => {
    aff.get<{ rows: Who[] }>("/affiliates").then((r) => setPeople(r.rows)).catch(() => undefined);
  }, []);

  async function show(id: string) {
    try { setOpen(await aff.get<Detail>(`/referrals/${id}`)); } catch (e) { toast.show(errorText(e)); }
  }
  useEffect(() => {
    if (openId && openId !== "review") void show(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Referrals</h1>
          <p>Every referred shop, who it belongs to and how it got attributed.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => aff.save("/referrals.csv", "referrals.csv").catch((e) => toast.show(errorText(e)))}><Icon name="download" />Export</button>
          <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />Add by hand</button>
        </div>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <section className="card">
        <div className="tabs" style={{ padding: "0 16px" }}>
          {TABS.map(([key, label]) => (
            <button key={key} className={`tab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>
              {key === "review" ? <Icon name="flag" size="s" /> : null}{label}
              <Count n={data?.counts[key] ?? 0} tone={key === "review" ? "warn" : "mut"} />
            </button>
          ))}
        </div>
        <div className="filters">
          <div className="ig"><Icon name="search" />
            <input className="input" type="search" placeholder="Search shop or affiliate" aria-label="Search referrals" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" style={{ width: 190 }} aria-label="Affiliate" value={partner} onChange={(e) => setPartner(e.target.value)}>
            <option value="">Affiliate: all</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Plan: all</option><option value="starter">Starter</option><option value="wholesale">Wholesale</option><option value="scale">Scale</option>
          </select>
          <select className="select" style={{ width: 150 }} aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Source: all</option><option value="code">Code</option><option value="cookie">Cookie</option><option value="manual">Manual</option>
          </select>
        </div>
        {!data ? <div className="pad col">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
          : data.rows.length === 0 ? <div className="pad"><Empty icon="link" title="No referrals here">A shop that signs up with a partner&apos;s link or code shows here.</Empty></div>
            : (
              <div className="tw">
                <table className="tbl stk">
                  <thead><tr><th>Shop</th><th>Affiliate</th><th>Plan</th><th>Status</th><th>Source</th><th>Attributed</th><th>Flags</th></tr></thead>
                  <tbody>{data.rows.map((r) => (
                    <tr key={r.id} className={open?.id === r.id ? "sel" : ""} style={{ cursor: "pointer" }} onClick={() => show(r.id)}>
                      <td className="ink" data-l="Shop">{r.shop_name}</td>
                      <td data-l="Affiliate">{r.partner_name}</td>
                      <td data-l="Plan">{r.plan_name}</td>
                      <td data-l="Status">{r.excluded ? <Chip tone="mut">Excluded</Chip> : <ShopChip state={r.state} />}</td>
                      <td data-l="Source">{r.source === "manual" ? <Chip tone="mut">Manual</Chip> : SOURCE[r.source]}</td>
                      <td data-l="Attributed">{day(r.attributed_at)}</td>
                      <td data-l="Flags"><Flags flags={r.flags} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        <div className="tfoot">
          <span>Showing {data?.rows.length ?? 0} of {data?.counts.all ?? 0}. Flagged shops are listed first.</span>
          <span>Last valid click wins. A typed code beats a missing cookie.</span>
        </div>
      </section>

      {open ? <ReferralDrawer r={open} people={people} onClose={() => setOpen(null)} go={go}
                              onDone={(msg) => { setOpen(null); toast.show(msg); onChanged(); void load(); }} /> : null}
      {adding ? <AddReferral people={people} onClose={() => setAdding(false)}
                             onDone={() => { setAdding(false); toast.show("Referral added"); setTab("manual"); void load(); }} /> : null}
      {toast.node}
    </>
  );
}

function ReferralDrawer({ r, people, onClose, onDone, go }: { r: Detail; people: Who[]; onClose: () => void; onDone: (msg: string) => void; go: Go }) {
  const flagged = r.flags.includes("self_referral") || r.flags.includes("domain_match");
  const [decision, setDecision] = useState<"exclude" | "reassign" | "clear">(flagged ? "exclude" : "reassign");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const others = useMemo(() => people.filter((p) => p.id !== r.partner_id && p.status !== "terminated"), [people, r.partner_id]);

  async function apply(kind: "exclude" | "reassign" | "clear" | "note") {
    setError(null);
    try {
      await aff.post(`/referrals/${r.id}/decision`, { decision: kind, reason, new_partner_id: kind === "reassign" ? to : null });
      onDone(kind === "note" ? "Note saved" : kind === "exclude" ? "Excluded from commission" : kind === "reassign" ? "Reassigned" : "Flag cleared, lines released");
    } catch (e) { setError(errorText(e)); }
  }

  const options: { key: "exclude" | "reassign" | "clear"; title: string; text: string; show: boolean }[] = [
    { key: "exclude", title: "Exclude from commission", text: "Shop stays attributed, no commission. Its lines not yet paid or in a payout batch are voided.", show: !r.excluded },
    { key: "reassign", title: "Reassign affiliate", text: "Move the shop to someone else. Future lines follow.", show: true },
    { key: "clear", title: "Not a self referral", text: "Clear the flag and release the held lines.", show: flagged || r.review },
  ];

  return (
    <Drawer title={r.shop_name} onClose={onClose}
            chips={<><Chip>{r.plan_name}</Chip>{r.excluded ? <Chip tone="mut">Excluded</Chip> : <ShopChip state={r.state} />}
              {r.flags.includes("self_referral") ? <Chip tone="bad">Self referral</Chip> : null}
              {r.flags.includes("domain_match") ? <Chip tone="warn">Domain match</Chip> : null}</>}
            footer={<><button className="btn" disabled={!reason.trim()} onClick={() => apply("note")}>Add note only</button>
              <button className="btn pri" disabled={!reason.trim() || (decision === "reassign" && !to)} onClick={() => apply(decision)}>Apply decision</button></>}>
      {r.message ? <Banner tone="bad" icon="flag">{r.message}</Banner> : null}
      {r.decision_reason ? <Banner icon="info">Last decision by {r.decided_by}: {r.decision_reason}</Banner> : null}
      <dl className="kv">
        <dt>Affiliate</dt><dd><a href={`#affiliates/affiliates/${r.partner_id}`} onClick={(e) => { e.preventDefault(); go("affiliates", r.partner_id); }}>{r.partner_name}</a></dd>
        <dt>Source</dt><dd>{r.source_words}</dd>
        <dt>Attributed</dt><dd>{day(r.attributed_at, true)}</dd>
        {r.earn_until ? <><dt>Earns until</dt><dd>{day(r.earn_until, true)}</dd></> : null}
        <dt>Owner email</dt><dd>{r.owner_email ?? "Unknown"}</dd>
        <dt>Stripe customer</dt><dd className="mono">{r.stripe_customer ?? "None yet"}</dd>
        <dt>Held lines</dt><dd>{r.held_lines ? `${r.held_lines} line${r.held_lines === 1 ? "" : "s"}, ${money(r.held_cents)}` : "None"}</dd>
      </dl>
      <div className="col" style={{ gap: 10 }}>
        <span className="lbl">Decision</span>
        {options.filter((o) => o.show).map((o) => (
          <label key={o.key} className={`opt${decision === o.key ? " on" : ""}`}>
            <input type="radio" name="decision" checked={decision === o.key} onChange={() => setDecision(o.key)} />
            <span><b className="ink">{o.title}</b><br /><span className="sm muted">{o.text}</span></span>
          </label>
        ))}
        {decision === "reassign" ? (
          <Field label="New affiliate" htmlFor="rf-to">
            <select id="rf-to" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose an affiliate</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        ) : null}
      </div>
      <Field label={<>Reason <span className="chip bad" style={{ height: 20 }}>Required</span></>} htmlFor="rf-why" error={error}>
        <textarea id="rf-why" className="area" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Saved in the activity log" />
      </Field>
    </Drawer>
  );
}

function AddReferral({ people, onClose, onDone }: { people: Who[]; onClose: () => void; onDone: () => void }) {
  const [partnerId, setPartnerId] = useState("");
  const [q, setQ] = useState("");
  const [shops, setShops] = useState<{ id: string; name: string; slug: string; referred: boolean }[]>([]);
  const [shop, setShop] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setShops([]); return; }
    const t = setTimeout(() => {
      aff.get<typeof shops>(`/shops?q=${encodeURIComponent(q.trim())}`).then(setShops).catch(() => setShops([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function save() {
    try {
      await aff.post("/referrals", { partner_id: partnerId, shop_tenant_id: shop, reason });
      onDone();
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <Modal title="Add a referral by hand" sub="For a shop whose link or code was missed. It is flagged as added by admin." onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
             <button className="btn pri" disabled={!partnerId || !shop || !reason.trim()} onClick={save}>Add referral</button></>}>
      <Field label="Affiliate" htmlFor="ar-p">
        <select id="ar-p" className="select" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">Choose an affiliate</option>
          {people.filter((p) => p.status !== "terminated").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Shop" htmlFor="ar-q" hint="Type at least two letters of the shop's name or address.">
        <input id="ar-q" className="input" value={q} onChange={(e) => { setQ(e.target.value); setShop(""); }} />
      </Field>
      {shops.length ? (
        <div className="col" style={{ gap: 6 }}>
          {shops.map((s) => (
            <label key={s.id} className={`opt${shop === s.id ? " on" : ""}`} style={{ padding: "10px 12px", opacity: s.referred ? 0.6 : 1 }}>
              <input type="radio" name="shop" disabled={s.referred} checked={shop === s.id} onChange={() => setShop(s.id)} />
              <span><b className="ink">{s.name}</b> <span className="xs muted">{s.slug}{s.referred ? ", already referred" : ""}</span></span>
            </label>
          ))}
        </div>
      ) : null}
      <Field label="Reason, required" htmlFor="ar-why" error={error}>
        <textarea id="ar-why" className="area" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Saved in the activity log" />
      </Field>
    </Modal>
  );
}
