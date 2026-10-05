/**
 * Planning a whole job across sheets.
 *
 * The bug these exist for: auto-nest used to leave anything that did not fit
 * exactly where it was — on top of whatever was already there — so the button
 * meant to tidy a sheet was itself a way to produce an overlapping one.
 */
import { describe, expect, it } from "vitest";
import { planCopies, planFill, planNest, planRows, quarter, turnFor, type NestItem } from "@/lib/sheetNesting";
import type { Box, Sheet } from "@/lib/sheetPlacement";

/** A 22in roll cut to three feet, the size the screenshots are working in. */
const sheet: Sheet = {
  width: 22, length: 36, bleed: 0.25, gap: 0.5, canGrow: false, maxLength: 36,
};

function boxesOf(placed: { x: number; y: number; w: number; h: number; rotated: boolean }[]): Box[] {
  return placed.map((p) => ({
    x: p.x, y: p.y,
    w: p.rotated ? p.h : p.w,
    h: p.rotated ? p.w : p.h,
  }));
}

function overlapping(boxes: Box[], gap: number): [Box, Box] | null {
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

function offSheet(boxes: Box[], s: Sheet): Box | null {
  return boxes.find((b) =>
    b.x < s.bleed - 1e-9 || b.x + b.w > s.width - s.bleed + 1e-9 ||
    b.y < s.bleed - 1e-9 || b.y + b.h > s.length - s.bleed + 1e-9) ?? null;
}

/** Every sheet in a plan is a sheet somebody could actually print. */
function sound(plan: ReturnType<typeof planNest>, s: Sheet = sheet) {
  for (const placed of plan.sheets) {
    const boxes = boxesOf(placed);
    expect(overlapping(boxes, s.gap)).toBeNull();
    expect(offSheet(boxes, s)).toBeNull();
  }
}

const copies = (n: number, w: number, h: number): NestItem[] =>
  Array.from({ length: n }, (_, i) => ({ key: `d${i}`, w, h }));

describe("a job that needs more than one sheet", () => {
  it("spills onto further sheets instead of stacking", () => {
    const items = copies(36, 4.8, 3.2);
    const plan = planNest(sheet, items);
    const total = plan.sheets.reduce((n, s) => n + s.length, 0);
    expect(total + plan.unplaceable.length).toBe(36);
    expect(plan.unplaceable).toHaveLength(0);
    sound(plan);
  });

  it("keeps every design exactly once", () => {
    const plan = planNest(sheet, copies(80, 4.8, 3.2));
    const keys = plan.sheets.flat().map((p) => p.key).sort();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(80);
  });

  it("fills the sheet it has before opening another", () => {
    const plan = planNest(sheet, copies(30, 4.8, 3.2));
    // Whatever the count, no sheet before the last may be left mostly empty.
    for (const f of plan.fill.slice(0, -1)) expect(f).toBeGreaterThan(0.5);
  });
});

describe("gaps", () => {
  it("drops a small design into the space beside a large one", () => {
    // One tall design down the left, then smalls that only fit to its right.
    const items: NestItem[] = [
      { key: "tall", w: 10, h: 30 },
      ...Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, w: 5, h: 4 })),
    ];
    const plan = planNest(sheet, items);
    expect(plan.sheets).toHaveLength(1);
    sound(plan);
  });
});

describe("turning a design to make it fit", () => {
  it("lays a wide design on its side when that is the only way", () => {
    // 30in long will not fit across a 22in roll, but will fit down it.
    const plan = planNest(sheet, [{ key: "wide", w: 30, h: 4 }]);
    expect(plan.unplaceable).toHaveLength(0);
    expect(plan.sheets[0]![0]!.rotated).toBe(true);
    sound(plan);
  });

  it("leaves text the right way up when told to", () => {
    const plan = planNest(sheet, [{ key: "text", w: 30, h: 4, canRotate: false }]);
    expect(plan.unplaceable).toHaveLength(1);
    expect(plan.sheets).toHaveLength(0);
  });
});

