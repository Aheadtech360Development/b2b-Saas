/**
 * The cart a shopper has before they have an account.
 *
 * It lives in this browser until checkout, which prices every line again on
 * the server. Two kinds of line: one the store stocks (a variant), and one
 * made from the options chosen on a product — a business card in a particular
 * stock and finish, which has no variant to point at.
 *
 * Every screen that touches the guest cart goes through here, so a line saved
 * by one of them reads the same everywhere else.
 */

export const GUEST_CART_KEY = "af_guest_cart";

export interface GuestLine {
  /** Identity of the line, and what dedupes it. A variant's id, or a key
   *  built from the product and what was chosen on it. */
  variant_id: string;
  quantity: number;
  product_id: string;
  product_name: string;
  slug: string;
  color: string | null;
  size: string | null;
  unit_price: number;
  image_url?: string | null;
  /** Set on a line made from options; the server prices it from these. */
  selections?: Record<string, string>;
}

/** The key that tells two configured lines apart: same choices, same line. */
export function configuredKey(productId: string, selections: Record<string, string>): string {
  const parts = Object.entries(selections).sort(([a], [b]) => a.localeCompare(b));
  return `cfg:${productId}:${parts.map(([k, v]) => `${k}=${v}`).join(",")}`;
}

export function readGuestCart(): GuestLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || "[]");
    return Array.isArray(raw) ? (raw as GuestLine[]) : [];
  } catch {
    return [];
  }
}

export function writeGuestCart(lines: GuestLine[]): void {
  try { localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines)); } catch { /* private mode */ }
  window.dispatchEvent(new Event("af_guest_cart_updated"));
}

export function addToGuestCart(line: GuestLine): void {
  const cart = readGuestCart();
  const existing = cart.find((i) => i.variant_id === line.variant_id);
  if (existing) existing.quantity += line.quantity;
  else cart.push(line);
  writeGuestCart(cart);
}

/** What the checkout sends for one line: the server prices it from this. */
export function guestCheckoutItem(line: GuestLine): {
  quantity: number; variant_id?: string; product_id?: string; selections?: Record<string, string>;
} {
  if (line.selections) {
    return { quantity: line.quantity, product_id: line.product_id, selections: line.selections };
  }
  return { quantity: line.quantity, variant_id: line.variant_id };
}
