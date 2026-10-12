/**
 * Sends the shopping events to whichever tools this brand connected.
 *
 * One call site per event, fanned out here to GA4, Meta, TikTok, Pinterest,
 * Snap, Klaviyo and Omnisend, because a product page should not have to know
 * which tools a brand happens to use — and a brand that adds one later should
 * not need its product page edited.
 *
 * Everything is best-effort. A blocked pixel, an ad blocker, a tool that never
 * loaded: none of it may interrupt a purchase, so every call is wrapped and a
 * failure is silent.
 *
 * The events, in the order a shopper meets them: page view, search, product
 * view, add to cart, cart view, remove from cart, checkout started, delivery
 * chosen, payment chosen, purchase; and beside them a new account and an
 * enquiry. A screen that puts something in a cart says so through one of the
 * senders at the foot of this file (`trackCartAdd`, `trackSheetAdd`,
 * `trackLineAdd`): they take the screen's own data as it is and cannot throw.
 */

import type { AnalyticsConfig } from "@/components/analytics/TrackingScripts";

type Fn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Fn;
    fbq?: Fn;
    ttq?: { track: Fn; page: Fn };
    pintrk?: Fn;
    snaptr?: Fn;
    klaviyo?: { push: Fn };
    _learnq?: unknown[];
    omnisend?: unknown[];
    dataLayer?: unknown[];
  }
}

export interface TrackedItem {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  sku?: string;
  category?: string;
  variant?: string;
}

let config: AnalyticsConfig | null = null;

// Shopping events sent before the shop's settings have been read. The
// settings are fetched by the browser after the page is up, and a product
// page reports its view as soon as it is drawn: on a visitor's first page,
// the one an advert or a search result lands them on, the view came first
// and was dropped, because nothing yet said which tools the shop uses.
let waiting: (() => void)[] = [];

export function setTrackingConfig(next: AnalyticsConfig | null): void {
  config = next;
  const queued = waiting;
  waiting = [];
  if (!next) return;
  // What the page before left to be sent happened before anything here did.
  safely(sendCarried);
  queued.forEach(send => safely(send));
}

/** True when the event has been put aside to be sent once the settings
 *  are in. A handful at most: this is a page's first moments, not a log. */
function held(send: () => void): boolean {
  if (config || typeof window === "undefined") return false;
  if (waiting.length < 20) waiting.push(send);
  return true;
}

function on(feature: "products" | "checkout" = "products"): boolean {
  if (typeof window === "undefined" || !config?.enabled) return false;
  return feature === "products" ? config.track_products : config.track_checkout;
}

function has(tool: string): boolean {
  return !!config?.tools?.[tool];
}

/** Run something that talks to a third-party script, and never let it throw. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* a tool that is blocked or half-loaded is not worth an error */
  }
}

function money(items: TrackedItem[]): number {
  return items.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0);
}

// ── What this tab remembers ─────────────────────────────────────────────────

function recall<T>(key: string, empty: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : empty;
  } catch {
    return empty;
  }
}

/** False when the browser would not keep it (private mode, storage full). */
function keep(key: string, value: unknown): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function forget(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* nothing was kept */ }
}

const SEEN = "pc_track_seen";

/** True the first time `key` comes up in this visit. A checkout page is drawn
 *  again on a reload, on Back, after its own data arrives: the step it stands
 *  for happened once. */
function first(key: string): boolean {
  const kept = recall<unknown>(SEEN, []);
  const seen = Array.isArray(kept) ? (kept as string[]) : [];
  if (seen.includes(key)) return false;
  keep(SEEN, [...seen, key].slice(-40));
  return true;
}

function signature(items: TrackedItem[]): string {
  return items.map(i => `${i.sku ?? i.id}*${i.quantity ?? 1}`).sort().join(",");
}

// Several "add to cart" buttons finish by loading /cart afresh: the sheet
// builder, the uploaders, the configurator. An event sent the moment before a
// page is thrown away is often thrown away with it, the tool's request
// cancelled half sent. Those are written down instead, and the page that
// loads next sends them once it knows the shop's tools.
const CARRIED = "pc_track_carried";

function carry(items: TrackedItem[]): boolean {
  const kept = recall<unknown>(CARRIED, []);
  const list = Array.isArray(kept) ? kept : [];
  return keep(CARRIED, [...list, items].slice(-10));
}