describe("a design too big for any sheet", () => {
  it("is reported rather than forced on", () => {
    const plan = planNest(sheet, [{ key: "huge", w: 40, h: 40 }, { key: "ok", w: 5, h: 5 }]);
    expect(plan.unplaceable.map((i) => i.key)).toEqual(["huge"]);
    expect(plan.sheets.flat().map((p) => p.key)).toEqual(["ok"]);
    sound(plan);
  });

  it("gives a design that needs a whole sheet one of its own", () => {
    const items: NestItem[] = [
      { key: "big", w: 21, h: 34 },
      ...Array.from({ length: 4 }, (_, i) => ({ key: `s${i}`, w: 6, h: 6 })),
    ];
    const plan = planNest(sheet, items);
    expect(plan.sheets.length).toBeGreaterThan(1);
    expect(plan.sheets[0]!.map((p) => p.key)).toEqual(["big"]);
    sound(plan);
  });
});

describe("the same job twice", () => {
  it("plans identically", () => {
    const a = planNest(sheet, copies(40, 4.8, 3.2));
    const b = planNest(sheet, copies(40, 4.8, 3.2));
    expect(a).toEqual(b);
  });
});

describe("auto fill", () => {
  it("only uses space that is actually free", () => {
    const taken: Box[] = [{ x: 0.25, y: 0.25, w: 10, h: 10 }];
    const spots = planFill(sheet, taken, { key: "c", w: 4, h: 4 });
    expect(spots.length).toBeGreaterThan(0);
    const all = [...taken, ...boxesOf(spots.map((s) => ({ ...s, w: 4, h: 4 })))];
    expect(overlapping(all, sheet.gap)).toBeNull();
    expect(offSheet(all, sheet)).toBeNull();
  });

  it("returns nothing when the sheet is already full", () => {
    const taken: Box[] = [{ x: 0.25, y: 0.25, w: 21.5, h: 35.5 }];
    expect(planFill(sheet, taken, { key: "c", w: 4, h: 4 })).toEqual([]);
  });
});

/**
 * The sheet a buyer was on when this was reported: 22 x 10 inches, a fixed
 * size, with a 2.67 inch design they asked for twenty-three more of. Eighteen
 * fit. The other seven used to be dropped in the top-left corner in a pile.
 */
describe("adding copies of a design", () => {
  const fixed: Sheet = { width: 22, length: 10, bleed: 0.25, gap: 0.5, canGrow: false, maxLength: 10 };
  const first: Box = { x: 0.25, y: 0.25, w: 2.67, h: 2.67 };

  it("places only what the sheet has room for, and says how many are left over", () => {
    const plan = planCopies(fixed, [first], 2.67, 2.67, 23);
    expect(plan.spots.length).toBe(17);          // eighteen fit in all; one is already there
    expect(plan.left).toBe(6);
    expect(plan.len).toBe(10);
  });

  it("never puts one copy on another, or outside the safe area", () => {
    const plan = planCopies(fixed, [first], 2.67, 2.67, 23);
    const all = [first, ...plan.spots.map((sp) => ({ x: sp.x, y: sp.y, w: 2.67, h: 2.67 }))];
    expect(overlapping(all, fixed.gap)).toBeNull();
    expect(offSheet(all, fixed)).toBeNull();
  });

  it("places all of them when they do fit", () => {
    const plan = planCopies(fixed, [first], 2.67, 2.67, 5);
    expect(plan.spots).toHaveLength(5);
    expect(plan.left).toBe(0);
  });

  it("makes a roll longer instead of running out, up to the longest it is sold in", () => {
    const roll: Sheet = { width: 22, length: 10, bleed: 0.25, gap: 0.5, canGrow: true, maxLength: 24 };
    const plan = planCopies(roll, [first], 2.67, 2.67, 23);
    expect(plan.left).toBe(0);
    expect(plan.len).toBeGreaterThan(10);
    expect(plan.len).toBeLessThanOrEqual(24);
    const all = [first, ...plan.spots.map((sp) => ({ x: sp.x, y: sp.y, w: 2.67, h: 2.67 }))];
    expect(overlapping(all, roll.gap)).toBeNull();
    expect(offSheet(all, { ...roll, length: plan.len })).toBeNull();

    const tooMany = planCopies(roll, [first], 2.67, 2.67, 200);
    expect(tooMany.left).toBeGreaterThan(0);
    expect(tooMany.len).toBeLessThanOrEqual(24);
  });

  it("places none of a design wider than the sheet", () => {
    const plan = planCopies(fixed, [], 30, 2, 3);
    expect(plan.spots).toEqual([]);
    expect(plan.left).toBe(3);
  });
});

