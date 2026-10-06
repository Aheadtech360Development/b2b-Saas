/**
 * How an order page words its discounts — the admin's and the buyer's say the
 * same thing. The lines come from the order endpoints' `discounts`
 * (backend services/order_money.py).
 */
import type { OrderDiscountLine } from "@/types/order.types";

/** "Discount (SAVE90 · 90% off)"; with no code recorded, just "Discount". */
export function discountLabel(d: OrderDiscountLine): string {
  return d.code ? `Discount (${d.label})` : d.label;
}

/** "−$6.62". A free-shipping code takes nothing off the items: it says so. */
export function discountAmount(d: OrderDiscountLine): string {
  if (d.amount > 0) return `−$${d.amount.toFixed(2)}`;
  return d.type === "free_shipping" ? "Free shipping" : "$0.00";
}
