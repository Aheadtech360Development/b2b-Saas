"use client";

/**
 * Returns and reprints: an order that went wrong, put right (backend
 * services/returns.py). Reprints are the usual fix, refunds the exception.
 *
 * A customer's request (sent from their account) waits here in Review until
 * the shop decides: reprint it, refund it, or reject it, with a note the
 * customer is emailed. The shop can also make one itself from the panel. A
 * reprint is a no-charge order linked to this one (its print jobs copied,
 * approved, into the print queue); a refund goes back on the card through the
 * order page's own refund, so it needs the billing permission and shows in
 * the refunds ledger.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ask, askText, tell } from "@/lib/dialog";
import { OrdersFrame, useOrdersOverview } from "@/components/admin/orders/OrdersFrame";

interface Return {
  id: string; rma_number: string; order_id: string; order_number: string | null; customer: string;
  reason: string; notes: string | null; admin_notes: string | null; status: string; status_words: string;
  outcome: "reprint" | "refund" | null; reprint: { id: string; number: string } | null; refund_amount: number | null;
  can_refund: boolean; created_at: string | null;
  // From the returns portal (backend services/returns_portal).
  kind?: "return" | "exchange"; channel?: "account" | "guest" | "admin"; refund_method?: string | null;
  refunded_amount?: number; portal?: boolean;
}
interface Answer { items: Return[]; counts: Record<string, number>; reasons: { key: string; words: string }[] }
interface OrderHit { id: string; order_number: string; customer: string; total: number; can_refund: boolean }

const FILTERS: [string, string][] = [["pending", "To review"], ["approved", "Approved"], ["received", "Received"], ["rejected", "Rejected"], ["completed", "Completed"], ["all", "All"]];
const TONE: Record<string, string> = { pending: "amber", approved: "blue", rejected: "red", completed: "green",
  received: "blue", refunded: "green", exchanged: "green", closed: "" };
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const errorText = (e: unknown, fallback: string) => (e instanceof ApiClientError && e.message ? e.message : fallback);

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading returns…</div></div>}>
      <Returns />
    </Suspense>
  );
}

function Returns() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { overview, refresh: refreshTabs } = useOrdersOverview();
  const show = params.get("show") ?? "all";
  const picked = params.get("rma") ?? "";
  const settingsOpen = params.get("settings") === "1";
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState("");

  const go = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`);
  }, [params, pathname, router]);

  const load = useCallback(() => {
    apiClient.get<Answer>("/api/v1/admin/returns")
      .then((a) => { setData(a); setError(""); })
      .catch((e) => setError(errorText(e, "The returns could not be loaded.")));
    refreshTabs();
  }, [refreshTabs]);
  useEffect(() => { load(); }, [load]);

  const rows = (data?.items ?? []).filter((r) => show === "all" || r.status === show);
  const chosen = picked ? data?.items.find((r) => r.id === picked) ?? null : null;

  return (
    <OrdersFrame active="returns" overview={overview} title="Returns and reprints" lede="Reprints are the usual fix, refunds are the exception."
      primary={<span />}>
      {error && <div className="pc-flash" data-bad="" role="status">{error}</div>}
      <div className="pc-cols" style={{ marginTop: 0 }}>
        <div>
          <div className="pc-filters no-print" role="group" aria-label="Show" style={{ marginBottom: 12 }}>
            <button type="button" className="pc-btn" style={{ marginLeft: "auto" }} onClick={() => go({ rma: null, settings: "1" })}>
              Returns portal
            </button>
            <div className="pc-seg">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={show === value} onClick={() => go({ show: value === "all" ? null : value })}>
                  {label}{value !== "all" && data?.counts?.[value] ? ` (${data.counts[value]})` : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="pc-card pc-scroll-x" aria-busy={!data} data-shown={data ? show : undefined}>
            {!data ? <div className="pc-empty">Loading returns…</div> : !rows.length ? (
              <div className="pc-empty">{show === "pending" ? "Nothing to review. A customer's request to return or reprint an order shows here."
                : "No returns yet. Make a reprint or a refund from the panel."}</div>
            ) : (
              <table className="pc-table">
                <thead><tr><th>RMA</th><th>Order</th><th>Customer</th><th>Reason</th><th>Outcome</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} data-href="" data-return={r.rma_number} aria-selected={picked === r.id}
                        style={picked === r.id ? { background: "var(--pc-blue-tint, #EEF4FF)" } : undefined}
                        onClick={() => go({ rma: r.id })}>
                      <td style={{ whiteSpace: "nowrap" }}><b>{r.rma_number}</b></td>
                      <td><Link className="pc-link" href={`/admin/orders/${r.order_id}`} onClick={(e) => e.stopPropagation()}>{r.order_number ?? "Order"}</Link></td>
                      <td>{r.customer}</td>
                      <td>{r.reason.split(":")[0]}</td>
                      <td>{r.portal
                        ? (r.kind === "exchange" ? "Exchange" : r.refund_method === "store_credit" ? "Store credit" : "Refund")
                          + (r.channel === "guest" ? " · guest" : "")
                        : r.outcome === "reprint" ? "Reprint" : r.outcome === "refund" ? "Refund" : "—"}</td>
                      <td><span className="pc-pill" data-tone={TONE[r.status]} style={{ textTransform: "none" }}>{r.status_words}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          {settingsOpen ? (
            <PortalSettings onClose={() => go({ settings: null })} />
          ) : chosen?.portal ? (
            <PortalPanel r={chosen} onDone={() => load()} onClose={() => go({ rma: null })} />
          ) : chosen ? (
            <ReturnPanel r={chosen} onDone={() => load()} onClose={() => go({ rma: null })} />
          ) : (
            <NewPanel reasons={data?.reasons ?? []} onMade={(id) => { load(); go({ rma: id }); }} />
          )}
        </div>
      </div>
    </OrdersFrame>
  );
}

function OutcomePick({ value, onChange, canRefund }: { value: "reprint" | "refund"; onChange: (v: "reprint" | "refund") => void; canRefund: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} role="radiogroup" aria-label="Put it right with">
      {([["reprint", "Reprint", "Creates a no-charge order linked to this one."], ["refund", "Refund", "Money back, shows in the ledger."]] as const).map(([key, title, blurb]) => {
        const off = key === "refund" && !canRefund;
        return (
          <button key={key} type="button" role="radio" aria-checked={value === key} disabled={off}
            className="pc-card" onClick={() => onChange(key)}
            style={{ textAlign: "left", padding: "12px 14px", cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.55 : 1,
                     borderColor: value === key ? "var(--pc-blue)" : undefined, background: value === key ? "var(--pc-blue-tint, #EEF4FF)" : undefined }}>
            <b>{title}</b>
            <div className="pc-sub-line">{off ? "Only an order paid by card can be refunded here." : blurb}</div>
          </button>
        );
      })}
    </div>
  );
}

function NewPanel({ reasons, onMade }: { reasons: { key: string; words: string }[]; onMade: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OrderHit[] | null>(null);
  const [order, setOrder] = useState<OrderHit | null>(null);
  const [reason, setReason] = useState("print_quality");
  const [outcome, setOutcome] = useState<"reprint" | "refund">("reprint");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setHits(null); return; }
    const t = setTimeout(() => {
      apiClient.get<OrderHit[]>(`/api/v1/admin/returns/orders?q=${encodeURIComponent(q.trim())}`)
        .then(setHits).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { if (order && !order.can_refund) setOutcome("reprint"); }, [order]);

  async function create() {
    if (!order) return;
    const words = outcome === "reprint"
      ? `Reprint order ${order.order_number} for ${order.customer} at no charge? A new order is made with the same lines at $0.00.`
      : `Refund ${amount ? money(Number(amount)) : "what is left"} of order ${order.order_number} to ${order.customer}'s card?`;
    if (!(await ask(words, { title: outcome === "reprint" ? "New reprint" : "New refund", ok: "Create" }))) return;
    setBusy(true);
    try {
      const body = { order_id: order.id, reason, note: note.trim() || null, ...(outcome === "refund" && amount ? { amount: Number(amount) } : {}) };
      const r = await apiClient.post<{ id: string; reprint_number?: string; refund_amount?: number }>(`/api/v1/admin/returns/${outcome}`, body);
      tell(outcome === "reprint" ? `Reprint made: order ${r.reprint_number}.` : `Refunded ${money(r.refund_amount ?? 0)}.`);
      setOrder(null); setNote(""); setAmount(""); setQ("");
      onMade(r.id);
    } catch (e) { tell(errorText(e, "That could not be made.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="pc-panel">
      <div className="pc-panel-head"><h2 className="pc-h2" style={{ margin: 0 }}>New reprint or refund</h2></div>
      <div className="pc-panel-body">
        <div>
          <label className="pc-label" htmlFor="ret-order">Order</label>
          {order ? (
            <div><b>{order.order_number}</b> · {order.customer} · {money(order.total)}{" "}
              <button type="button" className="pc-link" style={{ background: "none", border: 0 }} onClick={() => setOrder(null)}>Change</button></div>
          ) : (
            <>
              <label className="pc-field" style={{ maxWidth: "none" }}>
                <Search size={16} />
                <input id="ret-order" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number or customer" />
              </label>
              {hits && (hits.length ? (
                <div className="pc-card" style={{ boxShadow: "none", maxHeight: 220, overflowY: "auto", marginTop: 6 }}>
                  {hits.map((h) => (
                    <button key={h.id} type="button" className="pc-pop-item" style={{ display: "block", width: "100%", textAlign: "left" }} onClick={() => setOrder(h)}>
                      <b>{h.order_number}</b> <span className="pc-sub-line">· {h.customer} · {money(h.total)}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="pc-sub-line">No order matches.</p>)}
            </>
          )}
        </div>
        <div>
          <label className="pc-label" htmlFor="ret-reason">Reason</label>
          <select id="ret-reason" className="pc-input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => <option key={r.key} value={r.key}>{r.words}</option>)}
          </select>
        </div>
        <OutcomePick value={outcome} onChange={setOutcome} canRefund={!order || order.can_refund} />
        {outcome === "refund" && (
          <div>
            <label className="pc-label" htmlFor="ret-amount">Amount <span className="pc-sub-line">(empty: all that is left)</span></label>
            <input id="ret-amount" className="pc-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        )}
        <div>
          <label className="pc-label" htmlFor="ret-note">Note</label>
          <textarea id="ret-note" className="pc-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="button" className="pc-btn" data-kind="primary" style={{ width: "100%", justifyContent: "center" }}
          disabled={busy || !order} onClick={create}>{busy ? "Creating…" : "Create"}</button>
      </div>
    </div>
  );
}

function ReturnPanel({ r, onDone, onClose }: { r: Return; onDone: () => void; onClose: () => void }) {
  const [outcome, setOutcome] = useState<"reprint" | "refund">("reprint");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setOutcome("reprint"); setAmount(""); setNote(""); }, [r.id]);

  async function decide(kind: "reprint" | "refund" | "reject") {
    const words = kind === "reject" ? `Reject return ${r.rma_number}? The customer is emailed${note.trim() ? " with your note" : ""}.`
      : kind === "reprint" ? `Approve ${r.rma_number} as a reprint of order ${r.order_number}? A no-charge order is made with the same lines.`
      : `Approve ${r.rma_number} as a refund of ${amount ? money(Number(amount)) : "what is left"} on order ${r.order_number}?`;
    if (!(await ask(words, { title: kind === "reject" ? "Reject return" : "Approve return", ok: kind === "reject" ? "Reject" : "Approve" }))) return;
    setBusy(kind);
    try {
      await apiClient.post(`/api/v1/admin/returns/${r.id}/${kind}`, { note: note.trim() || null, ...(kind === "refund" && amount ? { amount: Number(amount) } : {}) });
      onDone();
    } catch (e) { tell(errorText(e, "That could not be saved.")); }
    finally { setBusy(null); }
  }
  async function complete() {
    if (!(await ask(`Mark return ${r.rma_number} completed?`, { title: "Complete return", ok: "Complete" }))) return;
    setBusy("complete");
    try { await apiClient.patch(`/api/v1/admin/rma/${r.id}`, { status: "completed" }); onDone(); }
    catch (e) { tell(errorText(e, "That could not be saved.")); }
    finally { setBusy(null); }
  }

  return (
    <div className="pc-panel" data-return-panel={r.rma_number}>
      <div className="pc-panel-head">
        <div>
          <h2 className="pc-h2" style={{ margin: 0 }}>Return {r.rma_number}</h2>
          <div className="pc-sub-line">Order <Link className="pc-link" href={`/admin/orders/${r.order_id}`}>{r.order_number}</Link> · {r.customer}</div>
        </div>
        <button type="button" className="pc-btn" onClick={onClose}>New</button>
      </div>
      <div className="pc-panel-body">
        <div>
          <div className="pc-label">Reason</div>
          <p style={{ margin: 0 }}>{r.reason}</p>
          {r.notes && <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>{r.notes}</p>}
          {r.admin_notes && <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>Your note: {r.admin_notes}</p>}
        </div>
        {r.status === "pending" ? (
          <>
            <OutcomePick value={outcome} onChange={setOutcome} canRefund={r.can_refund} />
            {outcome === "refund" && (
              <div>
                <label className="pc-label" htmlFor="rp-amount">Amount <span className="pc-sub-line">(empty: all that is left)</span></label>
                <input id="rp-amount" className="pc-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
            )}
            <div>
              <label className="pc-label" htmlFor="rp-note">Note to the customer</label>
              <textarea id="rp-note" className="pc-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="pc-row-actions">
              <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={() => decide(outcome)}>
                {busy === outcome ? "Saving…" : outcome === "reprint" ? "Approve as reprint" : "Approve as refund"}
              </button>
              <button type="button" className="pc-btn" disabled={!!busy} onClick={() => decide("reject")}>{busy === "reject" ? "Saving…" : "Reject"}</button>
            </div>
          </>
        ) : (
          <>
            <div className="pc-kv" style={{ display: "grid", gap: 6 }}>
              <div><span className="pc-sub-line">Status</span> <span className="pc-pill" data-tone={TONE[r.status]}>{r.status_words}</span></div>
              {r.outcome === "reprint" && r.reprint && (
                <div>Reprinted as order <Link className="pc-link" href={`/admin/orders/${r.reprint.id}`}>{r.reprint.number}</Link>, at no charge.</div>
              )}
              {r.outcome === "refund" && <div>Refunded {money(r.refund_amount ?? 0)} to the card it was paid with.</div>}
            </div>
            {r.status === "approved" && (
              <button type="button" className="pc-btn" disabled={!!busy} onClick={complete}>{busy === "complete" ? "Saving…" : "Mark completed"}</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface PortalItem {
  id: string; product_name: string; sku: string; color: string | null; size: string | null; quantity: number;
  reason: string | null; unit_price: number; can_restock: boolean; received_quantity: number | null; restock: boolean | null;
  replacement: { variant_id: string; label: string; sku: string } | null;
}
interface PortalDetail {
  id: string; rma_number: string; status: string; status_words: string; kind: string; refund_method: string | null;
  channel: string; notes: string | null; admin_notes: string | null; refunded_amount: number; refund_cap: number;
  refund_left: number; exchange_order_id: string | null; order_id: string; order_number: string | null;
  buyer_email: string | null; items: PortalItem[];
  events: { status: string; status_words: string; actor_kind: string; actor_name: string | null; note: string | null; at: string | null }[];
}

/** A return or exchange a buyer started themselves (the returns portal):
 *  approve, decline, note what came back, refund (to the payment or as store
 *  credit, never more than was paid for the items) or make the exchange. */