function sendCarried(): void {
  const kept = recall<unknown>(CARRIED, []);
  forget(CARRIED);
  if (!Array.isArray(kept)) return;
  for (const items of kept) if (Array.isArray(items)) trackAddToCart(items as TrackedItem[]);
}

// ── Google Tag Manager ──────────────────────────────────────────────────────

function dataLayerItems(items: TrackedItem[]) {
  return items.map(i => ({
    item_id: i.sku ?? i.id, item_name: i.name, price: i.price, quantity: i.quantity ?? 1,
    ...(i.category ? { item_category: i.category } : {}),
    ...(i.variant ? { item_variant: i.variant } : {}),
  }));
}

/**
 * A shopping event for the shop's own Tag Manager container, in the shape its
 * tags read: `event` plus `ecommerce`, the same data layer a Shopify or
 * WooCommerce store hands it. The other tools above are each called by name;
 * a container is not, so without this a shop that connects only its container
 * gets page loads and nothing a purchase tag could be built on.
 *
 * `ecommerce: null` goes first, as Google's own guide has it: it stops one
 * event's items staying on for the next.
 */
function toDataLayer(event: string, ecommerce: Record<string, unknown>): void {
  safely(() => {
    if (!has("gtm")) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ event, ecommerce });
  });
}

/** An event that is not about products: a search, a new account, an enquiry. */
function toDataLayerPlain(event: string, params: Record<string, unknown>): void {
  safely(() => {
    if (!has("gtm")) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...params });
  });
}

// ── Page view ───────────────────────────────────────────────────────────────

/** A navigation. The App Router never reloads the document, so without this
 *  every tool would record exactly one view per session. */
export function trackPageView(path: string): void {
  if (!config?.enabled || typeof window === "undefined") return;
  const url = window.location.origin + path;

  safely(() => { if (has("ga4")) window.gtag?.("event", "page_view", { page_path: path, page_location: url }); });
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "PageView"); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.page(); });
  safely(() => { if (has("pinterest_tag")) window.pintrk?.("page"); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "PAGE_VIEW"); });
  safely(() => { if (has("omnisend")) window.omnisend?.push(["track", "$pageViewed"]); });
}

/** The words somebody searched the shop for. */
export function trackSearch(term: string): void {
  const q = (term || "").trim().slice(0, 120);
  if (!q) return;
  if (held(() => trackSearch(q))) return;
  if (!on("products")) return;

  toDataLayerPlain("search", { search_term: q });
  safely(() => { if (has("ga4")) window.gtag?.("event", "search", { search_term: q }); });
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "Search", { search_string: q }); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("Search", { query: q }); });
  safely(() => { if (has("pinterest_tag")) window.pintrk?.("track", "search", { search_query: q }); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "SEARCH", { search_string: q }); });
}

// ── Shopping ────────────────────────────────────────────────────────────────

export function trackViewItem(item: TrackedItem): void {
  if (held(() => trackViewItem(item))) return;
  if (!on("products")) return;
  const value = item.price * (item.quantity ?? 1);

  toDataLayer("view_item", { currency: "USD", value, items: dataLayerItems([item]) });
  safely(() => {
    if (has("ga4")) window.gtag?.("event", "view_item", {
      currency: "USD", value,
      items: [{ item_id: item.sku ?? item.id, item_name: item.name, price: item.price,
                item_category: item.category, item_variant: item.variant }],
    });
  });
  safely(() => {
    if (has("meta_pixel")) window.fbq?.("track", "ViewContent", {
      content_ids: [item.sku ?? item.id], content_name: item.name,
      content_type: "product", value, currency: "USD",
    });
  });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("ViewContent", { content_id: item.sku ?? item.id, content_name: item.name, value, currency: "USD" }); });
  safely(() => { if (has("pinterest_tag")) window.pintrk?.("track", "pagevisit", { product_id: item.sku ?? item.id }); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "VIEW_CONTENT", { item_ids: [item.sku ?? item.id], price: item.price, currency: "USD" }); });
  safely(() => { if (has("omnisend")) window.omnisend?.push(["track", "$productViewed", { $productID: item.id, $productTitle: item.name, $price: item.price }]); });
}

/**
 * `navigating`: the button goes on to load another page afresh. The event is
 * written down and sent by that page (see `carry` above) instead of now.
 */
