/**
 * The plans' monthly prices on the platform's own website.
 *
 * The super admin sets them in the console (backend services/plan_prices); the
 * public /api/v1/signup/plans answers with the prices in force. A marketing
 * route reads them on the server (lib/planPricesServer) and hands them to its
 * page through PlanPricesProvider (lib/planPricesContext), so the page is drawn
 * with the real price from the start. Without a provider the shipped defaults
 * are used.
 *
 * No "use client" here: a server route calls these too.
 */
export type PlanKey = "retail" | "starter" | "wholesale" | "scale";
export type PlanPrices = Record<PlanKey, number>;   // cents a month

/** The prices the platform shipped with (BILLING_PLANS in backend/app/core/billing_plans.py). */
export const DEFAULT_PLAN_PRICES: PlanPrices = { retail: 7900, starter: 9700, wholesale: 29700, scale: 49700 };

/** "$97", or "$97.50" when it has cents. */
export function priceText(cents: number): string {
  return cents % 100 === 0
    ? `$${(cents / 100).toLocaleString("en-US")}`
    : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The prices from the API's plan list, the defaults for anything it leaves out. */
export function pricesFrom(plans: { key: string; amount_cents: number }[] | null | undefined): PlanPrices {
  const out: PlanPrices = { ...DEFAULT_PLAN_PRICES };
  for (const p of plans ?? []) {
    if (p.key in out && Number.isFinite(p.amount_cents) && p.amount_cents > 0) out[p.key as PlanKey] = p.amount_cents;
  }
  return out;
}
