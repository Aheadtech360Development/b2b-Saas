/** Marketing → Upsells, the admin's side: an offer as the list shows it, and
 *  when it shows, in words (services/upsells on the server). */
import { formatCurrency } from "@/lib/utils";

export interface UpsellRow {
  id: string;
  name: string;
  is_active: boolean;
  priority: number;
  product_id: string;
  product_name: string;
  product_image: string | null;
  ready_made: boolean;
  variant_id: string | null;
  variant_label: string | null;
  headline: string | null;
  description: string | null;
  discount_type: "none" | "percent" | "amount";
  discount_value: string;
  discount_words: string | null;
  trigger_kind: "any" | "products" | "collections";
  trigger_ids: string[];
  min_subtotal: string | null;
  max_subtotal: string | null;
  orders: number;
  revenue: string;
}

/** When the offer shows, in words. */
export function whenWords(o: Pick<UpsellRow, "trigger_kind" | "trigger_ids" | "min_subtotal" | "max_subtotal">): string {
  const n = o.trigger_ids.length;
  const base = o.trigger_kind === "products" ? `Cart has ${n === 1 ? "a chosen product" : `one of ${n} products`}`
    : o.trigger_kind === "collections" ? `Cart has a product from ${n === 1 ? "a chosen collection" : `${n} collections`}`
    : "Every cart";
  const lo = o.min_subtotal != null ? formatCurrency(Number(o.min_subtotal)) : null;
  const hi = o.max_subtotal != null ? formatCurrency(Number(o.max_subtotal)) : null;
  const range = lo && hi ? `, ${lo} to ${hi}` : lo ? `, ${lo} or more` : hi ? `, up to ${hi}` : "";
  return base + range;
}

