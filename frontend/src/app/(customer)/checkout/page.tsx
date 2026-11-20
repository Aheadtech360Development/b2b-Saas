"use client";

/**
 * The checkout, on one page (the owner's "Store Cart and Checkout" design,
 * 2026-11-16): contact, delivery address, delivery method and payment, with
 * the order summary beside them. It replaces the two steps that were
 * /checkout/address and /checkout/review (both now send people here), and
 * keeps everything they did: saved addresses and address lookup, the shop's
 * shipping (its tiers, flat brackets or live carrier rates) and pickup, tax
 * looked up for the address, discount codes, gift cards, card by Stripe, cash
 * on delivery, pay on invoice (Net 30) for an account that has it, PO number
 * and order note, the tracking events, and the one-order-per-attempt guard.
 *
 * What the design shows that this shop may not have is left out rather than
 * faked: an express option only appears if the shop's shipping offers one,
 * pickup only if the shop does pickup, Net 30 only for an approved account.
 * A first order still opens an account (as before), so the contact is the
 * signed-in buyer's own email.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useBranding } from "@/components/providers/BrandingProvider";
import { StripePaymentForm, type IntentResp } from "@/components/checkout/StripePaymentForm";
import { ConfigurationDetail } from "@/components/shared/ConfigurationDetail";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import { apiClient } from "@/lib/api-client";
import { clearAttribution, getAttribution, getServerTracking } from "@/lib/attribution";
import { claimBuyerReferral } from "@/lib/buyerReferral";
import { THEME_CSS_VARS, useCartLook } from "@/lib/cartLook";
import { isDesignLine, isGiftCardLine } from "@/lib/guestCart";
import { rememberOrderKey, thankYouPath } from "@/lib/orderThanks";
import { cartLines, holdPurchase, trackCheckoutStarted, trackPaymentChosen, trackShippingChosen } from "@/lib/tracking";
import { formatCurrency } from "@/lib/utils";
import { cartService } from "@/services/cart.service";
import { ordersService } from "@/services/orders.service";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { useCheckoutStore, type ShippingMethod } from "@/stores/checkout.store";
import type { Cart } from "@/types/order.types";

interface LiveRate { rate_id: string; carrier: string; service: string; cost: number; days: number | null }
interface SavedAddress {
  id: string; label: string | null; full_name: string | null; line1: string; line2: string | null;
  city: string; state: string; postal_code: string; country: string; phone: string | null; is_default: boolean;
}
interface Coupon { code: string; discount_type: string; discount_amount: number }
/** /account/profile/full, the parts the checkout reads. */
interface AccountProfile {
  web_user?: { first_name?: string | null; last_name?: string | null; email?: string | null };
  company?: {
    name?: string | null; phone?: string | null; address_line1?: string | null; address_line2?: string | null;
    city?: string | null; state_province?: string | null; postal_code?: string | null;
  } | null;
}

/** A state as the form's list has it: "TX", or "Texas" read as "TX". */
function stateCode(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (US_STATES.includes(v.toUpperCase())) return v.toUpperCase();
  return STATE_NAMES[v.toLowerCase()] ?? "";
}

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY",
];
const STATE_NAMES: Record<string, string> = Object.fromEntries(([
  ["alabama", "AL"], ["alaska", "AK"], ["arizona", "AZ"], ["arkansas", "AR"], ["california", "CA"], ["colorado", "CO"],
  ["connecticut", "CT"], ["delaware", "DE"], ["florida", "FL"], ["georgia", "GA"], ["hawaii", "HI"], ["idaho", "ID"],
  ["illinois", "IL"], ["indiana", "IN"], ["iowa", "IA"], ["kansas", "KS"], ["kentucky", "KY"], ["louisiana", "LA"],
  ["maine", "ME"], ["maryland", "MD"], ["massachusetts", "MA"], ["michigan", "MI"], ["minnesota", "MN"],
  ["mississippi", "MS"], ["missouri", "MO"], ["montana", "MT"], ["nebraska", "NE"], ["nevada", "NV"],
  ["new hampshire", "NH"], ["new jersey", "NJ"], ["new mexico", "NM"], ["new york", "NY"], ["north carolina", "NC"],
  ["north dakota", "ND"], ["ohio", "OH"], ["oklahoma", "OK"], ["oregon", "OR"], ["pennsylvania", "PA"],
  ["rhode island", "RI"], ["south carolina", "SC"], ["south dakota", "SD"], ["tennessee", "TN"], ["texas", "TX"],
  ["utah", "UT"], ["vermont", "VT"], ["virginia", "VA"], ["washington", "WA"], ["west virginia", "WV"],
  ["wisconsin", "WI"], ["wyoming", "WY"],
] as const).map(([n, c]) => [n, c]));

const PAY_LABELS: Record<string, string> = { card: "card", cod: "cod", net_30: "net_30" };

function newAttempt(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return [parts[0] ?? "", ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]!];
}

