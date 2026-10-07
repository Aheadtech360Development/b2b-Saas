/**
 * A whole sheet built from a short order: these designs, this many of each, at
 * this size, on this sheet.
 *
 * It is what the builder's assistant hands over when a customer says "8 of this
 * one at 4 inches on a 22x10". The model never works out a layout: it names the
 * designs, counts and sizes, and this lays them out with the same nesting the
 * Auto Nest button uses — so what the plan card promises, and what the sheet
 * then shows, are the same thing, and the price is the shop's own.
 */
import { planNest, type NestItem } from "@/lib/sheetNesting";
import type { Sheet } from "@/lib/sheetPlacement";

export interface StudioSize {
  id: string;
  name: string;
  width_in: number;
  height_in: number;
  price_per_sheet: number;
  bleed_in: number;
  pricing_mode: "fixed" | "custom_length";
  price_per_inch: number;
  min_length_in: number;
  max_length_in: number;
}

export interface BuildDesign {
  /** Whatever the caller uses to know the design again (an upload id). */
  key: string;
  /** Print size, upright, in inches. */
  w: number;
  h: number;
  copies: number;
}

export interface BuildPiece {
  key: string;
  x: number;
  y: number;
  /** The design's own size, upright; `rotated` turns it a quarter. */
  w: number;
  h: number;
  rotated: boolean;
}

export interface BuildSheet {
  /** For a roll, the length it is cut to; otherwise the sheet's own. */
  length: number;
  price: number;
  pieces: BuildPiece[];
}

export interface BuildPlan {
  size: StudioSize;
  sheets: BuildSheet[];
  /** Designs too big for this sheet however they are turned. */
  tooBig: string[];
  /** All sheets together, for one set. */
  price: number;
  /** Average share of each sheet's printable area covered, 0-100. */
  fillPct: number;
  copies: number;
}

/** No order is this big; past it the nesting would keep the page busy for nothing. */
export const MAX_BUILD_COPIES = 2000;

const r2 = (n: number) => Math.round(n * 100) / 100;

export const isRoll = (s: StudioSize) => s.pricing_mode === "custom_length";

/** Lay the designs out on `size`, onto as many sheets as they take. */
export function planBuild(size: StudioSize, designs: BuildDesign[], edge: number, gap: number): BuildPlan {
  const roll = isRoll(size);
  const bleed = Math.max(size.bleed_in || 0, edge);
  // A roll is cut to length: lay it out at the longest it is sold, then cut
  // each sheet to what its designs use.
  const length = roll ? size.max_length_in : size.height_in;
  const spec: Sheet = { width: size.width_in, length, bleed, gap, canGrow: false, maxLength: length };

  const owners: string[] = [];
  const items: NestItem[] = [];
  for (const d of designs) {
    if (!(d.w > 0 && d.h > 0)) continue;
    const n = Math.max(0, Math.floor(d.copies));
    for (let i = 0; i < n && items.length < MAX_BUILD_COPIES; i++) {
      items.push({ key: String(owners.length), w: d.w, h: d.h });
      owners.push(d.key);
    }
  }

  const plan = planNest(spec, items);
  const sheets: BuildSheet[] = plan.sheets.map((page) => {
    const pieces = page.map((it) => ({
      key: owners[Number(it.key)]!, x: it.x, y: it.y, w: it.w, h: it.h, rotated: it.rotated,
    }));
    if (!roll) return { length, price: r2(size.price_per_sheet || 0), pieces };
    const used = page.reduce((m, it) => Math.max(m, it.y + (it.rotated ? it.w : it.h)), 0);
    const cut = Math.min(size.max_length_in, Math.max(size.min_length_in || 0, Math.ceil(used + bleed - 1e-6)));
    return { length: cut, price: r2(cut * (size.price_per_inch || 0)), pieces };
  });
  const tooBig = [...new Set(plan.unplaceable.map((it) => owners[Number(it.key)]!))];
  const fill = plan.fill.length ? plan.fill.reduce((a, b) => a + b, 0) / plan.fill.length : 0;

  return {
    size,
    sheets,
    tooBig,
    price: r2(sheets.reduce((sum, s) => sum + s.price, 0)),
    fillPct: Math.round(fill * 100),
    copies: items.length,
  };
}

/**
 * About how many copies of one design, alone, fit on a sheet: a grid of them,
 * all upright or all turned, whichever takes more. It is what the assistant is
 * told so it knows that smaller means more and bigger means fewer, without
 * running the nesting for every size it might mention. `length` is a roll's
 * cut length; a roll otherwise counts at its longest.
 */
export function capacity(size: StudioSize, w: number, h: number, edge: number, gap: number, length?: number): number {
  if (!(w > 0 && h > 0)) return 0;
  const bleed = Math.max(size.bleed_in || 0, edge);
  const long = length ?? (isRoll(size) ? size.max_length_in : size.height_in);
  const W = size.width_in - bleed * 2, H = long - bleed * 2;
  const grid = (a: number, b: number) => (a > W + 1e-9 || b > H + 1e-9 ? 0
    : Math.floor((W + gap + 1e-9) / (a + gap)) * Math.floor((H + gap + 1e-9) / (b + gap)));
  return Math.max(grid(w, h), grid(h, w));
}

