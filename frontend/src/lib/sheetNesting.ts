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
import { freeSpotOn, spotFor, type Box, type Sheet, type Spot } from "./sheetPlacement";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Any angle as the quarter turn nearest it: 0, 90, 180 or 270, clockwise. */
export function quarter(deg: number): number {
  return (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
}

/**
 * Which way up a design ends when a plan says whether it lies on its side.
 *
 * A plan only knows "upright" or "on its side". A design somebody turned
 * upside down is still upside down afterwards — arranging a sheet is not a
 * reason to flip a design back over.
 */
export function turnFor(current: number, onItsSide: boolean): number {
  return (quarter(current) >= 180 ? 180 : 0) + (onItsSide ? 90 : 0);
}

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

/**
 * Where more copies of one design go on this sheet, and how many will not fit.
 *
 * "Add copies" had a placement rule of its own: it ignored the safe edge, and
 * when the sheet ran out of room it put every remaining copy in the top-left
 * corner, one on top of the next — twenty-three copies asked for, eight of
 * them in a pile. This places them by the rules everything else goes by: free
 * space first, then, on a roll that can be cut longer, below what is there.
 * What is left over is counted and handed back, never stacked.
 *
 * `w` and `h` are the footprint as it stands on the sheet; copies keep the
 * way up their original has.
 */
export function planCopies(
  sheet: Sheet, taken: Box[], w: number, h: number, count: number,
): { spots: Spot[]; left: number; len: number } {
  const boxes = [...taken];
  const spots: Spot[] = [];
  let len = sheet.length;
  for (let i = 0; i < count; i++) {
    const at = spotFor({ ...sheet, length: len }, w, h, boxes);
    if (!at) break;
    spots.push(at);
    boxes.push({ x: at.x, y: at.y, w, h });
    len = Math.max(len, at.len);
  }
  return { spots, left: count - spots.length, len };
}

/**
 * The same job laid out in full-width rows, for sheets that will be cut apart.
 *
 * Packing tightly wastes the least film but leaves no straight line to cut
 * along. Rows do: every design in a row starts at the same height, the next
 * row starts below the tallest of them, and a cut can run straight across the
 * sheet between one row and the next.
 */
export function planRows(sheet: Sheet, items: NestItem[], maxSheets = 60): NestPlan {
  const EPS = 1e-9;
  const g = Math.max(sheet.gap, 0.25);
  const b = sheet.bleed;
  const printW = sheet.width - b * 2;
  const printH = sheet.length - b * 2;
  const area = Math.max(printW * printH, EPS);

  // Laid flat where that is allowed and fits across: shorter rows, less film.
  const prepared = items.map((item) => {
    const mayTurn = item.canRotate !== false && Math.abs(item.w - item.h) > EPS;
    const rotated = mayTurn && item.h <= printW + EPS && (item.h > item.w || item.w > printW + EPS);
    return { item, rotated, ...sizeOf(item, rotated) };
  }).sort((a, c) => {
    if (Math.abs(c.h - a.h) > EPS) return c.h - a.h;
    if (Math.abs(c.w - a.w) > EPS) return c.w - a.w;
    return a.item.key < c.item.key ? -1 : a.item.key > c.item.key ? 1 : 0;
  });

  const sheets: NestPlaced[][] = [];
  const rows: { y: number; height: number; x: number }[][] = [];
  const used: number[] = [];
  const unplaceable: NestItem[] = [];

  /** A row on this sheet with room for the piece, opening a new one if there is height left. */
  function rowOn(index: number, w: number, h: number) {
    const mine = rows[index]!;
    const open = mine.find((r) => r.x + w <= printW + EPS && h <= r.height + EPS);
    if (open) return open;
    const last = mine[mine.length - 1];
    const y = last ? last.y + last.height + g : 0;
    if (y + h > printH + EPS) return null;
    const row = { y, height: h, x: 0 };
    mine.push(row);
    return row;
  }

  for (const p of prepared) {
    if (p.w > printW + EPS || p.h > printH + EPS) { unplaceable.push(p.item); continue; }

    let index = -1;
    let row: { y: number; height: number; x: number } | null = null;
    for (let i = 0; i < sheets.length && !row; i++) {
      row = rowOn(i, p.w, p.h);
      if (row) index = i;
    }
    if (!row) {
      if (sheets.length >= maxSheets) { unplaceable.push(p.item); continue; }
      sheets.push([]); rows.push([]); used.push(0);
      index = sheets.length - 1;
      row = rowOn(index, p.w, p.h)!;
    }

    sheets[index]!.push({ ...p.item, sheet: index, x: round3(b + row.x), y: round3(b + row.y), rotated: p.rotated });
    row.x += p.w + g;
    used[index] = used[index]! + p.item.w * p.item.h;
  }

  return { sheets, unplaceable, fill: used.map((u) => Math.min(1, u / area)) };
}