const CSS = `
.co{${THEME_CSS_VARS} font-family:var(--ck-font-body);color:var(--ui-ink,#111318)}
.co-crumbs{display:flex;gap:8px;font-size:14px;color:var(--ui-muted,#5A6472);margin-bottom:10px}
.co-crumbs a{color:inherit}
.co-crumbs b{color:var(--ui-ink,#111318);font-weight:600}
.co h1{font-family:var(--ck-font-head);font-size:40px;line-height:1.1;margin:0 0 24px;font-weight:700;letter-spacing:-.01em}
.co-grid{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:32px;align-items:start}
.co-col{display:grid;gap:18px;min-width:0}
.co-card{background:#fff;border:1px solid var(--ui-line,#E3E6EA);border-radius:var(--ck-radius);padding:22px 24px}
.co-h{display:flex;align-items:center;gap:12px;margin:0 0 18px;font-family:var(--ck-font-head);font-size:21px;font-weight:700}
.co-n{width:26px;height:26px;border-radius:50%;background:var(--ck-btn);color:var(--ck-btn-ink);display:inline-flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:700;font-family:var(--ck-font-body)}
.co-f{display:grid;gap:6px;min-width:0}
.co-f label{font-size:13.5px;font-weight:600}
.co-f input,.co-f select,.co-f textarea{height:46px;padding:0 13px;border:1px solid var(--ui-line,#D5D9DF);border-radius:10px;font:inherit;font-size:15px;background:#fff;color:inherit;width:100%;box-sizing:border-box}
.co-f textarea{height:auto;min-height:78px;padding:11px 13px;resize:vertical}
.co-f input[readonly]{background:var(--ui-paper,#F6F7F9)}
.co-f .co-err{font-size:12.5px;color:var(--ui-bad,#B42318)}
.co-f.co-bad input,.co-f.co-bad select{border-color:var(--ui-bad,#B42318)}
.co-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.co-stack{display:grid;gap:14px}
.co-small{font-size:13.5px;color:var(--ui-muted,#5A6472);margin:10px 0 0}
.co-opt{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;padding:15px 16px;border:1px solid var(--ui-line,#D5D9DF);border-radius:12px;background:#fff;cursor:pointer;font:inherit;color:inherit}
.co-opt[aria-checked=true]{border-color:var(--ck-btn);box-shadow:0 0 0 1px var(--ck-btn);background:#F7FAF9}
.co-opt[disabled]{opacity:.55;cursor:not-allowed}
.co-dot{width:18px;height:18px;border-radius:50%;border:2px solid var(--ui-line,#B8BEC6);flex:none;margin-top:2px;display:inline-flex;align-items:center;justify-content:center;background:#fff}
.co-opt[aria-checked=true] .co-dot{border-color:var(--ck-btn)}
.co-opt[aria-checked=true] .co-dot::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--ck-btn)}
.co-opt b{display:block;font-size:15px}
.co-opt small{display:block;font-size:13.5px;color:var(--ui-muted,#5A6472);margin-top:3px;line-height:1.45}
.co-opt .co-price{margin-left:auto;font-weight:700;white-space:nowrap;padding-left:10px}
.co-rates{display:grid;gap:8px;margin-top:10px}
.co-btn{display:inline-flex;align-items:center;justify-content:center;height:54px;padding:0 22px;border-radius:var(--ck-btn-radius);font-family:var(--ck-font-button);font-weight:700;font-size:16.5px;cursor:pointer;text-decoration:none;border:1px solid transparent;box-sizing:border-box}
.co-main{background:var(--ck-btn);color:var(--ck-btn-ink);width:100%}
.co-main[disabled]{opacity:.55;cursor:not-allowed}
.co-ghost{background:#fff;color:var(--ui-ink,#111318);border-color:var(--ui-line,#D5D9DF)}
.co-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}
.co-terms{font-size:13px;color:var(--ui-muted,#5A6472);margin:10px 0 0}
.co-terms a{color:inherit}
.co-alert{border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;border-radius:12px;padding:12px 16px;font-size:14.5px;font-weight:600}
.co-warn{border:1px solid #FCD34D;background:#FFFBEB;color:#92400E;border-radius:12px;padding:12px 16px;font-size:14.5px}
.co-sum h2{font-family:var(--ck-font-head);font-size:21px;margin:0 0 16px;font-weight:700}
.co-item{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--ui-line,#EEF0F2)}
.co-thumb{position:relative;width:52px;height:52px;border-radius:10px;border:1px solid var(--ui-line,#E3E6EA);background:var(--ui-paper,#F6F7F9)}
.co-thumb img{width:100%;height:100%;object-fit:contain;border-radius:10px}
.co-thumb span{position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#374151;color:#fff;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}
.co-item div:nth-child(2){font-size:14px;line-height:1.35}
.co-item small{display:block;color:var(--ui-muted,#5A6472);font-size:12.5px}
.co-item b{font-size:14.5px;font-variant-numeric:tabular-nums}
.co-code{display:flex;gap:10px;margin:16px 0}
.co-code input{flex:1;min-width:0;height:46px;padding:0 13px;border:1px solid var(--ui-line,#D5D9DF);border-radius:10px;font:inherit;font-size:15px}
.co-row{display:flex;justify-content:space-between;gap:10px;font-size:15px;margin:10px 0}
.co-row span:last-child{font-variant-numeric:tabular-nums}
.co-muted{color:var(--ui-muted,#5A6472)}
.co-ok{color:var(--ui-ok,#15803D)}
.co-total{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid var(--ui-line,#E3E6EA);margin-top:14px;padding-top:18px;font-weight:600}
.co-total b{font-size:28px;font-variant-numeric:tabular-nums}
.co-total small{font-size:12.5px;color:var(--ui-muted,#5A6472);margin-left:4px;font-weight:500}
.co-help{text-align:center;font-size:13.5px;color:var(--ui-muted,#5A6472);margin-top:12px}
.co-help a{color:var(--ck-btn)}
.co-phone-sum{display:none}
@media (max-width:900px){
  .co h1{font-size:30px;margin-bottom:14px}
  .co-crumbs{display:none}
  .co-grid{grid-template-columns:minmax(0,1fr)}
  .co-card{padding:18px 16px}
  .co-two{grid-template-columns:1fr}
  .co-two.co-keep{grid-template-columns:1fr 1fr}
  .co-aside{display:none}
  .co-phone-sum{display:block}
  .co-phone-sum > button{width:100%;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border:1px solid var(--ui-line,#E3E6EA);border-radius:12px;background:#fff;font:inherit;font-weight:600;cursor:pointer;color:inherit}
  .co-actions{grid-template-columns:1fr}
}
`;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className={`co-f${error ? " co-bad" : ""}`}>
      <label>{label}</label>
      {children}
      {error ? <span className="co-err">{error}</span> : null}
    </div>
  );
}

