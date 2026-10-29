"use client";

/**
 * Starting a return or an exchange (backend services/returns_portal, Retail
 * launch package 4). One form for guests (/returns, after the order number
 * and email are checked) and for signed-in buyers (/account/returns/new): the
 * server says what can come back, and checks it all again when it is sent.
 */
import { useState } from "react";

export interface ReturnLine {
  order_item_id: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  quantity: number;
  returnable: number;
  unit_price: number;
  final_sale: string | null;
  exchange_options: { variant_id: string; label: string; sku: string; price: number; in_stock: number | null }[];
}

export interface ReturnInfo {
  open: boolean;
  why: string | null;
  order_id: string;
  order_number: string;
  window_ends: string | null;
  lines: ReturnLine[];
  reasons: string[];
  methods: string[];
  shipping_payer: string;
  instructions: string;
  returns?: { rma_number: string; kind: string; status_words: string; created_at: string | null }[];
}

export interface ReturnRequest {
  kind: "return" | "exchange";
  refund_method?: "original" | "store_credit";
  note?: string;
  items: { order_item_id: string; quantity: number; reason: string; replacement_variant_id?: string }[];
}

export const RETURN_CSS = `
  .rp-card { background: #fff; border: 1px solid #E8E6E1; padding: 22px; font-family: 'DM Sans', sans-serif; margin-bottom: 16px; }
  .rp-label { display: block; font-size: 12px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: #1A1A1A; margin: 0 0 8px; }
  .rp-input { width: 100%; padding: 11px 13px; border: 1px solid #DCD9D3; font-size: 15px; font-family: inherit; box-sizing: border-box; background: #fff; color: #1A1A1A; }
  .rp-line { display: grid; grid-template-columns: auto 1fr; gap: 12px; padding: 14px 0; border-bottom: 1px solid #F0EEEA; }
  .rp-line:last-child { border-bottom: none; }
  .rp-name { font-size: 15px; font-weight: 600; color: #1A1A1A; }
  .rp-sub { font-size: 13px; color: #6B6B6B; margin-top: 2px; }
  .rp-grid { display: grid; grid-template-columns: 90px 1fr; gap: 10px; margin-top: 10px; }
  .rp-seg { display: flex; gap: 8px; flex-wrap: wrap; }
  .rp-seg button { padding: 10px 16px; border: 1.5px solid #DCD9D3; background: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  .rp-seg button[aria-pressed="true"] { border-color: var(--brand-primary, #1C3557); background: #F3F5F8; }
  .rp-btn { width: 100%; padding: 15px; border: none; background: var(--brand-primary, #1C3557); color: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
  .rp-btn:disabled { opacity: .6; cursor: not-allowed; }
  .rp-err { margin: 0 0 14px; padding: 10px 14px; background: rgba(232,36,42,.07); border: 1px solid rgba(232,36,42,.25); color: #B42318; font-size: 13.5px; font-weight: 600; }
  .rp-ok { padding: 14px; background: rgba(5,150,105,.07); border: 1px solid rgba(5,150,105,.25); color: #065F46; font-size: 14.5px; line-height: 1.6; }
  .rp-note { font-size: 13px; color: #6B6B6B; line-height: 1.55; }
  @media (max-width: 600px) { .rp-grid { grid-template-columns: 1fr; } .rp-card { padding: 16px; } }
`;

