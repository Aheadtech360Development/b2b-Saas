/**
 * Arranging a whole job across however many sheets it takes.
 *
 * The old auto-nest packed one canvas with shelves and, when something did not
 * fit, left it exactly where it was — on top of whatever was already there. So
 * the one button whose whole job is to tidy up was itself a way to produce an
 * overlapping sheet. Auto-fill had the same shape of bug from the other end: it
 * laid a full grid over the sheet without looking at what was on it.
 *
 * This plans instead of placing. It works out where every design goes across
 * every sheet, says how many sheets that needs and what it could not place at
 * all, and hands that back to be shown to somebody before anything moves. The
 * caller applies it or throws it away; nothing here touches a layout.
 *
 * What it tries to do, in order: put each design on the earliest sheet with
 * room for it — including in a gap between designs already placed, and turned
 * a quarter if that is what fits — and only start a new sheet when no existing
 * one can take it. Biggest first, because a big design dropped into a sheet
 * already full of small ones is what forces an extra sheet nobody needed.
 */
import { freeSpotOn, type Box, type Sheet } from "./sheetPlacement";

export interface NestItem {
  /** Whatever the caller needs to map this back to its own record. */
  key: string;
  /** Print size in inches, before any turn. */
  w: number;
  h: number;
  /** Text, for one, reads badly on its side. Defaults to allowed. */
  canRotate?: boolean;
}

export interface NestPlaced extends NestItem {
  /** Which sheet, counted from zero. */
  sheet: number;
  x: number;
  y: number;
  /** A quarter turn clockwise; w and h stay as the design's own. */
  rotated: boolean;
}

export interface NestPlan {
  /** One list per sheet, in order. */
  sheets: NestPlaced[][];
  /** Too wide for the roll however it is turned — no sheet can hold these. */
  unplaceable: NestItem[];
  /** How much of each sheet's printable area is covered, 0 to 1. */
  fill: number[];
}

/** The footprint a design occupies once turned (or not). */
function sizeOf(item: NestItem, rotated: boolean) {
  return rotated ? { w: item.h, h: item.w } : { w: item.w, h: item.h };
}

/** Both ways round, unless turning makes no difference or is not allowed. */
function orientations(item: NestItem): boolean[] {
  if (item.canRotate === false) return [false];
  if (Math.abs(item.w - item.h) < 1e-9) return [false];
  return [false, true];
}

/**
 * Where every design goes, and how many sheets that takes.
 *
 * The sheet's own length is respected rather than grown: the length is what
 * the buyer chose and what they are being quoted, so an overflow becomes
 * another sheet — the same answer, visible, and theirs to accept.
 */
export function planNest(sheet: Sheet, items: NestItem[], maxSheets = 60): NestPlan {
  const printW = sheet.width - sheet.bleed * 2;
  const printH = sheet.length - sheet.bleed * 2;
  const area = Math.max(printW * printH, 1e-9);

  // Biggest first. A large design left until last is what ends up alone on a
  // sheet of its own with everything else already packed around it.
  const queue = [...items].sort((a, b) => {
    const byLongest = Math.max(b.w, b.h) - Math.max(a.w, a.h);
    if (Math.abs(byLongest) > 1e-9) return byLongest;
    const byArea = b.w * b.h - a.w * a.h;
    if (Math.abs(byArea) > 1e-9) return byArea;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const sheets: NestPlaced[][] = [];
  const boxes: Box[][] = [];
  const used: number[] = [];
  const unplaceable: NestItem[] = [];

  /** The best spot for this design on one sheet, or null. */
  function spotOn(index: number, item: NestItem) {
    let best: { x: number; y: number; rotated: boolean } | null = null;
    for (const rotated of orientations(item)) {
      const { w, h } = sizeOf(item, rotated);
      if (w > printW + 1e-9 || h > printH + 1e-9) continue;
      const at = freeSpotOn(sheet, sheet.length, w, h, boxes[index]!);
      if (!at) continue;
      // Higher up wins, then further left — so the sheet fills from the top
      // and gaps left behind get used by whatever comes next.
      if (!best || at.y < best.y - 1e-9 || (Math.abs(at.y - best.y) < 1e-9 && at.x < best.x - 1e-9)) {
        best = { ...at, rotated };
      }
    }
    return best;
  }

  function openSheet() {
    sheets.push([]);
    boxes.push([]);
    used.push(0);
    return sheets.length - 1;
  }

  for (const item of queue) {
    const itemArea = item.w * item.h;
    let placed = false;

    for (let i = 0; i < sheets.length; i++) {
      // A sheet without room left for this much is not worth scanning.
      if (area - used[i]! < itemArea - 1e-9) continue;
      const at = spotOn(i, item);
      if (!at) continue;
      const { w, h } = sizeOf(item, at.rotated);
      sheets[i]!.push({ ...item, sheet: i, x: at.x, y: at.y, rotated: at.rotated });
      boxes[i]!.push({ x: at.x, y: at.y, w, h });
      used[i] = used[i]! + itemArea;
      placed = true;
      break;
    }
    if (placed) continue;

    // Nothing open could take it. A fresh sheet is the next answer — unless
    // the design does not fit an empty one either, in which case no number of
    // sheets will help and saying so is the only honest thing to do.
    if (sheets.length >= maxSheets) { unplaceable.push(item); continue; }
    const i = openSheet();
    const at = spotOn(i, item);
    if (!at) {
      sheets.pop(); boxes.pop(); used.pop();
      unplaceable.push(item);
      continue;
    }
    const { w, h } = sizeOf(item, at.rotated);
    sheets[i]!.push({ ...item, sheet: i, x: at.x, y: at.y, rotated: at.rotated });
    boxes[i]!.push({ x: at.x, y: at.y, w, h });
    used[i] = used[i]! + itemArea;
  }

  return { sheets, unplaceable, fill: used.map((u) => Math.min(1, u / area)) };
}

/**
 * How many more copies of one design this sheet can take, and where.
 *
 * Auto-fill used to lay a full grid across the sheet without looking at what
 * was already on it, so it buried every other design under a row of copies.
 * This only ever uses space that is actually free.
 */
export function planFill(
  sheet: Sheet, taken: Box[], item: NestItem, limit = 400,
): { x: number; y: number; rotated: boolean }[] {
  const out: { x: number; y: number; rotated: boolean }[] = [];
  const boxes = [...taken];
  for (let n = 0; n < limit; n++) {
    let best: { x: number; y: number; rotated: boolean } | null = null;
    for (const rotated of orientations(item)) {
      const { w, h } = sizeOf(item, rotated);
      const at = freeSpotOn(sheet, sheet.length, w, h, boxes);
      if (!at) continue;
      if (!best || at.y < best.y - 1e-9 || (Math.abs(at.y - best.y) < 1e-9 && at.x < best.x - 1e-9)) {
        best = { ...at, rotated };
      }
    }
    if (!best) break;
    const { w, h } = sizeOf(item, best.rotated);
    boxes.push({ x: best.x, y: best.y, w, h });
    out.push(best);
  }
  return out;
}
