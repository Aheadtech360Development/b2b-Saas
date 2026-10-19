"use client";

/**
 * The moving parts of the marketing pages: the gang sheet savings calculator
 * (Home and Pricing), the FAQ lists, and the referral earnings calculator
 * (Partners). Ported from the design's own page logic, so the numbers and the
 * wording are the design's.
 */
import { useState, type ChangeEvent, type CSSProperties } from "react";

/**
 * The three plans as sold. The source of truth is BILLING_PLANS in
 * backend/app/core/billing_plans.py; keep these in step with it.
 */
export const PLANS = [
  { key: "starter", name: "Starter", fee: 97, commission: 2.8 },
  { key: "wholesale", name: "Wholesale", fee: 297, commission: 1.9 },
  { key: "scale", name: "Scale", fee: 497, commission: 1.3 },
] as const;

const FONT = "'Inter',system-ui,sans-serif";

/** A round toggle button, filled when it is the one picked. */
export function pillStyle(pressed: boolean, minWidth?: string): CSSProperties {
  return {
    minHeight: "44px",
    minWidth,
    padding: "0 20px",
    borderRadius: "999px",
    border: pressed ? "1px solid #0B66E4" : "1px solid #D5DCE6",
    background: pressed ? "#0B66E4" : "#FFFFFF",
    color: pressed ? "#FFFFFF" : "#0C1E35",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: FONT,
  };
}

const dollars = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** What a shop pays its current gang sheet app, against each plan. */
export function useSavingsCalculator() {
  const [sales, setSales] = useState(10000);
  const [rate, setRate] = useState(4);

  const costs = PLANS.map((p) => ({
    name: p.name,
    cost: p.fee + (sales * p.commission) / 100,
    be: "Cheaper above " + dollars(p.fee / ((rate - p.commission) / 100)) + " a month",
  }));
  const current = (sales * rate) / 100;
  const best = costs.reduce((a, b) => (b.cost < a.cost ? b : a));
  const diff = current - best.cost;

  return {
    salesValue: sales,
    salesLabel: dollars(sales),
    onSales: (e: ChangeEvent<HTMLInputElement>) => setSales(Number(e.target.value)),
    rates: [3, 4, 5].map((r) => ({
      label: r + "%",
      pressed: rate === r,
      pick: () => setRate(r),
      style: pillStyle(rate === r, "72px"),
    })),
    currentCost: dollars(current),
    bestName: best.name,
    bestCost: dollars(best.cost),
    verdict:
      diff > 0
        ? "You keep " + dollars(diff) + " a month on the " + best.name + " plan."
        : "At this volume your current app costs " + dollars(-diff) + " less. Compare the break even points below.",
    plans: costs.map((p) => ({
      name: p.name,
      be: p.be,
      cost: dollars(p.cost),
      rowStyle: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        padding: "12px 0",
        borderTop: "1px solid rgba(255,255,255,.14)",
        background: p.name === best.name ? "rgba(14,114,251,.12)" : undefined,
      } as CSSProperties,
    })),
  };
}

/** An accordion where one answer is open at a time, the first to begin with. */
export function useFaq(items: { q: string; a: string }[]) {
  const [open, setOpen] = useState(0);
  return items.map((f, i) => ({
    q: f.q,
    a: f.a,
    open: open === i,
    sign: open === i ? "−" : "+",
    toggle: () => setOpen(open === i ? -1 : i),
  }));
}

const cents = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** What a partner earns: 20% of the plan price of every shop they refer. */
export function useEarningsCalculator() {
  const [shops, setShops] = useState(5);
  const [plan, setPlan] = useState(1);
  const picked = PLANS[plan] ?? PLANS[1];
  const perShop = picked.fee * 0.2;
  const monthly = shops * perShop;

  return {
    shopsValue: shops,
    shopsLabel: String(shops),
    onShops: (e: ChangeEvent<HTMLInputElement>) => setShops(Number(e.target.value)),
    planBtns: PLANS.map((p, i) => ({
      label: p.name,
      pressed: plan === i,
      pick: () => setPlan(i),
      style: pillStyle(plan === i),
    })),
    planName: picked.name,
    perShop: cents(perShop),
    monthly: cents(monthly),
    yearly: cents(monthly * 12),
  };
}
