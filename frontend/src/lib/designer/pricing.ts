/**
 * What a design costs. Pure: the same inputs always give the same quote, so
 * the builder's live price and a server's charged price can be produced by
 * the same rules once this moves behind the API.
 *
 * Every piece in the order counts towards the quantity break, across products
 * and colours, which is how print shops quote a run.
 *
 * Each side is priced by what is on it: the shop sets a price per side for
 * uploaded artwork, for text and for graphics. A side with more than one of
 * them is one print, charged at the dearest. Names and numbers are priced per
 * shirt on the roster and add nothing to a side. The same rules as the server
 * (backend services/tshirt_designer.quote).
 */
import type { DecorationMethod, Garment, Quantities, RosterRow, SizeKey, ViewKey, ViewObjects } from "./types";

/** What a buyer can put on a shirt, each switched on or off by the shop. */
export type Service = "upload" | "text" | "graphics" | "names";
export const SERVICES: Service[] = ["upload", "text", "graphics", "names"];
/** The ones priced per side. */
export type SideService = Exclude<Service, "names">;
export const SIDE_SERVICES: SideService[] = ["upload", "text", "graphics"];
export const SERVICE_LABEL: Record<Service, string> = {
  upload: "Upload your own artwork",
  text: "Text",
  graphics: "Graphics",
  names: "Names and numbers",
};

export interface Tier {
  min: number;
  upload: number;
  text: number;
  graphics: number;
}

export interface PriceRates {
  print: Tier[];
  embroidery: Tier[];
  embroideryMinimum: number;
  sizeUpcharge: Partial<Record<SizeKey, number>>;
  name: number;
  number: number;
  /** Which services the shop offers. */
  offered: Record<Service, boolean>;
}

export const ALL_OFFERED: Record<Service, boolean> = { upload: true, text: true, graphics: true, names: true };
const same = (min: number, price: number): Tier => ({ min, upload: price, text: price, graphics: price });

/**
 * Demo rates. Placeholders until the shop sets its own in admin: they are not
 * any shop's real prices.
 */
export const DEMO_RATES: PriceRates = {
  print: [same(1, 8), same(12, 5.5), same(24, 4.25), same(48, 3.5), same(100, 2.75)],
  embroidery: [same(12, 9), same(24, 7.5), same(48, 6.25), same(100, 5)],
  embroideryMinimum: 12,
  sizeUpcharge: { "2XL": 2, "3XL": 3, "4XL": 4 },
  name: 4,
  number: 3,
  offered: ALL_OFFERED,
};

const TEXT_TYPES = new Set(["text", "textbox", "itext", "i-text"]);

/** Which service put an object on the shirt (the designer tags each one). */
export function serviceOf(o: Record<string, unknown>): Service {
  if (o.nn === "name" || o.nn === "number") return "names";
  if (o.kind === "image") return "upload";
  if (o.kind === "text") return "text";
  if (o.kind === "graphic") return "graphics";
  const t = String(o.type ?? "").toLowerCase();
  if (TEXT_TYPES.has(t)) return "text";
  return t === "image" ? "upload" : "graphics";
}

/** The services on one side, in SERVICES order. */
export function sideServices(objects: ViewObjects | undefined): Service[] {
  const found = new Set((objects ?? []).map(serviceOf));
  return SERVICES.filter((s) => found.has(s));
}

/** One side at this break: the dearest per-side service on it, and which.
 *  Without a list (an older caller), every per-side service counts. */
export function sidePrice(services: Service[] | undefined, tier: Tier): { price: number; service: SideService | null } {
  const list = services ?? SIDE_SERVICES;
  let best: { price: number; service: SideService | null } = { price: 0, service: null };
  for (const s of list) {
    if (s === "names") continue;
    if (best.service === null || tier[s] > best.price) best = { price: tier[s], service: s };
  }
  return best;
}

export interface QuoteLine {
  garmentId: string;
  colorId: string;
  size: SizeKey;
  qty: number;
  unit: number;
  subtotal: number;
}

export interface SidePriceLine {
  line: string;
  view: ViewKey;
  service: SideService | null;
  price: number;
}