describe("nesting in rows, for cutting", () => {
  const mixed: NestItem[] = [
    ...copies(6, 4, 3), ...copies(5, 2, 6).map((c, i) => ({ ...c, key: `tall${i}` })),
    ...copies(7, 5, 2).map((c, i) => ({ ...c, key: `wide${i}` })),
  ];

  it("keeps every design, on sheets that could be printed", () => {
    const plan = planRows(sheet, mixed);
    expect(plan.sheets.flat()).toHaveLength(mixed.length);
    expect(plan.unplaceable).toEqual([]);
    sound(plan);
  });

  it("leaves a straight line across the sheet between one row and the next", () => {
    const plan = planRows(sheet, mixed);
    for (const placed of plan.sheets) {
      const boxes = boxesOf(placed);
      const tops = [...new Set(boxes.map((b) => b.y))].sort((a, b) => a - b);
      expect(tops.length).toBeGreaterThan(1);
      for (let i = 0; i + 1 < tops.length; i++) {
        const bottom = Math.max(...boxes.filter((b) => b.y === tops[i]).map((b) => b.y + b.h));
        // Nothing in this row reaches the next: the cut has the whole width.
        expect(bottom + sheet.gap).toBeLessThanOrEqual(tops[i + 1]! + 1e-9);
      }
    }
  });

  it("spills onto another sheet rather than stacking, and reports what fits nowhere", () => {
    const plan = planRows(sheet, [...copies(60, 5, 5), { key: "huge", w: 40, h: 40 }]);
    expect(plan.sheets.length).toBeGreaterThan(1);
    expect(plan.sheets.flat()).toHaveLength(60);
    expect(plan.unplaceable.map((u) => u.key)).toEqual(["huge"]);
    sound(plan);
  });

  it("leaves text upright when told to", () => {
    const plan = planRows(sheet, [{ key: "text", w: 3, h: 8, canRotate: false }]);
    expect(plan.sheets[0]![0]!.rotated).toBe(false);
  });
});

describe("which way up a design is", () => {
  it("reads any angle as a quarter turn", () => {
    expect([0, 90, 180, 270, 360, 450, -90].map(quarter)).toEqual([0, 90, 180, 270, 0, 90, 270]);
  });

  it("goes all the way round, a quarter at a time", () => {
    const seen: number[] = [];
    let r = 0;
    for (let i = 0; i < 4; i++) { r = (quarter(r) + 90) % 360; seen.push(r); }
    expect(seen).toEqual([90, 180, 270, 0]);
  });

  it("keeps an upside-down design upside down when a sheet is rearranged", () => {
    expect(turnFor(0, false)).toBe(0);
    expect(turnFor(0, true)).toBe(90);
    expect(turnFor(90, false)).toBe(0);
    expect(turnFor(180, false)).toBe(180);
    expect(turnFor(180, true)).toBe(270);
    expect(turnFor(270, true)).toBe(270);
    expect(turnFor(270, false)).toBe(180);
  });
});

describe("a big job stays responsive", () => {
  it("plans 300 designs quickly", () => {
    const started = Date.now();
    const plan = planNest(sheet, copies(300, 3, 3));
    expect(Date.now() - started).toBeLessThan(3000);
    expect(plan.sheets.flat()).toHaveLength(300);
    sound(plan);
  });
});
