// frontend/src/app/(customer)/account/orders/[id]/page.tsx
"use client";

/**
 * One order: its lines, where it is, what it came to, what happened to it and
 * when, and a note to the shop about it. Reorder, the order's PDFs, paying a
 * shop invoice and asking for a reprint or return all start here.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { tell } from "@/lib/dialog";
import { useBranding } from "@/components/providers/BrandingProvider";
import { accountService } from "@/services/account.service";
import { gangSheetsService } from "@/services/gangSheets.service";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { ConfigurationDetail } from "@/components/shared/ConfigurationDetail";
import type { LineConfiguration, OrderDiscountLine } from "@/types/order.types";
import { discountAmount, discountLabel } from "@/lib/orderMoney";
import { day, money } from "@/lib/customerWords";
import {
  Banner, Loading, OrderChip, PageHead, PaymentChip, Steps, num, saveOrderPdf,
} from "@/components/portal/ui";
import { jobState, reorderToCart, type Job } from "@/components/portal/data";

interface OrderItem {
  id: string;
  sku: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
  /** Configured products: the options chosen at the time of ordering. */
  configuration?: LineConfiguration | null;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: string;
  subtotal: string;
  shipping_cost: string;
  tax_amount?: string | null;
  /** "Tax (WY · 6%)": where the tax was charged and at what rate. */
  tax_label?: string | null;
  /** What took money off the total: the discount code, and what it saved. */
  discounts?: OrderDiscountLine[];
  amount_paid?: string | null;
  convenience_fee?: string | null;
  po_number: string | null;
  order_notes: string | null;
  tracking_number: string | null;
  tracking_url?: string | null;
  carrier: string | null;
  courier_service?: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

interface Comment {
  id: string;
  body: string;
  is_admin: boolean;
  author_name: string | null;
  created_at: string;
}

interface OrderHistoryEvent {
  id: string;
  type: string;
  label: string;
  message: string;
  actor_type: string;
  actor_name: string | null;
  occurred_at: string;
}

interface CompanyAddress {
  name: string | null;
  company_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
}

const ORDER_STEPS = ["Placed", "Confirmed", "Processing", "Shipped", "Delivered"];
const ORDER_AT: Record<string, number> = { pending: 0, confirmed: 1, processing: 2, ready_for_pickup: 2, shipped: 3, delivered: 4 };

type Pdf = "confirmation" | "invoice" | "ship-confirmation" | "pack-slip";

