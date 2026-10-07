import { describe, expect, it } from "vitest";
import { buildStudioContext, fitOn, type StudioUpload } from "@/lib/studioContext";
import { betterSize, planBuild, type BuildDesign, type StudioSize } from "@/lib/studioBuild";

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
    { uid: "u-logo", name: "logo.jpg", pxW: 1200, pxH: 1200, isImage: true, hasAlpha: false },
    { uid: "u-star", name: "star.png", pxW: 600, pxH: 600, isImage: true, hasAlpha: true },
    { uid: "u-vec", name: "art.svg", isImage: false, hasAlpha: false },
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
    const d = buildStudioContext({ ...base, uploads: [{ uid: "u-old", name: "old.png", isImage: true }], pieces: [] })!.context.designs[0]!;
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

  it("sends fits only when something is on the sheet", () => {
    expect(buildStudioContext({ ...base, pieces: [] })!.context.fits).toEqual([]);
    expect(buildStudioContext({ ...base, pieces: sq(2) })!.context.fits).toHaveLength(3);
  });
});
