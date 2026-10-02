/**
 * Where a design goes on a gang sheet — and when the sheet has to get longer.
 *
 * This used to live inside the builder and had one answer for "there is no
 * room": the top-left corner. So the first design that did not fit was dropped
 * on top of the first one that did, and the next on top of that, until twenty
 * uploads were a single unreadable pile. Nothing said so; the sheet simply
 * looked wrong.
 *
 * A roll is sold by the inch, so the honest answer is almost always to use a
 * few more inches. These functions give the spot and the length the sheet must
 * be to hold it, and say null only when the sheet genuinely cannot grow — a
 * fixed size, or one already at its longest.
 */

export interface Box {
  /** Left and top in inches, and the footprint after any rotation. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sheet {
  /** Across the roll, in inches — this never changes. */
  width: number;
  /** Down the roll, in inches, as it is now. */
  length: number;
  /** Kept clear at every edge. */
  bleed: number;
  /** Kept between designs. */
  gap: number;
  /** Rolls can be cut longer; a fixed sheet cannot. */
  canGrow: boolean;
  /** The longest this roll is sold in. Ignored when it cannot grow. */
  maxLength: number;
}

export interface Spot {
  x: number;
  y: number;
  /** What the sheet's length must be for this spot to exist. */
  len: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function hits(b: Box, x: number, y: number, w: number, h: number, gap: number): boolean {
  return !(
    x + w + gap <= b.x ||
    x >= b.x + b.w + gap ||
    y + h + gap <= b.y ||
    y >= b.y + b.h + gap
  );
}

/**
 * The first free spot on a sheet of this length, scanning left to right and
 * top to bottom, or null when the design does not fit anywhere on it.
 */
export function freeSpotOn(
  sheet: Sheet, len: number, w: number, h: number, taken: Box[],
): { x: number; y: number } | null {
  const g = Math.max(sheet.gap, 0.25);
  const b = sheet.bleed;
  if (w > sheet.width - b * 2) return null;
  for (let y = b; y + h <= len - b + 1e-9; y += g) {
    for (let x = b; x + w <= sheet.width - b + 1e-9; x += g) {
      if (!taken.some((t) => hits(t, x, y, w, h, g))) return { x: round3(x), y: round3(y) };
    }
  }
  return null;
}

/**
 * Where this design goes, growing the sheet if that is what it takes.
 *
 * A design that does not fit in the space already paid for goes below
 * everything else, and the sheet is lengthened by exactly enough to hold it —
 * which is how it would be laid out by hand, and what every other builder in
 * this trade does. Returns null only when there is truly nowhere.
 */
export function spotFor(sheet: Sheet, w: number, h: number, taken: Box[]): Spot | null {
  const here = freeSpotOn(sheet, sheet.length, w, h, taken);
  if (here) return { ...here, len: sheet.length };

  // Too wide for the roll is not a length problem, and no amount of growing
  // will fix it.
  if (!sheet.canGrow || w > sheet.width - sheet.bleed * 2) return null;

  const g = Math.max(sheet.gap, 0.25);
  const bottom = taken.reduce((m, t) => Math.max(m, t.y + t.h), sheet.bleed);
  const y = round3(bottom + g);
  const needed = round3(y + h + sheet.bleed);
  if (needed > sheet.maxLength + 1e-9) return null;
  return { x: round3(sheet.bleed), y, len: needed };
}
