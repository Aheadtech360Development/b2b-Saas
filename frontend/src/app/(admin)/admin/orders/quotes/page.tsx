"use client";

/**
 * Quotes: requests that need a price, then orders once accepted (backend
 * services/quotes.py says where each one stands).
 *
 * A quote is a draft order, so it is priced with the draft routes: a line is
 * added at the price the shop quotes (POST /admin/orders/{id}/items with
 * unit_price) and taken off with the line's delete. A storefront quote request
 * becomes a quote by choosing whose account it goes on; the request then
 * leaves "Needs pricing" and is answered in the Inbox. Send quote emails it
 * with a valid-until date and a link the customer accepts from; Convert to
 * order is the draft's own confirm, which gives it a real order number and
 * emails its invoice.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ask, tell } from "@/lib/dialog";
import { adminService } from "@/services/admin.service";
import { customersService } from "@/services/customers.service";
import { OrdersFrame, useOrdersOverview } from "@/components/admin/orders/OrdersFrame";

type Status = "needs_pricing" | "draft" | "sent" | "expired" | "accepted" | "ordered";
interface Row {
  kind: "quote" | "request"; id: string; number: string; order_number: string | null; customer: string;
  requested_at: string | null; total: number | null; status: Status; status_words: string;
  valid_until: string | null; request_id: string | null; by_copilot: boolean;
  /** A request's sender and message, as the Inbox reads the form. */
  from?: Asked["from"];
}
interface Line { id: string; name: string; sku: string; color: string | null; size: string | null; quantity: number; unit_price: number; line_total: number }
interface Asked { id: string; from: { name: string | null; email: string | null; phone: string | null; company: string | null; message: string | null; fields: { label: string; value: string }[] }; created_at: string | null }
interface Quote {
  id: string; number: string; order_number: string | null; company_id: string | null; customer: string;
  status: Status; status_words: string; notes: string | null; asked: Asked | null; items: Line[];
  subtotal: number; shipping: number; tax: number; total: number;
  valid_until: string | null; sent_at: string | null; sent_to: string | null; accepted_at: string | null; default_valid_until: string;
}
interface Product { id: string; name: string; variants?: { id: string; color: string | null; size: string | null; retail_price: string }[] }

const TONE: Record<Status, string | undefined> = {
  needs_pricing: "amber", draft: undefined, sent: "blue", expired: "red", accepted: "green", ordered: "green",
};
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const offset = () => -new Date().getTimezoneOffset();
const errorText = (e: unknown, fallback: string) => (e instanceof ApiClientError && e.message ? e.message : fallback);

export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading quotes…</div></div>}>
      <Quotes />
    </Suspense>
  );
}

