/**
 * The whole way from a product to an order, as a shop's tools are told it.
 *
 * A shop on the website builder had "add to cart" reported for one case only:
 * a guest adding a stocked variant. A signed-in shopper, a gang sheet, an
 * uploaded design and a made-to-order product reported nothing, "checkout
 * started" was written and never called, and a sheet's line went out on the
 * purchase with an empty product id.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addedLines, cartLine, cartLines, setTrackingConfig, sheetLine,
  trackAddToCart, trackCartAdd, trackCartViewed, trackCheckoutStarted, trackConfiguredAdd,
  trackLead, trackLinesRemoved, trackPaymentChosen, trackPurchase, trackReorder, trackSearch,
  trackSheetAdd, trackSheetBuilderViewed, trackShippingChosen, trackSignUp,
} from "@/lib/tracking";

const shop = (tools: Record<string, string> = { gtm: "GTM-TEST123" }) =>
  setTrackingConfig({ enabled: true, tools, head_snippet: "", body_snippet: "", track_products: true, track_checkout: true });

const events = () => ((window.dataLayer ?? []) as Record<string, unknown>[]).filter(e => e.event);
const names = () => events().map(e => e.event);
const last = () => events().at(-1) as { event: string; ecommerce: Record<string, unknown> } & Record<string, unknown>;

/** What Meta's pixel was asked to do, in order. */
let pixel: unknown[][] = [];

const tee = { variant_id: "v1", product_id: "p1", product_name: "Tee", sku: "TEE-BLK-M", color: "Black", size: "M", quantity: 3, unit_price: "12.50" };
const sheet = { variant_id: null, product_id: null, product_name: "Gang Sheet GS-AB-2610-0005 — 22 × 24", sku: "", color: null, size: null, quantity: 2, unit_price: "15.00", item_type: "gang_sheet", gang_sheet_order_id: "o1" };
const cards = { variant_id: null, product_id: "p9", product_name: "Business Cards", sku: "-GL", color: null, size: null, quantity: 250, unit_price: "0.12", item_type: "configured", configuration: { selections: { stock: "16pt", finish: "gloss" } } };

beforeEach(() => {
  setTrackingConfig(null);
  sessionStorage.clear();
  window.dataLayer = [];
  pixel = [];
  window.fbq = (...args: unknown[]) => { pixel.push(args); };
});

describe("a cart line, as a tool is told about it", () => {
  it("a stocked variant goes by its SKU, with its colour and size", () => {
    expect(cartLine(tee)).toEqual({ id: "v1", sku: "TEE-BLK-M", name: "Tee", price: 12.5, quantity: 3, variant: "Black / M" });
  });

  it("a gang sheet is one product whatever the job's number, and its size is the variant", () => {
    expect(cartLine(sheet)).toEqual({ id: "GANG-SHEET", sku: "GANG-SHEET", name: "Gang Sheet", variant: "22 × 24", price: 15, quantity: 2 });
    // A guest's sheet is kept in the browser with no type, only its key.
    expect(cartLine({ variant_id: "gs:o1", product_id: "", product_name: "Gang Sheet GS-AB-2610-0005 — 22 × 24", unit_price: 15, quantity: 1 }).id).toBe("GANG-SHEET");
  });

  it("a design ordered by size keeps its product's name", () => {
    const line = cartLine({ ...sheet, product_name: 'DTF Transfers by Size — 2"x1.33"' });
    expect(line).toMatchObject({ id: "GANG-SHEET", name: "DTF Transfers by Size", variant: '2"x1.33"' });
  });

  it("a made-to-order line goes by its product, not by the ending its options add to the SKU", () => {
    expect(cartLine(cards)).toEqual({ id: "p9", name: "Business Cards", price: 0.12, quantity: 250 });
    // A guest's is keyed by everything chosen on it.
    expect(cartLine({ variant_id: "cfg:p9:finish=gloss,stock=16pt", product_id: "p9", product_name: "Business Cards — 16pt · Gloss", unit_price: 0.12, quantity: 250 }).id).toBe("p9");
  });

  it("a sheet job reads the same before it is in a cart as after", () => {
    expect(sheetLine({ sheet_name: "22 × 24", sheet_size_id: "s1", price_per_sheet: 15, sheet_quantity: 2 }))
      .toEqual(cartLine(sheet));
    expect(sheetLine({ sheet_name: 'DTF Transfers by Size — 2"x1.33"', sheet_size_id: null, price_per_sheet: "1.25", sheet_quantity: 40 }))
      .toEqual({ id: "GANG-SHEET", sku: "GANG-SHEET", name: "DTF Transfers by Size", variant: '2"x1.33"', price: 1.25, quantity: 40 });
  });

  it("never throws on a cart that is not what it should be", () => {
    expect(cartLines(null)).toEqual([]);
    expect(cartLines("nope" as unknown as [])).toEqual([]);
    expect(cartLines([null as unknown as typeof tee, tee])).toHaveLength(1);
  });
});

