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

export function setTrackingConfig(next: AnalyticsConfig | null): void {
  config = next;
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

// ── Shopping ────────────────────────────────────────────────────────────────

export function trackViewItem(item: TrackedItem): void {
  if (!on("products")) return;
  const value = item.price * (item.quantity ?? 1);

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

export function trackAddToCart(items: TrackedItem[]): void {
  if (!on("products") || !items.length) return;
  const value = money(items);
  const ids = items.map(i => i.sku ?? i.id);

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

export function trackBeginCheckout(items: TrackedItem[]): void {
  if (!on("checkout") || !items.length) return;
  const value = money(items);
  const ids = items.map(i => i.sku ?? i.id);

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

/**
 * The one event every brand checks.
 *
 * `orderNumber` is passed to every tool that accepts one so a reload of the
 * confirmation page is de-duplicated rather than counted as a second sale.
 */
export function trackPurchase(orderNumber: string, total: number, items: TrackedItem[] = []): void {
  if (!on("checkout")) return;
  const ids = items.map(i => i.sku ?? i.id);

  safely(() => {
    if (has("ga4")) window.gtag?.("event", "purchase", {
      transaction_id: orderNumber, currency: "USD", value: total,
      items: items.map(i => ({ item_id: i.sku ?? i.id, item_name: i.name, price: i.price, quantity: i.quantity ?? 1 })),
    });
  });
  safely(() => { if (has("meta_pixel")) window.fbq?.("track", "Purchase", { content_ids: ids, content_type: "product", value: total, currency: "USD" }, { eventID: orderNumber }); });
  safely(() => { if (has("tiktok_pixel")) window.ttq?.track("CompletePayment", { value: total, currency: "USD", contents: items.map(i => ({ content_id: i.sku ?? i.id, quantity: i.quantity ?? 1, price: i.price })) }); });
  safely(() => { if (has("pinterest_tag")) window.pintrk?.("track", "checkout", { value: total, order_id: orderNumber, currency: "USD", order_quantity: items.length }); });
  safely(() => { if (has("snap_pixel")) window.snaptr?.("track", "PURCHASE", { item_ids: ids, price: total, currency: "USD", transaction_id: orderNumber }); });
  safely(() => { if (has("omnisend")) window.omnisend?.push(["track", "$placedOrder", { $orderID: orderNumber, $value: total }]); });
}

/** Tell the email tools who this is, so their flows can reach them. */
export function identify(email: string, extra: Record<string, unknown> = {}): void {
  if (!config?.enabled || !email) return;
  safely(() => { if (has("klaviyo")) window._learnq?.push(["identify", { $email: email, ...extra }]); });
  safely(() => { if (has("omnisend")) window.omnisend?.push(["identifyContact", { email, ...extra }]); });
  safely(() => { if (has("meta_pixel")) window.fbq?.("init", config!.tools.meta_pixel, { em: email }); });
}
