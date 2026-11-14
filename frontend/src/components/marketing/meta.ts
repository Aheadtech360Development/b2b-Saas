/** What the browser tab and search results say for each page of printcopilot.co. Titles are the design's. */
import type { Metadata } from "next";
import { DEFAULT_PLAN_PRICES, priceText } from "@/lib/planPrices";

/** The Retail page's description, at the Retail price in force (cents a month). */
export function retailDescription(cents: number): string {
  return `A branded store with reviews, loyalty, gift cards, returns and order tracking built in. One plan, ${priceText(cents)} a month. 14 day free trial, no card needed.`;
}

export const MARKETING_META = {
  home: {
    title: "PrintCoPilot",
    description:
      "A storefront, a gang sheet builder, wholesale ordering and an AI copilot for print shops, DTF operators and apparel brands.",
  },
  features: {
    title: "PrintCoPilot Features",
    description: "Gang sheets, wholesale, storefront, orders, customers, an AI agent, suppliers and a mobile app, in one platform.",
  },
  retail: {
    title: "PrintCoPilot for D2C and retail brands",
    description: retailDescription(DEFAULT_PLAN_PRICES.retail),
  },
  pricing: {
    title: "PrintCoPilot Pricing",
    description: "One monthly price. Commission only on gang sheet orders. 14 day free trial, no card needed.",
  },
  demo: {
    title: "Book a PrintCoPilot demo",
    description: "See PrintCoPilot with your own business in mind.",
  },
  contact: {
    title: "Contact PrintCoPilot",
    description: "Questions about plans, setup or whether PrintCoPilot fits your shop.",
  },
  about: {
    title: "About PrintCoPilot",
    description: "Software built for how print and apparel businesses really work.",
  },
  partners: {
    title: "PrintCoPilot Affiliate and Partners",
    description: "Earn 20% for every shop you refer to PrintCoPilot.",
  },
  privacy: { title: "PrintCoPilot Privacy Policy" },
  terms: { title: "PrintCoPilot Terms of Service" },
  cookies: { title: "PrintCoPilot Cookie Policy" },
  affiliateTerms: { title: "PrintCoPilot Affiliate Terms" },
  dpa: { title: "PrintCoPilot Data Processing Addendum" },
} satisfies Record<string, Metadata>;
