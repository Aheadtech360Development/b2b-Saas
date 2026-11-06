import { describe, expect, it } from "vitest";
import { effectiveQuantities, quote, type PriceRates } from "@/lib/designer/pricing";
import type { Garment, RosterRow } from "@/lib/designer/types";

const tee: Garment = {
  id: "tee", name: "Tee", styleCode: "T1", brand: "B", silhouette: "tee",
  description: "", fabric: "", basePrice: 6, sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
  colors: [{ id: "white", name: "White", hex: "#fff" }, { id: "black", name: "Black", hex: "#000" }],
  embroidery: true,
};

const rates: PriceRates = {
  print: [{ min: 1, perSide: 8 }, { min: 12, perSide: 5 }, { min: 48, perSide: 3 }],
  embroidery: [{ min: 12, perSide: 9 }, { min: 48, perSide: 6 }],
  embroideryMinimum: 12,
  sizeUpcharge: { "2XL": 2, "3XL": 3 },
  name: 4,
  number: 3,
};

const garments = { tee };

describe("quote", () => {
  it("prices one printed side at the single-piece rate", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front"],
      quantities: { "tee:white": { M: 1 } }, roster: [],
    });
    expect(q.totalQty).toBe(1);
    expect(q.total).toBe(14);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]!.unit).toBe(14);
  });

  it("uses the tier reached by every piece in the order, across colours", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front", "back"],
      quantities: { "tee:white": { M: 6 }, "tee:black": { L: 6 } }, roster: [],
    });
    expect(q.totalQty).toBe(12);
    // 6 garment + 2 sides × 5
    expect(q.lines.every((l) => l.unit === 16)).toBe(true);
    expect(q.total).toBe(192);
  });

  it("adds the size upcharge to large sizes only", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front"],
      quantities: { "tee:white": { M: 1, "2XL": 1 } }, roster: [],
    });
    const big = q.lines.find((l) => l.size === "2XL")!;
    const med = q.lines.find((l) => l.size === "M")!;
    expect(big.unit - med.unit).toBe(2);
  });

  it("says how much the next break saves", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front"],
      quantities: { "tee:white": { M: 10 } }, roster: [],
    });
    expect(q.nextBreak).toEqual({ qty: 12, savingPerPiece: 3 });
  });

  it("has no next break past the last tier", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front"],
      quantities: { "tee:white": { M: 60 } }, roster: [],
    });
    expect(q.nextBreak).toBeNull();
  });

  it("charges names and numbers per roster row that has them", () => {
    const roster: RosterRow[] = [
      { id: "1", name: "SMITH", number: "7", size: "M", line: "tee:white" },
      { id: "2", name: "", number: "9", size: "M", line: "tee:white" },
    ];
    const q = quote({
      garments, rates, method: "print", sides: ["back"],
      quantities: { "tee:white": { M: 2 } }, roster,
    });
    expect(q.personalization).toBe(4 + 3 + 3);
    expect(q.total).toBe(2 * 14 + 10);
  });

  it("flags embroidery under its minimum", () => {
    const q = quote({
      garments, rates, method: "embroidery", sides: ["front"],
      quantities: { "tee:white": { M: 5 } }, roster: [],
    });
    expect(q.problems).toContain("Embroidery starts at 12 pieces. Add 7 more to order.");
    expect(q.lines[0]!.unit).toBe(6 + 9);
  });

  it("asks for a design and for quantities when either is missing", () => {
    const q = quote({ garments, rates, method: "print", sides: [], quantities: {}, roster: [] });
    expect(q.problems).toEqual([
      "Add artwork to at least one side.",
      "Add at least one size and quantity.",
    ]);
    expect(q.total).toBe(0);
  });

  it("prices each shirt by its own printed sides", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front", "back"],
      sidesByLine: { "tee:white": ["front"], "tee:black": ["front", "back"] },
      quantities: { "tee:white": { M: 6 }, "tee:black": { M: 6 } }, roster: [],
    });
    // 12 pieces reach the 12+ tier (5 a side): white 6 + 5, black 6 + 10.
    expect(q.lines.find((l) => l.colorId === "white")!.unit).toBe(11);
    expect(q.lines.find((l) => l.colorId === "black")!.unit).toBe(16);
    expect(q.total).toBe(6 * 11 + 6 * 16);
  });

  it("asks for artwork on a shirt being ordered that has none", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front"],
      sidesByLine: { "tee:white": ["front"], "tee:black": [] },
      quantities: { "tee:white": { M: 2 }, "tee:black": { M: 2 } }, roster: [],
    });
    expect(q.problems).toContain("Add artwork to the Tee in Black, or remove its sizes.");
    expect(q.total).toBe(0);
  });

  it("lists sizes in the garment's own order", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front"],
      quantities: { "tee:white": { "2XL": 1, S: 1, L: 2 } }, roster: [],
    });
    expect(q.lines.map((l) => l.size)).toEqual(["S", "L", "2XL"]);
  });

  it("ignores lines for products that are no longer in the design", () => {
    const q = quote({
      garments, rates, method: "print", sides: ["front"],
      quantities: { "gone:white": { M: 4 }, "tee:white": { M: 1 } }, roster: [],
    });
    expect(q.totalQty).toBe(1);
  });
});

describe("effectiveQuantities", () => {
  it("raises a size to the number of roster shirts in it", () => {
    const roster: RosterRow[] = [
      { id: "1", name: "A", number: "", size: "L", line: "tee:white" },
      { id: "2", name: "B", number: "", size: "L", line: "tee:white" },
    ];
    const q = effectiveQuantities({ "tee:white": { L: 1, M: 3 } }, roster);
    expect(q["tee:white"]).toEqual({ L: 2, M: 3 });
  });
});
