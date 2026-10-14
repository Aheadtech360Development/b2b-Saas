/**
 * An order's thank-you page: its address, and what lets this browser open it.
 *
 * Every order used to land on /checkout/confirmed, one address for all of them,
 * drawn from what the browser had kept: a reload in a new tab sent the buyer to
 * an empty cart. Now each order has its own page, /checkout/thank-you/<number>,
 * read back from the server (backend services/order_view.py).
 *
 * A signed-in buyer is let in by their sign-in. A guest's checkout answers with
 * a view key, kept here and sent with the page's own request for the order. It
 * never goes in the page's address, where the shop's tracking tools collect
 * the URL.
 */
import type { LineConfiguration, OrderDiscountLine } from "@/types/order.types";

export interface ThankYouLine {
  name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  configuration: LineConfiguration | null;
  image_url: string | null;
  gang_sheet: boolean;
}

export interface ThankYouAddress {
  full_name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
}

export interface ThankYouOrder {
  order_number: string;
  created_at: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  first_name: string | null;
  email: string | null;
  company_name: string | null;
  po_number: string | null;
  items: ThankYouLine[];
  subtotal: number;
  discounts: OrderDiscountLine[];
  shipping_cost: number;
  tax_amount: number;
  tax_label: string | null;
  convenience_fee: number;
  total: number;
  shipping_method: string | null;
  carrier: string | null;
  courier_service: string | null;
  ship_to: ThankYouAddress | null;
  pickup: { name: string; address: string; hours: string; note: string } | null;
  has_gang_sheet: boolean;
}

const STORE = "pc_order_views";
// A thank-you page is for the days after an order; the account and the order
// email are for later. Fewer keys kept is less left on a shared computer.
const KEEP = 10;
const KEEP_MS = 30 * 86_400_000;

type Kept = Record<string, { key: string; at: number }>;

function kept(): Kept {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

export function thankYouPath(orderNumber: string): string {
  return `/checkout/thank-you/${encodeURIComponent(orderNumber)}`;
}

/** Keep a guest order's view key in this browser. */
export function rememberOrderKey(orderNumber: string, key: string | null | undefined): void {
  if (!key) return;
  try {
    const now = Date.now();
    const others = Object.entries(kept())
      .filter(([n, v]) => n !== orderNumber && v && typeof v.key === "string" && now - (v.at || 0) < KEEP_MS);
    // Always the newest, even beside a key saved in the same millisecond:
    // the oldest are the ones let go.
    const at = Math.max(now, ...others.map(([, v]) => (v.at || 0) + 1));
    const entries = [...others, [orderNumber, { key, at }] as const]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, KEEP);
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage refused: the page falls back to the sign-in, or to the email.
  }
}

/** Forget every order key in this browser: on signing out, so the next person
 *  at a shared computer cannot open the last buyer's orders from its history.
 *  Not on clearing the sign-in in general: a new tab clears it on every load,
 *  and the key is what opens the page there. */
export function forgetOrderKeys(): void {
  try {
    localStorage.removeItem(STORE);
  } catch {
    // Storage refused: there is nothing kept to forget.
  }
}

/** This browser's key for an order's page, or null. */
export function orderKey(orderNumber: string): string | null {
  const entry = kept()[orderNumber];
  if (!entry || typeof entry.key !== "string") return null;
  return Date.now() - (entry.at || 0) < KEEP_MS ? entry.key : null;
}
