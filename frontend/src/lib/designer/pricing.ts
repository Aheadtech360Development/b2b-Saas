/**
 * What a design costs. Pure: the same inputs always give the same quote, so
 * the builder's live price and a server's charged price can be produced by
 * the same rules once this moves behind the API.
 *
 * Every piece in the order counts towards the quantity break, across products
 * and colours, which is how print shops quote a run.
 */
import type { DecorationMethod, Garment, Quantities, RosterRow, SizeKey, ViewKey } from "./types";

export interface Tier {
  min: number;
  perSide: number;
}

export interface PriceRates {
  print: Tier[];
  embroidery: Tier[];
  embroideryMinimum: number;
  sizeUpcharge: Partial<Record<SizeKey, number>>;
  name: number;
  number: number;
}

/**
 * Demo rates. Placeholders until the shop sets its own in admin: they are not
 * any shop's real prices.
 */
export const DEMO_RATES: PriceRates = {
  print: [
    { min: 1, perSide: 8 },
    { min: 12, perSide: 5.5 },
    { min: 24, perSide: 4.25 },
    { min: 48, perSide: 3.5 },
    { min: 100, perSide: 2.75 },
  ],
  embroidery: [
    { min: 12, perSide: 9 },
    { min: 24, perSide: 7.5 },
    { min: 48, perSide: 6.25 },
    { min: 100, perSide: 5 },
  ],
  embroideryMinimum: 12,
  sizeUpcharge: { "2XL": 2, "3XL": 3, "4XL": 4 },
  name: 4,
  number: 3,
};

export interface QuoteLine {
  garmentId: string;
  colorId: string;
  size: SizeKey;
  qty: number;
  unit: number;
  subtotal: number;
}

export interface Quote {
  totalQty: number;
  perSide: number;
  lines: QuoteLine[];
  personalization: number;
  total: number;
  /** Average per piece, personalization included. */
  average: number;
  nextBreak: { qty: number; savingPerPiece: number } | null;
  problems: string[];
}

export interface QuoteInput {
  garments: Record<string, Garment>;
  rates: PriceRates;
  method: DecorationMethod;
  /** Views with artwork on them, on any shirt. */
  sides: ViewKey[];
  /**
   * Each shirt's own printed views, by `garmentId:colorId`. Shirts are designed
   * one by one, so each is charged for the sides it has. Without it, every
   * shirt is charged for `sides`.
   */
  sidesByLine?: Record<string, ViewKey[]>;
  quantities: Quantities;
  roster: RosterRow[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

function tierFor(tiers: Tier[], qty: number): { tier: Tier; next: Tier | null } {
  let i = 0;
  while (i + 1 < tiers.length && qty >= tiers[i + 1]!.min) i++;
  return { tier: tiers[i]!, next: tiers[i + 1] ?? null };
}

/** Grid quantities, raised so every roster shirt is counted. */
export function effectiveQuantities(quantities: Quantities, roster: RosterRow[]): Quantities {
  const out: Quantities = {};
  for (const [line, sizes] of Object.entries(quantities)) out[line] = { ...sizes };
  const counts: Record<string, Partial<Record<SizeKey, number>>> = {};
  for (const r of roster) {
    const c = (counts[r.line] ??= {});
    c[r.size] = (c[r.size] ?? 0) + 1;
  }
  for (const [line, sizes] of Object.entries(counts)) {
    const row = (out[line] ??= {});
    for (const [size, n] of Object.entries(sizes) as [SizeKey, number][]) {
      row[size] = Math.max(row[size] ?? 0, n);
    }
  }
  return out;
}

export function quote(input: QuoteInput): Quote {
  const { garments, rates, method, sides, sidesByLine, roster } = input;
  const sidesOf = (line: string) => sidesByLine?.[line] ?? sides;
  const quantities = effectiveQuantities(input.quantities, roster);

  const pending: Omit<QuoteLine, "unit" | "subtotal">[] = [];
  for (const [line, sizes] of Object.entries(quantities)) {
    const [garmentId = "", colorId = ""] = line.split(":");
    if (!garments[garmentId]) continue;
    for (const [size, qty] of Object.entries(sizes) as [SizeKey, number][]) {
      if (qty > 0) pending.push({ garmentId, colorId, size, qty });
    }
  }
  // In the order the garment lists its sizes, so XS comes before 2XL.
  const lineOrder = [...new Set(pending.map((l) => `${l.garmentId}:${l.colorId}`))];
  const rank = (l: (typeof pending)[number]) =>
    lineOrder.indexOf(`${l.garmentId}:${l.colorId}`) * 100 + garments[l.garmentId]!.sizes.indexOf(l.size);
  pending.sort((a, b) => rank(a) - rank(b));
  const totalQty = pending.reduce((n, l) => n + l.qty, 0);

  const tiers = method === "embroidery" ? rates.embroidery : rates.print;
  const { tier, next } = tierFor(tiers, totalQty);
  const lines: QuoteLine[] = pending.map((l) => {
    const decoration = sidesOf(`${l.garmentId}:${l.colorId}`).length * tier.perSide;
    const unit = cents(garments[l.garmentId]!.basePrice + (rates.sizeUpcharge[l.size] ?? 0) + decoration);
    return { ...l, unit, subtotal: cents(unit * l.qty) };
  });

  const counted = new Set(Object.keys(quantities).filter((k) => garments[k.split(":")[0] ?? ""]));
  const personalization = cents(roster
    .filter((r) => counted.has(r.line))
    .reduce((sum, r) => sum + (r.name.trim() ? rates.name : 0) + (r.number.trim() ? rates.number : 0), 0));

  const problems: string[] = [];
  if (!sides.length) problems.push("Add artwork to at least one side.");
  // A shirt being ordered with nothing on it is almost always a mistake.
  const bare = sides.length ? lineOrder.filter((line) => !sidesOf(line).length) : [];
  for (const line of bare) {
    const [gid = "", cid = ""] = line.split(":");
    const g = garments[gid]!;
    problems.push(`Add artwork to the ${g.name} in ${g.colors.find((c) => c.id === cid)?.name ?? cid}, or remove its sizes.`);
  }
  if (!totalQty) problems.push("Add at least one size and quantity.");
  if (method === "embroidery" && totalQty > 0 && totalQty < rates.embroideryMinimum) {
    const more = rates.embroideryMinimum - totalQty;
    problems.push(`Embroidery starts at ${rates.embroideryMinimum} pieces. Add ${more} more to order.`);
  }

  const ready = sides.length > 0 && totalQty > 0 && bare.length === 0;
  const total = ready ? cents(lines.reduce((s, l) => s + l.subtotal, 0) + personalization) : 0;

  return {
    totalQty,
    perSide: tier.perSide,
    lines,
    personalization,
    total,
    average: ready ? cents(total / totalQty) : 0,
    // Shirts print different numbers of sides: the saving is the average per piece.
    nextBreak: next && sides.length
      ? {
        qty: next.min,
        savingPerPiece: cents((tier.perSide - next.perSide) * (totalQty
          ? pending.reduce((n, l) => n + l.qty * sidesOf(`${l.garmentId}:${l.colorId}`).length, 0) / totalQty
          : sides.length)),
      }
      : null,
    problems,
  };
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
