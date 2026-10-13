/**
 * The shop's standard shipping rate, as the settings screen shows it and as
 * the checkout reads it (the `standard_shipping` setting).
 *
 * The checkout knows three shapes: one price (`store_default`), live carrier
 * rates (`live_shippo`), and steps by order size (`flat_rate` with brackets).
 * "One price, free above an amount" is not a fourth: it is saved as two
 * order-value steps, the price up to a cent under the amount and nothing from
 * the amount up, so every place that already prices an order reads it right
 * without learning a new rule. Each step carries its own upper end because
 * one of those places takes the first step that fits, in the order saved.
 */
export interface Bracket {
  min_units: number;
  max_units: number | null;
  min_order_value: number | null;
  max_order_value: number | null;
  cost: number;
}
export type RateMode = "flat" | "live" | "steps";
export type RateCalc = "units" | "order_value";

export interface StandardRate {
  mode: RateMode;
  /** One price, for "flat". */
  amount: number;
  /** Orders of this much or more ship free; 0 for no such rule. "flat" only. */
  freeOver: number;
  calc: RateCalc;
  steps: Bracket[];
}

interface Saved {
  shipping_type?: string;
  shipping_amount?: number | string;
  calc_type?: string;
  brackets?: Bracket[];
  cutoff_time?: string;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** A saved pair of steps that is "one price, free above an amount". */
function asFreeAbove(cfg: Saved): { amount: number; over: number } | null {
  if (cfg.shipping_type !== "flat_rate" || cfg.calc_type !== "order_value" || cfg.brackets?.length !== 2) return null;
  const [low, high] = [...cfg.brackets].sort((a, b) => (a.min_order_value ?? 0) - (b.min_order_value ?? 0)) as [Bracket, Bracket];
  const over = Number(high.min_order_value ?? 0);
  const fits = Number(low.min_order_value ?? 0) === 0 && Number(low.cost) > 0 && over > 0 && Number(high.cost) === 0
    && high.max_order_value == null && (low.max_order_value == null || Math.abs(Number(low.max_order_value) - (over - 0.01)) < 0.011);
  return fits ? { amount: Number(low.cost), over } : null;
}

/** What is saved, as the screen shows it. Nothing saved is one price of 0. */
export function readRate(cfg: Saved | null | undefined): StandardRate {
  const calc: RateCalc = cfg?.calc_type === "units" ? "units" : "order_value";
  const base: StandardRate = { mode: "flat", amount: 0, freeOver: 0, calc, steps: [] };
  if (!cfg) return base;
  const pair = asFreeAbove(cfg);
  if (pair) return { ...base, calc: "order_value", amount: pair.amount, freeOver: pair.over };
  if (cfg.shipping_type === "live_shippo") return { ...base, mode: "live" };
  if (cfg.shipping_type === "flat_rate") return { ...base, mode: "steps", steps: Array.isArray(cfg.brackets) ? cfg.brackets : [] };
  return { ...base, amount: Number(cfg.shipping_amount ?? 0) || 0 };
}

/** What to save for a rate. `keep` carries what the screen does not show. */
export function writeRate(rate: StandardRate, keep: { cutoff_time?: string } = {}): Required<Saved> {
  const cutoff_time = keep.cutoff_time ?? "";
  if (rate.mode === "live") return { shipping_type: "live_shippo", shipping_amount: 0, calc_type: rate.calc, brackets: [], cutoff_time };
  if (rate.mode === "steps") return { shipping_type: "flat_rate", shipping_amount: 0, calc_type: rate.calc, brackets: rate.steps, cutoff_time };
  if (rate.freeOver > 0.01 && rate.amount > 0) {
    const none = { min_units: 0, max_units: null };
    return {
      shipping_type: "flat_rate", shipping_amount: 0, calc_type: "order_value", cutoff_time,
      brackets: [
        { ...none, min_order_value: 0, max_order_value: cents(rate.freeOver - 0.01), cost: rate.amount },
        { ...none, min_order_value: rate.freeOver, max_order_value: null, cost: 0 },
      ],
    };
  }
  return { shipping_type: "store_default", shipping_amount: rate.amount, calc_type: rate.calc, brackets: [], cutoff_time };
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The rate in a few words, for the table's row. */
export function rateWords(rate: StandardRate): string {
  if (rate.mode === "live") return "Live carrier rates";
  if (rate.mode === "steps") return `${rate.steps.length} ${rate.steps.length === 1 ? "step" : "steps"} by ${rate.calc === "units" ? "units" : "order value"}`;
  if (rate.amount <= 0) return "Free";
  return `${money(rate.amount)} an order${rate.freeOver > 0.01 ? `, free over ${money(rate.freeOver)}` : ""}`;
}
