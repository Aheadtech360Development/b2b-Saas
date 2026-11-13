/**
 * A page of printcopilot.co, drawn from the design exactly as it was made: its
 * own CSS and markup (generated into ./pages), with the numbers filled in here
 * on the server so they are never out of date:
 *
 *   %%PRICE:<plan>%%   the plan price the super admin set (lib/planPricesServer)
 *   %%RATE%% %%EARN:<plan>%% %%EARN:total%% %%HOLD%% %%MINPAY%% %%COOKIE%%
 *                      the partner program's own settings (affiliate page)
 *
 * The forms, the help search and a partner's ?ref= link are handled in the
 * browser by SiteWire. Only drawn on the platform's own address: each route
 * checks there is no shop first.
 */
import { ReferralCapture } from "@/components/partners/ReferralCapture";
import { priceText, type PlanPrices } from "@/lib/planPrices";
import { loadPlanPrices } from "@/lib/planPricesServer";
import { loadSitePage, type SiteKey } from "./registry";
import SiteWire from "./SiteWire";

const API_BASE = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PLANS = ["retail", "starter", "wholesale", "scale"] as const;

export interface ProgramNumbers {
  rateBps: number;
  rateText: string;
  holdDays: number;
  minimumPayoutCents: number;
  cookieDays: number;
}

/** What the design says today, used when the program cannot be read. */
export const PROGRAM_DEFAULTS: ProgramNumbers = {
  rateBps: 2000, rateText: "20%", holdDays: 30, minimumPayoutCents: 5000, cookieDays: 90,
};

async function loadProgram(): Promise<ProgramNumbers> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/partners/program`, { next: { revalidate: 60 } });
    if (!res.ok) return PROGRAM_DEFAULTS;
    const p = (await res.json()) as {
      standard_rate_bps?: number; standard_rate?: string; hold_days?: number;
      minimum_payout_cents?: number; cookie_days?: number;
    };
    return {
      rateBps: p.standard_rate_bps ?? PROGRAM_DEFAULTS.rateBps,
      rateText: p.standard_rate ?? PROGRAM_DEFAULTS.rateText,
      holdDays: p.hold_days ?? PROGRAM_DEFAULTS.holdDays,
      minimumPayoutCents: p.minimum_payout_cents ?? PROGRAM_DEFAULTS.minimumPayoutCents,
      cookieDays: p.cookie_days ?? PROGRAM_DEFAULTS.cookieDays,
    };
  } catch {
    return PROGRAM_DEFAULTS;
  }
}

const cents2 = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The design's markup with every number in force. Exported for the tests. */
export function fillNumbers(html: string, prices: PlanPrices, program: ProgramNumbers | null): string {
  let out = html.replace(/%%PRICE:(retail|starter|wholesale|scale)%%/g, (_, plan: keyof PlanPrices) => priceText(prices[plan]));
  if (program) {
    const earn = (plan: (typeof PLANS)[number]) => Math.round((prices[plan] * program.rateBps) / 10000);
    const total = PLANS.reduce((sum, plan) => sum + earn(plan), 0);
    out = out
      .replace(/%%EARN:(retail|starter|wholesale|scale)%%/g, (_, plan: (typeof PLANS)[number]) => cents2(earn(plan)))
      .replace(/%%EARN:total%%/g, cents2(total))
      .replace(/%%RATE%%/g, program.rateText)
      .replace(/%%HOLD%%/g, String(program.holdDays))
      .replace(/%%MINPAY%%/g, priceText(program.minimumPayoutCents))
      .replace(/%%COOKIE%%/g, String(program.cookieDays));
  }
  return out;
}

export default async function SitePage({ page }: { page: SiteKey }) {
  const [data, prices, program] = await Promise.all([
    loadSitePage(page),
    loadPlanPrices(),
    page === "affiliate" ? loadProgram() : Promise.resolve(null),
  ]);
  return (
    <>
      {/* Outfit and Inter, the design's two faces. React hoists this into <head>. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600&display=swap"
        precedence="default"
      />
      {/* The page's own stylesheet, as designed. Inline, so it leaves with the page. */}
      <style dangerouslySetInnerHTML={{ __html: data.css }} />
      {/* A partner's link (?ref=CODE) counts on any page it lands on. */}
      <ReferralCapture />
      <div id="pc-site" dangerouslySetInnerHTML={{ __html: fillNumbers(data.html, prices, program) }} />
      <SiteWire page={page} />
    </>
  );
}
