"use client";

/** The plans' prices in force, handed down from a marketing route (lib/planPrices). */
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_PLAN_PRICES, priceText, type PlanKey, type PlanPrices } from "@/lib/planPrices";

const Ctx = createContext<PlanPrices>(DEFAULT_PLAN_PRICES);

export function PlanPricesProvider({ prices, children }: { prices: PlanPrices; children: ReactNode }) {
  return <Ctx.Provider value={prices}>{children}</Ctx.Provider>;
}

/** Each plan's price in cents a month. */
export function usePlanCents(): PlanPrices {
  return useContext(Ctx);
}

/** Each plan's price as it reads: { starter: "$97", ... }. */
export function usePlanPrices(): Record<PlanKey, string> {
  const prices = useContext(Ctx);
  return {
    retail: priceText(prices.retail), starter: priceText(prices.starter),
    wholesale: priceText(prices.wholesale), scale: priceText(prices.scale),
  };
}
