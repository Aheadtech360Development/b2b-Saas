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
  /** Set on a gang sheet the buyer already built; it carries its own price. */
  gang_sheet_order_id?: string;
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
  quantity: number; variant_id?: string; product_id?: string;
  selections?: Record<string, string>; gang_sheet_order_id?: string;
} {
  if (line.gang_sheet_order_id) {
    return { quantity: line.quantity, gang_sheet_order_id: line.gang_sheet_order_id };
  }
  if (line.selections) {
    return { quantity: line.quantity, product_id: line.product_id, selections: line.selections };
  }
  return { quantity: line.quantity, variant_id: line.variant_id };
}

/** A built gang sheet, as a line in the cart a guest already has. */
export function gangSheetLine(job: {
  id: string; reference: string; sheet_name: string; price_per_sheet: number | string;
  sheet_quantity: number;
}): GuestLine {
  return {
    variant_id: `gs:${job.id}`,
    quantity: job.sheet_quantity || 1,
    product_id: "",
    product_name: `Gang Sheet ${job.reference} — ${job.sheet_name}`,
    slug: "",
    color: null,
    size: null,
    unit_price: Number(job.price_per_sheet) || 0,
    gang_sheet_order_id: job.id,
  };
}