describe("add to cart, from every way into a cart", () => {
  it("variants added to an account's cart are read from the cart the server sent back, by the quantity added", () => {
    const cart = { items: [{ ...tee, quantity: 9 }, sheet] };
    expect(addedLines(cart, [{ variant_id: "v1", quantity: 2 }, { variant_id: "gone", quantity: 1 }]))
      .toEqual([{ id: "v1", sku: "TEE-BLK-M", name: "Tee", price: 12.5, quantity: 2, variant: "Black / M" }]);
    shop();
    trackCartAdd(cart, [{ variant_id: "v1", quantity: 2 }]);
    expect(last().event).toBe("add_to_cart");
    expect(last().ecommerce).toMatchObject({ value: 25, items: [{ item_id: "TEE-BLK-M", quantity: 2 }] });
  });

  it("a made-to-order product's line is the one with the same choices, and the same file", () => {
    const other = { ...cards, unit_price: "0.20", configuration: { selections: { stock: "32pt", finish: "matte" } } };
    const withFile = { ...cards, unit_price: "0.15", configuration: { selections: { finish: "gloss", stock: "16pt" }, artwork: { url: "https://x/a.png" } } };
    shop();
    trackConfiguredAdd({ items: [cards, other, withFile] }, { product_id: "p9", selections: { finish: "gloss", stock: "16pt" }, quantity: 100 });
    expect(last().ecommerce).toMatchObject({ value: 12, items: [{ item_id: "p9", item_name: "Business Cards", price: 0.12, quantity: 100 }] });
    trackConfiguredAdd({ items: [cards, other, withFile] }, { product_id: "p9", selections: { stock: "16pt", finish: "gloss" }, quantity: 100, artwork_url: "https://x/a.png" });
    expect(last().ecommerce).toMatchObject({ value: 15 });
  });

  it("sheets from the builder are reported together", () => {
    shop({ gtm: "GTM-TEST123", meta_pixel: "1234567890123456" });
    trackSheetAdd([
      { sheet_name: "22 × 24", sheet_size_id: "s1", price_per_sheet: 15, sheet_quantity: 2 },
      { sheet_name: "22 × 60", sheet_size_id: "s2", price_per_sheet: 30, sheet_quantity: 1 },
    ]);
    expect(last().ecommerce).toMatchObject({ value: 60, items: [{ item_id: "GANG-SHEET", item_variant: "22 × 24" }, { item_id: "GANG-SHEET", item_variant: "22 × 60" }] });
    expect(pixel).toEqual([["track", "AddToCart", { content_ids: ["GANG-SHEET", "GANG-SHEET"], content_type: "product", value: 60, currency: "USD" }]]);
  });

  it("an add that ends by loading another page is sent by that page, once", () => {
    shop();
    trackSheetAdd({ sheet_name: "22 × 24", sheet_size_id: "s1", price_per_sheet: 15, sheet_quantity: 2 }, { navigating: true });
    expect(names()).toEqual([]);

    // The next page: its own copy of everything, and the settings read again.
    window.dataLayer = [];
    setTrackingConfig(null);
    shop();
    expect(names()).toEqual(["add_to_cart"]);
    expect(last().ecommerce).toMatchObject({ value: 30 });

    // And the page after that has nothing left to send.
    window.dataLayer = [];
    setTrackingConfig(null);
    shop();
    expect(names()).toEqual([]);
  });

  it("a reorder reports the lines that went back in, not the one that was out of stock", () => {
    shop();
    trackReorder([tee, { ...tee, variant_id: "v2", sku: "TEE-BLK-L", size: "L" }], [{ sku: "TEE-BLK-L" }]);
    expect(last().ecommerce).toMatchObject({ items: [{ item_id: "TEE-BLK-L" }] });
    trackReorder([tee], "not a list");
    expect(names()).toEqual(["add_to_cart"]);
  });

  it("nothing is reported for an add of nothing", () => {
    shop();
    trackAddToCart([]);
    trackCartAdd(null, [{ variant_id: "v1", quantity: 1 }]);
    expect(names()).toEqual([]);
  });
});

