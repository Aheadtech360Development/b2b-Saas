/**
 * The standard shipping rate, saved and read back, and what the checkout
 * makes of what is saved.
 */
import { describe, expect, it } from "vitest";
import { rateWords, readRate, writeRate, type Bracket, type StandardRate } from "@/lib/shippingRate";
import { minutesIntoDay, offsetWords, zoneOffsetMinutes } from "@/lib/shopClock";

const flat = (amount: number, freeOver = 0): StandardRate => ({ mode: "flat", amount, freeOver, calc: "order_value", steps: [] });

/** The guest checkout's own way with steps: the first that fits, in the order
 *  saved (backend api/v1/guest.py, guest_shipping_estimate). */
function firstThatFits(brackets: Bracket[], subtotal: number): number | null {
  for (const b of brackets) {
    const min = b.min_order_value ?? 0;
    if (subtotal >= min && (b.max_order_value == null || subtotal <= b.max_order_value)) return b.cost;
  }
  return null;
}
/** The account checkout's way: the highest step reached (services/shipping_service.py). */
function highestReached(brackets: Bracket[], subtotal: number): number | null {
  const sorted = [...brackets].sort((a, b) => (a.min_order_value ?? 0) - (b.min_order_value ?? 0)).reverse();
  for (const b of sorted) {
    if (subtotal >= (b.min_order_value ?? 0) && (b.max_order_value == null || subtotal <= b.max_order_value)) return b.cost;
  }
  return null;
}

describe("the standard shipping rate", () => {
  it("one price is saved as one price", () => {
    const saved = writeRate(flat(8.5));
    expect(saved).toMatchObject({ shipping_type: "store_default", shipping_amount: 8.5, brackets: [] });
    expect(readRate(saved)).toMatchObject({ mode: "flat", amount: 8.5, freeOver: 0 });
  });

  it("free above an amount is two steps both checkouts price the same", () => {
    const saved = writeRate(flat(8.5, 120));
    expect(saved.shipping_type).toBe("flat_rate");
    expect(saved.calc_type).toBe("order_value");
    expect(saved.brackets).toHaveLength(2);
    for (const price of [firstThatFits, highestReached]) {
      expect(price(saved.brackets, 0)).toBe(8.5);
      expect(price(saved.brackets, 119.99)).toBe(8.5);
      expect(price(saved.brackets, 120)).toBe(0);
      expect(price(saved.brackets, 5000)).toBe(0);
    }
  });

  it("the two steps read back as what the shop typed", () => {
    expect(readRate(writeRate(flat(8.5, 120)))).toMatchObject({ mode: "flat", amount: 8.5, freeOver: 120 });
    expect(rateWords(readRate(writeRate(flat(8.5, 120))))).toBe("$8.50 an order, free over $120.00");
  });

  it("free shipping needs a price to be free from", () => {
    // A price of 0 is free already; an amount of a cent or less is no rule.
    expect(writeRate(flat(0, 120)).shipping_type).toBe("store_default");
    expect(writeRate(flat(8, 0.01)).shipping_type).toBe("store_default");
    expect(rateWords(flat(0))).toBe("Free");
  });

  it("steps a shop built by hand stay steps", () => {
    const steps: Bracket[] = [
      { min_units: 0, max_units: null, min_order_value: 0, max_order_value: 49.99, cost: 9 },
      { min_units: 0, max_units: null, min_order_value: 50, max_order_value: 99.99, cost: 5 },
      { min_units: 0, max_units: null, min_order_value: 100, max_order_value: null, cost: 0 },
    ];
    const saved = { shipping_type: "flat_rate", calc_type: "order_value", brackets: steps };
    expect(readRate(saved)).toMatchObject({ mode: "steps", steps });
    // Two steps that do not end in free shipping are not the pair either.
    expect(readRate({ ...saved, brackets: [steps[0]!, steps[1]!] }).mode).toBe("steps");
    expect(readRate({ shipping_type: "flat_rate", calc_type: "units", brackets: [] })).toMatchObject({ mode: "steps", calc: "units" });
  });

  it("live rates, and what the screen does not show is kept", () => {
    expect(readRate({ shipping_type: "live_shippo" }).mode).toBe("live");
    expect(writeRate({ ...flat(0), mode: "live" }, { cutoff_time: "12PM CT" })).toMatchObject({ shipping_type: "live_shippo", cutoff_time: "12PM CT" });
    expect(readRate(null)).toMatchObject({ mode: "flat", amount: 0 });
  });
});

describe("the shop's clock", () => {
  const winter = new Date("2026-01-15T18:10:00Z");
  const summer = new Date("2026-07-15T18:10:00Z");

  it("knows a zone's offset in winter and in summer", () => {
    expect(zoneOffsetMinutes("America/Chicago", winter)).toBe(-360);
    expect(zoneOffsetMinutes("America/Chicago", summer)).toBe(-300);
    expect(zoneOffsetMinutes("America/Phoenix", summer)).toBe(-420);
    expect(offsetWords("America/Chicago", winter)).toBe("UTC−6");
  });

  it("reads the time of day on the shop's clock", () => {
    // 18:10 UTC is 12:10 in Chicago in winter and 13:10 in summer.
    expect(minutesIntoDay("America/Chicago", winter)).toBe(12 * 60 + 10);
    expect(minutesIntoDay("America/Chicago", summer)).toBe(13 * 60 + 10);
  });

  it("no zone, or one nobody knows, is not an offset", () => {
    expect(zoneOffsetMinutes(null)).toBeNull();
    expect(zoneOffsetMinutes("Mars/Olympus_Mons")).toBeNull();
  });
});
