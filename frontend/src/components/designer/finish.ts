/**
 * What finishing a design does, for one that was sent before (`remote`).
 *
 * Still the buyer's to change and buy (in a cart, not ordered): update it and
 * put it in the cart. Paid for and sent back by the print team for a change:
 * send the changes, not a new order. Gone, not this buyer's, or bought already
 * (and not sent back): it stays with its order, and this is a new design and a
 * new order.
 */
import type { TShirtDesignRecord } from "@/services/tshirtDesigns.service";

export interface FinishPlan {
  /** Update the design sent before, rather than make a new one. */
  keep: boolean;
  /** Into the cart, or the changes back to the print team. */
  finish: "cart" | "changes";
}

export function finishPlan(record: Pick<TShirtDesignRecord, "order_id" | "status"> | null | undefined): FinishPlan {
  if (!record) return { keep: false, finish: "cart" };
  if (record.order_id) {
    return record.status === "revision_requested" ? { keep: true, finish: "changes" } : { keep: false, finish: "cart" };
  }
  return { keep: record.status === "submitted", finish: "cart" };
}
