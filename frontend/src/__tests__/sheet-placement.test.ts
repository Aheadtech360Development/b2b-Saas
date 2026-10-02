/**
 * Where designs land on a gang sheet, over the cases a real job hits.
 *
 * The bug these exist for: a full sheet used to answer every further design
 * with the top-left corner, so twenty uploads became one pile. Every case here
 * asserts the same two things afterwards — nothing overlaps, and everything is
 * on the sheet — because those are what a buyer actually sees.
 */
import { describe, expect, it } from "vitest";
import { freeSpotOn, spotFor, type Box, type Sheet } from "@/lib/sheetPlacement";

const roll: Sheet = {
  width: 22, length: 24, bleed: 0.25, gap: 0.25, canGrow: true, maxLength: 1200,
};

/** Place a run of designs the way the studio does, one after another. */
function run(sheet: Sheet, designs: [number, number][]) {
  const taken: Box[] = [];
  const refused: [number, number][] = [];
  let len = sheet.length;
  for (const [w, h] of designs) {
    const spot = spotFor({ ...sheet, length: len }, w, h, taken);
    if (!spot) { refused.push([w, h]); continue; }
    len = Math.max(len, spot.len);
    taken.push({ x: spot.x, y: spot.y, w, h });
  }
  return { taken, len, refused };
}

function overlapping(boxes: Box[], gap: number): Box[] | null {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      const apart =
        a.x + a.w + gap <= b.x + 1e-9 || b.x + b.w + gap <= a.x + 1e-9 ||
        a.y + a.h + gap <= b.y + 1e-9 || b.y + b.h + gap <= a.y + 1e-9;
      if (!apart) return [a, b];
    }
  }
  return null;
}

function offSheet(boxes: Box[], sheet: Sheet, len: number): Box | null {
  return boxes.find((b) =>
    b.x < sheet.bleed - 1e-9 || b.x + b.w > sheet.width - sheet.bleed + 1e-9 ||
    b.y < sheet.bleed - 1e-9 || b.y + b.h > len - sheet.bleed + 1e-9) ?? null;
}

function sound(sheet: Sheet, r: ReturnType<typeof run>) {
  expect(overlapping(r.taken, sheet.gap)).toBeNull();
  expect(offSheet(r.taken, sheet, r.len)).toBeNull();
}

describe("a job that outgrows its sheet", () => {
  it("places 300 stickers without stacking them", () => {
    const r = run(roll, Array.from({ length: 300 }, () => [2, 2] as [number, number]));
    expect(r.refused).toHaveLength(0);
    expect(r.len).toBeGreaterThan(24);
    sound(roll, r);
  });

  it("handles the sizes a real order arrives in", () => {
    const sizes: [number, number][] = [[3, 3], [10, 4], [5.5, 7], [1.5, 1.5], [21, 2]];
    const r = run(roll, Array.from({ length: 60 }, (_, i) => sizes[i % sizes.length]!));
    expect(r.refused).toHaveLength(0);
    sound(roll, r);
  });

  it("stacks full-width designs down the roll", () => {
    const r = run(roll, [[21.5, 6], [21.5, 6], [21.5, 6]]);
    expect(r.refused).toHaveLength(0);
    sound(roll, r);
  });

  it("grows only as far as the roll is sold", () => {
    const capped = { ...roll, maxLength: 40 };
    const r = run(capped, Array.from({ length: 60 }, () => [10, 8] as [number, number]));
    expect(r.len).toBeLessThanOrEqual(40);
    expect(r.refused.length).toBeGreaterThan(0);
    sound(capped, r);
  });
});

describe("margins", () => {
  it("places everything with no margin at all", () => {
    const tight = { ...roll, gap: 0 };
    const r = run(tight, Array.from({ length: 40 }, () => [4, 4] as [number, number]));
    expect(r.refused).toHaveLength(0);
    sound(tight, r);
  });

  it("keeps a wide margin between designs", () => {
    const loose = { ...roll, gap: 2 };
    const r = run(loose, Array.from({ length: 20 }, () => [4, 4] as [number, number]));
    expect(overlapping(r.taken, 2)).toBeNull();
  });
});

describe("what it refuses", () => {
  it("will not place a design wider than the roll", () => {
    expect(spotFor(roll, 30, 4, [])).toBeNull();
    expect(spotFor(roll, 21.6, 4, [])).toBeNull();
  });

  it("refuses rather than stacking on a fixed sheet", () => {
    const fixed = { ...roll, canGrow: false, maxLength: 24 };
    const r = run(fixed, Array.from({ length: 40 }, () => [6, 6] as [number, number]));
    expect(r.refused.length).toBeGreaterThan(0);
    expect(r.len).toBe(24);
    sound(fixed, r);
  });

  it("says there is no spot when the sheet is too short", () => {
    expect(freeSpotOn(roll, 4, 10, 8, [])).toBeNull();
  });
});

describe("turning a design", () => {
  it("gives the swapped footprint a spot of its own", () => {
    const taken: Box[] = [{ x: 0.25, y: 0.25, w: 10, h: 4 }];
    const turned = spotFor(roll, 4, 10, taken);
    expect(turned).not.toBeNull();
    expect(overlapping([...taken, { x: turned!.x, y: turned!.y, w: 4, h: 10 }], 0.25)).toBeNull();
  });
});

describe("the same job twice", () => {
  it("lays out identically", () => {
    const job = (): [number, number][] =>
      Array.from({ length: 50 }, (_, i) => [2 + (i % 4), 2 + (i % 3)] as [number, number]);
    expect(run(roll, job())).toEqual(run(roll, job()));
  });
});

describe("a big job stays responsive", () => {
  it("places 800 designs in well under a second", () => {
    const started = Date.now();
    const r = run(roll, Array.from({ length: 800 }, () => [3, 3] as [number, number]));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(overlapping(r.taken, 0.25)).toBeNull();
  });
});
