/**
 * The sheet as the builder's assistant is told about it.
 *
 * The assistant is a language model: good at asking and explaining, wrong to
 * trust with geometry or prices. So the builder works those out here, with the
 * same nesting the Auto Nest button uses, and sends the results along with each
 * question. The model reads them; it works nothing out.
 *
 * Each uploaded design is given a short name ("d1", "d2"…) that the model uses
 * to say which design it means. `refs` maps those names back to uploads, held by
 * the builder for when the customer presses the plan's button.
 */
import { capacity, isRoll, planBuild, type StudioSize } from "@/lib/studioBuild";

export type { StudioSize } from "@/lib/studioBuild";

export interface StudioUpload {
  uid: string;
  name: string;
  pxW?: number;
  pxH?: number;
  isImage: boolean;
  /** Undefined when nobody has looked (a design reopened from an order). */
  hasAlpha?: boolean;
  /** The print size it has on the sheet, or would be given if added now. */
  w_in: number;
  h_in: number;
}

/** A ready-made design of the shop's, or one from the customer's gallery. */
export interface StudioShopItem {
  /** What the builder knows it by: the library id, or the gallery file's address. */
  key: string;
  name: string;
  category?: string | null;
}

export interface StudioPiece {
  uid: string;
  w_in: number;
  h_in: number;
}

export interface StudioContext {
  sheet_name: string;
  sheet_width_in: number;
  sheet_length_in: number;
  /** Kept clear at the sheet's edges ("sheet margin"), and the least the shop allows. */
  sheet_margin_in: number;
  min_sheet_margin_in: number;
  /** Kept between designs ("image margin"). */
  gap_between_designs_in: number;
  sheet_count_ordered: number;
  price_now?: number;
  designs_on_sheet: number;
  designs: {
    ref: string; name: string; picture?: boolean; has_background?: boolean;
    size_now: { width_in: number; height_in: number; dpi?: number };
    on_sheet: { width_in: number; height_in: number; copies: number; dpi?: number }[];
    /** Alone on the open sheet: about how many copies fit at each width. */
    copies_that_fit?: { width_in: number; height_in: number; copies: number; dpi?: number }[];
  }[];
  sizes: {
    name: string; width_in: number; is_roll: boolean; length_in?: number; price?: number;
    min_length_in?: number; max_length_in?: number; price_per_inch?: number; current: boolean;
  }[];
  warnings: { low_dpi: number; outside_safe_area: number; overlapping: number; very_small: number };
  fits: {
    size_name: string; width_in: number; length_in?: number; is_roll: boolean; fits_all: boolean;
    sheets_needed?: number; too_wide: number; fill_pct?: number; price?: number; current: boolean;
  }[];
  /** The shop's ready-made designs (s1…) and the customer's gallery (g1…). */
  shop_designs: { ref: string; name: string; category?: string }[];
  gallery: { ref: string; name: string }[];
}

export interface StudioInput {
  sizes: StudioSize[];
  current: StudioSize | undefined;
  currentLength: number;
  edge: number;
  gap: number;
  copiesOrdered: number;
  priceNow: number;
  uploads: StudioUpload[];
  pieces: StudioPiece[];
  warnings: StudioContext["warnings"];
  shopDesigns?: StudioShopItem[];
  gallery?: StudioShopItem[];
}

// Past this the nesting runs once per size on every question; the answer would
// be slower than the question is worth, and the model is told it has no fits.
const MAX_ITEMS_FOR_FITS = 300;
const MAX_DESIGNS = 40;
const MAX_SIZES = 12;
// The widths a buyer is likely to name. Each design is told how many copies of
// it fit at these, so "smaller and fill the sheet" or "bigger, will it
// overflow?" is answered from the builder's numbers. Only the first few
// designs get the table: it is the bulk of what is sent.
const WIDTHS = [1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12];
const MAX_TABLES = 8;
const MAX_SHOP = 40;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function dpiAt(u: { isImage: boolean; pxW?: number; pxH?: number } | undefined, w: number, h: number): number | undefined {
  if (!u || !u.isImage || !u.pxW || !u.pxH || w <= 0 || h <= 0) return undefined;
  return Math.floor(Math.min(u.pxW / w, u.pxH / h));
}

