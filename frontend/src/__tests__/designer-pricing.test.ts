import { describe, expect, it } from "vitest";
import { effectiveQuantities, quote, ratesFrom, serviceOf, sideServices, type PriceRates } from "@/lib/designer/pricing";
import type { Garment, RosterRow } from "@/lib/designer/types";

const tee: Garment = {
  id: "tee", name: "Tee", styleCode: "T1", brand: "B", silhouette: "tee",
  description: "", fabric: "", basePrice: 6, sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
  colors: [{ id: "white", name: "White", hex: "#fff" }, { id: "black", name: "Black", hex: "#000" }],
  embroidery: true,
};

const rates: PriceRates = {
  print: [{ min: 1, upload: 8, text: 8, graphics: 8 }, { min: 12, upload: 5, text: 5, graphics: 5 }, { min: 48, upload: 3, text: 3, graphics: 3 }],
  embroidery: [{ min: 12, upload: 9, text: 9, graphics: 9 }, { min: 48, upload: 6, text: 6, graphics: 6 }],
  embroideryMinimum: 12,
  sizeUpcharge: { "2XL": 2, "3XL": 3 },
  name: 4,
  number: 3,
  offered: { upload: true, text: true, graphics: true, names: true },
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

describe("a price for each kind of artwork", () => {
  // Uploaded artwork 8, text 4, graphics 6 a side; 12+ pieces: 5, 2, 3.
  const each: PriceRates = {
    ...rates,
    print: [{ min: 1, upload: 8, text: 4, graphics: 6 }, { min: 12, upload: 5, text: 2, graphics: 3 }],
  };

  it("prices each side by what is on it", () => {
    const q = quote({
      garments, rates: each, method: "print", sides: ["front"],
      sidesByLine: { "tee:white": ["front"], "tee:black": ["front"] },
      servicesByLine: { "tee:white": { front: ["text"] }, "tee:black": { front: ["graphics"] } },
      quantities: { "tee:white": { M: 1 }, "tee:black": { M: 1 } }, roster: [],
    });
    expect(q.lines.find((l) => l.colorId === "white")!.unit).toBe(6 + 4);
    expect(q.lines.find((l) => l.colorId === "black")!.unit).toBe(6 + 6);
    expect(q.decorationByLine).toEqual({ "tee:white": 4, "tee:black": 6 });
    expect(q.sidePrices).toEqual([
      { line: "tee:white", view: "front", service: "text", price: 4 },
      { line: "tee:black", view: "front", service: "graphics", price: 6 },
    ]);
  });

  it("charges a side with several kinds at the dearest, once", () => {
    const q = quote({
      garments, rates: each, method: "print", sides: ["front", "back"],
      servicesByLine: { "tee:white": { front: ["upload", "text"], back: ["text", "graphics"] } },
      quantities: { "tee:white": { M: 1 } }, roster: [],
    });
    // Front: artwork 8 (not 8 + 4). Back: graphics 6 (not 4 + 6).
    expect(q.lines[0]!.unit).toBe(6 + 8 + 6);
  });

  it("adds nothing for a side with only names and numbers on it", () => {
    const roster: RosterRow[] = [{ id: "1", name: "SMITH", number: "7", size: "M", line: "tee:white" }];
    const q = quote({
      garments, rates: each, method: "print", sides: ["front", "back"],
      servicesByLine: { "tee:white": { front: ["text"], back: ["names"] } },
      quantities: { "tee:white": { M: 1 } }, roster,
    });
    expect(q.lines[0]!.unit).toBe(6 + 4);
    expect(q.personalization).toBe(4 + 3);
    expect(q.total).toBe(10 + 7);
  });

  it("works out the next break's saving from each side's own prices", () => {
    const q = quote({
      garments, rates: each, method: "print", sides: ["front"],
      servicesByLine: { "tee:white": { front: ["text"] } },
      quantities: { "tee:white": { M: 10 } }, roster: [],
    });
    expect(q.nextBreak).toEqual({ qty: 12, savingPerPiece: 2 });
  });

  it("won't order a kind of artwork the shop switched off", () => {
    const q = quote({
      garments, rates: { ...each, offered: { ...each.offered, text: false } }, method: "print", sides: ["front"],
      servicesByLine: { "tee:white": { front: ["text"] } },
      quantities: { "tee:white": { M: 1 } }, roster: [],
    });
    expect(q.problems).toContain("Text is not offered on this shop's shirts. Remove it from your design to order.");
    expect(q.total).toBe(0);
  });

  it("won't order names and numbers when the shop switched them off", () => {
    const roster: RosterRow[] = [{ id: "1", name: "SMITH", number: "", size: "M", line: "tee:white" }];
    const q = quote({
      garments, rates: { ...each, offered: { ...each.offered, names: false } }, method: "print", sides: ["front"],
      servicesByLine: { "tee:white": { front: ["upload"] } },
      quantities: { "tee:white": { M: 1 } }, roster,
    });
    expect(q.problems).toContain("Names and numbers is not offered on this shop's shirts. Remove it from your design to order.");
  });

  it("reads which kind each object is", () => {
    expect(serviceOf({ kind: "image" })).toBe("upload");
    expect(serviceOf({ kind: "text" })).toBe("text");
    expect(serviceOf({ kind: "graphic" })).toBe("graphics");
    expect(serviceOf({ kind: "text", nn: "number" })).toBe("names");
    expect(serviceOf({ type: "Textbox" })).toBe("text");
    expect(serviceOf({ type: "Image" })).toBe("upload");
    expect(serviceOf({ type: "Path" })).toBe("graphics");
    expect(sideServices([{ kind: "text" }, { kind: "image" }, { kind: "text", nn: "name" }])).toEqual(["upload", "text", "names"]);
  });

  it("gives every kind the one price a shop saved before they had their own", () => {
    const r = ratesFrom({
      print: [{ min: 1, per_side: 7 }], embroidery: [{ min: 12, per_side: 9 }], embroidery_minimum: 12, name: 4, number: 3,
    }, { text: false });
    expect(r.print[0]).toEqual({ min: 1, upload: 7, text: 7, graphics: 7 });
    expect(r.offered).toEqual({ upload: true, text: false, graphics: true, names: true });
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

describe("the designer's artwork tools", () => {
  it("offers only what the shop switched on, and AI design only with text and graphics", async () => {
    const { offeredTools } = await import("@/stores/designer.store");
    expect(offeredTools(rates)).toEqual(["upload", "text", "graphics", "ai", "names"]);
    expect(offeredTools({ ...rates, offered: { upload: true, text: true, graphics: false, names: false } }))
      .toEqual(["upload", "text"]);
    expect(offeredTools({ ...rates, offered: { upload: false, text: false, graphics: false, names: true } }))
      .toEqual(["names"]);
  });
});
