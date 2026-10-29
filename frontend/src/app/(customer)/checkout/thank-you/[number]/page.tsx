"use client";

/**
 * The page after a checkout: /checkout/thank-you/<order number>.
 *
 * Each order has its own address and is read back from the server, so a
 * reload, a new tab or the back and forward buttons still show it (see
 * lib/orderThanks.ts). The Purchase event is sent here, as the page opens,
 * the way tag managers expect it: the review page holds it for the tab that
 * placed the order, and it goes once (lib/tracking sendHeldPurchase), so a
 * reload of this page or a second tab does not count the sale twice.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ConfigurationDetail } from "@/components/shared/ConfigurationDetail";
import { apiClient } from "@/lib/api-client";
import { orderKey, type ThankYouAddress, type ThankYouOrder } from "@/lib/orderThanks";
import { sendHeldPurchase } from "@/lib/tracking";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";

const SHIPPING_LABELS: Record<string, string> = {
  standard: "Standard Ground",
  expedited: "Expedited (2-Day)",
  will_call: "Will Call Pickup",
  freight: "Freight / LTL",
};

const PAYMENT_LABELS: Record<string, string> = {
  card: "Credit card",
  ach: "ACH / Bank transfer",
  net_30: "Net 30, pay by invoice",
  cod: "Cash on delivery",
  gift_card: "Gift card",
};

/** Where the order stands on money, said the way the buyer needs to hear it. */
function paymentNote(o: ThankYouOrder): string | null {
  if (o.payment_status === "paid") return "Paid";
  // Checkout took bank details, not money: the shop marks it paid on arrival.
  if (o.payment_method === "ach") return "Waiting for your bank transfer";
  if (o.payment_method === "cod") return `Pay ${formatCurrency(o.total)} when it arrives`;
  if (o.payment_method === "net_30") return "Pay by invoice, net 30";
  return "Not paid yet";
}

function shippingWords(o: ThankYouOrder): string {
  const base = SHIPPING_LABELS[o.shipping_method ?? ""] ?? "Shipping";
  const service = [o.carrier, o.courier_service].filter(Boolean).join(" ");
  return o.shipping_method !== "will_call" && service ? `${base}, ${service}` : base;
}

/** Whether this tab is the one that just placed this order: the review page
 *  leaves its number behind (af_confirmed_order, sessionStorage). */
function placedHere(orderNumber: string): boolean {
  try {
    const kept = JSON.parse(sessionStorage.getItem("af_confirmed_order") || "{}") as { number?: string };
    return kept.number === orderNumber;
  } catch {
    return false;
  }
}

function AddressLines({ a }: { a: ThankYouAddress }) {
  const region = [a.city, [a.state, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <>
      {a.full_name ? <div>{a.full_name}</div> : null}
      <div>{a.line1}</div>
      {a.line2 ? <div>{a.line2}</div> : null}
      {region ? <div>{region}</div> : null}
      {a.country && a.country !== "US" ? <div>{a.country}</div> : null}
      {a.phone ? <div>{a.phone}</div> : null}
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="ty-k">{title}</div>
      <div className="ty-v">{children}</div>
    </div>
  );
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`ty-sum${strong ? " ty-sum-total" : ""}`}>
      <span>{label}</span>
      <span className="ui-num">{value}</span>
    </div>
  );
}