export interface Quote {
  totalQty: number;
  /** The dearest side price at this break. */
  perSide: number;
  /** Each shirt's decoration for one piece, by `garmentId:colorId`. */
  decorationByLine: Record<string, number>;
  /** Every printed side of every shirt being ordered, and its price. */
  sidePrices: SidePriceLine[];
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
  /** What is on each side of each shirt, by `garmentId:colorId` then view.
   *  Without it, a side is charged at its dearest service. */
  servicesByLine?: Record<string, Partial<Record<ViewKey, Service[]>>>;
  quantities: Quantities;
  roster: RosterRow[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** What one blank piece costs in this colour and size; null when it is not on sale. */
export function piecePrice(g: Garment, colorId: string, size: SizeKey, rates: PriceRates): number | null {
  if (g.prices) return g.prices[`${colorId}|${size}`] ?? null;
  return g.basePrice + (rates.sizeUpcharge[size] ?? 0);
}

/** The shop's decoration prices as its API sends them (snake_case), for the designer. */
export interface RawTier { min: number; per_side?: number; upload?: number; text?: number; graphics?: number }

export function ratesFrom(raw: {
  print: RawTier[];
  embroidery: RawTier[];
  embroidery_minimum: number;
  name: number;
  number: number;
}, services?: Partial<Record<Service, boolean>> | null): PriceRates {
  // A row saved before each service had its own price gives all three the one.
  const tiers = (t: RawTier[]) => t.map((x) => ({
    min: x.min,
    upload: x.upload ?? x.per_side ?? 0,
    text: x.text ?? x.per_side ?? 0,
    graphics: x.graphics ?? x.per_side ?? 0,
  }));
  const offered = { ...ALL_OFFERED };
  for (const s of SERVICES) if (services?.[s] === false) offered[s] = false;
  return {
    print: tiers(raw.print), embroidery: tiers(raw.embroidery), embroideryMinimum: raw.embroidery_minimum,
    // A shop's sizes carry their own prices: nothing is added for a size.
    sizeUpcharge: {}, name: raw.name, number: raw.number, offered,
  };
}

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
  const { garments, rates, method, sides, sidesByLine, servicesByLine, roster } = input;
  const sidesOf = (line: string) => sidesByLine?.[line] ?? sides;
  const servicesOn = (line: string, view: ViewKey): Service[] | undefined => {
    if (!servicesByLine) return undefined;
    if (servicesByLine[line]) return servicesByLine[line]![view] ?? [];
    // Sizes for a shirt with no design of its own: what any shirt has there.
    const found = new Set(Object.values(servicesByLine).flatMap((v) => v[view] ?? []));
    return SERVICES.filter((s) => found.has(s));
  };
  /** One piece of a shirt's decoration at a break, and each side's part. */
  const decoration = (line: string, at: Tier) => {
    const parts = sidesOf(line).map((view) => ({ line, view, ...sidePrice(servicesOn(line, view), at) }));
    return { total: parts.reduce((n, p) => n + p.price, 0), parts };
  };
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
  const problems: string[] = [];
  const colourName = (g: Garment, cid: string) => g.colors.find((c) => c.id === cid)?.name ?? cid;
  const lines: QuoteLine[] = [];
  const decorationByLine: Record<string, number> = {};
  const sidePrices: SidePriceLine[] = [];
  for (const line of lineOrder) {
    const d = decoration(line, tier);
    decorationByLine[line] = cents(d.total);
    sidePrices.push(...d.parts);
  }
  for (const l of pending) {
    const g = garments[l.garmentId]!;
    const base = piecePrice(g, l.colorId, l.size, rates);
    // A size this colour is not sold in (the server refuses it the same way).
    if (base === null) {
      problems.push(`${g.name} in ${colourName(g, l.colorId)}, size ${l.size}, is not on sale. Remove it from your sizes.`);
      continue;
    }
    const unit = cents(base + (decorationByLine[`${l.garmentId}:${l.colorId}`] ?? 0));
    lines.push({ ...l, unit, subtotal: cents(unit * l.qty) });
  }

  const counted = new Set(Object.keys(quantities).filter((k) => garments[k.split(":")[0] ?? ""]));
  const personalization = cents(roster
    .filter((r) => counted.has(r.line))
    .reduce((sum, r) => sum + (r.name.trim() ? rates.name : 0) + (r.number.trim() ? rates.number : 0), 0));

  if (!sides.length) problems.unshift("Add artwork to at least one side.");
  // A shirt being ordered with nothing on it is almost always a mistake.
  const bare = sides.length ? lineOrder.filter((line) => !sidesOf(line).length) : [];
  for (const line of bare) {
    const [gid = "", cid = ""] = line.split(":");
    const g = garments[gid]!;
    problems.push(`Add artwork to the ${g.name} in ${colourName(g, cid)}, or remove its sizes.`);
  }
  if (!totalQty) problems.push("Add at least one size and quantity.");
  if (method === "embroidery") {
    for (const gid of new Set(pending.map((l) => l.garmentId))) {
      if (!garments[gid]!.embroidery) problems.push(`${garments[gid]!.name} is not embroidered here. Choose print for it.`);
    }
    if (totalQty > 0 && totalQty < rates.embroideryMinimum) {
      const more = rates.embroideryMinimum - totalQty;
      problems.push(`Embroidery starts at ${rates.embroideryMinimum} pieces. Add ${more} more to order.`);
    }
  }
  // Sizes kept for a product the shop no longer offers in the designer.
  if (Object.entries(quantities).some(([line, sizes]) => !garments[line.split(":")[0] ?? ""]
      && Object.values(sizes).some((n) => (n ?? 0) > 0))) {
    problems.push("A product in this design is no longer offered. Remove it and choose another.");
  }
  // What the shirts being ordered use, against what the shop offers.
  const used = new Set<Service>();
  for (const line of lineOrder) for (const v of sidesOf(line)) for (const s of servicesOn(line, v) ?? []) used.add(s);
  if (roster.some((r) => lineOrder.includes(r.line) && (r.name.trim() || r.number.trim()))) used.add("names");
  for (const s of SERVICES) {
    if (used.has(s) && rates.offered?.[s] === false) {
      problems.push(`${SERVICE_LABEL[s]} is not offered on this shop's shirts. Remove it from your design to order.`);
    }
  }

  // The same rule as the server's: nothing is priced while a problem stands.
  const ready = problems.length === 0;
  const total = ready ? cents(lines.reduce((s, l) => s + l.subtotal, 0) + personalization) : 0;

  // What the next break takes off the decoration, on average per piece.
  const decorationAt = (at: Tier) =>
    pending.reduce((n, l) => n + l.qty * decoration(`${l.garmentId}:${l.colorId}`, at).total, 0);
  const oneSideSaving = (at: Tier, nxt: Tier) => sidePrice(undefined, at).price - sidePrice(undefined, nxt).price;
  return {
    totalQty,
    perSide: Math.max(tier.upload, tier.text, tier.graphics),
    decorationByLine,
    sidePrices,
    lines,
    personalization,
    total,
    average: ready ? cents(total / totalQty) : 0,
    nextBreak: next && sides.length
      ? {
        qty: next.min,
        savingPerPiece: cents(totalQty
          ? (decorationAt(tier) - decorationAt(next)) / totalQty
          : oneSideSaving(tier, next) * sides.length),
      }
      : null,
    problems,
  };
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
