"use client";

/**
 * The page after a checkout: /checkout/thank-you/<order number>.
 *
 * Each order has its own address and is read back from the server, so a
 * reload, a new tab or the back and forward buttons still show it (see
 * lib/orderThanks.ts). The Purchase event is sent here, as the page opens,
 * the way tag managers expect it: the checkout holds it for the tab that
 * placed the order, and it goes once (lib/tracking sendHeldPurchase), so a
 * reload of this page or a second tab does not count the sale twice.
 *
 * Laid out as the owner's design (2026-11-16), with "What happens next" made
 * from this order's own lines rather than one story for every order: a gang
 * sheet, a design or an uploaded print gets the shop's artwork check (there
 * is no step where the buyer approves a proof, so none is shown); something
 * made to order is printed, a ready-made product is packed; pickup ends in
 * "ready to collect", shipping in a tracking link; a gift card is emailed.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ConfigurationDetail } from "@/components/shared/ConfigurationDetail";
import { apiClient } from "@/lib/api-client";
import { THEME_CSS_VARS, useCartLook } from "@/lib/cartLook";
import { orderKey, type ThankYouAddress, type ThankYouOrder } from "@/lib/orderThanks";
import { isGiftLine, nextSteps, stepsDone } from "@/lib/orderSteps";
import { sendHeldPurchase } from "@/lib/tracking";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";

const SHIPPING_LABELS: Record<string, string> = {
  standard: "Standard shipping",
  expedited: "Expedited shipping",
  will_call: "Local pickup",
  freight: "Freight",
};

const PAYMENT_LABELS: Record<string, string> = {
  card: "Credit card",
  ach: "Bank transfer",
  net_30: "Pay on invoice (Net 30)",
  cod: "Cash on delivery",
  gift_card: "Gift card",
};

/** Where the order stands on money, said the way the buyer needs to hear it. */
function paymentNote(o: ThankYouOrder): string | null {
  if (o.payment_status === "paid") return "Paid";
  // Checkout took bank details, not money: the shop marks it paid on arrival.
  if (o.payment_method === "ach") return "Waiting for your bank transfer";
  if (o.payment_method === "cod") return `Pay ${formatCurrency(o.total)} when it arrives`;
  if (o.payment_method === "net_30") return "Pay by invoice, due in 30 days";
  return "Not paid yet";
}

function shippingWords(o: ThankYouOrder): string {
  const base = SHIPPING_LABELS[o.shipping_method ?? ""] ?? "Shipping";
  const service = [o.carrier, o.courier_service].filter(Boolean).join(" ");
  return o.shipping_method !== "will_call" && service ? `${base}, ${service}` : base;
}

