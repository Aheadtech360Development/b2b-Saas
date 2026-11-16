/**
 * "What happens next" on the order confirmation, made from the order's own
 * lines: a gang sheet, a design or an uploaded print gets the shop's artwork
 * check (there is no step where the buyer approves a proof, so none is
 * shown); something made to order is printed, a ready-made product is
 * packed; pickup ends in "ready to collect", shipping in a tracking link; a
 * gift card on its own is simply emailed.
 */
import type { ThankYouLine, ThankYouOrder } from "@/lib/orderThanks";

export interface Step { title: string; text: string }

export const isGiftLine = (l: ThankYouLine) => !!(l.configuration as { gift_card?: unknown } | null)?.gift_card;
const hasArtwork = (l: ThankYouLine) => {
  const c = (l.configuration ?? {}) as { tshirt_design?: unknown; artwork?: unknown };
  return l.gang_sheet || !!c.tshirt_design || !!c.artwork;
};
const madeToOrder = (l: ThankYouLine) => hasArtwork(l) || !!((l.configuration ?? {}) as { selections?: unknown }).selections;


/** What happens next for this order, from its own lines and delivery. */
export function nextSteps(o: Pick<ThankYouOrder, "items" | "shipping_method">): Step[] {
  const lines = o.items ?? [];
  const steps: Step[] = [{ title: "Order received", text: "Done" }];
  if (lines.length && lines.every(isGiftLine)) {
    steps.push({ title: "Gift card emailed", text: "It goes to the person you chose once your payment clears" });
    return steps;
  }
  if (lines.some(hasArtwork)) {
    steps.push({ title: "Artwork check", text: "The shop checks your files before printing" });
  }
  steps.push(lines.some(madeToOrder)
    ? { title: "In production", text: "We print and pack your order" }
    : { title: "Packing", text: "We pick and pack your order" });
  steps.push(o.shipping_method === "will_call"
    ? { title: "Ready for pickup", text: "We email you when it is ready to collect" }
    : { title: "Shipped", text: "You get a tracking link by email" });
  return steps;
}

/** How many of the steps are behind the order, from where it stands now. */
export function stepsDone(status: string, steps: Step[]): number {
  const s = (status || "").toLowerCase();
  if (s === "delivered") return steps.length;
  if (s === "shipped" || s === "ready_for_pickup") return steps.length - 1;
  if (s === "processing") return steps.findIndex((x) => x.title === "In production" || x.title === "Packing");
  return 1;
}

