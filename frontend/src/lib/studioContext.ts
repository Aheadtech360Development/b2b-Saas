/**
 * The sheet as the builder's assistant is told about it.
 *
 * The assistant is a language model: good at asking and explaining, wrong to
 * trust with geometry or prices. So the builder works those out here, with the
 * same nesting the Auto Nest button uses, and sends the results along with each
 * question. The model reads them; it works nothing out.
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

export interface StudioPiece {
  /** Items that share a name and size are one design with several copies. */
  name: string;
  w_in: number;
  h_in: number;
  pxW?: number;
  pxH?: number;
  isImage: boolean;
  hasAlpha: boolean;
}

export interface StudioContext {
  sheet_name: string;
  sheet_width_in: number;
  sheet_length_in: number;
  safe_edge_in: number;
  gap_between_designs_in: number;
  sheet_count_ordered: number;
  price_now?: number;
  designs_on_sheet: number;
  designs: {
    name: string; width_in: number; height_in: number; copies: number;
    px_w?: number; px_h?: number; dpi?: number; has_background?: boolean;
  }[];
  warnings: { low_dpi: number; outside_safe_area: number; overlapping: number; very_small: number };
  fits: {
    size_name: string; width_in: number; length_in?: number; is_roll: boolean; fits_all: boolean;
    sheets_needed?: number; too_wide: number; fill_pct?: number; price?: number; current: boolean;
  }[];
}

export interface StudioInput {
  sizes: StudioSize[];
  current: StudioSize | undefined;
  currentLength: number;
  edge: number;
  gap: number;
  copiesOrdered: number;
  priceNow: number;
  pieces: StudioPiece[];
  warnings: StudioContext["warnings"];
}

// Past this the nesting runs once per size on every question; the answer would
// be slower than the question is worth, and the model is told it has no fits.
const MAX_ITEMS_FOR_FITS = 300;
const MAX_DESIGNS = 40;
const MAX_FITS = 12;

const r2 = (n: number) => Math.round(n * 100) / 100;

function dpiOf(p: StudioPiece): number | undefined {
  if (!p.isImage || !p.pxW || !p.pxH || p.w_in <= 0 || p.h_in <= 0) return undefined;
  return Math.floor(Math.min(p.pxW / p.w_in, p.pxH / p.h_in));
}

/** How the same designs would nest on one size, at this gap and edge. */
export function fitOn(
  size: StudioSize, pieces: StudioPiece[], edge: number, gap: number,
): StudioContext["fits"][number] {
  const isRoll = size.pricing_mode === "custom_length";
  const bleed = Math.max(size.bleed_in, edge);
  // A roll is cut to length, so the question is how long it must be: try it at
  // the longest it is sold and measure what the designs actually use.
  const length = isRoll ? size.max_length_in : size.height_in;
  const spec: Sheet = { width: size.width_in, length, bleed, gap, canGrow: false, maxLength: length };
  const items: NestItem[] = pieces.map((p, i) => ({ key: String(i), w: p.w_in, h: p.h_in }));
  const plan = planNest(spec, items);
  const fitsAll = plan.unplaceable.length === 0 && plan.sheets.length <= 1;
  const base = {
    size_name: size.name, width_in: size.width_in, is_roll: isRoll, fits_all: fitsAll,
    too_wide: plan.unplaceable.length,
  };
  if (isRoll) {
    if (!fitsAll) return { ...base, length_in: size.max_length_in, sheets_needed: plan.sheets.length, current: false };
    const used = plan.sheets[0]?.reduce((m, it) => Math.max(m, it.y + (it.rotated ? it.w : it.h)), 0) ?? 0;
    const need = Math.min(size.max_length_in, Math.max(size.min_length_in, Math.ceil(used + bleed)));
    return { ...base, length_in: need, sheets_needed: 1, price: r2(need * size.price_per_inch), current: false };
  }
  const n = plan.sheets.length;
  return {
    ...base, length_in: size.height_in, sheets_needed: n,
    fill_pct: plan.fill.length ? Math.round((plan.fill.reduce((a, b) => a + b, 0) / plan.fill.length) * 100) : 0,
    price: r2(size.price_per_sheet * Math.max(1, n)), current: false,
  };
}

export function buildStudioContext(input: StudioInput): StudioContext | null {
  const { current, pieces } = input;
  if (!current) return null;

  const groups = new Map<string, { piece: StudioPiece; copies: number }>();
  for (const p of pieces) {
    const k = `${p.name}|${p.w_in}|${p.h_in}`;
    const g = groups.get(k);
    if (g) g.copies += 1; else groups.set(k, { piece: p, copies: 1 });
  }
  const designs = [...groups.values()].slice(0, MAX_DESIGNS).map(({ piece: p, copies }) => ({
    name: p.name.slice(0, 80), width_in: r2(p.w_in), height_in: r2(p.h_in), copies,
    px_w: p.pxW || undefined, px_h: p.pxH || undefined, dpi: dpiOf(p),
    has_background: p.isImage ? !p.hasAlpha : undefined,
  }));

  let fits: StudioContext["fits"] = [];
  if (pieces.length > 0 && pieces.length <= MAX_ITEMS_FOR_FITS) {
    fits = input.sizes.slice(0, MAX_FITS).map((s) => ({ ...fitOn(s, pieces, input.edge, input.gap), current: s.id === current.id }));
  }

  return {
    sheet_name: current.name.slice(0, 80),
    sheet_width_in: current.width_in,
    sheet_length_in: input.currentLength,
    safe_edge_in: Math.max(current.bleed_in, input.edge),
    gap_between_designs_in: input.gap,
    sheet_count_ordered: Math.max(1, input.copiesOrdered),
    price_now: Number.isFinite(input.priceNow) ? r2(input.priceNow) : undefined,
    designs_on_sheet: pieces.length,
    designs,
    warnings: input.warnings,
    fits,
  };
}