export function trackAddToCart(items: TrackedItem[], opts: { navigating?: boolean } = {}): void {
  if (!items.length) return;
  if (opts.navigating && typeof window !== "undefined" && carry(items)) return;
  if (held(() => trackAddToCart(items))) return;
  if (!on("products")) return;
  const value = money(items);
  const ids = items.map(i => i.sku ?? i.id);

  toDataLayer("add_to_cart", { currency: "USD", value, items: dataLayerItems(items) });
  safely(() => {
    if (has("ga4")) window.gtag?.("event", "add_to_cart", {
      currency: "USD", value,
      items: items.map(i => ({ item_id: i.sku ?? i.id, item_name: i.name, price: i.price,
                               quantity: i.quantity ?? 1, item_variant: i.variant })),
    });
  });
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "AddToCart", { content_ids: ids, content_type: "product", value, currency: "USD" }); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("AddToCart", { value, currency: "USD", contents: items.map(i => ({ content_id: i.sku ?? i.id, quantity: i.quantity ?? 1, price: i.price })) }); });
  safely(() => { if (has("pinterest_tag")) window.pintrk?.("track", "addtocart", { value, order_quantity: items.length, currency: "USD" }); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "ADD_CART", { item_ids: ids, price: value, currency: "USD" }); });
  safely(() => { if (has("omnisend")) window.omnisend?.push(["track", "$addedToCart", { $value: value }]); });
}

export function trackRemoveFromCart(items: TrackedItem[]): void {
  if (!items.length) return;
  if (held(() => trackRemoveFromCart(items))) return;
  if (!on("products")) return;
  const body = { currency: "USD", value: money(items), items: dataLayerItems(items) };

  toDataLayer("remove_from_cart", body);
  safely(() => { if (has("ga4")) window.gtag?.("event", "remove_from_cart", body); });
}

/** The cart, opened with something in it. */
export function trackViewCart(items: TrackedItem[]): void {
  if (!items.length) return;
  if (held(() => trackViewCart(items))) return;
  if (!on("products")) return;
  const body = { currency: "USD", value: money(items), items: dataLayerItems(items) };

  toDataLayer("view_cart", body);
  safely(() => { if (has("ga4")) window.gtag?.("event", "view_cart", body); });
}

// ── Checkout ────────────────────────────────────────────────────────────────

export function trackBeginCheckout(items: TrackedItem[]): void {
  if (held(() => trackBeginCheckout(items))) return;
  if (!on("checkout") || !items.length) return;
  const value = money(items);
  const ids = items.map(i => i.sku ?? i.id);

  toDataLayer("begin_checkout", { currency: "USD", value, items: dataLayerItems(items) });
  safely(() => {
    if (has("ga4")) window.gtag?.("event", "begin_checkout", {
      currency: "USD", value,
      items: items.map(i => ({ item_id: i.sku ?? i.id, item_name: i.name, price: i.price, quantity: i.quantity ?? 1 })),
    });
  });
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "InitiateCheckout", { content_ids: ids, value, currency: "USD", num_items: items.length }); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("InitiateCheckout", { value, currency: "USD" }); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "START_CHECKOUT", { item_ids: ids, price: value, currency: "USD" }); });
  safely(() => { if (has("omnisend")) window.omnisend?.push(["track", "$startedCheckout", { $value: value }]); });
}

// What is being checked out, kept for the steps after the first: the review
// page sends "payment chosen" for the same lines the address page started
// with, and it may have been reloaded in between.
const CHECKOUT = "pc_track_checkout";
let inCheckout: TrackedItem[] | null = null;

function checkoutItems(): TrackedItem[] {
  if (inCheckout) return inCheckout;
  const kept = recall<unknown>(CHECKOUT, []);
  return Array.isArray(kept) ? (kept as TrackedItem[]) : [];
}

/**
 * The checkout's first step was opened for this cart. Sent once for a cart in
 * a visit: the step is drawn again on a reload and on every way back to it.
 */
export function trackCheckoutStarted(lines: CartLineLike[] | null | undefined): void {
  safely(() => {
    const items = cartLines(lines);
    if (!items.length) return;
    inCheckout = items;
    keep(CHECKOUT, items);
    sendCheckoutStarted(items);
  });
}

function sendCheckoutStarted(items: TrackedItem[]): void {
  if (held(() => sendCheckoutStarted(items))) return;
  if (!on("checkout") || !first(`begin_checkout:${signature(items)}`)) return;
  trackBeginCheckout(items);
}