/** Whether this tab is the one that just placed this order: the checkout
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

const CSS = `
.ty{${THEME_CSS_VARS} font-family:var(--ck-font-body);color:var(--ui-ink,#111318);padding:48px 0 80px}
.ty-wrap{max-width:960px;margin:0 auto;padding:0 20px}
.ty-top{text-align:center}
.ty-tick{width:64px;height:64px;border-radius:50%;background:#DCFCE7;display:inline-flex;align-items:center;justify-content:center;margin-bottom:18px}
.ty h1{font-family:var(--ck-font-head);font-size:44px;line-height:1.1;margin:0;font-weight:700;letter-spacing:-.01em}
.ty-lede{max-width:620px;margin:14px auto 0;font-size:17px;line-height:1.6;color:var(--ui-muted,#4B5563)}
.ty-lede b{color:var(--ui-ink,#111318)}
.ty-btns{display:flex;gap:14px;justify-content:center;margin-top:26px;flex-wrap:wrap}
.ty-btn{display:inline-flex;align-items:center;justify-content:center;height:50px;padding:0 24px;border-radius:var(--ck-btn-radius);font-family:var(--ck-font-button);font-weight:700;font-size:16px;text-decoration:none;border:1px solid transparent}
.ty-main{background:var(--ck-btn);color:var(--ck-btn-ink)}
.ty-ghost{background:#fff;color:var(--ui-ink,#111318);border-color:var(--ui-line,#D5D9DF)}
.ty-card{background:#fff;border:1px solid var(--ui-line,#E3E6EA);border-radius:var(--ck-radius);padding:26px 28px;margin-top:22px}
.ty-card h2{font-family:var(--ck-font-head);font-size:22px;margin:0 0 20px;font-weight:700}
.ty-steps{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:16px;list-style:none;margin:0;padding:0}
.ty-steps li{border-top:4px solid var(--ui-line,#E3E6EA);padding-top:14px}
.ty-steps li.on{border-top-color:var(--ck-btn)}
.ty-steps b{display:block;font-size:15.5px}
.ty-steps span{display:block;font-size:14.5px;color:var(--ui-muted,#5A6472);margin-top:4px;line-height:1.5}
.ty-two{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.ty-two .ty-card{margin-top:22px}
.ty-line{display:flex;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--ui-line,#EEF0F2)}
.ty-line small{display:block;color:var(--ui-muted,#5A6472);font-size:13px;margin-top:2px}
.ty-line b{font-variant-numeric:tabular-nums;white-space:nowrap}
.ty-sum{display:flex;justify-content:space-between;font-size:15.5px;margin-top:12px;color:var(--ui-muted,#4B5563)}
.ty-sum span:last-child{color:var(--ui-ink,#111318);font-variant-numeric:tabular-nums}
.ty-total{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid var(--ui-line,#E3E6EA);margin-top:18px;padding-top:18px;font-weight:700}
.ty-total b{font-size:26px;font-variant-numeric:tabular-nums}
.ty-k{font-weight:700;font-size:15px;margin-top:16px}
.ty-k:first-of-type{margin-top:0}
.ty-v{font-size:15.5px;color:var(--ui-muted,#4B5563);margin-top:4px;line-height:1.55}
@media (max-width:760px){
  .ty{padding:32px 0 64px}
  .ty h1{font-size:32px}
  .ty-steps{grid-template-columns:minmax(0,1fr)}
  .ty-steps li{border-top:0;border-left:4px solid var(--ui-line,#E3E6EA);padding:2px 0 2px 14px}
  .ty-steps li.on{border-left-color:var(--ck-btn)}
  .ty-two{grid-template-columns:minmax(0,1fr);gap:0}
  .ty-card{padding:20px 18px}
}
`;

export default function ThankYouPage() {
  const params = useParams<{ number: string }>();
  const number = decodeURIComponent(params?.number ?? "");
  const look = useCartLook();
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
  const vars = { "--ck-btn": look.button, "--ck-btn-ink": look.buttonInk } as React.CSSProperties;

  if (missing) {
    // The tab that placed the order still holds its number. If the order
    // could not be read back (the network, or the minutes while a release
    // reaches the API), that tab still gets its thank-you, not a dead end.
    const justPlaced = placedHere(number);
    return (
      <div className="ty" style={vars}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="ty-wrap ty-top">
          <h1>{justPlaced ? "Thanks, your order is in." : `Order ${number}`}</h1>
          <p className="ty-lede">
            {justPlaced
              ? <>Order <b>#{number}</b> is placed. A confirmation is on its way to your inbox.</>
              : "We could not open this order here. Its confirmation email has the details, and you can follow the order at any time."}
          </p>
          <div className="ty-btns">
            <Link href={signedIn ? "/account/orders" : "/track-order"} className="ty-btn ty-main">
              {signedIn ? "Your orders" : "Track an order"}
            </Link>
            <Link href="/products" className="ty-btn ty-ghost">Continue shopping</Link>
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

  const unpaidCod = order.payment_method === "cod" && order.payment_status !== "paid";
  const note = paymentNote(order);
  const trackHref = signedIn ? `/account/orders/${encodeURIComponent(order.order_number)}` : "/track-order";
  const steps = nextSteps(order);
  const done = Math.max(1, stepsDone(order.status, steps));
  const giftOnly = order.items.length > 0 && order.items.every(isGiftLine);
  const paid = order.payment_status === "paid";

  return (
    <div className="ty" style={vars}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ty-wrap">
        <div className="ty-top">
          <div className="ty-tick" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
          </div>
          <h1>{order.first_name ? `Thanks, ${order.first_name}. Your order is in.` : "Thanks, your order is in."}</h1>
          <p className="ty-lede">
            Order <b>#{order.order_number}</b>.{" "}
            {order.email ? <>We sent a confirmation to <b>{order.email}</b>.</> : <>A confirmation is on its way to your inbox.</>}
            {unpaidCod ? <> Have <b>{formatCurrency(order.total)}</b> ready to pay when it arrives.</> : null}
          </p>
          <div className="ty-btns">
            {!giftOnly && <Link href={trackHref} className="ty-btn ty-main">Track your order</Link>}
            <Link href="/products" className={`ty-btn ${giftOnly ? "ty-main" : "ty-ghost"}`}>Continue shopping</Link>
          </div>
        </div>

        <section className="ty-card" aria-labelledby="ty-next">
          <h2 id="ty-next">What happens next</h2>
          <ol className="ty-steps" style={{ ["--n" as string]: steps.length } as React.CSSProperties} data-next-steps>
            {steps.map((s, i) => (
              <li key={s.title} className={i < done ? "on" : undefined} aria-current={i === done ? "step" : undefined}>
                <b>{s.title}</b>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="ty-two">
          <section className="ty-card" aria-labelledby="ty-sum">
            <h2 id="ty-sum">Order summary</h2>
            {order.items.map((line, i) => (
              <div key={i} className="ty-line">
                <div style={{ minWidth: 0 }}>
                  {line.name}
                  <small>
                    {[[line.color, line.size].filter(Boolean).join(", "), `qty ${line.quantity}`].filter(Boolean).join(", ")}
                  </small>
                  {line.configuration ? <ConfigurationDetail configuration={line.configuration} compact /> : null}
                </div>
                <b>{formatCurrency(line.line_total)}</b>
              </div>
            ))}
            <div className="ty-sum"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
            {order.discounts.map((d, i) => (
              <div key={i} className="ty-sum"><span>{d.label || (d.code ? `Discount (${d.code})` : "Discount")}</span><span>-{formatCurrency(Math.abs(d.amount))}</span></div>
            ))}
            {!giftOnly && (
              <div className="ty-sum">
                <span>{order.shipping_method === "will_call" ? "Pickup" : `Shipping (${(SHIPPING_LABELS[order.shipping_method ?? ""] ?? "Shipping").replace(/ shipping$/i, "")})`}</span>
                <span>{order.shipping_cost > 0 ? formatCurrency(order.shipping_cost) : "Free"}</span>
              </div>
            )}
            {order.tax_amount > 0 ? <div className="ty-sum"><span>{order.tax_label || "Tax"}</span><span>{formatCurrency(order.tax_amount)}</span></div> : null}
            {order.convenience_fee > 0 ? <div className="ty-sum"><span>Convenience fee</span><span>{formatCurrency(order.convenience_fee)}</span></div> : null}
            <div className="ty-total"><span>{paid ? "Total paid" : "Total"}</span><b>{formatCurrency(order.total)}</b></div>
          </section>

          <section className="ty-card" aria-labelledby="ty-del">
            <h2 id="ty-del">{giftOnly ? "Details" : "Delivery details"}</h2>
            {order.email ? (
              <>
                <div className="ty-k">Contact</div>
                <div className="ty-v">{order.company_name ? <div>{order.company_name}</div> : null}{order.email}</div>
              </>
            ) : null}
            {!giftOnly && (order.pickup ? (
              <>
                <div className="ty-k">Pickup location</div>
                <div className="ty-v">
                  {order.pickup.name ? <div>{order.pickup.name}</div> : null}
                  {order.pickup.address ? <div>{order.pickup.address}</div> : null}
                  {order.pickup.hours ? <div>{order.pickup.hours}</div> : null}
                  {order.pickup.note ? <div>{order.pickup.note}</div> : null}
                </div>
              </>
            ) : order.ship_to ? (
              <>
                <div className="ty-k">Ships to</div>
                <div className="ty-v"><AddressLines a={order.ship_to} /></div>
              </>
            ) : null)}
            {!giftOnly && (
              <>
                <div className="ty-k">{order.shipping_method === "will_call" ? "Collection" : "Delivery method"}</div>
                <div className="ty-v">{shippingWords(order)}</div>
              </>
            )}
            <div className="ty-k">Payment</div>
            <div className="ty-v">
              <div>{PAYMENT_LABELS[order.payment_method ?? ""] ?? "Payment"}</div>
              {note ? <div>{note}</div> : null}
            </div>
            {order.po_number ? (
              <>
                <div className="ty-k">PO number</div>
                <div className="ty-v">{order.po_number}</div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
