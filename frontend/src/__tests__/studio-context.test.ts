import { describe, expect, it } from "vitest";
import { buildStudioContext, fitOn, type StudioUpload } from "@/lib/studioContext";
import { betterSize, capacity, fillCount, planBuild, shrinkToFit, type BuildDesign, type StudioSize } from "@/lib/studioBuild";

const fixed = (over: Partial<StudioSize> = {}): StudioSize => ({
  id: "a", name: "22x10", width_in: 22, height_in: 10, price_per_sheet: 10, bleed_in: 0.25,
  pricing_mode: "fixed", price_per_inch: 0, min_length_in: 0, max_length_in: 0, ...over,
});
const big = () => fixed({ id: "b", name: "22x24", height_in: 24, price_per_sheet: 22 });
const roll = (): StudioSize => fixed({
  id: "r", name: "Roll 22", height_in: 0, price_per_sheet: 0, pricing_mode: "custom_length",
  price_per_inch: 0.5, min_length_in: 12, max_length_in: 240,
});
const sq = (n: number, w = 4, h = 4) => Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, w_in: w, h_in: h }));
const design = (key: string, w: number, h: number, copies: number): BuildDesign => ({ key, w, h, copies });

describe("planBuild", () => {
  it("puts a few copies on one fixed sheet at its price", () => {
    const p = planBuild(fixed(), [design("logo", 4, 4, 8)], 0, 0.5);
    expect(p.sheets).toHaveLength(1);
    expect(p.sheets[0]!.pieces).toHaveLength(8);
    expect(p.price).toBe(10);
    expect(p.tooBig).toEqual([]);
  });

  it("spills onto more sheets, priced per sheet, keeping every copy", () => {
    const p = planBuild(fixed(), [design("logo", 8, 8, 20)], 0, 0.5);
    expect(p.sheets.length).toBeGreaterThan(1);
    expect(p.sheets.flatMap((s) => s.pieces)).toHaveLength(20);
    expect(p.price).toBe(10 * p.sheets.length);
  });

  it("keeps every copy apart by the gap and inside the edge", () => {
    const p = planBuild(fixed(), [design("a", 3, 2, 12)], 0, 0.5);
    const boxes = p.sheets[0]!.pieces.map((q) => ({ x: q.x, y: q.y, w: q.rotated ? q.h : q.w, h: q.rotated ? q.w : q.h }));
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0.25 - 1e-9);
      expect(b.y).toBeGreaterThanOrEqual(0.25 - 1e-9);
      expect(b.x + b.w).toBeLessThanOrEqual(22 - 0.25 + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(10 - 0.25 + 1e-9);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      const apart = a.x + a.w + 0.5 <= b.x + 1e-6 || b.x + b.w + 0.5 <= a.x + 1e-6
        || a.y + a.h + 0.5 <= b.y + 1e-6 || b.y + b.h + 0.5 <= a.y + 1e-6;
      expect(apart).toBe(true);
    }
  });

  it("names a design too big for the sheet instead of placing it", () => {
    const p = planBuild(fixed(), [design("banner", 30, 12, 1), design("logo", 4, 4, 2)], 0, 0.5);
    expect(p.tooBig).toEqual(["banner"]);
  });

  it("cuts a roll to what its designs use and prices it by the inch", () => {
    const p = planBuild(roll(), [design("a", 10, 20, 2)], 0, 0.5);
    expect(p.sheets).toHaveLength(1);
    expect(p.sheets[0]!.length).toBeGreaterThanOrEqual(20);
    expect(p.sheets[0]!.length).toBeLessThan(30);
    expect(p.price).toBe(p.sheets[0]!.length * 0.5);
  });

  it("never cuts a roll shorter than it is sold", () => {
    expect(planBuild(roll(), [design("tiny", 2, 2, 1)], 0, 0.5).sheets[0]!.length).toBe(12);
  });

  it("leaves nothing to place when nothing is asked for", () => {
    const p = planBuild(fixed(), [design("a", 4, 4, 0)], 0, 0.5);
    expect(p.sheets).toEqual([]);
    expect(p.copies).toBe(0);
  });
});

