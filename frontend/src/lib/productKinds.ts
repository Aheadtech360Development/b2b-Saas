/**
 * The five kinds of product a shop sells, named once.
 *
 * A kind is read from the fields that already decide how a product is sold
 * (services/product_catalog.kind_of on the server says the same): the stocked
 * matrix or made-to-order questions (pricing_mode), or one of the three gang
 * sheet builders (gang_sheet_enabled + gang_sheet_type).
 */
export type ProductKind = "stocked" | "made" | "gang_sheet" | "upload_by_size" | "upload_own";

export const PRODUCT_KINDS: { kind: ProductKind; title: string; blurb: string }[] = [
  { kind: "stocked", title: "Stocked item", blurb: "Apparel and blanks. Colour by size, own SKU and stock count." },
  { kind: "made", title: "Made to order", blurb: "Business cards, yard signs, banners. Questions, choices and price breaks." },
  { kind: "gang_sheet", title: "Gang sheet", blurb: "Buyers build a sheet in the builder. You set sizes and prices." },
  { kind: "upload_by_size", title: "Upload by size", blurb: "Buyer uploads one design and picks a size, like DTF transfers." },
  { kind: "upload_own", title: "Upload your own sheet", blurb: "Buyer uploads a print ready gang sheet file." },
];

export const KIND_WORDS: Record<ProductKind, string> = {
  stocked: "Stocked", made: "Made to order", gang_sheet: "Gang sheet",
  upload_by_size: "Upload by size", upload_own: "Upload your own sheet",
};

export function kindOf(p: { pricing_mode?: string | null; gang_sheet_enabled?: boolean | null; gang_sheet_type?: string | null }): ProductKind {
  if (p.gang_sheet_enabled) {
    return p.gang_sheet_type === "upload_by_size" || p.gang_sheet_type === "upload_own" ? p.gang_sheet_type : "gang_sheet";
  }
  return p.pricing_mode === "configurable" ? "made" : "stocked";
}

/** What creating a product of this kind writes. A sheet kind is set on the
 *  builder right after (Gang sheets → Products is where it always lived). */
export function kindFields(kind: ProductKind): { pricing_mode: "variant" | "configurable"; gang_sheet_type: string | null } {
  if (kind === "made") return { pricing_mode: "configurable", gang_sheet_type: null };
  if (kind === "stocked") return { pricing_mode: "variant", gang_sheet_type: null };
  return { pricing_mode: "variant", gang_sheet_type: kind };
}

/** Only stocked apparel has these fields; the editor leaves them out for the rest. */
export const APPAREL_FIELDS_NOTE = "Gender, fabric, size chart, care instructions and print methods only show for stocked apparel.";

export const STATUS_PILL: Record<string, [string, string]> = {
  active: ["Active", "green"], draft: ["Draft", ""], archived: ["Archived", "red"],
};

export function priceFromWords(p: { amount: number; per: string } | null | undefined): string {
  if (!p) return "–";
  const money = p.amount < 1 ? `$${p.amount.toFixed(p.amount < 0.1 ? 4 : 2).replace(/0+$/, "").replace(/\.$/, ".00")}` : `$${p.amount.toFixed(2)}`;
  return p.per === "item" ? money : `${money} / ${p.per}`;
}