/** A delivery method was chosen and the shopper went on to pay. */
export function trackShippingChosen(tier: string): void {
  safely(() => sendCheckoutStep("add_shipping_info", "shipping_tier", tier || "standard"));
}

/** A way to pay was chosen and the order sent. */
export function trackPaymentChosen(type: string): void {
  safely(() => sendCheckoutStep("add_payment_info", "payment_type", type || "card"));
}

function sendCheckoutStep(event: "add_shipping_info" | "add_payment_info", key: string, choice: string): void {
  if (held(() => sendCheckoutStep(event, key, choice))) return;
  if (!on("checkout")) return;
  const items = checkoutItems();
  if (!items.length || !first(`${event}:${choice}:${signature(items)}`)) return;
  const value = money(items);
  const ids = items.map(i => i.sku ?? i.id);
  const body = { currency: "USD", value, [key]: choice, items: dataLayerItems(items) };

  toDataLayer(event, body);
  safely(() => { if (has("ga4")) window.gtag?.("event", event, body); });
  if (event !== "add_payment_info") return;
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "AddPaymentInfo", { content_ids: ids, content_type: "product", value, currency: "USD" }); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("AddPaymentInfo", { value, currency: "USD" }); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "ADD_BILLING", { item_ids: ids, price: value, currency: "USD" }); });
}

/** What an order's total is made of, for the tools that report it apart. */
export interface PurchaseExtra {
  tax?: number;
  shipping?: number;
  coupon?: string;
}

/**
 * The one event every brand checks.
 *
 * `orderNumber` is passed to every tool that accepts one so a reload of the
 * confirmation page is de-duplicated rather than counted as a second sale.
 */
export function trackPurchase(orderNumber: string, total: number, items: TrackedItem[] = [], extra: PurchaseExtra = {}): void {
  if (held(() => trackPurchase(orderNumber, total, items, extra))) return;
  if (!on("checkout")) return;
  const ids = items.map(i => i.sku ?? i.id);
  const parts = {
    ...(extra.tax != null ? { tax: extra.tax } : {}),
    ...(extra.shipping != null ? { shipping: extra.shipping } : {}),
    ...(extra.coupon ? { coupon: extra.coupon } : {}),
  };

  toDataLayer("purchase", {
    transaction_id: orderNumber, currency: "USD", value: total, ...parts, items: dataLayerItems(items),
  });
  safely(() => {
    if (has("ga4")) window.gtag?.("event", "purchase", {
      transaction_id: orderNumber, currency: "USD", value: total, ...parts,
      items: items.map(i => ({ item_id: i.sku ?? i.id, item_name: i.name, price: i.price, quantity: i.quantity ?? 1 })),
    });
  });
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "Purchase", { content_ids: ids, content_type: "product", value: total, currency: "USD" }, { eventID: orderNumber }); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("CompletePayment", { value: total, currency: "USD", contents: items.map(i => ({ content_id: i.sku ?? i.id, quantity: i.quantity ?? 1, price: i.price })) }); });
  safely(() => { if (has("pinterest_tag")) window.pintrk?.("track", "checkout", { value: total, order_id: orderNumber, currency: "USD", order_quantity: items.length }); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "PURCHASE", { item_ids: ids, price: total, currency: "USD", transaction_id: orderNumber }); });
  safely(() => { if (has("omnisend")) window.omnisend?.push(["track", "$placedOrder", { $orderID: orderNumber, $value: total }]); });

  // The order is placed: the next cart is a new checkout, even one with the
  // same lines in it.
  inCheckout = null;
  forget(CHECKOUT);
  forget(SEEN);
}

// ── People ──────────────────────────────────────────────────────────────────

/** Somebody opened an account with the shop. */
export function trackSignUp(method = "email"): void {
  if (held(() => trackSignUp(method))) return;
  if (!config?.enabled || typeof window === "undefined") return;

  toDataLayerPlain("sign_up", { method });
  safely(() => { if (has("ga4")) window.gtag?.("event", "sign_up", { method }); });
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "CompleteRegistration"); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("CompleteRegistration"); });
  safely(() => { if (has("pinterest_tag")) window.pintrk?.("track", "signup"); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "SIGN_UP"); });
}