describe("betterSize", () => {
  it("offers one bigger sheet when the chosen one spills over", () => {
    const designs = [design("logo", 8, 8, 4)];
    const p = planBuild(fixed(), designs, 0, 0.5);
    expect(p.sheets.length).toBeGreaterThan(1);
    const alt = betterSize([fixed(), big()], p, designs, 0, 0.5);
    expect(alt?.size.name).toBe("22x24");
    expect(alt?.sheets).toHaveLength(1);
  });

  it("offers nothing when the chosen sheet already holds it all and nothing is cheaper", () => {
    const designs = [design("logo", 4, 4, 2)];
    const p = planBuild(fixed(), designs, 0, 0.5);
    expect(betterSize([fixed(), big()], p, designs, 0, 0.5)).toBeNull();
  });

  it("offers a cheaper sheet that also holds it all", () => {
    const designs = [design("logo", 4, 4, 2)];
    const p = planBuild(big(), designs, 0, 0.5);
    expect(betterSize([fixed(), big()], p, designs, 0, 0.5)?.size.name).toBe("22x10");
  });
});

describe("layouts", () => {
  it("for cutting, lays rows a cut can run straight across", () => {
    const p = planBuild(fixed({ height_in: 24 }), [design("a", 3, 2, 5), design("b", 2, 4, 5)], 0, 0.5, "cutting");
    const pieces = p.sheets[0]!.pieces.map((q) => ({ y: q.y, bottom: q.y + (q.rotated ? q.w : q.h) }));
    const rows = [...new Set(pieces.map((q) => q.y))].sort((a, b) => a - b);
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i++) {
      const above = Math.max(...pieces.filter((q) => q.y === rows[i - 1]).map((q) => q.bottom));
      expect(rows[i]!).toBeGreaterThanOrEqual(above);
    }
  });
});

describe("shrinkToFit", () => {
  it("finds the largest size at which an overflow goes on one sheet", () => {
    const designs = [design("a", 8, 8, 4)];
    expect(planBuild(fixed(), designs, 0, 0.5).sheets).toHaveLength(2);
    const s = shrinkToFit(fixed(), designs, 0, 0.5)!;
    expect(s.plan.sheets).toHaveLength(1);
    expect(s.plan.price).toBe(10);
    const bigger = planBuild(fixed(), designs.map((d) => ({ ...d, w: d.w * (s.scale + 0.01), h: d.h * (s.scale + 0.01) })), 0, 0.5);
    expect(bigger.sheets.length).toBeGreaterThan(1);
  });

  it("has nothing to offer when it already fits, or would need shrinking past a quarter", () => {
    expect(shrinkToFit(fixed(), [design("a", 4, 4, 2)], 0, 0.5)).toBeNull();
    expect(shrinkToFit(fixed(), [design("a", 4, 4, 500)], 0, 0.5)).toBeNull();
  });
});

describe("capacity", () => {
  it("counts a grid of copies, smaller fitting more and bigger fewer", () => {
    // 22x10 with a 0.25 edge and 0.5 gap: 21.5 x 9.5 to print in.
    expect(capacity(fixed(), 3, 3, 0, 0.5)).toBe(6 * 2);
    expect(capacity(fixed(), 2, 2, 0, 0.5)).toBe(8 * 4);
    expect(capacity(fixed(), 4, 4, 0, 0.5)).toBe(4 * 2);
    expect(capacity(fixed(), 10, 10, 0, 0.5)).toBe(0);
  });

  it("turns a design on its side when that fits more", () => {
    // 2 wide x 9 tall: upright 8 across x 1 down; on its side 2 across x 4 down.
    expect(capacity(fixed(), 2, 9, 0, 0.5)).toBe(8);
    expect(capacity(fixed(), 9, 2, 0, 0.5)).toBe(8);
  });

  it("measures a roll at the length given", () => {
    expect(capacity(roll(), 4, 4, 0, 0.5, 10)).toBe(capacity(fixed(), 4, 4, 0, 0.5));
  });
});

