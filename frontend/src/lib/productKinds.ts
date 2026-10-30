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

/**
 * What Add product offers first: the five kinds, and a stocked item once more
 * as "Wholesale bulk", sold on the bulk order form (products.bulk_order).
 * Bulk is not a kind of its own: it is stocked, with that page.
 */
export type ProductChoice = ProductKind | "bulk";

export const BULK_CHOICE = {
  title: "Wholesale bulk",
  blurb: "Blanks sold by the case. Buyers pick up to 10 colours and type a quantity for every size.",
};

export const ADD_CHOICES: { choice: ProductChoice; title: string; blurb: string }[] = [
  ...PRODUCT_KINDS.slice(0, 1).map((k) => ({ choice: k.kind as ProductChoice, title: k.title, blurb: k.blurb })),
  { choice: "bulk", ...BULK_CHOICE },
  ...PRODUCT_KINDS.slice(1).map((k) => ({ choice: k.kind as ProductChoice, title: k.title, blurb: k.blurb })),
];

/** What the bulk order form's colour cards show (products.bulk_cards). */
export const BULK_CARDS: { value: "pictures" | "swatches"; title: string; blurb: string }[] = [
  { value: "pictures", title: "Pictures", blurb: "Each colour's own picture, from the pictures given that colour. A colour without one shows its swatch." },
  { value: "swatches", title: "Swatches only", blurb: "Just the colour on every card, no pictures." },
];

/** The choice a product was made with: bulk when a stocked one is sold in bulk. */
export function choiceOf(p: Parameters<typeof kindOf>[0] & { bulk_order?: boolean | null }): ProductChoice {
  const kind = kindOf(p);
  return kind === "stocked" && p.bulk_order ? "bulk" : kind;
}

/** The kind behind a choice. */
export function kindOfChoice(choice: ProductChoice): ProductKind {
  return choice === "bulk" ? "stocked" : choice;
}

/** What a product is called in the admin: its kind, or "Wholesale bulk". */
export function kindWords(p: Parameters<typeof choiceOf>[0]): string {
  const choice = choiceOf(p);
  return choice === "bulk" ? BULK_CHOICE.title : KIND_WORDS[choice];
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
