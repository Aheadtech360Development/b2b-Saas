/**
 * What a shop's Tag Manager container is handed.
 *
 * A shop that connects only its container (no tool by name) used to get page
 * loads and nothing else: every shopping event was sent to a named tool and
 * none to the data layer, so no purchase tag could be built in the container.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setTrackingConfig, trackAddToCart, trackBeginCheckout, trackPurchase, trackViewItem } from "@/lib/tracking";

const shop = (tools: Record<string, string>, over: Partial<{ track_products: boolean; track_checkout: boolean; enabled: boolean }> = {}) =>
  setTrackingConfig({ enabled: true, tools, head_snippet: "", body_snippet: "", track_products: true, track_checkout: true, ...over });

const tee = { id: "p1", sku: "TEE-BLK-M", name: "Tee", price: 12.5, quantity: 2, variant: "Black / M" };
const layer = () => (window.dataLayer ?? []) as Record<string, unknown>[];

describe("the data layer for a shop's own Tag Manager container", () => {
  beforeEach(() => { window.dataLayer = []; });

  it("gets a purchase in the shape Tag Manager's tags read", () => {
    shop({ gtm: "GTM-TEST123" });
    trackPurchase("1044", 68, [tee]);
    expect(layer()).toEqual([
      { ecommerce: null },
      {
        event: "purchase",
        ecommerce: {
          transaction_id: "1044", currency: "USD", value: 68,
          items: [{ item_id: "TEE-BLK-M", item_name: "Tee", price: 12.5, quantity: 2, item_variant: "Black / M" }],
        },
      },
    ]);
  });

  it("gets a product view, an add to cart and the start of checkout", () => {
    shop({ gtm: "GTM-TEST123" });
    trackViewItem({ ...tee, quantity: undefined });
    trackAddToCart([tee]);
    trackBeginCheckout([tee]);
    const events = layer().filter(e => e.event);
    expect(events.map(e => e.event)).toEqual(["view_item", "add_to_cart", "begin_checkout"]);
    expect((events[0]!.ecommerce as { value: number }).value).toBe(12.5);
    expect((events[1]!.ecommerce as { value: number }).value).toBe(25);
    // Each one is cleared for first, so one event's items do not stay on for the next.
    expect(layer().filter(e => "ecommerce" in e && e.ecommerce === null)).toHaveLength(3);
  });

  it("gets nothing when the shop has no container", () => {
    shop({ ga4: "G-TEST12345" });
    trackPurchase("1044", 68, [tee]);
    trackAddToCart([tee]);
    expect(layer()).toEqual([]);
  });

  it("respects the shop's two switches", () => {
    shop({ gtm: "GTM-TEST123" }, { track_checkout: false });
    trackPurchase("1044", 68, [tee]);
    trackAddToCart([tee]);
    expect(layer().filter(e => e.event).map(e => e.event)).toEqual(["add_to_cart"]);

    window.dataLayer = [];
    shop({ gtm: "GTM-TEST123" }, { track_products: false });
    trackAddToCart([tee]);
    trackViewItem(tee);
    expect(layer()).toEqual([]);
  });

  it("gets nothing when tracking is switched off altogether", () => {
    shop({ gtm: "GTM-TEST123" }, { enabled: false });
    trackPurchase("1044", 68, [tee]);
    expect(layer()).toEqual([]);
  });
});

/**
 * A visitor's first page. The shop's settings are read by the browser after
 * the page is up, and a product page reports its view the moment it is drawn,
 * so on the page an advert lands somebody on the view came before the settings
 * and was dropped.
 */
describe("an event sent before the shop's settings have been read", () => {
  beforeEach(() => { window.dataLayer = []; setTrackingConfig(null); });

  it("is kept and sent once the settings arrive", () => {
    trackViewItem({ ...tee, quantity: undefined });
    expect(layer()).toEqual([]);
    shop({ gtm: "GTM-TEST123" });
    expect(layer().filter(e => e.event).map(e => e.event)).toEqual(["view_item"]);
  });

  it("is sent once, not again when the settings are read a second time", () => {
    trackViewItem(tee);
    shop({ gtm: "GTM-TEST123" });
    shop({ gtm: "GTM-TEST123" });
    expect(layer().filter(e => e.event)).toHaveLength(1);
  });

  it("is dropped when the settings say the shop tracks nothing", () => {
    trackViewItem(tee);
    trackPurchase("1044", 68, [tee]);
    shop({ gtm: "GTM-TEST123" }, { enabled: false });
    expect(layer()).toEqual([]);
  });

  it("is one of twenty at most: a page's first moments, not a log", () => {
    for (let i = 0; i < 50; i++) trackAddToCart([tee]);
    expect(layer()).toEqual([]);
    shop({ gtm: "GTM-TEST123" });
    expect(layer().filter(e => e.event)).toHaveLength(20);
  });
});