/**
 * Exactly how many copies of `design` go on one sheet beside `others` — the
 * most for which the whole build still takes a single sheet. This is "fill the
 * sheet": counted by laying it out, not by the grid estimate. A roll is filled
 * to `length` rather than let out to its longest.
 */
export function fillCount(
  size: StudioSize, others: BuildDesign[], design: { key: string; w: number; h: number },
  edge: number, gap: number, length?: number,
): number {
  const sheet: StudioSize = length && isRoll(size) ? { ...size, pricing_mode: "fixed", height_in: length } : size;
  const fits = (n: number) => {
    const p = planBuild(sheet, [...others, { ...design, copies: n }], edge, gap);
    return p.tooBig.length === 0 && p.sheets.length <= 1;
  };
  if (!fits(1)) return 0;
  let lo = 1;
  let hi = Math.min(MAX_BUILD_COPIES, Math.ceil(capacity(sheet, design.w, design.h, edge, gap) * 1.3) + 2);
  // The grid estimate is a starting point; mixing turns can fit a few more.
  while (hi < MAX_BUILD_COPIES && fits(hi)) { lo = hi; hi = Math.min(MAX_BUILD_COPIES, hi * 2); }
  if (fits(hi)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * The cheapest size that takes everything on one sheet, worth offering instead
 * of `plan`.
 *
 * When `plan` spills onto more sheets, or cannot hold a design at all, the
 * single sheet is offered whatever it costs — the buyer sees both prices and
 * chooses. When `plan` is already one sheet, another size is only offered if it
 * is cheaper. Null when there is nothing better to say.
 */
export function betterSize(
  sizes: StudioSize[], plan: BuildPlan, designs: BuildDesign[], edge: number, gap: number,
): BuildPlan | null {
  let best: BuildPlan | null = null;
  for (const s of sizes) {
    if (s.id === plan.size.id) continue;
    const p = planBuild(s, designs, edge, gap);
    if (p.tooBig.length || p.sheets.length !== 1) continue;
    if (!best || p.price < best.price - 1e-9) best = p;
  }
  if (!best) return null;
  const oneSheet = !plan.tooBig.length && plan.sheets.length === 1;
  if (oneSheet && best.price >= plan.price - 1e-9) return null;
  return best;
}

/** A size as the API sends it, with every number made a number. */
export function toStudioSize(s: {
  id: string; name: string; width_in: number | string; height_in: number | string;
  price_per_sheet: number | string; bleed_in: number | string; pricing_mode: string;
  price_per_inch: number | string; min_length_in: number | string; max_length_in: number | string;
}): StudioSize {
  return {
    id: s.id, name: s.name,
    width_in: Number(s.width_in) || 0, height_in: Number(s.height_in) || 0,
    price_per_sheet: Number(s.price_per_sheet) || 0, bleed_in: Number(s.bleed_in) || 0,
    pricing_mode: s.pricing_mode === "custom_length" ? "custom_length" : "fixed",
    price_per_inch: Number(s.price_per_inch) || 0,
    min_length_in: Number(s.min_length_in) || 0, max_length_in: Number(s.max_length_in) || 0,
  };
}

/** What the assistant proposes, as the server checked it (services/copilot/studio.py). */
export interface AssistantPlan {
  label: string;
  remove_background?: string[];
  /** Put these on the sheet where there is room, without moving anything.
   *  Only the builder's own upload card asks for this, never the model. */
  place?: string[];
  build?: {
    sheet_size?: string;
    keep_others?: boolean;
    /** Space between designs, in inches; the builder's margin otherwise. */
    gap_in?: number;
    items: { design: string; copies?: number; fill?: boolean; width_in?: number; height_in?: number }[];
  };
  /** How many of the sheet to print. */
  sets?: number;
  add_to_cart?: boolean;
}

/** What the plan card shows before anything changes. */
export interface PlanPreview {
  /** File names whose background will be removed. */
  backgrounds: string[];
  build?: {
    sizeName: string;
    sheets: number;
    /** Each sheet's length, for a roll cut to length. */
    lengths: number[];
    roll: boolean;
    copies: number;
    /** For one set; times `qty` when more sets are ordered. */
    price: number;
    qty: number;
    tooBig: string[];
    lowDpi: { name: string; dpi: number }[];
    /** Designs that fill whatever room is left, and how many that came to. */
    fills: { name: string; copies: number }[];
    /** The spacing it was laid out with, when the plan sets one. */
    gap?: number;
    alt?: { sizeId: string; sizeName: string; price: number; length?: number };
  };
  cart: boolean;
  /** Names put on the sheet as they are. */
  place: string[];
  /** Sets to print, when the plan changes it. */
  sets?: number;
  /** Why it cannot be done as it stands. */
  problem?: string;
}

export interface PlanRun { ok: boolean; message: string }
