/**
 * Which of a product's pictures show a colour, and the word between the buy
 * box and the gallery when a shopper picks one.
 *
 * A picture says its colour in its alt text: the S&S import writes
 * "Name - Colour" or "Name - Colour - Back" (services/suppliers/ss_products.py),
 * and a brand that uploads its own names the colour there. The older product
 * page reads it the same way (ProductDetailClient).
 *
 * The buy box (ThemeProductBuy) and the gallery (builder islands/Interactive)
 * are separate islands, so the choice travels as a window event.
 */

export const COLOUR_CHOSEN = "pc:colour-chosen";

export interface ColourChosen {
  productId: string;
  colour: string;
}

/** Tell the gallery of this product that a colour was picked. */
export function announceColour(productId: string, colour: string): void {
  if (typeof window === "undefined" || !productId || !colour) return;
  window.dispatchEvent(new CustomEvent<ColourChosen>(COLOUR_CHOSEN, { detail: { productId, colour } }));
}

/**
 * The pictures of one colour, in their order. A part of the alt text that is
 * the colour wins ("Black" is not "Black Heather"); failing that, any alt
 * text that mentions it, as the older product page matched. None: [].
 */
export function picturesOfColour<T extends { alt: string }>(pictures: T[], colour: string): T[] {
  const want = colour.trim().toLowerCase();
  if (!want) return [];
  const parts = (alt: string) => alt.toLowerCase().split(/\s+[-–—|/]\s+|\s*,\s*/).map((s) => s.trim());
  const exact = pictures.filter((p) => parts(p.alt || "").includes(want));
  if (exact.length) return exact;
  return pictures.filter((p) => (p.alt || "").toLowerCase().includes(want));
}
