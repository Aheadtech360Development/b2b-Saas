"use client";

/**
 * Gift cards (api/v1/gift_cards.py, Retail launch package 3): every card the
 * shop sold or gave, with its balance and history, the report (sold,
 * redeemed, still owed) and the shop's settings.
 *
 * A code is shown in full once, when the card is issued or given a new code,
 * and never again: only its last 4 are kept. Every change of balance asks for
 * a reason and is a row in the card's history.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Copy, Plus, Search, Settings2, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ask, askText } from "@/lib/dialog";
import { MarketingFrame } from "@/components/admin/marketing/MarketingFrame";

interface Card {
  id: string;
  last4: string;
  masked: string;
  initial_amount: number;
  balance: number;
  status: "active" | "disabled" | "voided" | "expired";
  status_reason: string | null;
  source: "purchase" | "manual" | "store_credit";
  expires_at: string | null;
  purchase_order_id: string | null;
  buyer_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  sender_name: string | null;
  message: string | null;
  note: string | null;
  delivered_at: string | null;
  created_at: string | null;
}

interface LedgerRow {
  id: string;
  kind: string;
  amount: number;
  balance_after: number;
  order_id: string | null;
  order_number: string | null;
  actor_name: string | null;
  reason: string | null;
  created_at: string | null;
}

interface CardDetail extends Card {
  purchase_order_number: string | null;
  held: number;
  ledger: LedgerRow[];
  ledger_matches: boolean;
}

interface Report {
  sold: number;
  issued_by_shop: number;
  store_credit: number;
  redeemed: number;
  refunded_to_cards: number;
  held_at_checkout: number;
  outstanding: number;
  cards: Record<string, number>;
}

interface Settings {
  enabled: boolean;
  amounts: number[];
  custom: boolean;
  custom_min: number;
  custom_max: number;
  expiry_months: number;
  message: string;
  expiry_choices?: number[];
  max_amount?: number;
}

const PAGE_SIZE = 50;
const money = (n: number) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
const STATUS: Record<Card["status"], [string, string | undefined]> = {
  active: ["Active", "green"], disabled: ["Disabled", "amber"], voided: ["Voided", undefined], expired: ["Expired", undefined],
};
const SOURCE: Record<Card["source"], string> = { purchase: "Bought", manual: "Given by the shop", store_credit: "Store credit" };
const KIND: Record<string, string> = {
  issue: "Issued", hold: "Set aside at checkout", release: "Given back", capture: "Spent on an order",
  refund: "Refunded onto the card", adjust: "Adjusted", void: "Voided", expire: "Expired",
};
const EXPIRY: Record<number, string> = { 0: "Never", 60: "After 5 years", 84: "After 7 years", 120: "After 10 years" };
const newRequest = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

export default function GiftCardsPage() {
  return <Suspense fallback={null}><GiftCards /></Suspense>;
}

type Panel = null | { kind: "new" } | { kind: "card"; id: string } | { kind: "settings" } | { kind: "code"; code: string; card: Card; emailed: boolean };

function GiftCards() {
  const [rows, setRows] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qText, setQText] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [flash, setFlash] = useState("");
  const asked = useRef(0);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const [list, rep] = await Promise.all([
        apiClient.get<{ items: Card[]; total: number }>(`/api/v1/admin/gift-cards?${params}`),
        apiClient.get<Report>("/api/v1/admin/gift-cards/report"),
      ]);
      if (mine !== asked.current) return;
      setRows(list.items ?? []); setTotal(list.total ?? 0); setReport(rep); setFailed(false);
    } catch {
      if (mine === asked.current) { setRows([]); setFailed(true); }
    } finally {
      if (mine === asked.current) setLoading(false);
    }
  }, [page, q, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiClient.get<Settings>("/api/v1/admin/gift-cards/settings").then(setSettings).catch(() => setSettings(null));
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => { setPage(1); setQ(qText.trim()); }, 300);
    return () => window.clearTimeout(t);
  }, [qText]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const openId = panel?.kind === "card" ? panel.id : null;

  return (
    <MarketingFrame
      active="gift-cards" title="Gift cards" sub="Cards your shop sold or gave, what is left on each, and what you still owe."
      actions={<>
        <button type="button" className="pc-btn" onClick={() => setPanel({ kind: "settings" })}><Settings2 size={17} strokeWidth={2.2} /> Settings</button>
        <button type="button" className="pc-btn" data-kind="primary" onClick={() => setPanel({ kind: "new" })}><Plus size={17} strokeWidth={2.4} /> Issue gift card</button>
      </>}
    >
      {flash && (
        <div className="pc-flash" role="status">
          <span>{flash}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash("")} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}

      {settings && !settings.enabled && (
        <div className="pc-note" data-tone="blue" style={{ marginBottom: "14px" }}>
          Gift cards are not on sale in your shop. Cards you have already given still work at checkout.{" "}
          <button type="button" className="pc-link" onClick={() => setPanel({ kind: "settings" })}>Turn on sales</button>
        </div>
      )}

      {report && (
        <div className="pc-stats2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginBottom: "14px" }} data-gift-report>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{money(report.sold)}</div><div className="pc-stat4-l">Sold</div>
            {report.issued_by_shop + report.store_credit > 0 && <div className="pc-stat4-s">{money(report.issued_by_shop + report.store_credit)} given by the shop</div>}</div>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{money(report.redeemed)}</div><div className="pc-stat4-l">Spent on orders</div>
            {report.refunded_to_cards > 0 && <div className="pc-stat4-s">{money(report.refunded_to_cards)} refunded back onto cards</div>}</div>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{money(report.outstanding)}</div><div className="pc-stat4-l">Still owed</div>
            <div className="pc-stat4-s">What is left on active and disabled cards</div></div>
          {report.held_at_checkout > 0 && (
            <div className="pc-card pc-stat4"><div className="pc-stat4-v">{money(report.held_at_checkout)}</div><div className="pc-stat4-l">Set aside at checkout</div>
              <div className="pc-stat4-s">Buyers paying right now</div></div>
          )}
        </div>
      )}

      <div className="pc-filters">
        <label className="pc-field" style={{ flex: 1 }}>
          <Search size={17} strokeWidth={2} />
          <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search by code, last 4 or email" aria-label="Search gift cards" />
        </label>
        <select className="pc-input" style={{ width: "auto" }} value={status} aria-label="Status"
          onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="voided">Voided</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      <div className="pc-list" data-panel={panel ? "" : undefined}>
        <div style={{ display: "grid", gap: "14px", minWidth: 0 }}>
          <div className="pc-card" aria-busy={loading} data-gift-cards={loading ? undefined : rows.length}>
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "680px" }}>
                <thead>
                  <tr><th>Card</th><th>Balance</th><th>Status</th><th>How</th><th>For</th><th>Issued</th></tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 && [0, 1, 2].map((i) => (
                    <tr key={i}><td colSpan={6}><div className="at-skel" style={{ height: "18px", width: `${66 - i * 10}%`, borderRadius: "6px" }} /></td></tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={6} className="pc-empty">
                      {failed ? "The gift cards could not be loaded. Reload to try again." : q || status ? "No gift card matches." : "No gift cards yet."}
                    </td></tr>
                  )}
                  {rows.map((c) => {
                    const [label, tone] = STATUS[c.status];
                    return (
                      <tr key={c.id} data-href tabIndex={0} data-card={c.last4} data-open={openId === c.id ? "" : undefined}
                        onClick={() => setPanel(openId === c.id ? null : { kind: "card", id: c.id })}
                        onKeyDown={(e) => { if (e.key === "Enter") setPanel({ kind: "card", id: c.id }); }}>
                        <td style={{ fontWeight: 700, letterSpacing: ".04em", whiteSpace: "nowrap" }}>{c.masked}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{money(c.balance)}
                          <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>of {money(c.initial_amount)}</div></td>
                        <td><span className="pc-pill" data-tone={tone} style={{ textTransform: "none" }}>{label}</span></td>
                        <td style={{ whiteSpace: "nowrap" }}>{SOURCE[c.source]}</td>
                        <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.recipient_name || c.recipient_email || <span style={{ color: "var(--pc-muted)" }}>Not named</span>}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{day(c.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pc-table-foot">
              <span>{total} {total === 1 ? "card" : "cards"}</span>
              {pages > 1 ? (
                <span className="pc-row-actions">
                  <button type="button" className="pc-link" disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ opacity: page <= 1 ? 0.4 : 1 }}>Previous</button>
                  <span>Page {page} of {pages}</span>
                  <button type="button" className="pc-link" disabled={page >= pages} onClick={() => setPage(page + 1)} style={{ opacity: page >= pages ? 0.4 : 1 }}>Next</button>
                </span>
              ) : <span>Click a card to see its history</span>}
            </div>
          </div>
        </div>

        {panel?.kind === "new" && (
          <IssuePanel onClose={() => setPanel(null)} onIssued={(r) => { setPanel({ kind: "code", ...r }); load(); }} />
        )}
        {panel?.kind === "code" && (
          <CodePanel code={panel.code} card={panel.card} emailed={panel.emailed} onClose={() => setPanel({ kind: "card", id: panel.card.id })} />
        )}
        {panel?.kind === "card" && (
          <CardPanel id={panel.id} onClose={() => setPanel(null)} onChanged={(msg) => { setFlash(msg); load(); }}
            onNewCode={(r) => { setPanel({ kind: "code", ...r }); load(); }} />
        )}
        {panel?.kind === "settings" && settings && (
          <SettingsPanel settings={settings} onClose={() => setPanel(null)}
            onSaved={(s) => { setSettings(s); setFlash(s.enabled ? "Gift cards are on sale in your shop." : "Gift card sales are off. Cards already out still work."); }} />
        )}
      </div>
    </MarketingFrame>
  );
}

function PanelHead({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div className="pc-panel-head">
      <div style={{ minWidth: 0 }}>
        <h2 className="pc-h2">{title}</h2>
        {sub && <div className="pc-sub-line">{sub}</div>}
      </div>
      <button type="button" className="pc-x" aria-label="Close the panel" onClick={onClose}><X size={19} strokeWidth={2.2} /></button>
    </div>
  );
}

function IssuePanel({ onClose, onIssued }: { onClose: () => void; onIssued: (r: { code: string; card: Card; emailed: boolean }) => void }) {
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [send, setSend] = useState(false);
  const [credit, setCredit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One per press: a double click or a retry issues one card.
  const request = useRef(newRequest());

  async function issue() {
    const value = Number(amount);
    if (!(value > 0)) { setError("Enter the amount, for example 25."); return; }
    if (send && !email.trim()) { setError("Enter the email address to send it to."); return; }
    setBusy(true); setError("");
    try {
      const r = await apiClient.post<{ card: Card; code: string; emailed: boolean }>("/api/v1/admin/gift-cards", {
        amount: value, recipient_name: name.trim() || null, recipient_email: email.trim() || null,
        message: message.trim() || null, note: note.trim() || null, send_email: send,
        source: credit ? "store_credit" : "manual", request_id: request.current,
      });
      onIssued(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The gift card could not be issued.");
      request.current = newRequest();
    }
    setBusy(false);
  }

  return (
    <aside className="pc-panel" aria-label="Issue a gift card" data-issue-panel>
      <PanelHead title="Issue a gift card" sub="A card you give: a prize, an apology, store credit." onClose={onClose} />
      <form className="pc-panel-body" onSubmit={(e) => { e.preventDefault(); issue(); }}>
        {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
        <div>
          <label className="pc-label" htmlFor="gc-amount">Amount ($)</label>
          <input id="gc-amount" className="pc-input" type="number" inputMode="decimal" min="1" step="0.01" value={amount}
            placeholder="25.00" onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="pc-form2">
          <div>
            <label className="pc-label" htmlFor="gc-name">For (name)</label>
            <input id="gc-name" className="pc-input" value={name} maxLength={120} placeholder="Optional" onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="pc-label" htmlFor="gc-email">Their email</label>
            <input id="gc-email" className="pc-input" type="email" value={email} maxLength={254} placeholder="Optional" onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="pc-label" htmlFor="gc-msg">Message to them</label>
          <textarea id="gc-msg" className="pc-input" rows={3} maxLength={500} value={message} placeholder="Optional, in the email"
            onChange={(e) => setMessage(e.target.value)} style={{ height: "auto", paddingTop: "10px" }} />
        </div>
        <div>
          <label className="pc-label" htmlFor="gc-note">Note for your team</label>
          <input id="gc-note" className="pc-input" value={note} maxLength={500} placeholder="Why it was given" onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="pc-switch-row">
          <span>Email the code to them<div className="pc-sub-line" style={{ fontSize: "12.5px", fontWeight: 400 }}>In your shop&apos;s name, with the message.</div></span>
          <button type="button" className="pc-switch" role="switch" aria-label="Email the code" aria-checked={send} data-on={send ? "" : undefined} onClick={() => setSend(!send)} />
        </div>
        <div className="pc-switch-row">
          <span>Store credit<div className="pc-sub-line" style={{ fontSize: "12.5px", fontWeight: 400 }}>For a return or a refund, counted apart in the report.</div></span>
          <button type="button" className="pc-switch" role="switch" aria-label="Store credit" aria-checked={credit} data-on={credit ? "" : undefined} onClick={() => setCredit(!credit)} />
        </div>
        <button type="submit" className="pc-btn" data-kind="primary" data-block="" disabled={busy} style={{ height: "46px" }}>
          {busy ? "Issuing…" : "Issue gift card"}
        </button>
        <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>The code is shown once, on the next screen. Keep it or send it: it cannot be seen again.</div>
      </form>
    </aside>
  );
}

function CodePanel({ code, card, emailed, onClose }: { code: string; card: Card; emailed: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <aside className="pc-panel" aria-label="The gift card's code" data-code-panel>
      <PanelHead title={`${money(card.balance)} gift card`} sub={emailed ? `Emailed to ${card.recipient_email}` : "Not emailed"} onClose={onClose} />
      <div className="pc-panel-body">
        <div className="pc-note" data-tone="amber">This is the only time the full code is shown. Copy it now if you need it.</div>
        <div style={{ border: "1px dashed var(--pc-line, #CBD5E1)", borderRadius: "10px", padding: "18px", textAlign: "center" }}>
          <div className="pc-sub-line" style={{ fontSize: "12.5px", marginBottom: "6px" }}>Gift card code</div>
          <div data-full-code style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: "21px", fontWeight: 700, letterSpacing: "2px", wordBreak: "break-all" }}>{code}</div>
        </div>
        <button type="button" className="pc-btn" data-block="" onClick={async () => {
          try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); }
        }}><Copy size={16} strokeWidth={2.2} /> {copied ? "Copied" : "Copy code"}</button>
        <button type="button" className="pc-btn" data-kind="primary" data-block="" onClick={onClose}>Done</button>
      </div>
    </aside>
  );
}

function CardPanel({ id, onClose, onChanged, onNewCode }: {
  id: string; onClose: () => void; onChanged: (msg: string) => void;
  onNewCode: (r: { code: string; card: Card; emailed: boolean }) => void;
}) {
  const [card, setCard] = useState<CardDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setCard(await apiClient.get<CardDetail>(`/api/v1/admin/gift-cards/${id}`)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "The gift card could not be loaded."); }
  }, [id]);
  useEffect(() => { setCard(null); load(); }, [load]);

  async function act(run: () => Promise<unknown>, done: string) {
    setBusy(true); setError("");
    try { await run(); await load(); onChanged(done); }
    catch (e) { setError(e instanceof Error ? e.message : "That did not work. Try again."); }
    setBusy(false);
  }

  async function adjust() {
    const raw = await askText("How much to add? Use a minus to take off, for example -5.", "", { title: "Adjust the balance", ok: "Next", placeholder: "10.00" });
    if (raw == null) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value === 0) { setError("Enter an amount, like 10 or -5."); return; }
    const reason = await askText("Why? It is kept in the card's history.", "", { title: "Reason", ok: value > 0 ? `Add ${money(value)}` : `Take off ${money(-value)}`, placeholder: "Goodwill, a mistake…" });
    if (!reason?.trim()) return;
    await act(() => apiClient.post(`/api/v1/admin/gift-cards/${id}/adjust`, { amount: value, reason: reason.trim(), request_id: newRequest() }),
      value > 0 ? `Added ${money(value)}.` : `Took off ${money(-value)}.`);
  }

  async function setStatus(status: "active" | "disabled" | "voided") {
    const words = status === "voided"
      ? { title: "Void this gift card", ok: "Void", q: `Its ${money(card?.balance ?? 0)} goes to zero for good and the code stops working. Why?` }
      : status === "disabled"
        ? { title: "Disable this gift card", ok: "Disable", q: "The code stops working until you turn it back on; the balance is kept. Why?" }
        : { title: "Turn this gift card back on", ok: "Turn on", q: "Why?" };
    const reason = await askText(words.q, "", { title: words.title, ok: words.ok, danger: status === "voided", placeholder: "Reported lost, fraud, found again…" });
    if (!reason?.trim()) return;
    await act(() => apiClient.post(`/api/v1/admin/gift-cards/${id}/status`, { status, reason: reason.trim() }),
      status === "voided" ? "The gift card is voided." : status === "disabled" ? "The gift card is disabled." : "The gift card is on again.");
  }

  async function resend() {
    if (!card) return;
    if (!await ask(`Send ${card.recipient_email} a new code? The old code stops working; the balance stays on the card.`,
      { title: "Send a new code", ok: "Send new code" })) return;
    setBusy(true); setError("");
    try {
      const r = await apiClient.post<{ code: string; card: Card; emailed: boolean }>(`/api/v1/admin/gift-cards/${id}/resend`, {});
      onNewCode(r);
    } catch (e) { setError(e instanceof Error ? e.message : "A new code could not be sent."); }
    setBusy(false);
  }

  if (!card) {
    return (
      <aside className="pc-panel" aria-label="Gift card">
        <PanelHead title="Gift card" onClose={onClose} />
        <div className="pc-panel-body">{error ? <div className="pc-note" data-tone="red">{error}</div> : <div className="at-skel" style={{ height: "120px", borderRadius: "8px" }} />}</div>
      </aside>
    );
  }
  const [label, tone] = STATUS[card.status];
  const open = card.status === "active" || card.status === "disabled";
  return (
    <aside className="pc-panel" aria-label={`Gift card ${card.masked}`} data-card-panel={card.last4}>
      <PanelHead title={card.masked} sub={`${SOURCE[card.source]} · issued ${day(card.created_at)}`} onClose={onClose} />
      <div className="pc-panel-body">
        {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "28px", fontWeight: 700 }} data-balance>{money(card.balance)}</div>
          <div className="pc-sub-line">of {money(card.initial_amount)}</div>
          <span className="pc-pill" data-tone={tone} style={{ textTransform: "none", marginLeft: "auto" }}>{label}</span>
        </div>
        {card.held > 0 && <div className="pc-note" data-tone="blue">{money(card.held)} is set aside by a checkout in progress.</div>}
        {card.status_reason && card.status !== "active" && <div className="pc-sub-line">Why: {card.status_reason}</div>}
        {!card.ledger_matches && <div className="pc-note" data-tone="red">This card&apos;s history does not add up to its balance. Tell support.</div>}
        <dl className="pc-kv" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: "14px" }}>
          {card.recipient_name && <><dt className="pc-sub-line">For</dt><dd style={{ margin: 0 }}>{card.recipient_name}</dd></>}
          {card.recipient_email && <><dt className="pc-sub-line">Email</dt><dd style={{ margin: 0, wordBreak: "break-all" }}>{card.recipient_email}
            <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{card.delivered_at ? `Emailed ${day(card.delivered_at)}` : "Not emailed yet"}</div></dd></>}
          {card.buyer_email && <><dt className="pc-sub-line">Bought by</dt><dd style={{ margin: 0, wordBreak: "break-all" }}>{card.buyer_email}</dd></>}
          {card.purchase_order_number && <><dt className="pc-sub-line">Order</dt><dd style={{ margin: 0 }}>
            <a className="pc-link" href={`/admin/orders/${card.purchase_order_id}`}>#{card.purchase_order_number}</a></dd></>}
          <dt className="pc-sub-line">Expires</dt><dd style={{ margin: 0 }}>{card.expires_at ? day(card.expires_at) : "Never"}</dd>
          {card.note && <><dt className="pc-sub-line">Note</dt><dd style={{ margin: 0 }}>{card.note}</dd></>}
        </dl>
        {card.message && <div className="pc-note" style={{ whiteSpace: "pre-wrap" }}>{card.message}</div>}

        {open && (
          <div style={{ display: "grid", gap: "8px" }}>
            <button type="button" className="pc-btn" data-block="" disabled={busy} onClick={adjust}>Adjust balance</button>
            {card.recipient_email && card.status === "active" && (
              <button type="button" className="pc-btn" data-block="" disabled={busy} onClick={resend}>Send a new code</button>
            )}
            {card.status === "active"
              ? <button type="button" className="pc-btn" data-block="" disabled={busy} onClick={() => setStatus("disabled")}>Disable</button>
              : <button type="button" className="pc-btn" data-block="" disabled={busy} onClick={() => setStatus("active")}>Turn back on</button>}
            <button type="button" className="pc-btn" data-block="" data-kind="danger" disabled={busy} onClick={() => setStatus("voided")}>Void</button>
          </div>
        )}

        <div>
          <div className="pc-label" style={{ marginBottom: "8px" }}>History</div>
          <div style={{ display: "grid", gap: "10px" }} data-ledger={card.ledger.length}>
            {card.ledger.map((r) => (
              <div key={r.id} style={{ borderBottom: "1px solid var(--pc-line, #E3E8EF)", paddingBottom: "8px" }} data-kind={r.kind}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <strong style={{ fontSize: "14px" }}>{KIND[r.kind] ?? r.kind}</strong>
                  <span style={{ fontWeight: 600, color: r.amount < 0 ? "var(--pc-red, #B42318)" : r.amount > 0 ? "var(--pc-green, #067647)" : undefined }}>
                    {r.amount > 0 ? "+" : r.amount < 0 ? "−" : ""}{money(Math.abs(r.amount))}
                  </span>
                </div>
                <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>
                  {day(r.created_at)} · balance {money(r.balance_after)}
                  {r.order_number && <> · order <a className="pc-link" href={`/admin/orders/${r.order_id}`}>#{r.order_number}</a></>}
                  {r.actor_name && <> · {r.actor_name}</>}
                </div>
                {r.reason && r.reason !== KIND[r.kind] && <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{r.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SettingsPanel({ settings, onClose, onSaved }: { settings: Settings; onClose: () => void; onSaved: (s: Settings) => void }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [amounts, setAmounts] = useState(settings.amounts.join(", "));
  const [custom, setCustom] = useState(settings.custom);
  const [min, setMin] = useState(String(settings.custom_min));
  const [max, setMax] = useState(String(settings.custom_max));
  const [expiry, setExpiry] = useState(settings.expiry_months);
  const [message, setMessage] = useState(settings.message);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const list = amounts.split(/[,\s]+/).map((s) => s.replace(/^\$/, "")).filter(Boolean).map(Number);
    if (list.some((n) => !(n >= 1 && n <= (settings.max_amount ?? 2000)))) { setError(`Each amount must be between $1 and $${settings.max_amount ?? 2000}.`); return; }
    if (list.length > 8) { setError("Up to 8 amounts."); return; }
    if (custom && !(Number(min) >= 1 && Number(max) >= Number(min))) { setError("The custom range must go from a lower to a higher amount."); return; }
    if (enabled && list.length === 0 && !custom) { setError("Give at least one amount, or let buyers choose their own."); return; }
    setBusy(true); setError("");
    try {
      const saved = await apiClient.put<Settings>("/api/v1/admin/gift-cards/settings", {
        enabled, amounts: list, custom, custom_min: Number(min), custom_max: Number(max), expiry_months: expiry, message: message.trim(),
      });
      onSaved({ ...settings, ...saved });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "The settings could not be saved."); }
    setBusy(false);
  }

  return (
    <aside className="pc-panel" aria-label="Gift card settings" data-gift-settings>
      <PanelHead title="Gift card settings" sub="What buyers can buy on your gift card page." onClose={onClose} />
      <form className="pc-panel-body" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
        <div className="pc-switch-row">
          <span>Sell gift cards<div className="pc-sub-line" style={{ fontSize: "12.5px", fontWeight: 400 }}>Your shop&apos;s gift card page, at /gift-cards.</div></span>
          <button type="button" className="pc-switch" role="switch" aria-label="Sell gift cards" aria-checked={enabled} data-on={enabled ? "" : undefined} onClick={() => setEnabled(!enabled)} />
        </div>
        <div>
          <label className="pc-label" htmlFor="gs-amounts">Amounts ($)</label>
          <input id="gs-amounts" className="pc-input" value={amounts} placeholder="25, 50, 100" onChange={(e) => setAmounts(e.target.value)} />
          <div className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px" }}>Separated by commas. Up to 8.</div>
        </div>
        <div className="pc-switch-row">
          <span>Buyers choose their own amount</span>
          <button type="button" className="pc-switch" role="switch" aria-label="Buyers choose their own amount" aria-checked={custom} data-on={custom ? "" : undefined} onClick={() => setCustom(!custom)} />
        </div>
        {custom && (
          <div className="pc-form2">
            <div><label className="pc-label" htmlFor="gs-min">From ($)</label>
              <input id="gs-min" className="pc-input" type="number" min="1" step="1" value={min} onChange={(e) => setMin(e.target.value)} /></div>
            <div><label className="pc-label" htmlFor="gs-max">Up to ($)</label>
              <input id="gs-max" className="pc-input" type="number" min="1" step="1" value={max} onChange={(e) => setMax(e.target.value)} /></div>
          </div>
        )}
        <div>
          <label className="pc-label" htmlFor="gs-expiry">Cards expire</label>
          <select id="gs-expiry" className="pc-input" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
            {(settings.expiry_choices ?? [0, 60, 84, 120]).map((m) => <option key={m} value={m}>{EXPIRY[m] ?? `After ${m} months`}</option>)}
          </select>
          <div className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px" }}>
            US law allows no expiry under 5 years, and some states allow none at all. Check yours before setting one.
          </div>
        </div>
        <div>
          <label className="pc-label" htmlFor="gs-msg">A line on your gift card page</label>
          <input id="gs-msg" className="pc-input" value={message} maxLength={300} placeholder="Optional" onChange={(e) => setMessage(e.target.value)} />
        </div>
        <button type="submit" className="pc-btn" data-kind="primary" data-block="" disabled={busy} style={{ height: "46px" }}>{busy ? "Saving…" : "Save"}</button>
      </form>
    </aside>
  );
}