const money = (n: number) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReturnStart({ info, onSubmit }: { info: ReturnInfo; onSubmit: (r: ReturnRequest) => Promise<string> }) {
  const canExchange = info.methods.includes("exchange");
  const refunds = (["original", "store_credit"] as const).filter((m) => info.methods.includes(m));
  const [kind, setKind] = useState<"return" | "exchange">(refunds.length ? "return" : "exchange");
  const [method, setMethod] = useState<"original" | "store_credit">(refunds[0] ?? "original");
  const [picked, setPicked] = useState<Record<string, { qty: number; reason: string; replacement: string }>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rp-card" data-return-done>
        <div className="rp-ok">
          Request <strong>{done}</strong> is with the shop. We emailed you a copy; you will hear back by email.
        </div>
      </div>
    );
  }
  if (!info.open) {
    return <div className="rp-card"><div className="rp-note" data-return-closed>{info.why}</div></div>;
  }

  const lines = info.lines.filter((l) => kind === "return" || l.exchange_options.length > 0 || l.final_sale);
  const set = (id: string, change: Partial<{ qty: number; reason: string; replacement: string }>) =>
    setPicked((p) => ({ ...p, [id]: { qty: 1, reason: "", replacement: "", ...p[id], ...change } }));

  async function send() {
    const items = Object.entries(picked).filter(([, v]) => v.qty > 0).map(([id, v]) => ({
      order_item_id: id, quantity: v.qty, reason: v.reason,
      ...(kind === "exchange" ? { replacement_variant_id: v.replacement } : {}),
    }));
    if (!items.length) { setError("Choose at least one item."); return; }
    if (items.some((i) => !i.reason)) { setError("Choose a reason for each item."); return; }
    if (kind === "exchange" && items.some((i) => !i.replacement_variant_id)) { setError("Choose what you would like instead."); return; }
    setBusy(true); setError(null);
    try {
      setDone(await onSubmit({ kind, items, note: note.trim() || undefined, ...(kind === "return" ? { refund_method: method } : {}) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your request could not be sent. Try again.");
    }
    setBusy(false);
  }

  return (
    <div data-return-form>
      {error && <div className="rp-err" role="alert">{error}</div>}
      {canExchange && refunds.length > 0 && (
        <div className="rp-card">
          <span className="rp-label">What would you like?</span>
          <div className="rp-seg" role="group" aria-label="Return or exchange">
            <button type="button" aria-pressed={kind === "return"} onClick={() => { setKind("return"); setPicked({}); }}>Return for a refund</button>
            <button type="button" aria-pressed={kind === "exchange"} onClick={() => { setKind("exchange"); setPicked({}); }}>Exchange</button>
          </div>
        </div>
      )}
      <div className="rp-card">
        <span className="rp-label">Items from order {info.order_number}</span>
        {lines.map((l) => {
          const mine = picked[l.order_item_id];
          const on = !!mine && mine.qty > 0;
          const off = !!l.final_sale || l.returnable <= 0;
          return (
            <div key={l.order_item_id} className="rp-line" data-return-line={l.sku}>
              <input type="checkbox" aria-label={`Return ${l.product_name}`} checked={on} disabled={off}
                onChange={(e) => (e.target.checked ? set(l.order_item_id, { qty: 1 }) : setPicked((p) => { const n = { ...p }; delete n[l.order_item_id]; return n; }))} />
              <div>
                <div className="rp-name">{l.product_name}</div>
                <div className="rp-sub">{[l.color, l.size].filter(Boolean).join(" / ")}{" · "}{money(l.unit_price)} each</div>
                {off && <div className="rp-sub">{l.final_sale ?? "Already on another return."}</div>}
                {on && (
                  <div className="rp-grid">
                    <select className="rp-input" aria-label={`How many ${l.product_name}`} value={mine.qty}
                      onChange={(e) => set(l.order_item_id, { qty: Number(e.target.value) })}>
                      {Array.from({ length: l.returnable }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select className="rp-input" aria-label={`Why, ${l.product_name}`} value={mine.reason}
                      onChange={(e) => set(l.order_item_id, { reason: e.target.value })}>
                      <option value="">Why?</option>
                      {info.reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {kind === "exchange" && (
                      <select className="rp-input" aria-label={`Instead of ${l.product_name}`} value={mine.replacement}
                        onChange={(e) => set(l.order_item_id, { replacement: e.target.value })} style={{ gridColumn: "1 / -1" }}>
                        <option value="">What would you like instead?</option>
                        {l.exchange_options.map((o) => (
                          <option key={o.variant_id} value={o.variant_id}>
                            {o.label}{o.price !== l.unit_price ? ` (${money(o.price)})` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {kind === "return" && refunds.length > 1 && (
        <div className="rp-card">
          <span className="rp-label">Your money back</span>
          <div className="rp-seg" role="group" aria-label="Refund to">
            <button type="button" aria-pressed={method === "original"} onClick={() => setMethod("original")}>To the way I paid</button>
            <button type="button" aria-pressed={method === "store_credit"} onClick={() => setMethod("store_credit")}>As store credit</button>
          </div>
        </div>
      )}
      <div className="rp-card">
        <label className="rp-label" htmlFor="rp-note">Anything to add</label>
        <textarea id="rp-note" className="rp-input" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="rp-note" style={{ marginTop: "10px" }}>
          {info.shipping_payer === "shop" ? "Return shipping is on us." : "Return shipping is paid by you."}
          {info.window_ends && ` Returns for this order close on ${new Date(info.window_ends).toLocaleDateString()}.`}
          {" "}The shop checks your request and emails you what to do next.
        </p>
      </div>
      <button type="button" className="rp-btn" disabled={busy} onClick={send}>
        {busy ? "Sending…" : kind === "exchange" ? "Request exchange" : "Request return"}
      </button>
    </div>
  );
}

export function PastReturns({ items }: { items: ReturnInfo["returns"] }) {
  if (!items?.length) return null;
  return (
    <div className="rp-card" data-past-returns>
      <span className="rp-label">Requests on this order</span>
      {items.map((r) => (
        <div key={r.rma_number} className="rp-sub" style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
          <span>{r.rma_number} · {r.kind === "exchange" ? "Exchange" : "Return"}</span>
          <strong style={{ color: "#1A1A1A" }}>{r.status_words}</strong>
        </div>
      ))}
    </div>
  );
}
