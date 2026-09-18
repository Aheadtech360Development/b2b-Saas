/**
 * Packing designs onto gang sheets.
 *
 * Two layouts, matching what a print shop actually wants:
 *
 *  - "standard" packs tightly in every direction (MaxRects, best-short-side
 *    fit, rotation allowed) — the least film wasted.
 *  - "cutting" packs into full-width rows (shelves), so a cutter can run each
 *    cut straight across the sheet between rows.
 *
 * Whatever does not fit one sheet carries over to the next, so a big order
 * becomes several sheets instead of silently dropping designs. A design bigger
 * than the printable area on its own can never be placed, and is returned in
 * `tooBig` so the caller can say so.
 *
 * Units are inches throughout. `gap` is the space kept between designs; it is
 * handled by growing each design and the sheet by the gap, packing, and then
 * reading positions back — so designs never touch and never sit closer than
 * `gap`, and none is pushed past the far edges.
 */

export interface PackItem {
  key: string;
  w: number;
  h: number;
}

export interface Packed {
  key: string;
  x: number;
  y: number;
  /** True when the design was turned 90° to fit. */
  rotated: boolean;
}

export type Layout = "standard" | "cutting";

interface Free { x: number; y: number; w: number; h: number }

const EPS = 1e-6;

function packMaxRects(items: PackItem[], W: number, H: number, gap: number): { placed: Packed[]; rest: PackItem[] } {
  const BW = W + gap, BH = H + gap;
  let free: Free[] = [{ x: 0, y: 0, w: BW, h: BH }];
  const placed: Packed[] = [];
  const rest: PackItem[] = [];

  // Biggest first: large pieces are hardest to fit, small ones fill the gaps.
  const order = [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);

  for (const it of order) {
    let best: { fr: Free; w: number; h: number; rotated: boolean; score: number; long: number } | null = null;
    for (const fr of free) {
      for (const rotated of [false, true]) {
        const w = (rotated ? it.h : it.w) + gap;
        const h = (rotated ? it.w : it.h) + gap;
        if (w > fr.w + EPS || h > fr.h + EPS) continue;
        const shortLeft = Math.min(fr.w - w, fr.h - h);
        const longLeft = Math.max(fr.w - w, fr.h - h);
        if (!best || shortLeft < best.score - EPS || (Math.abs(shortLeft - best.score) < EPS && longLeft < best.long)) {
          best = { fr, w, h, rotated, score: shortLeft, long: longLeft };
        }
      }
    }
    if (!best) { rest.push(it); continue; }

    const node = { x: best.fr.x, y: best.fr.y, w: best.w, h: best.h };
    placed.push({ key: it.key, x: node.x, y: node.y, rotated: best.rotated });

    // Split every free rectangle the new piece overlaps.
    const next: Free[] = [];
    for (const fr of free) {
      const overlaps = !(node.x >= fr.x + fr.w - EPS || node.x + node.w <= fr.x + EPS ||
                         node.y >= fr.y + fr.h - EPS || node.y + node.h <= fr.y + EPS);
      if (!overlaps) { next.push(fr); continue; }
      if (node.x > fr.x + EPS) next.push({ x: fr.x, y: fr.y, w: node.x - fr.x, h: fr.h });
      if (node.x + node.w < fr.x + fr.w - EPS) next.push({ x: node.x + node.w, y: fr.y, w: fr.x + fr.w - (node.x + node.w), h: fr.h });
      if (node.y > fr.y + EPS) next.push({ x: fr.x, y: fr.y, w: fr.w, h: node.y - fr.y });
      if (node.y + node.h < fr.y + fr.h - EPS) next.push({ x: fr.x, y: node.y + node.h, w: fr.w, h: fr.y + fr.h - (node.y + node.h) });
    }
    // Drop free rectangles wholly inside another; they add nothing but time.
    free = next.filter((a, i) => !next.some((b, j) => j !== i &&
      a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS &&
      (j < i || a.w * a.h < b.w * b.h - EPS)));
  }
  return { placed, rest };
}

function packShelves(items: PackItem[], W: number, H: number, gap: number): { placed: Packed[]; rest: PackItem[] } {
  // Lay each piece landscape-first so rows stay short, then tallest first so
  // each row's height is set by its first piece.
  const prepared = items.map((it) => {
    const rotated = it.h > it.w && it.h <= W + EPS;
    return { it, w: rotated ? it.h : it.w, h: rotated ? it.w : it.h, rotated };
  }).sort((a, b) => b.h - a.h || b.w - a.w);

  const rows: { y: number; height: number; x: number }[] = [];
  const placed: Packed[] = [];
  const rest: PackItem[] = [];
  for (const p of prepared) {
    if (p.w > W + EPS) { rest.push(p.it); continue; }
    let row = rows.find((r) => r.x + p.w <= W + EPS && p.h <= r.height + EPS);
    if (!row) {
      const last = rows[rows.length - 1];
      const y = last ? last.y + last.height + gap : 0;
      if (y + p.h > H + EPS) { rest.push(p.it); continue; }
      row = { y, height: p.h, x: 0 };
      rows.push(row);
    }
    placed.push({ key: p.it.key, x: row.x, y: row.y, rotated: p.rotated });
    row.x += p.w + gap;
  }
  return { placed, rest };
}

/**
 * Pack `items` into as many W × H sheets as it takes.
 * Returns one list of placements per sheet, and anything too big to ever fit.
 */
export function packIntoSheets(items: PackItem[], W: number, H: number, gap: number, layout: Layout, maxSheets = 50): {
  sheets: Packed[][];
  tooBig: PackItem[];
} {
  const fits = (it: PackItem) =>
    (it.w <= W + EPS && it.h <= H + EPS) || (it.h <= W + EPS && it.w <= H + EPS);
  const tooBig = items.filter((it) => !fits(it));
  let pending = items.filter(fits);
  const sheets: Packed[][] = [];

  while (pending.length && sheets.length < maxSheets) {
    const { placed, rest } = layout === "cutting"
      ? packShelves(pending, W, H, gap)
      : packMaxRects(pending, W, H, gap);
    if (!placed.length) break;        // nothing more will go; stop rather than loop
    sheets.push(placed);
    pending = rest;
  }
  return { sheets, tooBig: [...tooBig, ...pending] };
}