function PortalPanel({ r, onDone, onClose }: { r: Return; onDone: () => void; onClose: () => void }) {
  const [d, setD] = useState<PortalDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [back, setBack] = useState<Record<string, { qty: number; restock: boolean }>>({});
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"original" | "store_credit">("original");

  const load = useCallback(() => {
    apiClient.get<PortalDetail>(`/api/v1/admin/returns/${r.id}/detail`).then((x) => {
      setD(x);
      setBack(Object.fromEntries(x.items.map((i) => [i.id, { qty: i.received_quantity ?? i.quantity, restock: i.restock ?? i.can_restock }])));
      setAmount(x.refund_left ? x.refund_left.toFixed(2) : "");
      setMethod(x.refund_method === "store_credit" ? "store_credit" : "original");
    }).catch((e) => tell(errorText(e, "The return could not be loaded.")));
  }, [r.id]);
  useEffect(() => { setD(null); load(); }, [load]);

  async function act(action: string, body: Record<string, unknown>, confirm: string, ok: string) {
    if (!(await ask(confirm, { title: ok, ok }))) return;
    setBusy(action);
    try {
      await apiClient.post(`/api/v1/admin/returns/${r.id}/${action}`, body);
      load(); onDone();
    } catch (e) { tell(errorText(e, "That could not be saved.")); }
    finally { setBusy(null); }
  }
  async function decline() {
    const note = await askText(`Why can't ${r.rma_number} be accepted? The buyer is emailed your words.`, "",
      { title: "Decline", ok: "Decline", danger: true, placeholder: "Outside our return window, worn…" });
    if (note === null) return;
    setBusy("decline");
    try { await apiClient.post(`/api/v1/admin/returns/${r.id}/decline`, { note: note.trim() || null }); load(); onDone(); }
    catch (e) { tell(errorText(e, "That could not be saved.")); }
    finally { setBusy(null); }
  }

  if (!d) return <div className="pc-panel"><div className="pc-panel-body"><div className="pc-empty">Loading…</div></div></div>;
  const can = (a: string) => ({
    approve: ["pending"], decline: ["pending", "approved"], receive: ["pending", "approved"],
    refund: ["approved", "received"], exchange: ["approved", "received"], close: ["pending", "approved", "received", "refunded", "exchanged", "completed"],
  } as Record<string, string[]>)[a]?.includes(d.status) ?? false;
  const isExchange = d.kind === "exchange";

  return (
    <div className="pc-panel" data-portal-return={d.rma_number}>
      <div className="pc-panel-head">
        <div>
          <h2 className="pc-h2" style={{ margin: 0 }}>{isExchange ? "Exchange" : "Return"} {d.rma_number}</h2>
          <div className="pc-sub-line">Order <Link className="pc-link" href={`/admin/orders/${d.order_id}`}>{d.order_number}</Link>
            {" · "}{d.channel === "guest" ? "guest" : "account"}{d.buyer_email ? ` · ${d.buyer_email}` : ""}</div>
        </div>
        <button type="button" className="pc-btn" onClick={onClose}>New</button>
      </div>
      <div className="pc-panel-body">
        <div><span className="pc-pill" data-tone={TONE[d.status]} style={{ textTransform: "none" }}>{d.status_words}</span></div>
        <div style={{ display: "grid", gap: 10 }}>
          {d.items.map((i) => (
            <div key={i.id} data-portal-item={i.sku} style={{ borderBottom: "1px solid var(--pc-line, #E3E8EF)", paddingBottom: 8 }}>
              <b>{i.quantity} × {i.product_name}</b> <span className="pc-sub-line">{[i.color, i.size].filter(Boolean).join(" / ")}</span>
              <div className="pc-sub-line">{i.reason}{i.replacement ? ` · instead: ${i.replacement.label}` : ""}</div>
              {i.received_quantity != null && (
                <div className="pc-sub-line">Came back: {i.received_quantity}{i.restock ? ", back on the shelf" : ""}</div>
              )}
              {can("receive") && (
                <div className="pc-row-actions" style={{ marginTop: 6 }}>
                  <label className="pc-sub-line">Came back
                    <input className="pc-input" type="number" min={0} max={i.quantity} value={back[i.id]?.qty ?? i.quantity}
                      style={{ width: 70, marginLeft: 6, height: 32 }} aria-label={`How many ${i.product_name} came back`}
                      onChange={(e) => setBack((b) => ({ ...b, [i.id]: { restock: false, ...b[i.id], qty: Math.max(0, Math.min(i.quantity, Math.floor(Number(e.target.value) || 0))) } }))} />
                  </label>
                  {i.can_restock && (
                    <label className="pc-sub-line"><input type="checkbox" checked={!!back[i.id]?.restock}
                      onChange={(e) => setBack((b) => ({ ...b, [i.id]: { qty: i.quantity, ...b[i.id], restock: e.target.checked } }))} /> Back on the shelf</label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {d.notes && <p className="pc-sub-line" style={{ margin: 0 }}>Buyer: {d.notes}</p>}
        {d.refunded_amount > 0 && <div>Refunded {money(d.refunded_amount)}{d.refund_method === "store_credit" ? " as store credit" : ""}.</div>}
        {d.exchange_order_id && <div>Exchange order <Link className="pc-link" href={`/admin/orders/${d.exchange_order_id}`}>open</Link>.</div>}

        {can("refund") && !isExchange && (
          <div style={{ display: "grid", gap: 8 }}>
            <label className="pc-label" htmlFor="pp-amount">Refund <span className="pc-sub-line">(up to {money(d.refund_left)}: what was paid for these items)</span></label>
            <input id="pp-amount" className="pc-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="pc-input" value={method} onChange={(e) => setMethod(e.target.value as "original" | "store_credit")} aria-label="Refund to">
              <option value="original">To the way they paid</option>
              <option value="store_credit">As store credit (a gift card)</option>
            </select>
          </div>
        )}
        <div className="pc-row-actions" style={{ flexWrap: "wrap" }}>
          {can("approve") && <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy}
            onClick={() => act("approve", {}, `Approve ${d.rma_number}? The buyer is emailed how to send it back.`, "Approve")}>Approve</button>}
          {can("receive") && <button type="button" className="pc-btn" disabled={!!busy}
            onClick={() => act("receive", { items: d.items.map((i) => ({ rma_item_id: i.id, quantity: back[i.id]?.qty ?? i.quantity, restock: !!back[i.id]?.restock })) },
              "Mark what came back? Items ticked go back into stock.", "Mark received")}>Mark received</button>}
          {can("refund") && !isExchange && <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy || !(Number(amount) > 0)}
            onClick={() => act("refund-items", { amount: Number(amount), method },
              `Refund ${money(Number(amount))} ${method === "store_credit" ? "as store credit" : "to the way they paid"}?`, "Refund")}>Refund</button>}
          {can("exchange") && isExchange && <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy}
            onClick={() => act("exchange", {}, "Make the exchange order? The new items come off stock; a price difference is charged or refunded.", "Make exchange")}>Make exchange order</button>}
          {can("decline") && <button type="button" className="pc-btn" disabled={!!busy} onClick={decline}>Decline</button>}
          {can("close") && <button type="button" className="pc-btn" disabled={!!busy}
            onClick={() => act("close", {}, `Close ${d.rma_number}? Nothing else happens to it.`, "Close")}>Close</button>}
        </div>
        <div>
          <div className="pc-label">History</div>
          {d.events.map((e, n) => (
            <div key={n} className="pc-sub-line" data-portal-event={e.status}>
              {e.at ? new Date(e.at).toLocaleString() : ""} · {e.status_words} · {e.actor_name ?? (e.actor_kind === "buyer" ? "Buyer" : "Staff")}
              {e.note ? ` · ${e.note}` : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PortalConf {
  enabled: boolean; window_days: number; reasons: string[]; made_to_order_final_sale: boolean;
  shipping_payer: "buyer" | "shop"; instructions: string; methods: string[];
}

/** The returns portal's settings: on or off, the window, reasons, final sale,
 *  who pays return shipping, the instructions mailed on approval, and the
 *  ways a return can be put right. */
function PortalSettings({ onClose }: { onClose: () => void }) {
  const [c, setC] = useState<PortalConf | null>(null);
  const [reasons, setReasons] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiClient.get<PortalConf>("/api/v1/admin/returns/settings")
      .then((x) => { setC(x); setReasons(x.reasons.join("\n")); })
      .catch((e) => setError(errorText(e, "The settings could not be loaded.")));
  }, []);
  if (!c) return <div className="pc-panel"><div className="pc-panel-body">{error ? <div className="pc-note" data-tone="red">{error}</div> : <div className="pc-empty">Loading…</div>}</div></div>;
  const set = (k: keyof PortalConf, v: unknown) => setC({ ...c, [k]: v } as PortalConf);
  const toggle = (m: string) => set("methods", c.methods.includes(m) ? c.methods.filter((x) => x !== m) : [...c.methods, m]);

  async function save() {
    setBusy(true); setError("");
    try {
      const saved = await apiClient.put<PortalConf>("/api/v1/admin/returns/settings", {
        ...c, reasons: reasons.split("\n").map((x) => x.trim()).filter(Boolean),
      });
      setC(saved); setReasons(saved.reasons.join("\n"));
      tell(saved.enabled ? "Buyers can now start returns at /returns and from their orders." : "The returns portal is off.");
    } catch (e) { setError(errorText(e, "The settings could not be saved.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="pc-panel" data-portal-settings>
      <div className="pc-panel-head">
        <div><h2 className="pc-h2" style={{ margin: 0 }}>Returns portal</h2>
          <div className="pc-sub-line">Buyers start returns and exchanges themselves, at /returns or from their orders.</div></div>
        <button type="button" className="pc-btn" onClick={onClose}>Done</button>
      </div>
      <div className="pc-panel-body">
        {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
        <div className="pc-switch-row">
          <span>Buyers start returns online</span>
          <button type="button" className="pc-switch" role="switch" aria-label="Buyers start returns online" aria-checked={c.enabled}
            data-on={c.enabled ? "" : undefined} onClick={() => set("enabled", !c.enabled)} />
        </div>
        <div>
          <label className="pc-label" htmlFor="ps-days">Days after delivery</label>
          <input id="ps-days" className="pc-input" type="number" min={1} max={365} value={c.window_days}
            onChange={(e) => set("window_days", Math.floor(Number(e.target.value) || 0))} />
        </div>
        <div>
          <label className="pc-label" htmlFor="ps-reasons">Reasons (one per line)</label>
          <textarea id="ps-reasons" className="pc-input" rows={5} value={reasons} onChange={(e) => setReasons(e.target.value)} style={{ height: "auto" }} />
        </div>
        <div>
          <span className="pc-label">Ways to put it right</span>
          {([["original", "Refund to the way they paid"], ["store_credit", "Store credit (a gift card)"], ["exchange", "Exchange for another size or colour"]] as const).map(([m, l]) => (
            <label key={m} className="pc-check-row" style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0" }}>
              <input type="checkbox" checked={c.methods.includes(m)} onChange={() => toggle(m)} /> {l}
            </label>
          ))}
        </div>
        <div className="pc-switch-row">
          <span>Made-to-order items are final sale</span>
          <button type="button" className="pc-switch" role="switch" aria-label="Made-to-order items are final sale"
            aria-checked={c.made_to_order_final_sale} data-on={c.made_to_order_final_sale ? "" : undefined}
            onClick={() => set("made_to_order_final_sale", !c.made_to_order_final_sale)} />
        </div>
        <div>
          <label className="pc-label" htmlFor="ps-payer">Return shipping</label>
          <select id="ps-payer" className="pc-input" value={c.shipping_payer} onChange={(e) => set("shipping_payer", e.target.value)}>
            <option value="buyer">Paid by the buyer</option>
            <option value="shop">Paid by the shop</option>
          </select>
        </div>
        <div>
          <label className="pc-label" htmlFor="ps-how">Instructions (emailed when you approve)</label>
          <textarea id="ps-how" className="pc-input" rows={3} maxLength={1500} value={c.instructions}
            onChange={(e) => set("instructions", e.target.value)} style={{ height: "auto" }} placeholder="Where to send it, what to put in the box." />
        </div>
        <button type="button" className="pc-btn" data-kind="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