describe("fillCount", () => {
  it("fills an empty sheet with as many as really fit, and one more would not", () => {
    const n = fillCount(fixed(), [], { key: "a", w: 3, h: 3 }, 0, 0.5);
    expect(n).toBe(12);
    expect(planBuild(fixed(), [design("a", 3, 3, n)], 0, 0.5).sheets).toHaveLength(1);
    expect(planBuild(fixed(), [design("a", 3, 3, n + 1)], 0, 0.5).sheets).toHaveLength(2);
  });

  it("leaves room for what else is on the sheet", () => {
    const others = [design("b", 8, 8, 1)];
    const n = fillCount(fixed(), others, { key: "a", w: 3, h: 3 }, 0, 0.5);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(12);
    expect(planBuild(fixed(), [...others, design("a", 3, 3, n)], 0, 0.5).sheets).toHaveLength(1);
    expect(planBuild(fixed(), [...others, design("a", 3, 3, n + 1)], 0, 0.5).sheets).toHaveLength(2);
  });

  it("is nothing when the design is too big for the sheet", () => {
    expect(fillCount(fixed(), [], { key: "a", w: 30, h: 3 }, 0, 0.5)).toBe(0);
  });

  it("fills a roll to the length it is cut at", () => {
    expect(fillCount(roll(), [], { key: "a", w: 3, h: 3 }, 0, 0.5, 10)).toBe(12);
  });
});

describe("fitOn", () => {
  it("says a few small designs fit one fixed sheet at its price", () => {
    const f = fitOn(fixed(), sq(2), 0.25, 0.5);
    expect(f.fits_all).toBe(true);
    expect(f.sheets_needed).toBe(1);
    expect(f.price).toBe(10);
  });

  it("says too many designs need a second sheet, and charges for it", () => {
    const f = fitOn(fixed(), sq(20, 8, 8), 0.25, 0.5);
    expect(f.fits_all).toBe(false);
    expect(f.sheets_needed).toBeGreaterThan(1);
    expect(f.price).toBe(10 * f.sheets_needed!);
  });

  it("reports a design wider than the sheet", () => {
    const f = fitOn(fixed(), sq(1, 30, 3), 0.25, 0.5);
    expect(f.fits_all).toBe(false);
    expect(f.too_wide).toBe(1);
  });

  it("measures a roll and never asks for less than its minimum", () => {
    expect(fitOn(roll(), sq(1, 2, 2), 0.25, 0.5).length_in).toBe(12);
  });
});