function Option({ checked, onPick, title, hint, price, disabled, children }: {
  checked: boolean; onPick: () => void; title: string; hint?: string; price?: string; disabled?: boolean; children?: React.ReactNode;
}) {
  return (
    <div>
      <button type="button" role="radio" aria-checked={checked} className="co-opt" onClick={onPick} disabled={disabled}>
        <span className="co-dot" aria-hidden="true" />
        <span style={{ minWidth: 0 }}>
          <b>{title}</b>
          {hint ? <small>{hint}</small> : null}
        </span>
        {price ? <span className="co-price">{price}</span> : null}
      </button>
      {checked && children}
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const look = useCartLook();
  const { pickup_address, pickup_name, pickup_hours, pickup_enabled, ship_countries } = useBranding();
  const pickupOffered = pickup_enabled !== false;
  const shipCountries = ship_countries?.length ? ship_countries : ["US", "CA"];
  const shipsTo = (country: string | null | undefined) => shipCountries.includes((country || "US").toUpperCase());

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const isGuest = !authIsLoading && !isAuthenticated;
  const clearCart = useCartStore((s) => s.clearCart);
  const store = useCheckoutStore();
  const {
    companyName, contactName, shippingPhone, shippingAddress, shippingMethod, setShippingMethod,
    poNumber, setPoNumber, orderNotes, setOrderNotes, paymentMethod, setPaymentMethod,
  } = store;

  // A first order opens an account (the cart says so), and this address can be typed.
  useEffect(() => {
    if (isGuest) router.replace(`/create-account?next=${encodeURIComponent("/checkout")}`);
  }, [isGuest, router]);

  const [cart, setCart] = useState<Cart | null>(null);
  const [cartFailed, setCartFailed] = useState(false);
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [useNew, setUseNew] = useState(false);
  const [shippingType, setShippingTypeState] = useState("store_default");
  const [tierShipping, setTierShipping] = useState<number | null>(null);
  const [liveRates, setLiveRates] = useState<LiveRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [rateId, setRateId] = useState<string | null>(null);
  const [tax, setTax] = useState<{ region: string; rate: number; amount: number } | null>(null);
  const [ways, setWays] = useState<{ card: boolean; cod: boolean } | null>(null);
  const [net30, setNet30] = useState(false);
  const [giftAccepted, setGiftAccepted] = useState(false);
  const [giftCodes, setGiftCodes] = useState<string[]>([]);
  const [giftShown, setGiftShown] = useState<Record<string, { masked: string; balance: number }>>({});
  const [giftEntry, setGiftEntry] = useState("");
  const [giftErr, setGiftErr] = useState<string | null>(null);
  const [giftBusy, setGiftBusy] = useState(false);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponRead, setCouponRead] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [pricedFor, setPricedFor] = useState<{ key: string; r: IntentResp } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [paidIntentId, setPaidIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const attempt = useRef("");
  const [checkoutRef, setCheckoutRef] = useState("");
  const tracked = useRef(false);
  // The sign-in is read from this tab's storage, which the server cannot see:
  // the first paint is the same "Loading" on both, then the page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [first0, last0] = splitName(contactName || [user?.first_name, user?.last_name].filter(Boolean).join(" "));
  const [form, setForm] = useState({
    first: first0, last: last0, company: companyName || "",
    street: shippingAddress?.line1 || "", line2: shippingAddress?.line2 || "",
    city: shippingAddress?.city || "", state: shippingAddress?.state || "", zip: shippingAddress?.postal_code || "",
    phone: shippingPhone || "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const onAutofill = useCallback((a: { street: string; city: string; state: string; zipCode: string }) => {
    setForm((f) => ({ ...f, street: a.street || f.street, city: a.city || f.city, state: a.state || f.state, zip: a.zipCode || f.zip }));
  }, []);
  const streetRef = useAddressAutocomplete(onAutofill);
  const [accountEmail, setAccountEmail] = useState("");

  // ── Loading what the page needs ────────────────────────────────────────────
  useEffect(() => {
    if (authIsLoading || isGuest) return;
    if (!attempt.current) attempt.current = newAttempt();
    setCheckoutRef(attempt.current);
    // A friend's referral link kept in this browser counts for a first order
    // only, so it is claimed before this one is placed.
    claimBuyerReferral();
    cartService.getCart().then((c) => {
      setCart(c);
      if (!tracked.current) { tracked.current = true; trackCheckoutStarted(c.items); }
      const hasTier = (c.validation as typeof c.validation & { has_shipping_tier?: boolean })?.has_shipping_tier ?? false;
      setTierShipping(hasTier ? Number(c.validation?.estimated_shipping ?? 0) : null);
    }).catch(() => setCartFailed(true));
    apiClient.get<SavedAddress[]>("/api/v1/account/addresses").then((list) => {
      setSaved(list);
      if (list.length) {
        setAddressId((store.addressId && list.some((a) => a.id === store.addressId) ? store.addressId : null)
          ?? (list.find((a) => a.is_default) ?? list[0]!).id);
        setUseNew(false);
      } else setUseNew(true);
    }).catch(() => setUseNew(true));
    // The account's email, and the details its owner gave when it was made,
    // for a buyer with no saved address yet (dev fix list, item 9).
    apiClient.get<AccountProfile>("/api/v1/account/profile/full").then((pr) => {
      setAccountEmail(pr.web_user?.email ?? "");
      const c = pr.company;
      setForm((f) => ({
        ...f,
        first: f.first || pr.web_user?.first_name || "",
        last: f.last || pr.web_user?.last_name || "",
        company: f.company || c?.name || "",
        street: f.street || c?.address_line1 || "",
        line2: f.line2 || c?.address_line2 || "",
        city: f.city || c?.city || "",
        state: f.state || stateCode(c?.state_province),
        zip: f.zip || c?.postal_code || "",
        phone: f.phone || c?.phone || "",
      }));
    }).catch(() => { /* typed in by hand, as before */ });
    apiClient.get<{ shipping_type: string }>("/api/v1/shipping/shipping-type")
      .then((r) => setShippingTypeState(r.shipping_type || "store_default"))
      .catch(() => setShippingTypeState("store_default"));
    apiClient.get<{ card?: boolean; cod?: boolean }>("/api/v1/checkout/payment-options")
      .then((r) => setWays({ card: r.card !== false, cod: !!r.cod }))
      .catch(() => setWays({ card: true, cod: false }));
    apiClient.get<{ net30_enabled?: boolean }>("/api/v1/account/net30-status")
      .then((r) => setNet30(!!r.net30_enabled)).catch(() => setNet30(false));
    apiClient.get<{ accepted?: boolean }>("/api/v1/storefront/gift-cards")
      .then((r) => setGiftAccepted(!!r.accepted)).catch(() => setGiftAccepted(false));
    try {
      const kept = JSON.parse(localStorage.getItem("af_coupon") || "null");
      if (kept?.code) setCoupon(kept);
    } catch { /* none */ }
    setCouponRead(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authIsLoading, isGuest]);

  // Keep the payment choice to what this shop and this account have.
  useEffect(() => {
    if (!ways) return;
    const can = { card: ways.card, cod: ways.cod, net_30: net30, ach: false };
    if (!can[paymentMethod]) setPaymentMethod(ways.card ? "card" : ways.cod ? "cod" : net30 ? "net_30" : "card");
  }, [ways, net30, paymentMethod, setPaymentMethod]);

  // Pickup chosen on an earlier visit, at a shop that has since switched it off.
  useEffect(() => {
    if (!pickupOffered && shippingMethod === "will_call") setShippingMethod("standard");
    if (shippingMethod === "expedited") setShippingMethod("standard");
  }, [pickupOffered, shippingMethod, setShippingMethod]);

  // ── The address in use ─────────────────────────────────────────────────────
  const savedActive = !useNew ? saved.find((a) => a.id === addressId) ?? null : null;
  const address = savedActive
    ? { line1: savedActive.line1, line2: savedActive.line2 || undefined, city: savedActive.city, state: savedActive.state, postal_code: savedActive.postal_code, country: savedActive.country || "US" }
    : { line1: form.street.trim(), line2: form.line2.trim() || undefined, city: form.city.trim(), state: form.state, postal_code: form.zip.trim(), country: "US" };
  const fullName = savedActive ? (savedActive.full_name || "") : `${form.first} ${form.last}`.trim();
  const phone = savedActive ? (savedActive.phone || "") : form.phone.trim();
  const zipOk = /^\d{5}(-\d{4})?$/.test(address.postal_code);
  const addressComplete = !!(address.line1 && address.city && address.state && zipOk && fullName);

  // ── Live carrier rates (debounced, a whole ZIP only) ───────────────────────
  const shipItems = useMemo(() => (cart?.items ?? []).filter((i) => i.variant_id).map((i) => ({ variant_id: i.variant_id as string, quantity: i.quantity })), [cart]);
  useEffect(() => {
    if (shippingType !== "live_shippo" || !zipOk || !address.state) return;
    const t = setTimeout(() => {
      setRatesLoading(true);
      setLiveRates([]);
      setRateId(null);
      apiClient.post<{ rates: LiveRate[] }>("/api/v1/shipping/live-rates", {
        to_zip: address.postal_code.slice(0, 5), to_state: address.state, to_city: address.city || undefined,
        cart_items: shipItems.length ? shipItems : undefined,
      }).then((r) => {
        const rates = r.rates || [];
        setLiveRates(rates);
        if (rates[0]) setRateId(rates[0].rate_id);
      }).catch(() => setLiveRates([])).finally(() => setRatesLoading(false));
    }, 700);
    return () => clearTimeout(t);
  }, [shippingType, zipOk, address.postal_code, address.state, address.city, shipItems]);
  const liveRate = liveRates.find((r) => r.rate_id === rateId) ?? null;

  // ── Money ──────────────────────────────────────────────────────────────────
  const items = cart?.items ?? [];
  const subtotal = Number(cart?.subtotal ?? 0);
  const giftLines = items.filter(isGiftCardLine);
  const onlyGiftCards = giftLines.length > 0 && giftLines.length === items.length;
  const giftLinesTotal = giftLines.reduce((s, i) => s + Number(i.line_total), 0);
  const couponDiscount = coupon && coupon.discount_type !== "free_shipping" ? Number(coupon.discount_amount) : 0;
  const live = shippingType === "live_shippo";
  const shippingKnown = onlyGiftCards || shippingMethod === "will_call" || (live ? !!liveRate : tierShipping !== null);
  const baseShipping = shippingMethod === "will_call" ? 0 : live ? (liveRate?.cost ?? 0) : (tierShipping ?? 0);
  const shipping = onlyGiftCards || coupon?.discount_type === "free_shipping" ? 0 : baseShipping;
  const taxAmount = onlyGiftCards ? 0 : tax ? (giftLines.length
    ? Math.round(Math.max(0, subtotal - giftLinesTotal - couponDiscount) * tax.rate) / 100
    : tax.amount) : 0;
  const total = subtotal + shipping + taxAmount - couponDiscount;

  // Tax is billed per lookup: wait for a whole ZIP and for typing to stop.
  useEffect(() => {
    if (!address.state || subtotal <= 0 || (address.postal_code && !zipOk)) { setTax(null); return; }
    const t = setTimeout(() => {
      apiClient.post<{ tax_rate: number; tax_amount: number; region: string }>("/api/v1/tax/calculate", {
        subtotal, zip_code: address.postal_code.slice(0, 5), state: address.state.toUpperCase(), discount: couponDiscount,
      }).then((r) => {
        const rate = Number(r.tax_rate ?? 0), amount = Number(r.tax_amount ?? 0);
        setTax(rate > 0 || amount > 0 ? { region: r.region, rate, amount } : null);
      }).catch(() => setTax(null));
    }, 500);
    return () => clearTimeout(t);
  }, [address.state, address.postal_code, zipOk, subtotal, couponDiscount]);

  // The checkout store is what places the order: kept in step with the page.
  useEffect(() => {
    store.setCompanyName(form.company.trim());
    store.setContactName(fullName);
    store.setShippingPhone(phone);
    store.setShippingAddress(addressComplete ? address : null);
    store.setAddressId(savedActive ? savedActive.id : null);
    store.setShippingCost(shipping);
    store.setShippingType(shippingType);
    store.setTaxInfo(tax?.region ?? null, tax?.rate ?? 0, taxAmount);
    const rate = live && liveRate ? { rate_id: liveRate.rate_id, carrier: liveRate.carrier, service: liveRate.service, price: liveRate.cost } : null;
    store.setSelectedRate(rate);
    try {
      sessionStorage.setItem("checkout_shipping_type", shippingType);
      if (rate) sessionStorage.setItem("checkout_selected_rate", JSON.stringify(rate));
      else sessionStorage.removeItem("checkout_selected_rate");
    } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.company, fullName, phone, addressComplete, address.line1, address.line2, address.city, address.state, address.postal_code,
    savedActive?.id, shipping, shippingType, tax, taxAmount, live, liveRate]);

  // What the tracking tools are told was chosen: the carrier's own service
  // when live rates are on, else the shop's method.
  const tier = live && liveRate && shippingMethod === "standard" ? `${liveRate.carrier} ${liveRate.service}` : shippingMethod;
  const told = useRef("");
  useEffect(() => {
    if (!shippingKnown || told.current === tier) return;
    told.current = tier;
    trackShippingChosen(tier);
  }, [tier, shippingKnown]);

  const noShipHere = savedActive && shippingMethod !== "will_call" && !shipsTo(savedActive.country);
  const ready = !!cart && items.length > 0 && addressComplete && shippingKnown && !noShipHere && !items.some((i) => i.problem);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (useNew || !savedActive) {
      if (!form.first.trim()) e.first = "Required";
      if (!form.last.trim()) e.last = "Required";
      if (!form.street.trim()) e.street = "Required";
      if (!form.city.trim()) e.city = "Required";
      if (!form.state) e.state = "Required";
      if (!zipOk) e.zip = form.zip.trim() ? "Enter a 5 digit ZIP" : "Required";
    }
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById("co-address")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return false;
    }
    if (live && shippingMethod === "standard" && !liveRate) {
      setError("Choose a shipping rate first.");
      return false;
    }
    return true;
  }

  // ── Codes ──────────────────────────────────────────────────────────────────
  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setCouponBusy(true);
    setCouponErr(null);
    try {
      const d = await apiClient.post<{ valid: boolean; message: string; code?: string; discount_type?: string; discount_amount?: number; final_total?: number }>(
        "/api/v1/discounts/validate", { code: couponInput.trim(), cart_total: subtotal, customer_type: "wholesale" });
      if (d.valid) {
        const c = { code: d.code!, discount_type: d.discount_type!, discount_amount: Number(d.discount_amount), final_total: Number(d.final_total), message: d.message };
        setCoupon(c);
        setCouponInput("");
        try { localStorage.setItem("af_coupon", JSON.stringify(c)); } catch { /* private mode */ }
      } else setCouponErr(d.message || "That code isn't valid.");
    } catch (e) {
      setCouponErr(e instanceof Error ? e.message : "Could not check that code.");
    }
    setCouponBusy(false);
  }
  function removeCoupon() {
    setCoupon(null);
    try { localStorage.removeItem("af_coupon"); } catch { /* private mode */ }
  }
  async function applyGiftCard() {
    const raw = giftEntry.trim();
    if (!raw) return;
    const same = (a: string) => a.toUpperCase().replace(/[\s-]/g, "");
    if (giftCodes.some((c) => same(c) === same(raw))) { setGiftErr("That gift card is already applied."); return; }
    if (giftCodes.length >= 5) { setGiftErr("Up to 5 gift cards on one order."); return; }
    setGiftBusy(true);
    setGiftErr(null);
    try {
      const r = await apiClient.post<{ masked: string; balance: number; usable: boolean; problem: string | null }>(
        "/api/v1/storefront/gift-cards/balance", { code: raw });
      if (!r.usable) setGiftErr(r.problem || "This gift card can't be used.");
      else {
        setGiftCodes((l) => [...l, raw]);
        setGiftShown((s) => ({ ...s, [raw]: { masked: r.masked, balance: Number(r.balance) } }));
        setGiftEntry("");
      }
    } catch (e) {
      setGiftErr(e instanceof Error ? e.message : "That gift card code isn't valid.");
    }
    setGiftBusy(false);
  }

  // ── Placing the order ──────────────────────────────────────────────────────
  async function confirmWithRetry(payload: Parameters<typeof ordersService.confirmOrder>[0]) {
    // Once Stripe has the money, losing the confirm would leave a charge with
    // no order: the server maps one payment to one order, so a retry is safe.
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try { return await ordersService.confirmOrder(payload); } catch (err) {
        last = err;
        const status = (err as { status?: number })?.status;
        if (status && status < 500) throw err;
        await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
      }
    }
    throw last;
  }

  async function placeOrder(stripePaymentIntentId?: string, giftOnly = false) {
    if (!stripePaymentIntentId && !giftOnly && !validate()) return;
    const snap = useCheckoutStore.getState();
    if (!snap.shippingAddress) { validate(); return; }
    if (stripePaymentIntentId) setPaidIntentId(stripePaymentIntentId);
    setPlacing(true);
    setError(null);
    const paidWith = giftOnly ? "gift_card" : paymentMethod;
    trackPaymentChosen(paidWith);
    if (!attempt.current) attempt.current = newAttempt();
    try {
      const base = {
        idempotency_key: attempt.current,
        attribution: getAttribution() ?? undefined,
        tracking: getServerTracking(),
        address_id: snap.addressId ?? undefined,
        shipping_address: {
          label: snap.companyName || "Shipping",
          full_name: snap.contactName || undefined,
          line1: snap.shippingAddress.line1, line2: snap.shippingAddress.line2,
          city: snap.shippingAddress.city, state: snap.shippingAddress.state,
          postal_code: snap.shippingAddress.postal_code, country: snap.shippingAddress.country || "US",
          phone: snap.shippingPhone || undefined,
        },
        shipping_method: shippingMethod || "standard",
        po_number: poNumber || undefined,
        order_notes: (look.showOrderNote && orderNotes) ? orderNotes : undefined,
        discount_code: coupon?.code || undefined,
        tax_amount: taxAmount > 0 ? taxAmount : undefined,
        tax_rate: tax?.rate ?? undefined,
        tax_region: tax?.region ?? undefined,
        shipping_cost: shipping > 0 ? shipping : undefined,
        ...(snap.selectedRate && snap.shippingType === "live_shippo" ? {
          shipping_rate_id: snap.selectedRate.rate_id, shipping_carrier: snap.selectedRate.carrier, shipping_service: snap.selectedRate.service,
        } : {}),
        gift_card_codes: giftCodes.length ? giftCodes : undefined,
        checkout_ref: checkoutRef || attempt.current || undefined,
      };
      const order = await confirmWithRetry(
        giftOnly ? { ...base, payment_method: "gift_card" }
          : paymentMethod === "card" ? { ...base, payment_method: "card", payment_intent_id: stripePaymentIntentId }
          : { ...base, payment_method: PAY_LABELS[paymentMethod] ?? paymentMethod },
      );
      const orderTotal = Number((order as { total?: number | string }).total ?? NaN) || total;
      const confirmed = {
        id: order.id, number: order.order_number, total: orderTotal, units: cart?.total_units ?? 0,
        colorSummary: "", productName: items[0]?.product_name ?? "Your order",
        shippingMethod, shippingCost: shipping, paymentMethod: paidWith,
      };
      holdPurchase(order.order_number, orderTotal, cartLines(items), { tax: taxAmount, shipping, coupon: coupon?.code });
      clearAttribution();
      store.setConfirmedOrder(confirmed);
      try {
        sessionStorage.setItem("af_confirmed_order", JSON.stringify(confirmed));
        localStorage.removeItem("af_coupon");
      } catch { /* private mode */ }
      setOrderNotes("");
      setPoNumber("");
      clearCart();
      window.dispatchEvent(new Event("cart_updated"));
      rememberOrderKey(order.order_number, order.view_key);
      router.replace(thankYouPath(order.order_number));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The order could not be placed. Please try again.");
      setPlacing(false);
    }
  }

  // What the card is asked for: the same fields the order is sent.
  const cardIntent = {
    shipping_method: shippingMethod || "standard",
    shipping_cost: shipping > 0 ? shipping : undefined,
    discount_code: coupon?.code || undefined,
    payment_method: "card",
    to_state: address.state || undefined,
    to_zip: address.postal_code || undefined,
    ...(giftCodes.length ? { gift_card_codes: giftCodes } : {}),
    checkout_ref: checkoutRef || undefined,
  };
  const intentKey = JSON.stringify(cardIntent);
  const priced = pricedFor?.key === intentKey ? pricedFor.r : null;
  const shownTotal = priced?.order_total != null ? Number(priced.order_total) : total;
  const cardToPay = priced ? Number(priced.amount) : total;
  const giftPaying = priced?.gift_cards ?? [];
  const btnStyle: React.CSSProperties = {
    background: look.button, color: look.buttonInk, borderRadius: "var(--ck-btn-radius)", height: "54px",
    fontFamily: "var(--ck-font-button)", fontWeight: 700, fontSize: "16.5px", marginTop: "18px",
  };
  const vars = { "--ck-btn": look.button, "--ck-btn-ink": look.buttonInk } as React.CSSProperties;

  if (!mounted || isGuest || authIsLoading) {
    return <div className="ui-wrap" style={{ padding: "60px 0", textAlign: "center", color: "var(--ui-muted)" }}>Loading checkout…</div>;
  }
  if (cartFailed) {
    return (
      <div className="ui-wrap" style={{ padding: "60px 0", textAlign: "center" }}>
        <p>Your cart could not be loaded. <Link href="/cart">Back to your cart</Link></p>
      </div>
    );
  }
  if (cart && items.length === 0) {
    return (
      <div className="ui-wrap" style={{ padding: "60px 0", textAlign: "center" }}>
        <p style={{ color: "var(--ui-muted)" }}>Your cart is empty.</p>
        <Link href="/products" className="ui-btn">Browse the shop</Link>
      </div>
    );
  }

  const summary = (
    <div className="co-card co-sum">
      <h2>Order summary</h2>
      {items.map((i) => (
        <div key={i.id} className="co-item">
          <div className="co-thumb">
            {i.product_image_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={i.product_image_url} alt="" />
              : null}
            <span aria-label={`Quantity ${i.quantity}`}>{i.quantity}</span>
          </div>
          <div>
            {i.product_name}
            <small>
              {isDesignLine(i) ? `Your design, ${i.quantity} pieces`
                : i.item_type === "gang_sheet" ? "Gang sheet"
                : isGiftCardLine(i) ? "Gift card, by email"
                : [i.color, i.size].filter(Boolean).join(", ")}
            </small>
            <ConfigurationDetail configuration={i.configuration} compact />
          </div>
          <b>{formatCurrency(Number(i.line_total))}</b>
        </div>
      ))}
      {!coupon ? (
        <>
          <div className="co-code">
            <input value={couponInput} onChange={(e) => { setCouponInput(e.target.value); setCouponErr(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
              placeholder="Discount code" aria-label="Discount code" />
            <button type="button" className="co-btn co-ghost" style={{ height: "46px" }} onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()} aria-label="Apply discount code">
              {couponBusy ? "…" : "Apply"}
            </button>
          </div>
          {couponErr ? <p className="co-small" style={{ color: "var(--ui-bad,#B42318)", marginTop: "-6px" }}>{couponErr}</p> : null}
        </>
      ) : null}
      <div className="co-row"><span className="co-muted">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
      {coupon ? (
        <div className="co-row co-ok">
          <span>Code {coupon.code} <button type="button" onClick={removeCoupon} aria-label="Remove the code"
            style={{ border: 0, background: "none", color: "var(--ui-bad,#B42318)", cursor: "pointer", fontWeight: 700 }}>✕</button></span>
          <span>{coupon.discount_type === "free_shipping" ? "Free shipping" : `-${formatCurrency(couponDiscount)}`}</span>
        </div>
      ) : null}
      <div className="co-row">
        <span className="co-muted">{onlyGiftCards ? "Delivery" : shippingMethod === "will_call" ? "Pickup" : "Shipping"}</span>
        <span>{onlyGiftCards ? "By email" : !shippingKnown ? <span className="co-muted">Add your address</span> : shipping === 0 ? "Free" : formatCurrency(shipping)}</span>
      </div>
      <div className="co-row">
        <span className="co-muted">{tax ? `Estimated tax (${tax.region})` : "Estimated tax"}</span>
        <span>{address.state ? formatCurrency(taxAmount) : <span className="co-muted">Add your address</span>}</span>
      </div>
      <div className="co-total"><span>Total</span><span><b>{formatCurrency(shownTotal)}</b><small>USD</small></span></div>
      {giftPaying.length > 0 && (
        <div data-gift-split style={{ marginTop: "8px" }}>
          {giftPaying.map((g) => (
            <div key={g.last4} className="co-row co-ok"><span>Gift card {g.masked}</span><span>-{formatCurrency(Number(g.amount))}</span></div>
          ))}
          <div className="co-row" style={{ fontWeight: 700 }}><span>{cardToPay > 0 ? "To pay by card" : "To pay"}</span><span>{formatCurrency(cardToPay)}</span></div>
        </div>
      )}
    </div>
  );

  const payOptions = ways ? [
    ways.card ? "card" : null, ways.cod ? "cod" : null, net30 ? "net_30" : null,
  ].filter(Boolean) as ("card" | "cod" | "net_30")[] : [];

  return (
    <div className="co" style={{ ...vars, padding: "32px 0 72px" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ui-wrap">
        <nav className="co-crumbs" aria-label="Checkout steps">
          <Link href="/cart">Cart</Link><span>/</span><b>Checkout</b><span>/</span><span>Confirmation</span>
        </nav>
        <h1>Checkout</h1>

        <div className="co-phone-sum" style={{ marginBottom: "14px" }}>
          <button type="button" onClick={() => setShowSummary((v) => !v)} aria-expanded={showSummary}>
            <span>{showSummary ? "Hide order summary" : "Show order summary"}</span>
            <span>{formatCurrency(shownTotal)}</span>
          </button>
          {showSummary ? <div style={{ marginTop: "12px" }}>{summary}</div> : null}
        </div>

        <div className="co-grid">
          <div className="co-col">
            {/* 1. Contact */}
            <section className="co-card" aria-labelledby="co-contact-h">
              <h2 className="co-h" id="co-contact-h"><span className="co-n">1</span>Contact</h2>
              <Field label="Email">
                <input value={user?.email || accountEmail} readOnly aria-readonly="true" />
              </Field>
              <p className="co-small">Your order confirmation and updates go to this address.</p>
            </section>

            {/* 2. Delivery address */}
            <section className="co-card" id="co-address" aria-labelledby="co-address-h">
              <h2 className="co-h" id="co-address-h"><span className="co-n">2</span>{shippingMethod === "will_call" ? "Your address" : "Delivery address"}</h2>
              {saved.length > 0 && (
                <div role="radiogroup" aria-label="Saved addresses" className="co-stack" style={{ marginBottom: useNew ? "16px" : 0 }}>
                  {saved.map((a) => (
                    <Option key={a.id} checked={!useNew && addressId === a.id} onPick={() => { setAddressId(a.id); setUseNew(false); }}
                      title={a.full_name || a.label || "Address"}
                      hint={`${a.line1}${a.line2 ? `, ${a.line2}` : ""}, ${a.city}, ${a.state} ${a.postal_code}${!shipsTo(a.country) ? ". We don't ship to this country." : ""}`} />
                  ))}
                  <Option checked={useNew} onPick={() => { setUseNew(true); setAddressId(null); }} title="Use a different address" />
                </div>
              )}
              {(useNew || saved.length === 0) && (
                <div className="co-stack">
                  <div className="co-two co-keep">
                    <Field label="First name" error={errors.first}><input value={form.first} onChange={set("first")} autoComplete="given-name" /></Field>
                    <Field label="Last name" error={errors.last}><input value={form.last} onChange={set("last")} autoComplete="family-name" /></Field>
                  </div>
                  <Field label="Company (optional)"><input value={form.company} onChange={set("company")} autoComplete="organization" /></Field>
                  <Field label="Address" error={errors.street}><input ref={streetRef} value={form.street} onChange={set("street")} autoComplete="address-line1" /></Field>
                  <Field label="Apartment, suite (optional)"><input value={form.line2} onChange={set("line2")} autoComplete="address-line2" /></Field>
                  <div className="co-two">
                    <Field label="City" error={errors.city}><input value={form.city} onChange={set("city")} autoComplete="address-level2" /></Field>
                    <Field label="State" error={errors.state}>
                      <select value={form.state} onChange={set("state")} autoComplete="address-level1">
                        <option value="">Select state</option>
                        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="co-two">
                    <Field label="ZIP code" error={errors.zip}><input value={form.zip} onChange={set("zip")} inputMode="numeric" maxLength={10} autoComplete="postal-code" /></Field>
                    <Field label="Phone (for delivery updates)"><input value={form.phone} onChange={set("phone")} type="tel" autoComplete="tel" /></Field>
                  </div>
                </div>
              )}
              {noShipHere ? <p className="co-warn" style={{ marginTop: "12px" }}>This shop doesn&apos;t ship to that country. Choose another address{pickupOffered ? ", or pick your order up" : ""}.</p> : null}
            </section>

            {/* 3. Delivery method */}
            {!onlyGiftCards && (
              <section className="co-card" aria-labelledby="co-method-h">
                <h2 className="co-h" id="co-method-h"><span className="co-n">3</span>Delivery method</h2>
                <div role="radiogroup" aria-label="Delivery method" className="co-stack">
                  <Option checked={shippingMethod === "standard"} onPick={() => setShippingMethod("standard")}
                    title={live ? "Shipping" : "Standard shipping"}
                    hint={live ? (liveRate ? `${liveRate.carrier} ${liveRate.service}${liveRate.days ? `, about ${liveRate.days} business day${liveRate.days === 1 ? "" : "s"}` : ""}` : "Carrier rates appear once your address is in")
                      : tierShipping === null ? "Your shipping is worked out for your account" : undefined}
                    price={live ? (liveRate ? formatCurrency(liveRate.cost) : ratesLoading ? "…" : undefined)
                      : tierShipping === null ? undefined : tierShipping === 0 ? "Free" : formatCurrency(tierShipping)}>
                    {live && (ratesLoading || liveRates.length > 0) ? (
                      <div className="co-rates" role="radiogroup" aria-label="Carrier rates">
                        {ratesLoading ? <p className="co-small">Getting carrier rates…</p> : liveRates.map((r) => (
                          <Option key={r.rate_id} checked={rateId === r.rate_id} onPick={() => setRateId(r.rate_id)}
                            title={`${r.carrier} ${r.service}`} hint={r.days != null ? `${r.days} business day${r.days === 1 ? "" : "s"}` : undefined}
                            price={formatCurrency(r.cost)} />
                        ))}
                      </div>
                    ) : live && zipOk && !ratesLoading ? (
                      <p className="co-small">No carrier rates for this address. Check the ZIP and state.</p>
                    ) : null}
                  </Option>
                  {pickupOffered && (
                    <Option checked={shippingMethod === "will_call"} onPick={() => setShippingMethod("will_call")}
                      title="Local pickup"
                      hint={[pickup_name, pickup_address].filter(Boolean).join(", ") || "Collect from the shop when your order is ready"}
                      price="Free">
                      {pickup_hours ? <p className="co-small">{pickup_hours}. We email you when it is ready to collect.</p> : <p className="co-small">We email you when it is ready to collect.</p>}
                    </Option>
                  )}
                </div>
              </section>
            )}

            {/* 4. Payment */}
            <section className="co-card" aria-labelledby="co-pay-h">
              <h2 className="co-h" id="co-pay-h"><span className="co-n">{onlyGiftCards ? 3 : 4}</span>Payment</h2>
              {!paidIntentId && payOptions.length > 1 && (
                <div role="radiogroup" aria-label="How to pay" className="co-stack" style={{ marginBottom: "14px" }}>
                  {payOptions.includes("card") && <Option checked={paymentMethod === "card"} onPick={() => setPaymentMethod("card")} title="Credit or debit card" disabled={placing} />}
                  {payOptions.includes("cod") && <Option checked={paymentMethod === "cod"} onPick={() => setPaymentMethod("cod")} title="Cash on delivery" hint={`Pay ${formatCurrency(total)} in cash when your order arrives.`} disabled={placing} />}
                  {payOptions.includes("net_30") && <Option checked={paymentMethod === "net_30"} onPick={() => setPaymentMethod("net_30")} title="Pay on invoice (Net 30)" hint="For your approved trade account. We send the invoice; it is due in 30 days." disabled={placing} />}
                </div>
              )}

              {!paidIntentId && payOptions.length === 1 && payOptions[0] !== "card" && (
                <div className="co-stack" style={{ marginBottom: "14px" }} data-only-way>
                  {payOptions[0] === "net_30"
                    ? <Option checked onPick={() => {}} title="Pay by invoice (Net 30)" hint="For your approved trade account. We send the invoice; it is due in 30 days." disabled={placing} />
                    : <Option checked onPick={() => {}} title="Cash on delivery" hint={`Pay ${formatCurrency(total)} in cash when your order arrives.`} disabled={placing} />}
                </div>
              )}

              {giftAccepted && !giftLines.length && paymentMethod === "card" && !paidIntentId && !placing && (
                <div style={{ marginBottom: "14px" }} data-gift-card-box>
                  {giftCodes.map((code) => (
                    <div key={code} className="co-row">
                      <span>Gift card {giftShown[code]?.masked ?? ""} <span className="co-muted">({formatCurrency(giftShown[code]?.balance ?? 0)} on it)</span></span>
                      <button type="button" onClick={() => setGiftCodes((l) => l.filter((c) => c !== code))}
                        style={{ border: 0, background: "none", cursor: "pointer", textDecoration: "underline", font: "inherit" }}>Remove</button>
                    </div>
                  ))}
                  <form className="co-code" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); applyGiftCard(); }}>
                    <input value={giftEntry} onChange={(e) => setGiftEntry(e.target.value)} placeholder="Gift card code"
                      aria-label="Gift card code" autoComplete="off" spellCheck={false} maxLength={40} />
                    <button type="submit" className="co-btn co-ghost" style={{ height: "46px" }} disabled={giftBusy || !giftEntry.trim()} aria-label="Apply gift card">
                      {giftBusy ? "Checking…" : "Apply"}
                    </button>
                  </form>
                  {giftErr ? <p className="co-small" role="alert" style={{ color: "var(--ui-bad,#B42318)" }}>{giftErr}</p> : null}
                </div>
              )}

              <div className="co-stack">
                <Field label="PO number (optional)"><input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} maxLength={60} /></Field>
                {look.showOrderNote && (
                  <Field label="Order note (optional)">
                    <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} maxLength={1000}
                      placeholder="Anything we should know about colors, deadline or packing?" />
                  </Field>
                )}
              </div>

              {error ? <p className="co-alert" role="alert" style={{ marginTop: "14px" }}>{error}</p> : null}

              {paymentMethod === "card" ? (
                <div style={{ marginTop: "16px" }}>
                  {placing ? (
                    <p className="co-small">Placing your order…</p>
                  ) : paidIntentId ? (
                    /* Charged, but the order didn't come back. Never show the pay
                       form again: the buyer would be charged a second time. */
                    <div className="co-warn">
                      <b>Your payment went through. Don&apos;t pay again.</b>
                      <p style={{ margin: "6px 0 10px" }}>We couldn&apos;t finish your order just now. Your card was charged once and that payment is safe. Press the button to finish; it picks up the same payment.</p>
                      <button type="button" className="co-btn co-main" onClick={() => placeOrder(paidIntentId)}>Finish my order</button>
                    </div>
                  ) : !ready ? (
                    <p className="co-small" data-card-waits>
                      {items.some((i) => i.problem) ? "Fix the item in your cart that can't be ordered, then pay here."
                        : "Fill in your delivery details above and the card form appears here."}
                    </p>
                  ) : !couponRead || !checkoutRef ? (
                    <p className="co-small">Loading secure payment…</p>
                  ) : (
                    <StripePaymentForm
                      // A new payment for a new amount: anything that changes what
                      // is charged gives the form a fresh intent, priced as the
                      // order will be. The one it replaces is never charged.
                      key={intentKey}
                      intentUrl="/api/v1/checkout/intent"
                      intentPayload={cardIntent}
                      onPaid={(pi) => placeOrder(pi)}
                      onIntent={(r) => setPricedFor({ key: intentKey, r })}
                      onGiftOnly={() => placeOrder(undefined, true)}
                      giftOnlyLabel={look.placeOrderText}
                      buttonLabel={`${look.placeOrderText}, ${formatCurrency(cardToPay)}`}
                      buttonStyle={btnStyle}
                    />
                  )}
                </div>
              ) : (
                <div className="co-actions" style={{ marginTop: "18px" }}>
                  <button type="button" className="co-btn co-main" disabled={placing || !cart} onClick={() => placeOrder()}>
                    {placing ? "Placing your order…" : `${look.placeOrderText}, ${formatCurrency(total)}`}
                  </button>
                  <Link href="/cart" className="co-btn co-ghost">Back to cart</Link>
                </div>
              )}
              <p className="co-terms">By placing your order you agree to the <a href="/terms">Terms</a> and <a href="/privacy-policy">Privacy Policy</a>.</p>
              {paymentMethod === "card" && <p className="co-terms"><Link href="/cart">Back to cart</Link></p>}
            </section>
          </div>

          <aside className="co-aside">
            {summary}
            <p className="co-help">Questions about your order? <Link href="/contact">Contact us</Link></p>
          </aside>
        </div>
      </div>
    </div>
  );
}
