import { describe, expect, it } from "vitest";
import { buildStudioContext, fitOn, type StudioPiece, type StudioSize } from "@/lib/studioContext";

const fixed = (over: Partial<StudioSize> = {}): StudioSize => ({
  id: "a", name: "22x10", width_in: 22, height_in: 10, price_per_sheet: 10, bleed_in: 0.25,
  pricing_mode: "fixed", price_per_inch: 0, min_length_in: 0, max_length_in: 0, ...over,
});
const roll = (): StudioSize => fixed({
  id: "r", name: "Roll 22", height_in: 0, price_per_sheet: 0, pricing_mode: "custom_length",
  price_per_inch: 0.5, min_length_in: 12, max_length_in: 240,
});
const piece = (name: string, w: number, h: number, over: Partial<StudioPiece> = {}): StudioPiece => ({
  name, w_in: w, h_in: h, isImage: true, hasAlpha: true, pxW: Math.round(w * 300), pxH: Math.round(h * 300), ...over,
});

describe("fitOn", () => {
  it("says a few small designs fit one fixed sheet at its price", () => {
    const f = fitOn(fixed(), [piece("a", 4, 4), piece("b", 4, 4)], 0.25, 0.5);
    expect(f.fits_all).toBe(true);
    expect(f.sheets_needed).toBe(1);
    expect(f.price).toBe(10);
  });

  it("says too many designs need a second sheet, and charges for it", () => {
    const many = Array.from({ length: 20 }, (_, i) => piece(`d${i}`, 8, 8));
    const f = fitOn(fixed(), many, 0.25, 0.5);
    expect(f.fits_all).toBe(false);
    expect(f.sheets_needed).toBeGreaterThan(1);
    expect(f.price).toBe(10 * f.sheets_needed!);
  });

  it("reports a design wider than the sheet as one nothing can hold", () => {
    const f = fitOn(fixed(), [piece("wide", 30, 3)], 0.25, 0.5);
    expect(f.fits_all).toBe(false);
    expect(f.too_wide).toBe(1);
  });

  it("measures the length a roll needs and prices it by the inch", () => {
    const f = fitOn(roll(), [piece("a", 10, 20), piece("b", 10, 20)], 0.25, 0.5);
    expect(f.fits_all).toBe(true);
    expect(f.is_roll).toBe(true);
    expect(f.length_in).toBeGreaterThanOrEqual(20);
    expect(f.length_in).toBeLessThan(30);
    expect(f.price).toBe(f.length_in! * 0.5);
  });

  it("never asks for less than the roll's minimum", () => {
    const f = fitOn(roll(), [piece("tiny", 2, 2)], 0.25, 0.5);
    expect(f.length_in).toBe(12);
  });
});

describe("buildStudioContext", () => {
  const base = {
    sizes: [fixed(), fixed({ id: "b", name: "22x24", height_in: 24, price_per_sheet: 22 })],
    current: fixed(), currentLength: 10, edge: 0.25, gap: 0.5, copiesOrdered: 1, priceNow: 10,
    warnings: { low_dpi: 0, outside_safe_area: 0, overlapping: 0, very_small: 0 },
  };

  it("has nothing to say without a sheet", () => {
    expect(buildStudioContext({ ...base, current: undefined, pieces: [] })).toBeNull();
  });

  it("folds copies into one design and flags a picture with no transparency", () => {
    const ctx = buildStudioContext({
      ...base,
      pieces: [piece("logo.png", 3, 3, { hasAlpha: false }), piece("logo.png", 3, 3, { hasAlpha: false }), piece("star.png", 2, 2)],
    })!;
    expect(ctx.designs).toHaveLength(2);
    expect(ctx.designs[0]).toMatchObject({ name: "logo.png", copies: 2, has_background: true });
    expect(ctx.designs[1]).toMatchObject({ name: "star.png", copies: 1, has_background: false });
  });

  it("reports the dpi each design will print at", () => {
    const ctx = buildStudioContext({ ...base, pieces: [piece("soft.png", 6, 6, { pxW: 600, pxH: 600 })] })!;
    expect(ctx.designs[0]!.dpi).toBe(100);
  });

  it("marks which size is the one open now, and gives every size a row", () => {
    const ctx = buildStudioContext({ ...base, pieces: [piece("a", 4, 4)] })!;
    expect(ctx.fits.map((f) => f.size_name)).toEqual(["22x10", "22x24"]);
    expect(ctx.fits.map((f) => f.current)).toEqual([true, false]);
  });

  it("sends no fits for an empty sheet", () => {
    expect(buildStudioContext({ ...base, pieces: [] })!.fits).toEqual([]);
  });
});