describe("buildStudioContext", () => {
  const uploads: StudioUpload[] = [
    { uid: "u-logo", name: "logo.jpg", pxW: 1200, pxH: 1200, isImage: true, hasAlpha: false, w_in: 4, h_in: 4 },
    { uid: "u-star", name: "star.png", pxW: 600, pxH: 600, isImage: true, hasAlpha: true, w_in: 2, h_in: 2 },
    { uid: "u-vec", name: "art.svg", isImage: false, hasAlpha: false, w_in: 4, h_in: 4 },
  ];
  const base = {
    sizes: [fixed(), big(), roll()], current: fixed(), currentLength: 10, edge: 0, gap: 0.5,
    copiesOrdered: 1, priceNow: 10, uploads,
    warnings: { low_dpi: 0, outside_safe_area: 0, overlapping: 0, very_small: 0 },
  };

  it("has nothing to say without a sheet", () => {
    expect(buildStudioContext({ ...base, current: undefined, pieces: [] })).toBeNull();
  });

  it("names every upload d1, d2… and maps the names back", () => {
    const out = buildStudioContext({ ...base, pieces: [] })!;
    expect(out.context.designs.map((d) => d.ref)).toEqual(["d1", "d2", "d3"]);
    expect(out.refs).toEqual({ d1: "u-logo", d2: "u-star", d3: "u-vec" });
  });

  it("flags a picture with no transparency, and not a vector", () => {
    const d = buildStudioContext({ ...base, pieces: [] })!.context.designs;
    expect(d.map((x) => x.has_background)).toEqual([true, false, undefined]);
  });

  it("says nothing about a background nobody has looked for", () => {
    const d = buildStudioContext({ ...base, uploads: [{ uid: "u-old", name: "old.png", isImage: true, w_in: 3, h_in: 3 }], pieces: [] })!.context.designs[0]!;
    expect(d.picture).toBe(true);
    expect(d.has_background).toBeUndefined();
  });

  it("counts copies by size and gives the dpi they print at", () => {
    const pieces = [
      { uid: "u-logo", w_in: 4, h_in: 4 }, { uid: "u-logo", w_in: 4, h_in: 4 }, { uid: "u-logo", w_in: 8, h_in: 8 },
    ];
    const d = buildStudioContext({ ...base, pieces })!.context.designs[0]!;
    expect(d.on_sheet).toEqual([
      { width_in: 4, height_in: 4, copies: 2, dpi: 300 },
      { width_in: 8, height_in: 8, copies: 1, dpi: 150 },
    ]);
  });

  it("lists every size the shop sells, rolls by the inch, and marks the open one", () => {
    const s = buildStudioContext({ ...base, pieces: [] })!.context.sizes;
    expect(s.map((x) => [x.name, x.current, x.is_roll])).toEqual([["22x10", true, false], ["22x24", false, false], ["Roll 22", false, true]]);
    expect(s[2]).toMatchObject({ price_per_inch: 0.5, min_length_in: 12, max_length_in: 240 });
  });

  it("tells each design how many copies fit at the widths people ask for", () => {
    const d = buildStudioContext({ ...base, pieces: [] })!.context.designs[0]!;
    expect(d.size_now).toEqual({ width_in: 4, height_in: 4, dpi: 300 });
    const at = (w: number) => d.copies_that_fit!.find((r) => r.width_in === w);
    expect(at(2)).toEqual({ width_in: 2, height_in: 2, copies: 32, dpi: 600 });
    expect(at(4)).toEqual({ width_in: 4, height_in: 4, copies: 8, dpi: 300 });
    // The first width that no longer fits is shown with 0; past it, nothing.
    expect(d.copies_that_fit!.at(-1)!.copies).toBe(0);
    expect(d.copies_that_fit!.filter((r) => r.copies === 0)).toHaveLength(1);
  });

  it("names the shop's designs s1… and the gallery g1…, and maps them back", () => {
    const out = buildStudioContext({
      ...base, pieces: [],
      shopDesigns: [{ key: "L1", name: "Skull", category: "Halloween" }, { key: "L2", name: "Rose" }],
      gallery: [{ key: "https://x/old.png", name: "old.png" }],
    })!;
    expect(out.context.shop_designs).toEqual([{ ref: "s1", name: "Skull", category: "Halloween" }, { ref: "s2", name: "Rose" }]);
    expect(out.context.gallery).toEqual([{ ref: "g1", name: "old.png" }]);
    expect(out.refs).toMatchObject({ s1: "shop:L1", s2: "shop:L2", g1: "gallery:https://x/old.png" });
  });

  it("sends no pixel sizes, only the dpi they come to", () => {
    const d = buildStudioContext({ ...base, pieces: [] })!.context.designs[0]! as Record<string, unknown>;
    expect(d).not.toHaveProperty("px_w");
    expect(d).not.toHaveProperty("px_h");
  });

  it("sends fits only when something is on the sheet", () => {
    expect(buildStudioContext({ ...base, pieces: [] })!.context.fits).toEqual([]);
    expect(buildStudioContext({ ...base, pieces: sq(2) })!.context.fits).toHaveLength(3);
  });
});