/** Somebody sent the shop an enquiry: a contact form, a quote request. */
export function trackLead(source = "contact"): void {
  if (held(() => trackLead(source))) return;
  if (!config?.enabled || typeof window === "undefined") return;

  toDataLayerPlain("generate_lead", { lead_source: source });
  safely(() => { if (has("ga4")) window.gtag?.("event", "generate_lead", { lead_source: source }); });
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "Lead", { content_name: source }); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("SubmitForm"); });
  safely(() => { if (has("pinterest_tag")) window.pintrk?.("track", "lead", { lead_type: source }); });
}

/** Tell the email tools who this is, so their flows can reach them. */
export function identify(email: string, extra: Record<string, unknown> = {}): void {
  if (!config?.enabled || !email) return;
  safely(() => { if (has("klaviyo")) window._learnq?.push(["identify", { $email: email, ...extra }]); });
  safely(() => { if (has("omnisend")) window.omnisend?.push(["identifyContact", { email, ...extra }]); });
  safely(() => { if (has("meta_pixel")) window.fbq?.("init", config!.tools.meta_pixel, { em: email }); });
}

// ── A cart's lines, as the tools are told about them ────────────────────────

/** What is read from a cart line. Both carts fit: the account's, which the
 *  server sends, and a guest's, which the browser keeps. */
export interface CartLineLike {
  variant_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  sku?: string | null;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
  unit_price?: string | number | null;
  item_type?: string | null;
  gang_sheet_order_id?: string | null;
  configuration?: { selections?: Record<string, unknown> | null; artwork?: { url?: string | null } | null } | null;
}

/** A sheet job, built in the studio or uploaded. */
export interface SheetJobLike {
  sheet_name?: string | null;
  sheet_size_id?: string | null;
  price_per_sheet?: number | string | null;
  sheet_quantity?: number | null;
}

// Every sheet is one product to a report. Its line is named after the job
// ("Gang Sheet GS-AB-2610-0005 — 22 × 24"), and a job's number as the
// product's name would make every sale a product of its own.
const SHEET = "GANG-SHEET";

/** "Gang Sheet GS-… — 22 × 24" → Gang Sheet, 22 × 24. A design ordered by
 *  size is labelled "<product> — <size>" and keeps the product's name. */
function sheetWords(label: string): { name: string; variant?: string } {
  const built = /^gang sheet\b/i.test(label.trim());
  // A built sheet's size comes after the first dash (the size's own name may
  // hold one); a product's name may hold one too, so there it is the last.
  const cut = built ? label.indexOf("—") : label.lastIndexOf("—");
  const head = (cut >= 0 ? label.slice(0, cut) : label).trim();
  const size = cut >= 0 ? label.slice(cut + 1).trim() : "";
  const name = built || !head ? "Gang Sheet" : head;
  return size ? { name, variant: size } : { name };
}

export function sheetLine(job: SheetJobLike): TrackedItem {
  const label = job.sheet_name || "";
  // A sheet built on one of the shop's sizes is named by that size alone.
  const words = job.sheet_size_id ? { name: "Gang Sheet", ...(label ? { variant: label } : {}) } : sheetWords(label);
  return { id: SHEET, sku: SHEET, ...words, price: Number(job.price_per_sheet) || 0, quantity: Number(job.sheet_quantity) || 1 };
}

export function cartLine(line: CartLineLike): TrackedItem {
  const name = line.product_name || "";
  const price = Number(line.unit_price) || 0;
  const quantity = Number(line.quantity) || 1;
  const own = line.variant_id || "";

  if (line.item_type === "gang_sheet" || line.gang_sheet_order_id || own.startsWith("gs:")) {
    return { id: SHEET, sku: SHEET, ...sheetWords(name), price, quantity };
  }
  const variant = [line.color, line.size].filter(Boolean).join(" / ");
  return {
    // A guest's made-to-order line is keyed by everything chosen on it, which
    // identifies the line, not the product.
    id: (own && !own.startsWith("cfg:") ? own : line.product_id) || name,
    // A made-to-order line's SKU is only the ending its options add ("-GL"):
    // the product is what it is known by.
    ...(line.sku && line.item_type !== "configured" ? { sku: line.sku } : {}),
    name, price, quantity,
    ...(variant ? { variant } : {}),
  };
}

/** Never throws: it is called on the way out of placing an order. */
export function cartLines(lines: CartLineLike[] | null | undefined): TrackedItem[] {
  if (!Array.isArray(lines)) return [];
  return lines.flatMap(line => {
    try { return [cartLine(line)]; } catch { return []; }
  });
}