describe("the cart", () => {
  it("is reported when it is opened with something in it, and when a line is taken out", () => {
    shop();
    trackCartViewed([tee, sheet]);
    trackLinesRemoved([{ ...tee, quantity: 1 }]);
    expect(names()).toEqual(["view_cart", "remove_from_cart"]);
    expect(events()[0]!.ecommerce).toMatchObject({ value: 67.5 });
    expect(events()[1]!.ecommerce).toMatchObject({ value: 12.5, items: [{ item_id: "TEE-BLK-M", quantity: 1 }] });
  });

  it("an empty cart is not a cart view", () => {
    shop();
    trackCartViewed([]);
    expect(names()).toEqual([]);
  });
});

describe("the checkout", () => {
  it("is started once for a cart, however often its first step is drawn", () => {
    shop({ gtm: "GTM-TEST123", meta_pixel: "1234567890123456" });
    trackCheckoutStarted([tee, sheet]);
    trackCheckoutStarted([tee, sheet]);
    expect(names()).toEqual(["begin_checkout"]);
    expect(last().ecommerce).toMatchObject({ value: 67.5 });
    expect(pixel).toEqual([["track", "InitiateCheckout", { content_ids: ["TEE-BLK-M", "GANG-SHEET"], value: 67.5, currency: "USD", num_items: 2 }]]);

    // A different cart is a different checkout.
    trackCheckoutStarted([tee]);
    expect(names()).toEqual(["begin_checkout", "begin_checkout"]);
  });

  it("then delivery, then payment, each for the lines it started with and each once", () => {
    shop({ gtm: "GTM-TEST123", meta_pixel: "1234567890123456" });
    trackCheckoutStarted([tee]);
    trackShippingChosen("standard");
    trackShippingChosen("standard");
    trackPaymentChosen("card");
    trackPaymentChosen("card");
    expect(names()).toEqual(["begin_checkout", "add_shipping_info", "add_payment_info"]);
    expect(events()[1]!.ecommerce).toMatchObject({ shipping_tier: "standard", value: 37.5, items: [{ item_id: "TEE-BLK-M", quantity: 3 }] });
    expect(events()[2]!.ecommerce).toMatchObject({ payment_type: "card", value: 37.5 });
    expect(pixel.map(c => c[1])).toEqual(["InitiateCheckout", "AddPaymentInfo"]);
  });

  it("is remembered across a reload of the page that pays", () => {
    shop();
    trackCheckoutStarted([tee]);
    // The page is loaded afresh: nothing is left in memory, only in the tab.
    const kept = sessionStorage.getItem("pc_track_checkout");
    trackPurchase("1", 1, []);                       // forgets the checkout…
    sessionStorage.setItem("pc_track_checkout", kept!);   // …as a reload would not
    window.dataLayer = [];
    trackPaymentChosen("cod");
    expect(names()).toEqual(["add_payment_info"]);
    expect(last().ecommerce).toMatchObject({ payment_type: "cod", items: [{ item_id: "TEE-BLK-M" }] });
  });

  it("ends in a purchase that says what the total is made of, and names a sheet", () => {
    shop();
    trackPurchase("1044", 68.43, cartLines([tee, sheet]), { tax: 2.48, shipping: 8.95, coupon: "SAVE10" });
    expect(last()).toEqual({
      event: "purchase",
      ecommerce: {
        transaction_id: "1044", currency: "USD", value: 68.43, tax: 2.48, shipping: 8.95, coupon: "SAVE10",
        items: [
          { item_id: "TEE-BLK-M", item_name: "Tee", price: 12.5, quantity: 3, item_variant: "Black / M" },
          { item_id: "GANG-SHEET", item_name: "Gang Sheet", price: 15, quantity: 2, item_variant: "22 × 24" },
        ],
      },
    });
  });

  it("the next order is a new checkout, even for the same lines", () => {
    shop();
    trackCheckoutStarted([tee]);
    trackPurchase("1044", 37.5, cartLines([tee]));
    trackCheckoutStarted([tee]);
    expect(names()).toEqual(["begin_checkout", "purchase", "begin_checkout"]);
  });

  it("says nothing when the shop has switched checkout tracking off", () => {
    setTrackingConfig({ enabled: true, tools: { gtm: "GTM-TEST123" }, head_snippet: "", body_snippet: "", track_products: true, track_checkout: false });
    trackCheckoutStarted([tee]);
    trackShippingChosen("standard");
    trackPaymentChosen("card");
    expect(names()).toEqual([]);
  });
});

