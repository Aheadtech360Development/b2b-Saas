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

// A space exactly the size of a design is a space it fits in. Without a hair of
// slack, the last digit of the arithmetic decided — and a copy put back into
// the gap its twin was deleted from could be told there was no room.
const SLACK = 1e-9;

function hits(b: Box, x: number, y: number, w: number, h: number, gap: number): boolean {
  return !(
    x + w + gap <= b.x + SLACK ||
    x >= b.x + b.w + gap - SLACK ||
    y + h + gap <= b.y + SLACK ||
    y >= b.y + b.h + gap - SLACK
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

  // Every design was tested against every candidate position, which is fine
  // for ten designs and ruinous for four hundred: the scan went quadratic and
  // froze the browser for eight seconds on a full roll. Two things fix it, and
  // neither changes where a design lands — only how long it takes to find out.
  //
  // First, sort by top edge, so a row only has to consider the designs that
  // reach into it rather than all of them.
  const sorted = [...taken].sort((a, c) => a.y - c.y);
  const maxX = sheet.width - b + 1e-9;
  const maxY = len - b + 1e-9;

  // A sweep down the sheet rather than a fresh search per row: each design
  // joins the working set once, when the rows reach it, and leaves once, when
  // the rows pass it. Without this, every row re-read the whole list from the
  // top, so a long roll near the end of a big job spent most of its time
  // walking past designs it had already walked past.
  let head = 0;
  let band: Box[] = [];

  let y = b;
  while (y + h <= maxY) {
    while (head < sorted.length && sorted[head]!.y - g < y + h) { band.push(sorted[head]!); head++; }
    if (band.length) band = band.filter((t) => t.y + t.h + g > y);
    if (band.length === 0) return { x: round3(b), y: round3(y) };

    // Second, when something is in the way, jump past its right-hand edge
    // instead of inching along by the margin — most of the row is one design.
    let x = b;
    while (x + w <= maxX) {
      let blocker: Box | null = null;
      for (const t of band) {
        if (hits(t, x, y, w, h, g)) { if (!blocker || t.x + t.w > blocker.x + blocker.w) blocker = t; }
      }
      if (!blocker) return { x: round3(x), y: round3(y) };
      const next = blocker.x + blocker.w + g;
      x = next > x ? next : x + g;
    }

    // Nothing is free at this height, and going lower changes nothing until
    // one of the designs in the way has been passed: more can only come into
    // reach, never less. So the next height worth trying is exactly the margin
    // below the first of them to end. Stepping down by the margin instead put
    // each row wherever the steps happened to land — further below the row
    // above than the designs in it were from each other, an uneven grid, and
    // on a short sheet one row fewer than there was room for.
    let below = Infinity;
    for (const t of band) { const end = t.y + t.h + g; if (end < below) below = end; }
    y = below > y ? below : y + g;
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
