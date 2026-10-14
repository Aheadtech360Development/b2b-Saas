"use client";

import { Chip, type Tone } from "./ui";

/** A commission line's state, as a chip in the design's colours. */
export const LINE_STATES: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warn" },
  payable: { label: "Payable", tone: "info" },
  paid: { label: "Paid", tone: "ok" },
  on_hold: { label: "On hold", tone: "mut" },
  clawback: { label: "Clawback", tone: "bad" },
  void: { label: "Void", tone: "mut" },
};

/** A referred shop's state. */
export const SHOP_STATES: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "ok" },
  trial: { label: "Trial", tone: "info" },
  past_due: { label: "Past due", tone: "warn" },
  canceled: { label: "Canceled", tone: "mut" },
  excluded: { label: "Not eligible", tone: "mut" },
};

export function LineChip({ state }: { state: string }) {
  const s = LINE_STATES[state] ?? { label: state, tone: "mut" as Tone };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function ShopChip({ state, trialEnded }: { state: string; trialEnded?: boolean }) {
  const s = SHOP_STATES[state] ?? { label: state, tone: "mut" as Tone };
  return <Chip tone={s.tone}>{state === "trial" && trialEnded ? "Trial ended" : s.label}</Chip>;
}

/** The chip a recent-activity row carries, by its state. */
export function ActivityChip({ state, label }: { state: string; label: string }) {
  const tone: Tone = state === "trial" ? "info" : state === "past_due" ? "warn"
    : (LINE_STATES[state]?.tone ?? "mut");
  return <Chip tone={tone}>{label}</Chip>;
}

export const METHODS = { paypal: "PayPal", wise: "Wise", bank: "Bank transfer" } as const;