export default function ThankYouPage() {
  const params = useParams<{ number: string }>();
  const number = decodeURIComponent(params?.number ?? "");
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [order, setOrder] = useState<ThankYouOrder | null>(null);
  const [missing, setMissing] = useState(false);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!number || asked.current === number) return;
    const key = orderKey(number);
    // Without this browser's key the sign-in is what opens the order, so wait
    // for it to be read first.
    if (!key && authLoading) return;
    asked.current = number;
    setOrder(null);
    setMissing(false);
    // In a header, not the query string, which the API's access log keeps.
    apiClient
      .get<ThankYouOrder>(`/api/v1/guest/orders/${encodeURIComponent(number)}/thank-you`,
        key ? { headers: { "X-Order-Key": key } } : undefined)
      .then((o) => {
        setOrder(o);
        // The Purchase, as this page opens, with the order's real figures:
        // once, and only in the tab that placed the order (lib/tracking).
        sendHeldPurchase(number, { total: o.total, tax: o.tax_amount, shipping: o.shipping_cost });
      })
      .catch(() => {
        setMissing(true);
        sendHeldPurchase(number);
      });
  }, [number, authLoading]);

  const signedIn = !authLoading && isAuthenticated();

  if (missing) {
    // The tab that placed the order still holds its number. If the order
    // could not be read back (the network, or the minutes while a release
    // reaches the API), that tab still gets its thank-you, not a dead end.
    const justPlaced = placedHere(number);
    return (
      <div style={{ padding: "72px 24px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          <h1 className="ui-h1">{justPlaced ? "Thank you for your order!" : `Order ${number}`}</h1>
          <p className="ui-lede">
            {justPlaced
              ? <>Order <b className="ui-num">{number}</b> is placed. A confirmation is on its way to your inbox.</>
              : "We could not open this order here. Its confirmation email has the details, and you can follow the order at any time."}
          </p>
          <div className="ty-actions" style={{ justifyContent: "center" }}>
            <Link href={signedIn ? "/account/orders" : "/track-order"} className="ui-btn">
              {signedIn ? "Your orders" : "Track an order"}
            </Link>
            <Link href="/products" className="ui-btn-ghost">Keep shopping</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ padding: "72px 24px", textAlign: "center", color: "var(--ui-muted)", fontSize: 14 }}>
        Loading your order&hellip;
      </div>
    );
  }

  const placed = order.created_at
    ? new Date(order.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const unpaidCod = order.payment_method === "cod" && order.payment_status !== "paid";
  const note = paymentNote(order);
  const trackHref = signedIn ? `/account/orders/${encodeURIComponent(order.order_number)}` : "/track-order";

  return (
    // The checkout layout already draws the page (.ui-page) around this.
    <div style={{ padding: "48px 0 72px" }}>
      <div className="ui-wrap">
        <div className="ty-grid">
          <div className="ty-main">
            <div className="ty-head">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <circle cx="24" cy="24" r="24" fill="var(--ui-ok)" opacity="0.12" />
                <path d="M14 24l7 7 13-13" stroke="var(--ui-ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <div className="ty-k">
                  Order <span className="ui-num">{order.order_number}</span>
                  {placed ? <>, placed {placed}</> : null}
                </div>
                <h1 className="ui-h1" style={{ margin: "2px 0 0" }}>
                  {order.first_name ? `Thank you, ${order.first_name}!` : "Thank you for your order!"}
                </h1>
              </div>
            </div>

            <div className="ui-card ty-card">
              {/* "Placed", not "confirmed": the shop confirms an order later,
                  and the buyer is emailed when it does. */}
              <h2 className="ty-h2">Your order is placed</h2>
              <p className="ty-p">
                {order.email
                  ? <>A confirmation is on its way to <b>{order.email}</b>.</>
                  : <>A confirmation is on its way to your inbox.</>}
                {unpaidCod
                  ? <> Have <b>{formatCurrency(order.total)}</b> ready to pay when it arrives.</>
                  : null}
              </p>
              {order.has_gang_sheet ? (
                <p className="ty-p" style={{ marginTop: 10 }}>
                  Your gang sheet goes to the print team, who check it before it is printed.
                </p>
              ) : null}
            </div>

            <div className="ui-card ty-card">
              <h2 className="ty-h2">Order details</h2>
              <div className="ty-info">
                {order.email ? (
                  <Block title="Contact">
                    {order.company_name ? <div>{order.company_name}</div> : null}
                    <div>{order.email}</div>
                  </Block>
                ) : null}
                {order.pickup ? (
                  <Block title="Pickup location">
                    {order.pickup.name ? <div>{order.pickup.name}</div> : null}
                    {order.pickup.address ? <div>{order.pickup.address}</div> : null}
                    {order.pickup.hours ? <div className="ty-muted">{order.pickup.hours}</div> : null}
                    {order.pickup.note ? <div className="ty-muted">{order.pickup.note}</div> : null}
                  </Block>
                ) : order.ship_to ? (
                  <Block title="Shipping address"><AddressLines a={order.ship_to} /></Block>
                ) : null}
                <Block title={order.shipping_method === "will_call" ? "Collection" : "Shipping method"}>
                  {shippingWords(order)}
                </Block>
                <Block title="Payment">
                  <div>{PAYMENT_LABELS[order.payment_method ?? ""] ?? "Payment"}</div>
                  {note ? <div className="ty-muted">{note}</div> : null}
                </Block>
                {order.po_number ? <Block title="PO number">{order.po_number}</Block> : null}
              </div>
            </div>

            <div className="ty-actions">
              <Link href={trackHref} className="ui-btn">Track this order</Link>
              <Link href="/products" className="ui-btn-ghost">Keep shopping</Link>
            </div>
          </div>

          <aside className="ui-card ty-card ty-summary" aria-label="Order summary">
            <h2 className="ty-h2">Order summary</h2>
            <ul className="ty-lines">
              {order.items.map((line, i) => (
                <li key={i} className="ty-line">
                  <div className="ty-pic">
                    {line.image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={line.image_url} alt="" />
                      : <span aria-hidden="true">{line.gang_sheet ? "GS" : line.name.slice(0, 1).toUpperCase()}</span>}
                    <span className="ty-qty ui-num" aria-label={`Quantity ${line.quantity}`}>{line.quantity}</span>
                  </div>
                  <div className="ty-line-what">
                    <div className="ty-line-name">{line.name}</div>
                    {[line.color, line.size].filter(Boolean).length
                      ? <div className="ty-muted">{[line.color, line.size].filter(Boolean).join(" / ")}</div>
                      : null}
                    {line.configuration ? <ConfigurationDetail configuration={line.configuration} compact /> : null}
                  </div>
                  <div className="ui-num ty-line-total">{formatCurrency(line.line_total)}</div>
                </li>
              ))}
            </ul>
            <div className="ty-sums">
              <SumRow label="Subtotal" value={formatCurrency(order.subtotal)} />
              {order.discounts.map((d, i) => (
                <SumRow key={i} label={d.label || (d.code ? `Discount (${d.code})` : "Discount")} value={`-${formatCurrency(Math.abs(d.amount))}`} />
              ))}
              <SumRow
                label={order.shipping_method === "will_call" ? "Pickup" : "Shipping"}
                value={order.shipping_cost > 0 ? formatCurrency(order.shipping_cost) : "Free"}
              />
              {order.tax_amount > 0 ? <SumRow label={order.tax_label || "Tax"} value={formatCurrency(order.tax_amount)} /> : null}
              {order.convenience_fee > 0 ? <SumRow label="Convenience fee" value={formatCurrency(order.convenience_fee)} /> : null}
              <SumRow label="Total" value={formatCurrency(order.total)} strong />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