/** How the pieces on the sheet now would nest on one size, at this gap and edge. */
export function fitOn(
  size: StudioSize, pieces: { w_in: number; h_in: number }[], edge: number, gap: number,
): StudioContext["fits"][number] {
  const plan = planBuild(size, pieces.map((p, i) => ({ key: String(i), w: p.w_in, h: p.h_in, copies: 1 })), edge, gap);
  const roll = isRoll(size);
  const fitsAll = plan.tooBig.length === 0 && plan.sheets.length <= 1;
  const base = { size_name: size.name, width_in: size.width_in, is_roll: roll, fits_all: fitsAll, too_wide: plan.tooBig.length, current: false };
  if (roll) {
    if (!fitsAll) return { ...base, length_in: size.max_length_in, sheets_needed: plan.sheets.length };
    return { ...base, length_in: plan.sheets[0]?.length ?? size.min_length_in, sheets_needed: 1, price: plan.price };
  }
  return { ...base, length_in: size.height_in, sheets_needed: plan.sheets.length, fill_pct: plan.fillPct, price: r2(size.price_per_sheet * Math.max(1, plan.sheets.length)) };
}

export function buildStudioContext(input: StudioInput): { context: StudioContext; refs: Record<string, string> } | null {
  const { current, pieces } = input;
  if (!current) return null;

  const refs: Record<string, string> = {};
  const designs: StudioContext["designs"] = input.uploads.slice(0, MAX_DESIGNS).map((u, i) => {
    const ref = `d${i + 1}`;
    refs[ref] = u.uid;
    const bySize = new Map<string, { width_in: number; height_in: number; copies: number; dpi?: number }>();
    for (const p of pieces) {
      if (p.uid !== u.uid) continue;
      const k = `${r2(p.w_in)}x${r2(p.h_in)}`;
      const g = bySize.get(k);
      if (g) g.copies += 1;
      else bySize.set(k, { width_in: r2(p.w_in), height_in: r2(p.h_in), copies: 1, dpi: dpiAt(u, p.w_in, p.h_in) });
    }
    const shape = u.w_in > 0 && u.h_in > 0 ? u.w_in / u.h_in : 1;
    const table = i < MAX_TABLES
      ? [...new Set([...WIDTHS, r2(u.w_in)])].sort((a, b) => a - b).map((w) => {
          const h = r2(w / shape);
          return { width_in: w, height_in: h, copies: capacity(current, w, h, input.edge, input.gap, isRoll(current) ? input.currentLength : undefined), dpi: dpiAt(u, w, h) };
        }).filter((row, j, all) => row.copies > 0 || all[j - 1]?.copies)
      : undefined;
    return {
      ref, name: u.name.slice(0, 80),
      picture: u.isImage || undefined,
      // A picture with no transparency almost always has a background to
      // remove. Not said at all when it was never looked at.
      has_background: u.isImage && u.hasAlpha !== undefined ? !u.hasAlpha : undefined,
      size_now: { width_in: r2(u.w_in), height_in: r2(u.h_in), dpi: dpiAt(u, u.w_in, u.h_in) },
      on_sheet: [...bySize.values()],
      copies_that_fit: table,
    };
  });

  const shown = input.sizes.slice(0, MAX_SIZES);
  const sizes: StudioContext["sizes"] = shown.map((s) => isRoll(s)
    ? { name: s.name, width_in: s.width_in, is_roll: true, min_length_in: s.min_length_in, max_length_in: s.max_length_in, price_per_inch: s.price_per_inch, current: s.id === current.id }
    : { name: s.name, width_in: s.width_in, is_roll: false, length_in: s.height_in, price: s.price_per_sheet, current: s.id === current.id });

  let fits: StudioContext["fits"] = [];
  if (pieces.length > 0 && pieces.length <= MAX_ITEMS_FOR_FITS) {
    fits = shown.map((s) => ({ ...fitOn(s, pieces, input.edge, input.gap), current: s.id === current.id }));
  }

  // The shop's designs and the gallery are named s1…, g1…; their refs carry
  // what the builder needs to fetch them, prefixed so they never pass for an upload.
  const shop_designs = (input.shopDesigns ?? []).slice(0, MAX_SHOP).map((d, i) => {
    const ref = `s${i + 1}`;
    refs[ref] = `shop:${d.key}`;
    return { ref, name: d.name.slice(0, 80), ...(d.category ? { category: d.category.slice(0, 40) } : {}) };
  });
  const gallery = (input.gallery ?? []).slice(0, MAX_SHOP).map((d, i) => {
    const ref = `g${i + 1}`;
    refs[ref] = `gallery:${d.key}`;
    return { ref, name: d.name.slice(0, 80) };
  });

  return {
    refs,
    context: {
      sheet_name: current.name.slice(0, 80),
      sheet_width_in: current.width_in,
      sheet_length_in: input.currentLength,
      sheet_margin_in: Math.max(current.bleed_in, input.edge),
      min_sheet_margin_in: current.bleed_in,
      gap_between_designs_in: input.gap,
      sheet_count_ordered: Math.max(1, input.copiesOrdered),
      price_now: Number.isFinite(input.priceNow) ? r2(input.priceNow) : undefined,
      designs_on_sheet: pieces.length,
      designs,
      sizes,
      warnings: input.warnings,
      fits,
      shop_designs,
      gallery,
    },
  };
}
