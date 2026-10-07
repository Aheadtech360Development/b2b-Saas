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

import { apiClient, ApiClientError } from "@/lib/api-client";
import { cartService } from "@/services/cart.service";

export const GUEST_CART_KEY = "af_guest_cart";
/** Lines taken out of the guest cart while they are being moved into an account. */
const ADOPTING_KEY = "af_guest_cart_adopting";

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
  /** The file this line is printed from, when the buyer supplied one. */
  artwork?: { url: string; file_name: string; file_type: string };
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
  // A built sheet is one job, not a stock line: saving it again replaces the
  // line (new price, new count) instead of adding its quantity on top.
  if (existing && line.gang_sheet_order_id) Object.assign(existing, line);
  else if (existing) existing.quantity += line.quantity;
  else cart.push(line);
  writeGuestCart(cart);
}

/** What the checkout sends for one line: the server prices it from this. */
export function guestCheckoutItem(line: GuestLine): {
  quantity: number; variant_id?: string; product_id?: string;
  selections?: Record<string, string>; gang_sheet_order_id?: string;
  artwork?: { url: string; file_name: string; file_type: string };
} {
  if (line.gang_sheet_order_id) {
    return { quantity: line.quantity, gang_sheet_order_id: line.gang_sheet_order_id };
  }
  if (line.selections) {
    return {
      quantity: line.quantity, product_id: line.product_id, selections: line.selections,
      ...(line.artwork ? { artwork: line.artwork } : {}),
    };
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

export interface AdoptResult {
  /** Lines now in the account's cart. */
  moved: number;
  /** Lines that can no longer be bought (gone, unpublished) — reported, not hidden. */
  dropped: GuestLine[];
}

let adopting: Promise<AdoptResult> | null = null;

function claimed(): { at: number; lines: GuestLine[] } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ADOPTING_KEY) || "null");
    return raw && Array.isArray(raw.lines) ? raw : null;
  } catch {
    return null;
  }
}

/** A refusal that will not change on a retry: the line itself cannot be bought. */
function definite(err: unknown): boolean {
  return err instanceof ApiClientError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429;
}

/**
 * Move this browser's guest cart into the account that just signed in.
 *
 * The first order needs an account, so every buyer arrives at checkout by way
 * of signing up — and until now the lines they had chosen as a guest stayed
 * behind in the browser while the cart switched to their (empty) account cart.
 * This carries every kind of line across, through the cart's own endpoints, so
 * prices and rules are the account's as for any other add.
 *
 * Safe to call more than once: lines are claimed before they are sent, so a
 * second tab finds nothing to add twice; anything that could not be sent for a
 * passing reason goes back to the guest cart for the next try.
 */
export function adoptGuestCart(): Promise<AdoptResult> {
  if (typeof window === "undefined") return Promise.resolve({ moved: 0, dropped: [] });
  if (adopting) return adopting;
  adopting = (async (): Promise<AdoptResult> => {
    const previous = claimed();
    // Another tab is moving lines right now: leave them to it.
    if (previous && Date.now() - previous.at < 120_000) return { moved: 0, dropped: [] };
    const lines = [...(previous?.lines ?? []), ...readGuestCart()];
    if (!lines.length) return { moved: 0, dropped: [] };
    try {
      localStorage.setItem(ADOPTING_KEY, JSON.stringify({ at: Date.now(), lines }));
    } catch { /* private mode: carry on without the claim */ }
    writeGuestCart([]);

    const retry: GuestLine[] = [];
    const dropped: GuestLine[] = [];
    let moved = 0;
    const one = async (line: GuestLine, send: () => Promise<unknown>) => {
      try { await send(); moved++; }
      catch (err) { (definite(err) ? dropped : retry).push(line); }
    };

    const stocked = new Map<string, GuestLine[]>();
    for (const line of lines) {
      if (line.gang_sheet_order_id) {
        await one(line, () => cartService.addGangSheet(line.gang_sheet_order_id!));
      } else if (line.selections) {
        await one(line, () => apiClient.post("/api/v1/cart/add-configured", {
          product_id: line.product_id, selections: line.selections, quantity: line.quantity,
          ...(line.artwork ? { artwork: line.artwork } : {}),
        }));
      } else if (line.product_id && line.variant_id) {
        stocked.set(line.product_id, [...(stocked.get(line.product_id) ?? []), line]);
      } else {
        dropped.push(line);
      }
    }
    for (const [productId, group] of stocked) {
      try {
        await cartService.addMatrix(productId, group.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })));
        moved += group.length;
      } catch {
        // One bad variant should not cost the others: try them one at a time.
        for (const line of group) {
          await one(line, () => cartService.addMatrix(productId, [{ variant_id: line.variant_id, quantity: line.quantity }]));
        }
      }
    }

    writeGuestCart([...retry, ...readGuestCart()]);
    try { localStorage.removeItem(ADOPTING_KEY); } catch { /* nothing to undo */ }
    if (moved) window.dispatchEvent(new Event("cart_updated"));
    return { moved, dropped };
  })().finally(() => { adopting = null; });
  return adopting;
}
