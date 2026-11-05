/**
 * The plans' prices in force, read on the server for a marketing route
 * (lib/planPrices). A minute's cache: a price the super admin changes reaches
 * the website within a minute, and every visit does not ask the API again.
 * When the API does not answer the page still draws, at the shipped prices.
 */
import { DEFAULT_PLAN_PRICES, pricesFrom, type PlanPrices } from "@/lib/planPrices";

const API_BASE = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function loadPlanPrices(): Promise<PlanPrices> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/signup/plans`, { next: { revalidate: 60 } });
    if (!res.ok) return DEFAULT_PLAN_PRICES;
    const body = (await res.json()) as { plans?: { key: string; amount_cents: number }[] };
    return pricesFrom(body.plans);
  } catch {
    return DEFAULT_PLAN_PRICES;
  }
}