function Quotes() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { overview, refresh: refreshTabs } = useOrdersOverview();
  const picked = params.get("quote") ?? "";
  const pickedRequest = params.get("request") ?? "";
  const making = params.get("new") === "1";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  const go = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`);
  }, [pathname, router]);

  const load = useCallback(() => {
    apiClient.get<{ items: Row[] }>(`/api/v1/admin/quotes?utc_offset=${offset()}`)
      .then((a) => { setRows(a.items); setError(""); })
      .catch((e) => setError(errorText(e, "The quotes could not be loaded.")));
    refreshTabs();
  }, [refreshTabs]);
  useEffect(() => { load(); }, [load]);

  const request = pickedRequest ? rows?.find((r) => r.kind === "request" && r.id === pickedRequest) ?? null : null;

  return (
    <OrdersFrame active="quotes" overview={overview} title="Quotes" lede="Requests that need a price, then orders once accepted."
      primary={<button type="button" className="pc-btn" data-kind="primary" onClick={() => go({ new: "1" })}><Plus size={17} strokeWidth={2.4} /> New quote</button>}>
      {error && <div className="pc-flash" data-bad="" role="status">{error}</div>}
      <div className="pc-cols" style={{ marginTop: 0 }}>
        <div className="pc-card pc-scroll-x" aria-busy={!rows} data-shown={rows ? "quotes" : undefined}>
          {!rows ? <div className="pc-empty">Loading quotes…</div> : !rows.length ? (
            <div className="pc-empty">No quotes yet. Requests from your storefront&apos;s quote form land here, and New quote prices one for a customer.</div>
          ) : (
            <table className="pc-table">
              <thead><tr><th>Quote</th><th>Customer</th><th>Requested</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const on = r.kind === "request" ? pickedRequest === r.id : picked === r.id;
                  return (
                    <tr key={`${r.kind}-${r.id}`} data-href="" data-quote={r.number} aria-selected={on}
                        style={on ? { background: "var(--pc-blue-tint, #EEF4FF)" } : undefined}
                        onClick={() => go(r.kind === "request" ? { request: r.id } : { quote: r.id })}>
                      <td><b>{r.number}</b>{r.by_copilot && <div className="pc-sub-line">By the Copilot</div>}</td>
                      <td>{r.customer}</td>
                      <td>{day(r.requested_at)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.total == null ? "—" : money(r.total)}</td>
                      <td><span className="pc-pill" data-tone={TONE[r.status]} style={{ textTransform: "none" }}>{r.status_words}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div>
          {making ? (
            <StartPanel title="New quote" onStarted={(id) => { load(); go({ quote: id }); }} onClose={() => go({})} />
          ) : request ? (
            <RequestPanel row={request} onStarted={(id) => { load(); go({ quote: id }); }}
              onArchived={() => { load(); go({}); }} />
          ) : picked ? (
            <QuotePanel id={picked} onChanged={load} />
          ) : (
            <div className="pc-panel"><div className="pc-panel-body"><p className="pc-sub-line">Choose a quote or a request to price it, or start a new quote.</p></div></div>
          )}
        </div>
      </div>
    </OrdersFrame>
  );
}

/** Whose account a quote goes on: a draft order needs an account (a guest has none). */
function CustomerPicker({ initial, onPick }: { initial: string; onPick: (c: { id: string; name: string }) => void }) {
  const [q, setQ] = useState(initial);
  const [found, setFound] = useState<{ id: string; name: string; email?: string | null }[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      customersService.list({ q: q.trim() || undefined, page_size: 8, sort: "name" })
        .then((d) => setFound(d.items.filter((r) => r.kind !== "guest").map((r) => ({ id: r.id, name: r.name, email: r.email }))))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label className="pc-label" htmlFor="quote-customer">Customer account</label>
      <label className="pc-field" style={{ maxWidth: "none" }}>
        <Search size={16} />
        <input id="quote-customer" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" />
      </label>
      {found && (found.length ? (
        <div className="pc-card" style={{ boxShadow: "none" }}>
          {found.map((c) => (
            <button key={c.id} type="button" className="pc-pop-item" style={{ display: "block", width: "100%", textAlign: "left" }} onClick={() => onPick(c)}>
              <b>{c.name}</b>{c.email ? <span className="pc-sub-line" style={{ marginLeft: 8 }}>{c.email}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="pc-sub-line">No account matches. A quote goes on a customer&apos;s account: <Link className="pc-link" href="/admin/customers">add the customer</Link> first, then come back.</p>
      ))}
    </div>
  );
}

function StartPanel({ title, initial = "", requestId, children, onStarted, onClose }: {
  title: string; initial?: string; requestId?: string; children?: React.ReactNode;
  onStarted: (id: string) => void; onClose?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start(c: { id: string; name: string }) {
    setBusy(true);
    try {
      const d = await apiClient.post<{ id: string }>("/api/v1/admin/orders/draft", { company_id: c.id, ...(requestId ? { quote_request_id: requestId } : {}) });
      onStarted(d.id);
    } catch (e) {
      setError(errorText(e, "The quote could not be started."));
    } finally { setBusy(false); }
  }
  return (
    <div className="pc-panel">
      <div className="pc-panel-head">
        <h2 className="pc-h2" style={{ margin: 0 }}>{title}</h2>
        {onClose && <button type="button" className="pc-btn" onClick={onClose}>Close</button>}
      </div>
      <div className="pc-panel-body">
        {children}
        {error && <div className="pc-flash" data-bad="" role="status">{error}</div>}
        {busy ? <p className="pc-sub-line">Starting the quote…</p> : <CustomerPicker initial={initial} onPick={start} />}
      </div>
    </div>
  );
}

function RequestPanel({ row, onStarted, onArchived }: { row: Row; onStarted: (id: string) => void; onArchived: () => void }) {
  async function archive() {
    if (!(await ask("Archive this quote request? It leaves Quotes and the Inbox's open list.", { title: "Archive request", ok: "Archive" }))) return;
    try {
      await apiClient.patch(`/api/v1/admin/contact-submissions/${row.id}`, { archived: true });
      onArchived();
    } catch (e) { tell(errorText(e, "The request could not be archived.")); }
  }
  const who = row.from;
  return (
    <StartPanel title={`Quote request ${row.number}`} initial={who?.email || who?.company || ""} requestId={row.id} onStarted={onStarted}>
      <div>
        <div className="pc-label">What the customer asked for</div>
        <div style={{ display: "grid", gap: 6 }}>
          <div><b>{who?.name || who?.company || "Someone"}</b>{who?.email ? ` · ${who.email}` : ""}{who?.phone ? ` · ${who.phone}` : ""}</div>
          {who?.company && who?.name && <div className="pc-sub-line">{who.company}</div>}
          {who?.message && <p style={{ margin: 0, whiteSpace: "pre-line" }}>{who.message}</p>}
          {who?.fields?.map((f) => <div key={f.label} className="pc-sub-line">{f.label}: {f.value}</div>)}
        </div>
      </div>
      <p className="pc-sub-line" style={{ margin: 0 }}>Choose the account the quote goes on to price it.</p>
      <button type="button" className="pc-btn" onClick={archive}>Archive request</button>
    </StartPanel>
  );
}

function QuotePanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [q, setQ] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [until, setUntil] = useState("");
  const [message, setMessage] = useState("");
  const [flash, setFlash] = useState("");

  const load = useCallback(() => {
    apiClient.get<Quote>(`/api/v1/admin/quotes/${id}?utc_offset=${offset()}`)
      .then((d) => { setQ(d); setError(""); setUntil((u) => u || d.valid_until || d.default_valid_until); })
      .catch((e) => setError(errorText(e, "The quote could not be loaded.")));
  }, [id]);
  useEffect(() => { setQ(null); setUntil(""); setMessage(""); setFlash(""); load(); }, [load]);

  const open = q && q.status !== "ordered";
  async function removeLine(l: Line) {
    if (!(await ask(`Take ${l.quantity} × ${l.name} off the quote?`, { title: "Remove line", ok: "Remove" }))) return;
    setBusy(l.id);
    try { await apiClient.delete(`/api/v1/admin/orders/${id}/items/${l.id}`); load(); onChanged(); }
    catch (e) { tell(errorText(e, "The line could not be removed.")); }
    finally { setBusy(null); }
  }
  async function send() {
    if (!q) return;
    setBusy("send");
    try {
      const r = await apiClient.post<{ sent_to: string }>(`/api/v1/admin/quotes/${id}/send`, { valid_until: until, message: message.trim() || null, utc_offset: offset() });
      setFlash(`Sent to ${r.sent_to}. It holds until ${day(until)}.`);
      load(); onChanged();
    } catch (e) { setFlash(""); tell(errorText(e, "The quote could not be sent.")); }
    finally { setBusy(null); }
  }
  async function convert() {
    if (!q) return;
    const sure = await ask(
      `Convert quote ${q.number} into an order for ${q.customer}? It takes the next order number and its invoice for ${money(q.total)} is emailed to the customer.`,
      { title: "Convert to order", ok: "Convert" });
    if (!sure) return;
    setBusy("convert");
    try {
      const r = await apiClient.post<{ order_number: string }>(`/api/v1/admin/quotes/${id}/convert`, {});
      setFlash(`Quote ${q.number} is order ${r.order_number}.`);
      load(); onChanged();
    } catch (e) { tell(errorText(e, "The quote could not be converted.")); }
    finally { setBusy(null); }
  }

  if (error) return <div className="pc-panel"><div className="pc-panel-body"><div className="pc-flash" data-bad="">{error}</div></div></div>;
  if (!q) return <div className="pc-panel"><div className="pc-panel-body"><p className="pc-sub-line">Loading the quote…</p></div></div>;
  return (
    <div className="pc-panel" data-quote-panel={q.number}>
      <div className="pc-panel-head">
        <div>
          <h2 className="pc-h2" style={{ margin: 0 }}>Quote {q.number}</h2>
          <div className="pc-sub-line">{q.customer}</div>
        </div>
        <span className="pc-pill" data-tone={TONE[q.status]} style={{ textTransform: "none" }}>{q.status_words}</span>
      </div>
      <div className="pc-panel-body">
        <p className="pc-sub-line" style={{ margin: 0, whiteSpace: "pre-line" }}>
          {q.asked?.from?.message || q.notes || "No request text: this quote was started by the shop."}
        </p>
        {flash && <div className="pc-flash" role="status">{flash}</div>}

        <div className="pc-card" style={{ boxShadow: "none" }}>
          <table className="pc-table">
            <thead><tr><th>Item</th><th style={{ textAlign: "center" }}>Qty</th><th className="pc-num">Price</th>{open && <th aria-label="Remove" />}</tr></thead>
            <tbody>
              {q.items.length ? q.items.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.name}</b>{(l.color || l.size) && <div className="pc-sub-line">{[l.color, l.size].filter(Boolean).join(" · ")}</div>}
                    <div className="pc-sub-line">{money(l.unit_price)} each</div></td>
                  <td style={{ textAlign: "center" }}>{l.quantity}</td>
                  <td className="pc-num">{money(l.line_total)}</td>
                  {open && <td style={{ width: 40 }}><button type="button" className="pc-btn" aria-label={`Remove ${l.name}`} disabled={busy === l.id} onClick={() => removeLine(l)}><Trash2 size={14} /></button></td>}
                </tr>
              )) : <tr><td colSpan={open ? 4 : 3} className="pc-sub-line">No lines yet. Add what the customer asked for, at the price you quote.</td></tr>}
              {q.items.length > 0 && <tr><td colSpan={2}><b>Total</b></td><td className="pc-num"><b>{money(q.total)}</b></td>{open && <td />}</tr>}
            </tbody>
          </table>
        </div>

        {open && <AddLine orderId={id} onAdded={() => { load(); onChanged(); }} />}

        {q.status === "ordered" ? (
          <div className="pc-note" data-tone="green">
            This quote is order <Link className="pc-link" href={`/admin/orders/${q.id}`}>{q.order_number}</Link>.
          </div>
        ) : (
          <>
            <div>
              <label className="pc-label" htmlFor="quote-until">Valid until</label>
              <input id="quote-until" className="pc-input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
            <div>
              <label className="pc-label" htmlFor="quote-message">Message to the customer <span className="pc-sub-line">(optional)</span></label>
              <textarea id="quote-message" className="pc-input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {q.sent_at && <p className="pc-sub-line" style={{ margin: 0 }}>Sent {day(q.sent_at)}{q.sent_to ? ` to ${q.sent_to}` : ""}, valid until {day(q.valid_until)}.
              {q.accepted_at ? ` Accepted ${day(q.accepted_at)}.` : ""}</p>}
            <div className="pc-row-actions">
              <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy || !q.items.length || !until} onClick={send}>
                {busy === "send" ? "Sending…" : q.sent_at ? "Send again" : "Send quote"}
              </button>
              <button type="button" className="pc-btn" disabled={!!busy || !q.items.length} onClick={convert}>
                {busy === "convert" ? "Converting…" : "Convert to order"}
              </button>
            </div>
            <p className="pc-sub-line" style={{ margin: 0 }}>Accepted quotes convert to an order in one click, with the customer, items and price carried over.</p>
          </>
        )}
      </div>
    </div>
  );
}

/** A line at the price the shop quotes: a product's variant, how many, and the price each. */
function AddLine({ orderId, onAdded }: { orderId: string; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [variant, setVariant] = useState<{ id: string; label: string } | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setProducts(null); return; }
    const t = setTimeout(() => {
      adminService.listProducts({ q: q.trim() })
        .then((res: unknown) => {
          const r = res as { items?: Product[] } | Product[] | null;
          setProducts(Array.isArray(r) ? r : r?.items ?? []);
        })
        .catch(() => setProducts([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  async function add() {
    if (!variant) return;
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/admin/orders/${orderId}/items`, { variant_id: variant.id, quantity: Math.max(1, Math.round(Number(qty) || 1)), unit_price: Number(price) || 0 });
      setVariant(null); setQ(""); setQty("1"); setPrice(""); setProducts(null);
      onAdded();
    } catch (e) { tell(errorText(e, "The line could not be added.")); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label className="pc-label" htmlFor="quote-product">Add a line</label>
      {variant ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div><b>{variant.label}</b> <button type="button" className="pc-link" style={{ background: "none", border: 0 }} onClick={() => setVariant(null)}>Change</button></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <label><span className="pc-label">Qty</span><input className="pc-input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
            <label><span className="pc-label">Price each ($)</span><input className="pc-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy || !(Number(price) > 0)} onClick={add}>{busy ? "Adding…" : "Add"}</button>
          </div>
        </div>
      ) : (
        <>
          <label className="pc-field" style={{ maxWidth: "none" }}>
            <Search size={16} />
            <input id="quote-product" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" />
          </label>
          {products && (products.length ? (
            <div className="pc-card" style={{ boxShadow: "none", maxHeight: 240, overflowY: "auto" }}>
              {products.flatMap((p) => (p.variants ?? []).map((v) => {
                const label = [p.name, v.color, v.size].filter(Boolean).join(" · ");
                return (
                  <button key={v.id} type="button" className="pc-pop-item" style={{ display: "block", width: "100%", textAlign: "left" }}
                    onClick={() => { setVariant({ id: v.id, label }); setPrice(String(Number(v.retail_price) || "")); }}>
                    {label} <span className="pc-sub-line">{money(Number(v.retail_price) || 0)}</span>
                  </button>
                );
              }))}
            </div>
          ) : <p className="pc-sub-line">No product matches.</p>)}
        </>
      )}
    </div>
  );
}
