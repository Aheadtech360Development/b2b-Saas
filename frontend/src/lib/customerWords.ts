/**
 * The words and colours a customer is shown with, the same on the list and on
 * a customer's page.
 */
import type { CustomerKind } from "@/services/customers.service";

export const KIND_LABEL: Record<CustomerKind, string> = { retail: "Retail", wholesale: "Wholesale", guest: "Guest" };
export const KIND_TONE: Record<CustomerKind, string> = { retail: "green", wholesale: "blue", guest: "" };

/** [label, pill tone] for an account's status; a guest has no account. */
export const STATUS_PILL: Record<string, [string, string]> = {
  active: ["Active", "green"],
  pending: ["Pending", "amber"],
  suspended: ["Suspended", "red"],
  rejected: ["Rejected", "red"],
  guest: ["No account", ""],
};

/** An order's own status, as the order list says it. */
export const ORDER_PILL: Record<string, [string, string]> = {
  pending: ["Pending", "amber"],
  confirmed: ["Confirmed", "blue"],
  processing: ["Processing", "blue"],
  ready_for_pickup: ["Ready for pickup", "blue"],
  shipped: ["Shipped", "green"],
  delivered: ["Delivered", "green"],
  cancelled: ["Cancelled", "red"],
  refunded: ["Refunded", "red"],
};

export const ROLE_LABEL: Record<string, string> = { owner: "Owner", buyer: "Buyer", viewer: "Viewer", finance: "Finance" };

export const money = (n: number | null | undefined) =>
  `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/** A stored word made readable: "screen_printer" → "Screen printer". */
export const words = (s: string | null | undefined) => {
  const t = (s ?? "").replace(/_/g, " ").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : "";
};
