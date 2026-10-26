"use client";

/**
 * Asking for a reprint or a refund: one form, tied to an order and the lines
 * on it. It becomes a return request the shop answers from its Returns screen
 * (and the order's history says so). Returns belong to a company account; a
 * retail buyer is pointed to Messages instead.
 */
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { accountService } from "@/services/account.service";
import { apiClient } from "@/lib/api-client";
import { day, money } from "@/lib/customerWords";
import { Banner, Loading, PageHead, Tabs, num } from "@/components/portal/ui";
import type { OrderPage, OrderRow } from "@/components/portal/data";

const REASONS = ["Wrong file printed", "Print quality", "Damaged in transit", "Wrong item or size", "Missing items", "Other"];

interface Line {
  id: string;
  sku: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: string;
}

function ReturnForm() {
  const params = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [lines, setLines] = useState<Line[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [want, setWant] = useState<"Reprint" | "Refund">("Reprint");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<OrderPage>("/api/v1/orders?page=1&page_size=50")
      .then((d) => setOrders(d.items.filter((o) => !["cancelled", "refunded"].includes(o.status) && !o.order_number.startsWith("DRAFT-"))))
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    if (!orderId) { setLines(null); return; }
    setLines(null);
    (accountService.getOrder(orderId) as Promise<{ items: Line[] }>)
      .then((o) => {
        setLines(o.items ?? []);
        setPicked(Object.fromEntries((o.items ?? []).map((l) => [l.id, l.quantity])));
      })
      .catch(() => setLines([]));
  }, [orderId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const items = Object.entries(picked).filter(([, q]) => q > 0).map(([id, q]) => ({ order_item_id: id, quantity: q, reason }));
    if (!orderId) return setError("Choose the order this is about.");
    if (!reason) return setError("Choose what happened.");
    if (!items.length) return setError("Tick at least one item.");
    setSending(true);
    try {
      const rma = await apiClient.post<{ rma_number: string }>("/api/v1/account/rma", {
        order_id: orderId,
        reason,
        items,
        notes: [`Would like: ${want}`, details.trim()].filter(Boolean).join("\n\n"),
      });
      setMade(rma.rma_number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your request could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (!user?.company_id) {
    return (
      <div className="cp-card cp-pad cp-stack-sm">
        <h2 className="cp-h3">Ask the shop in Messages</h2>
        <p className="cp-note" style={{ margin: 0 }}>Tell the shop which order it is and what went wrong, and they will sort out a reprint or refund with you.</p>
        <div><Link href="/account/messages" className="cp-btn cp-btn-p">Write to the shop</Link></div>
      </div>
    );
  }

  if (made) {
    return (
      <div className="cp-card cp-pad cp-stack-sm">
        <Banner tone="ok">Request {made} sent. The shop answers by email, and you can follow it under Returns and reprints.</Banner>
        <div className="cp-actions">
          <Link href="/account/orders?tab=returns" className="cp-btn cp-btn-p">See your requests</Link>
          <Link href={`/account/orders/${orderId}`} className="cp-btn">Back to the order</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-cols">
      <form className="cp-col-main" onSubmit={send}>
        <section className="cp-card cp-pad cp-stack-sm" style={{ gap: 16 }}>
          <h2 className="cp-h2">What happened?</h2>
          {error && <Banner tone="bad">{error}</Banner>}
          <div className="cp-grid2">
            <div className="cp-field">
              <label className="cp-label" htmlFor="r-order">Order</label>
              {orders === null ? <Loading /> : (
                <select id="r-order" className="cp-select" value={orderId} onChange={(e) => setOrderId(e.target.value)} required>
                  <option value="">Choose an order</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>Order {o.order_number}, {day(o.created_at)}, {money(num(o.total))}</option>)}
                </select>
              )}
            </div>
            <div className="cp-field">
              <label className="cp-label" htmlFor="r-reason">Reason</label>
              <select id="r-reason" className="cp-select" value={reason} onChange={(e) => setReason(e.target.value)} required>
                <option value="">Choose a reason</option>
                {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {orderId && (
            <div className="cp-field">
              <span className="cp-label">Which items?</span>
              {lines === null ? <Loading /> : lines.length === 0 ? <p className="cp-note" style={{ margin: 0 }}>No items found on this order.</p> : (
                <div className="cp-card" style={{ overflow: "hidden" }}>
                  <div className="cp-tbl-wrap">
                    <table className="cp-tbl" style={{ minWidth: 480 }}>
                      <thead><tr><th><span className="cp-sr">Include</span></th><th>Item</th><th className="cp-num">Ordered</th><th className="cp-num">Quantity</th></tr></thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.id}>
                            <td style={{ width: 40 }}>
                              <input type="checkbox" aria-label={`Include ${l.product_name}`} checked={(picked[l.id] ?? 0) > 0}
                                onChange={(e) => setPicked((p) => ({ ...p, [l.id]: e.target.checked ? l.quantity : 0 }))}
                                style={{ width: 18, height: 18, accentColor: "var(--cp-accent)" }} />
                            </td>
                            <td>{l.product_name} <span className="cp-muted">{[l.color, l.size].filter(Boolean).join(" / ")}</span></td>
                            <td className="cp-num">{l.quantity}</td>
                            <td className="cp-num" style={{ width: 120 }}>
                              <input className="cp-input" type="number" min={0} max={l.quantity} value={picked[l.id] ?? 0}
                                aria-label={`Quantity of ${l.product_name}`} style={{ height: 36, width: 90, textAlign: "right" }}
                                onChange={(e) => setPicked((p) => ({ ...p, [l.id]: Math.max(0, Math.min(l.quantity, Math.floor(Number(e.target.value) || 0))) }))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="cp-field">
            <span className="cp-label">What would you like?</span>
            <div className="cp-grid2" role="radiogroup" aria-label="What would you like?">
              {(["Reprint", "Refund"] as const).map((w) => (
                <button key={w} type="button" role="radio" aria-checked={want === w} className="cp-choice" onClick={() => setWant(w)}>
                  <span>
                    <span className="cp-strong" style={{ display: "block" }}>{w}</span>
                    <span className="cp-note">{w === "Reprint" ? "We print it again." : "Money back to how you paid."}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="cp-field">
            <label className="cp-label" htmlFor="r-details">Tell us more</label>
            <textarea id="r-details" className="cp-textarea" rows={5} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)}
              placeholder="What went wrong, and anything the shop should know." />
          </div>
          <div className="cp-actions" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="cp-btn cp-btn-p" disabled={sending}>{sending ? "Sending…" : "Send request"}</button>
          </div>
        </section>
      </form>
      <aside className="cp-col-side">
        <section className="cp-card cp-pad cp-stack-sm">
          <h2 className="cp-h3">How it works</h2>
          <p className="cp-note" style={{ margin: 0 }}>The shop looks at your request and answers by email. You can follow it under Returns and reprints, and on the order itself.</p>
          <p className="cp-note" style={{ margin: 0 }}>Have photos of the problem? Send them in Messages after you send this, and mention the request number.</p>
        </section>
      </aside>
    </div>
  );
}

export default function NewReturnPage() {
  const user = useAuthStore((s) => s.user);
  const company = !!user?.company_id;
  return (
    <>
      <PageHead eyebrow="Orders" title="Request a reprint or return" sub="One form, tied to your order." />
      {company && (
        <Tabs label="Orders" tabs={[
          { key: "all", label: "All orders", href: "/account/orders", on: false },
          { key: "saved", label: "Saved for later", href: "/account/orders?tab=saved", on: false },
          { key: "returns", label: "Returns and reprints", href: "/account/orders?tab=returns", on: true },
          { key: "receipts", label: "Receipts", href: "/account/orders?tab=receipts", on: false },
        ]} />
      )}
      <Suspense fallback={<Loading />}>
        <ReturnForm />
      </Suspense>
    </>
  );
}