export default function OrderDetailPage() {
  const { store_name: brandName } = useBranding();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const company = !!user?.company_id;

  const [order, setOrder] = useState<Order | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [sent, setSent] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [companyAddress, setCompanyAddress] = useState<CompanyAddress | null>(null);
  const [history, setHistory] = useState<OrderHistoryEvent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [saving, setSaving] = useState<Pdf | null>(null);
  const commentEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated()) return;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const orderData = await accountService.getOrder(id) as Order;
        setOrder(orderData);
        // Comments, history and print jobs use the real id (the address may carry the number).
        const [c, h, j] = await Promise.all([
          (accountService.getOrderComments(orderData.id) as Promise<Comment[]>).catch(() => [] as Comment[]),
          apiClient.get<{ events: OrderHistoryEvent[] }>(`/api/v1/orders/${orderData.id}/events`).catch(() => ({ events: [] })),
          (gangSheetsService.myOrders() as Promise<Job[]>).catch(() => [] as Job[]),
        ]);
        setComments(c);
        setHistory(h.events ?? []);
        setJobs(j.filter((x) => x.order_id === orderData.id));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "This order could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    load();
    // The company's billing address (best effort).
    apiClient.get<{ company: CompanyAddress | null }>("/api/v1/account/profile/full")
      .then((d) => { if (d.company) setCompanyAddress(d.company); })
      .catch(() => {});
  }, [id, authLoading, retryCount, isAuthenticated]);

  async function handleReorder() {
    setIsReordering(true);
    try {
      await reorderToCart(order?.id ?? id);
      router.push("/cart");
    } catch {
      tell("This order could not be added to your cart. Please try again.");
      setIsReordering(false);
    }
  }

  async function handleSendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSendingComment(true);
    try {
      const newComment = await accountService.addOrderComment(order?.id ?? id, commentBody.trim()) as Comment;
      setComments((prev) => [...prev, newComment]);
      setCommentBody("");
      setSent(true);
      setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    } catch {
      tell("Your message could not be sent. Please try again.");
    } finally {
      setSendingComment(false);
    }
  }

  async function downloadPdf(type: Pdf) {
    setSaving(type);
    if (!await saveOrderPdf(order?.id ?? id, type, order?.order_number)) {
      tell("Failed to download PDF. Please try again.");
    }
    setSaving(null);
  }

  if (loading) return <Loading what="Loading order" />;

  if (loadError) {
    return (
      <>
        <PageHead back={{ href: "/account/orders", label: "Orders" }} eyebrow="Order" title="Order" />
        <Banner tone="bad" onRetry={() => setRetryCount((c) => c + 1)}>{loadError}</Banner>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <PageHead back={{ href: "/account/orders", label: "Orders" }} eyebrow="Order" title="Order not found" />
      </>
    );
  }

  const isShipped = ["shipped", "delivered"].includes(order.status);
  const closed = order.status === "cancelled" || order.status === "refunded";
  const paid = num(order.amount_paid);
  const balance = Math.max(0, num(order.total) - paid);
  const payable = order.order_number?.startsWith("DRAFT-") && order.payment_status !== "paid" && !closed;
  const returnHref = company
    ? `/account/returns/new?order=${order.id}`
    : `/account/messages?order=${encodeURIComponent(order.order_number)}&topic=return`;

  return (
    <>
      <PageHead
        back={{ href: "/account/orders", label: "Orders" }}
        eyebrow="Order"
        title={<>Order {order.order_number}</>}
        sub={<>Placed {day(order.created_at)}{order.po_number ? ` · PO ${order.po_number}` : ""}</>}
        actions={
          <>
            <button type="button" className="cp-btn" onClick={handleReorder} disabled={isReordering}>
              {isReordering ? "Adding…" : "Reorder"}
            </button>
            <button type="button" className="cp-btn" onClick={() => downloadPdf("invoice")} disabled={saving === "invoice"}>
              {saving === "invoice" ? "Preparing…" : "Download invoice"}
            </button>
            {!closed && <Link href={returnHref} className="cp-btn">Request a reprint or return</Link>}
            <span className="cp-actions"><OrderChip status={order.status} /><PaymentChip status={order.payment_status} /></span>
          </>
        }
      />

      {payable && (
        <div style={{ marginBottom: 24 }}>
          <Banner tone="warn">
            Invoice payment pending: {money(paid > 0 ? balance : num(order.total))} {paid > 0 ? "left to pay" : "to pay"}.
            <a href={`/checkout/invoice/${order.order_number}`} className="cp-btn cp-btn-p cp-btn-sm" style={{ marginLeft: 12 }}>
              {paid > 0 ? "Pay balance" : "Pay now"}
            </a>
          </Banner>
        </div>
      )}

      <div className="cp-cols">
        <div className="cp-col-main">
          {!closed && (
            <section className="cp-card cp-pad" aria-label="Progress">
              <Steps steps={ORDER_STEPS} at={ORDER_AT[order.status] ?? 0} finished={order.status === "delivered"} />
            </section>
          )}

          <section className="cp-card" style={{ overflow: "hidden" }} aria-labelledby="items">
            <div style={{ padding: "16px 20px" }}><h2 id="items" className="cp-h2">Items</h2></div>
            <div className="cp-tbl-wrap">
              <table className="cp-tbl">
                <thead><tr><th>SKU</th><th>Product</th><th className="cp-num">Qty</th><th className="cp-num">Unit</th><th className="cp-num">Total</th></tr></thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="cp-mono cp-muted">{item.sku}</td>
                      <td>
                        {item.product_name}
                        {(item.color || item.size) && (
                          <span className="cp-muted" style={{ marginLeft: 6, fontSize: 13 }}>{[item.color, item.size].filter(Boolean).join(" / ")}</span>
                        )}
                        <ConfigurationDetail configuration={item.configuration} />
                      </td>
                      <td className="cp-num">{item.quantity}</td>
                      <td className="cp-num">{money(num(item.unit_price))}</td>
                      <td className="cp-num">{money(num(item.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="cp-card cp-pad" aria-labelledby="shipment">
            <div className="cp-card-head">
              <h2 id="shipment" className="cp-h2">Shipment</h2>
              {isShipped ? <OrderChip status={order.status} /> : <span className="cp-chip">Not shipped</span>}
            </div>
            {order.tracking_number ? (
              <div className="cp-stack-sm">
                <dl className="cp-kv" style={{ margin: 0 }}>
                  {order.carrier && <div><dt>Carrier</dt><dd>{order.carrier.toUpperCase()}{order.courier_service ? `, ${order.courier_service}` : ""}</dd></div>}
                  <div><dt>Tracking number</dt><dd className="cp-mono">{order.tracking_number}</dd></div>
                </dl>
                {order.tracking_url && (
                  <div><a href={order.tracking_url} target="_blank" rel="noreferrer" className="cp-btn cp-btn-p">Track package</a></div>
                )}
              </div>
            ) : (
              <p className="cp-note" style={{ margin: 0 }}>
                {order.status === "ready_for_pickup" ? "Ready for pickup." : "Carrier and tracking appear here when it ships."}
              </p>
            )}
          </section>

          <section className="cp-card cp-pad" aria-labelledby="order-messages">
            <h2 id="order-messages" className="cp-h2" style={{ marginBottom: 14 }}>Messages about this order</h2>
            {comments.length > 0 && (
              <div className="cp-thread" style={{ marginBottom: 14 }}>
                {comments.map((c) => (
                  <div key={c.id} className="cp-bubble" data-from={c.is_admin ? "shop" : "me"}>
                    <small>
                      {c.is_admin ? (brandName || c.author_name || "The shop") : (c.author_name || "You")} · {new Date(c.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </small>
                    {c.body}
                  </div>
                ))}
                <div ref={commentEndRef} />
              </div>
            )}
            {sent && <div style={{ marginBottom: 12 }}><Banner tone="ok">Sent. The shop sees it on your order and answers by email.</Banner></div>}
            <form onSubmit={handleSendComment} className="cp-stack-sm">
              <label className="cp-sr" htmlFor="order-note">Write to the shop</label>
              <textarea id="order-note" className="cp-textarea" placeholder="Write to the shop" maxLength={2000}
                value={commentBody} onChange={(e) => { setCommentBody(e.target.value); setSent(false); }} />
              <div className="cp-actions" style={{ justifyContent: "space-between" }}>
                <span className="cp-note">The shop answers by email.</span>
                <button type="submit" className="cp-btn cp-btn-p" disabled={!commentBody.trim() || sendingComment}>
                  {sendingComment ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </section>

          {order.order_notes && (
            <section className="cp-card cp-pad" aria-labelledby="notes">
              <h2 id="notes" className="cp-h3" style={{ marginBottom: 8 }}>Order notes</h2>
              <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{order.order_notes}</p>
            </section>
          )}
        </div>

        <div className="cp-col-side">
          <section className="cp-card cp-pad" aria-labelledby="totals">
            <h2 id="totals" className="cp-h2" style={{ marginBottom: 14 }}>Totals</h2>
            <dl className="cp-kv" style={{ margin: 0 }}>
              <div><dt>Subtotal</dt><dd>{money(num(order.subtotal))}</dd></div>
              {(order.discounts ?? []).map((d, i) => (
                <div key={i}><dt>{discountLabel(d)}</dt><dd style={{ color: "var(--cp-ok)" }}>{discountAmount(d)}</dd></div>
              ))}
              <div><dt>Shipping</dt><dd>{money(num(order.shipping_cost))}</dd></div>
              <div><dt>{order.tax_label || "Tax"}</dt><dd>{money(num(order.tax_amount))}</dd></div>
              {num(order.convenience_fee) > 0 && <div><dt>Convenience fee (3%)</dt><dd>{money(num(order.convenience_fee))}</dd></div>}
              <div className="cp-kv-total"><dt className="k">Total</dt><dd className="v">{money(num(order.total))}</dd></div>
              {paid > 0 && <div><dt>Paid</dt><dd>{money(paid)}</dd></div>}
              {paid > 0 && balance > 0 && !closed && <div><dt>Balance due</dt><dd>{money(balance)}</dd></div>}
              {order.payment_status === "refunded" && <div><dt>Refunded</dt><dd>{money(paid || num(order.total))}</dd></div>}
            </dl>
          </section>

          {history.length > 0 && (
            <section className="cp-card cp-pad" aria-labelledby="history">
              <h2 id="history" className="cp-h2" style={{ marginBottom: 14 }}>History</h2>
              <ol className="cp-history">
                {history.map((e) => {
                  const when = new Date(e.occurred_at);
                  return (
                    <li key={e.id}>
                      <span className="dot" aria-hidden />
                      <div>
                        <div className="t">{e.label}</div>
                        {e.message && e.message !== e.label && <div className="s">{e.message}</div>}
                        <time className="s" dateTime={e.occurred_at} title={when.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" })} style={{ display: "block" }}>
                          {when.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {jobs.length > 0 && (
            <section className="cp-card cp-pad" aria-labelledby="linked-jobs">
              <h2 id="linked-jobs" className="cp-h2" style={{ marginBottom: 14 }}>{jobs.length === 1 ? "Linked print job" : "Linked print jobs"}</h2>
              <div className="cp-rows">
                {jobs.map((j) => (
                  <div key={j.id} className="cp-row">
                    <div className="cp-row-body">
                      <div className="cp-row-t">{j.kind === "upload_by_size" ? "Print" : "Gang sheet"} {j.reference}</div>
                      <div className="cp-row-s">{jobState(j)[0]}</div>
                    </div>
                    <Link href={`/account/gang-sheets/${j.id}`} className="cp-btn cp-btn-sm">View job</Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="cp-card cp-pad" aria-labelledby="documents">
            <h2 id="documents" className="cp-h2" style={{ marginBottom: 14 }}>Documents</h2>
            <div className="cp-stack-sm">
              <button type="button" className="cp-btn cp-btn-block" disabled={saving === "confirmation"} onClick={() => downloadPdf("confirmation")}>
                {saving === "confirmation" ? "Preparing…" : "Order confirmation"}
              </button>
              <button type="button" className="cp-btn cp-btn-block" disabled={saving === "invoice"} onClick={() => downloadPdf("invoice")}>
                {saving === "invoice" ? "Preparing…" : "Invoice"}
              </button>
              {isShipped && (
                <button type="button" className="cp-btn cp-btn-block" disabled={saving === "ship-confirmation"} onClick={() => downloadPdf("ship-confirmation")}>
                  {saving === "ship-confirmation" ? "Preparing…" : "Ship confirmation"}
                </button>
              )}
              {["processing", "shipped", "delivered"].includes(order.status) && (
                <button type="button" className="cp-btn cp-btn-block" disabled={saving === "pack-slip"} onClick={() => downloadPdf("pack-slip")}>
                  {saving === "pack-slip" ? "Preparing…" : "Packing slip"}
                </button>
              )}
            </div>
          </section>

          {companyAddress && (companyAddress.address_line1 || companyAddress.company_email) && (
            <section className="cp-card cp-pad" aria-labelledby="billing">
              <h2 id="billing" className="cp-h3" style={{ marginBottom: 8 }}>Billing address</h2>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                {companyAddress.name && <div className="cp-strong">{companyAddress.name}</div>}
                {companyAddress.address_line1 && <div>{companyAddress.address_line1}</div>}
                {companyAddress.address_line2 && <div>{companyAddress.address_line2}</div>}
                {(companyAddress.city || companyAddress.state_province || companyAddress.postal_code) && (
                  <div>{[companyAddress.city, companyAddress.state_province, companyAddress.postal_code].filter(Boolean).join(", ")}</div>
                )}
                {companyAddress.country && <div>{companyAddress.country}</div>}
                {companyAddress.company_email && <div className="cp-muted">{companyAddress.company_email}</div>}
                {companyAddress.phone && <div className="cp-muted">{companyAddress.phone}</div>}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
