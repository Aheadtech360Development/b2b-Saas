/**
 * The Purchase is sent from the order's thank-you page, as it opens, once.
 *
 * A shop's marketer asked for it there: "on the thank-you page, run this once
 * when the page loads, with the real order details" —
 *   dataLayer.push({ event: 'purchase', ecommerce: { transaction_id, value, currency: 'USD' } })
 * It used to go from the review page, just before the page changed, so a tag
 * set to fire on the thank-you page never saw it. The review page now holds it
 * for the tab that placed the order; the thank-you page sends it with the
 * order's real figures, and never twice.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { holdPurchase, sendHeldPurchase, setTrackingConfig } from "@/lib/tracking";

const shop = () => setTrackingConfig({
  enabled: true, tools: { gtm: "GTM-TEST123" }, head_snippet: "", body_snippet: "", track_products: true, track_checkout: true,
});
const tee = { id: "p1", sku: "TEE-BLK-M", name: "Tee", price: 9.5, quantity: 12, variant: "Black / M" };
const purchases = () => ((window.dataLayer ?? []) as Record<string, unknown>[]).filter((e) => e.event === "purchase");

beforeEach(() => {
  window.dataLayer = [];
  sessionStorage.clear();
  localStorage.clear();
  shop();
});

describe("the Purchase", () => {
  it("is not sent when the order is placed, only held", () => {
    holdPurchase("1047", 120, [tee], { tax: 9.9, shipping: 0, coupon: "SAVE10" });
    expect(purchases()).toEqual([]);
  });

  it("goes as the thank-you page opens, in the marketer's shape, with the server's figures", () => {
    holdPurchase("1047", 120, [tee], { tax: 9.9, shipping: 5, coupon: "SAVE10" });
    sendHeldPurchase("1047", { total: 123.4, tax: 9.4, shipping: 0 });
    const layer = (window.dataLayer ?? []) as Record<string, unknown>[];
    // Cleared first, as Google's guide has it.
    expect(layer[layer.length - 2]).toEqual({ ecommerce: null });
    expect(layer[layer.length - 1]).toEqual({
      event: "purchase",
      ecommerce: {
        transaction_id: "1047", currency: "USD", value: 123.4, tax: 9.4, shipping: 0, coupon: "SAVE10",
        items: [{ item_id: "TEE-BLK-M", item_name: "Tee", price: 9.5, quantity: 12, item_variant: "Black / M" }],
      },
    });
  });

  it("goes once: not on a reload, not from a second tab, not if held again", () => {
    holdPurchase("1047", 120, [tee]);
    sendHeldPurchase("1047", { total: 120, tax: 0, shipping: 0 });
    sendHeldPurchase("1047", { total: 120, tax: 0, shipping: 0 });   // the page reloaded
    holdPurchase("1047", 120, [tee]);                                // somehow held again
    sendHeldPurchase("1047", { total: 120, tax: 0, shipping: 0 });
    expect(purchases()).toHaveLength(1);
  });

  it("is not sent by another order's page, and waits for its own", () => {
    holdPurchase("1047", 120, [tee]);
    sendHeldPurchase("1046", { total: 50, tax: 0, shipping: 0 });
    expect(purchases()).toEqual([]);
    sendHeldPurchase("1047");
    expect(purchases()).toHaveLength(1);
    // When the order could not be read back: the figures held at the order.
    expect((purchases()[0]!.ecommerce as { value: number }).value).toBe(120);
  });

  it("is never sent by a page that did not place the order", () => {
    sendHeldPurchase("1047", { total: 120, tax: 0, shipping: 0 });
    expect(purchases()).toEqual([]);
  });
});