describe("beside the shopping", () => {
  it("a search, a new account and an enquiry are each reported", () => {
    shop({ gtm: "GTM-TEST123", meta_pixel: "1234567890123456" });
    trackSearch("  dtf transfers ");
    trackSignUp();
    trackLead("Quote request");
    expect(events()).toEqual([
      { event: "search", search_term: "dtf transfers" },
      { event: "sign_up", method: "email" },
      { event: "generate_lead", lead_source: "Quote request" },
    ]);
    expect(pixel).toEqual([
      ["track", "Search", { search_string: "dtf transfers" }],
      ["track", "CompleteRegistration"],
      ["track", "Lead", { content_name: "Quote request" }],
    ]);
  });

  it("an empty search is not a search", () => {
    shop();
    trackSearch("   ");
    expect(names()).toEqual([]);
  });

  it("the sheet builder, opened, is a product view priced from its cheapest sheet", () => {
    shop();
    trackSheetBuilderViewed([{ price_per_sheet: 30 }, { price_per_sheet: 15 }, { price_per_sheet: 0, price_per_inch: 0.5, min_length_in: 12 }]);
    expect(last()).toMatchObject({ event: "view_item", ecommerce: { value: 6, items: [{ item_id: "GANG-SHEET", item_name: "Gang Sheet", price: 6 }] } });
  });
});

describe("every screen that puts something in a cart", () => {
  // The fault this guards against is quiet: a new "add to cart" button works,
  // the cart fills, and no tool is ever told. It is how seven of them came to
  // report nothing.
  const src = join(process.cwd(), "src");
  const adds = /cartService\.(addMatrix|addGangSheet)\(|\/api\/v1\/cart\/add-configured|addToGuestCart\(/;
  const reports = /track(AddToCart|CartAdd|SheetAdd|LineAdd|ConfiguredAdd)\(/;
  // Not screens: the cart's own plumbing, and moving a guest's cart into an
  // account (those lines were reported when the guest added them).
  const plumbing = ["lib/guestCart.ts", "services/cart.service.ts", "lib/tracking.ts"];

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : files(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("also reports it", () => {
    const silent = files(src)
      .filter(path => !plumbing.some(p => path.replace(/\\/g, "/").endsWith(p)))
      .filter(path => { const code = readFileSync(path, "utf8"); return adds.test(code) && !reports.test(code); })
      .map(path => path.replace(/\\/g, "/").split("/src/")[1]);
    expect(silent).toEqual([]);
  });
});