/** The lines an "add" put in the account's cart, read from the cart the
 *  server sent back, each with the quantity added (not the line's new total). */
export function addedLines(
  cart: { items?: CartLineLike[] | null } | null | undefined,
  added: { variant_id: string; quantity: number }[],
): TrackedItem[] {
  const lines = cart?.items ?? [];
  return added.flatMap(a => {
    const line = lines.find(l => l.variant_id === a.variant_id);
    return line ? [{ ...cartLine(line), quantity: a.quantity }] : [];
  });
}

// ── What a screen calls ─────────────────────────────────────────────────────
//
// Each takes the screen's own data as it is and cannot throw: an "added to
// cart" must never turn into "could not add" because of a report.

type AddOptions = { navigating?: boolean };

/** Variants just added to the account's cart, with the cart the server sent back. */
export function trackCartAdd(
  cart: { items?: CartLineLike[] | null } | null | undefined,
  added: { variant_id: string; quantity: number }[],
  opts: AddOptions = {},
): void {
  safely(() => trackAddToCart(addedLines(cart, added), opts));
}

/** The choices on a made-to-order line, in one order, to tell two lines apart. */
function choices(selections: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(
    Object.entries(selections ?? {})
      .map(([k, v]) => [k, Array.isArray(v) ? [...v].map(String).sort() : v] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * A made-to-order product just added to the account's cart. Its line is the
 * newest one for that product with the same choices (and the same file, when
 * one was sent); the server tops that line up rather than stacking a second.
 */
export function trackConfiguredAdd(
  cart: { items?: CartLineLike[] | null } | null | undefined,
  added: { product_id: string; selections: Record<string, unknown>; quantity: number; artwork_url?: string | null },
  opts: AddOptions = {},
): void {
  safely(() => {
    const mine = (cart?.items ?? []).filter(l => l.product_id === added.product_id && !l.variant_id);
    const want = choices(added.selections);
    const line = [...mine].reverse().find(l =>
      choices(l.configuration?.selections) === want
      && (l.configuration?.artwork?.url ?? null) === (added.artwork_url ?? null),
    ) ?? mine[mine.length - 1];
    if (line) trackAddToCart([{ ...cartLine(line), quantity: added.quantity }], opts);
  });
}

/** Sheets just put in a cart: built in the studio, or uploaded. */
export function trackSheetAdd(jobs: SheetJobLike | SheetJobLike[], opts: AddOptions = {}): void {
  safely(() => trackAddToCart((Array.isArray(jobs) ? jobs : [jobs]).map(sheetLine), opts));
}

/**
 * The sheet builder was opened to make a new sheet. On a shop whose product
 * is the sheet this is the product view, and many shoppers reach the builder
 * straight from a menu or an advert, without a product page before it. Priced
 * "from", as a product page is: the least a sheet can cost.
 */
export function trackSheetBuilderViewed(
  sizes: { price_per_sheet?: number | string | null; price_per_inch?: number | string | null; min_length_in?: number | string | null }[] | null | undefined,
): void {
  safely(() => {
    const prices = (sizes ?? [])
      .map(s => Number(s.price_per_sheet) || (Number(s.price_per_inch) || 0) * (Number(s.min_length_in) || 0))
      .filter(p => p > 0);
    trackViewItem({ id: SHEET, sku: SHEET, name: "Gang Sheet", price: prices.length ? Math.min(...prices) : 0 });
  });
}

/** One line put in a cart, described the way a cart line is. */
export function trackLineAdd(line: CartLineLike, opts: AddOptions = {}): void {
  safely(() => trackAddToCart([cartLine(line)], opts));
}

/** "Reorder" on a past order. `added` is what the server says went back in:
 *  a line out of stock is left out, and is not reported as added. */
export function trackReorder(lines: CartLineLike[] | null | undefined, added: unknown): void {
  safely(() => {
    const back = new Set((Array.isArray(added) ? added : []).map(a => (a as { sku?: string } | null)?.sku));
    trackAddToCart(cartLines((lines ?? []).filter(l => back.has(l.sku ?? undefined))));
  });
}

export function trackLinesRemoved(lines: CartLineLike[]): void {
  safely(() => trackRemoveFromCart(cartLines(lines)));
}

export function trackCartViewed(lines: CartLineLike[] | null | undefined): void {
  safely(() => trackViewCart(cartLines(lines)));
}
