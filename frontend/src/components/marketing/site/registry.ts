/**
 * printcopilot.co: which page of the design each address is, and what it says
 * in a browser tab and in search results.
 *
 * The pages themselves are generated from the design folder (printcopilot-site/)
 * by frontend/scripts/import-marketing-site.py into ./pages; each is loaded only
 * by the route that shows it.
 */
import type { Metadata } from "next";

export type SiteKey =
  | "home" | "features" | "pricing" | "demo" | "contact" | "about" | "affiliate" | "blog"
  | "blog-online-brand-app-stack" | "blog-sell-dtf-gang-sheets-online" | "blog-tiered-wholesale-pricing-blank-apparel"
  | "brands" | "dtf" | "examples" | "help" | "print-shops" | "wholesale";

export interface SitePageData {
  title: string;
  description: string;
  css: string;
  html: string;
  path: string;
}

/** The single-word addresses the shops' catch-all route hands to the site on printcopilot.co. */
export const SITE_SLUG_PAGES: Record<string, SiteKey> = {
  brands: "brands", dtf: "dtf", examples: "examples", help: "help", "print-shops": "print-shops", wholesale: "wholesale",
};

/** /blog/<slug> on printcopilot.co. */
export const SITE_BLOG_POSTS: Record<string, SiteKey> = {
  "online-brand-app-stack": "blog-online-brand-app-stack",
  "sell-dtf-gang-sheets-online": "blog-sell-dtf-gang-sheets-online",
  "tiered-wholesale-pricing-blank-apparel": "blog-tiered-wholesale-pricing-blank-apparel",
};

/** The design page at /<slug> on printcopilot.co, or null. Own keys only:
 *  an address like /constructor must not find something of Object's. */
export function siteSlugPage(slug: string): SiteKey | null {
  return Object.prototype.hasOwnProperty.call(SITE_SLUG_PAGES, slug) ? (SITE_SLUG_PAGES[slug] ?? null) : null;
}

/** The design's post at /blog/<slug> on printcopilot.co, or null. */
export function siteBlogPost(slug: string): SiteKey | null {
  return Object.prototype.hasOwnProperty.call(SITE_BLOG_POSTS, slug) ? (SITE_BLOG_POSTS[slug] ?? null) : null;
}

const LOADERS: Record<SiteKey, () => Promise<{ default: SitePageData }>> = {
  home: () => import("./pages/home"),
  features: () => import("./pages/features"),
  pricing: () => import("./pages/pricing"),
  demo: () => import("./pages/demo"),
  contact: () => import("./pages/contact"),
  about: () => import("./pages/about"),
  affiliate: () => import("./pages/affiliate"),
  blog: () => import("./pages/blog"),
  "blog-online-brand-app-stack": () => import("./pages/blog-online-brand-app-stack"),
  "blog-sell-dtf-gang-sheets-online": () => import("./pages/blog-sell-dtf-gang-sheets-online"),
  "blog-tiered-wholesale-pricing-blank-apparel": () => import("./pages/blog-tiered-wholesale-pricing-blank-apparel"),
  brands: () => import("./pages/brands"),
  dtf: () => import("./pages/dtf"),
  examples: () => import("./pages/examples"),
  help: () => import("./pages/help"),
  "print-shops": () => import("./pages/print-shops"),
  wholesale: () => import("./pages/wholesale"),
};

export async function loadSitePage(key: SiteKey): Promise<SitePageData> {
  return (await LOADERS[key]()).default;
}

/** Search descriptions: the design gives titles only. Said from what each page says. */
const DESCRIPTIONS: Record<SiteKey, string> = {
  home: "A storefront, a gang sheet builder, wholesale ordering and an AI copilot for print shops, DTF operators and apparel brands.",
  features: "Gang sheets, a product designer, wholesale tools, a storefront, production, reviews and loyalty, an AI copilot and an owner app, in one platform.",
  pricing: "One monthly price for each plan. Commission only on print orders. 14 day free trial, no card needed.",
  demo: "See PrintCoPilot with your own business in mind.",
  contact: "Questions about plans, setup or whether PrintCoPilot fits your shop.",
  about: "Software built for how print and apparel businesses really work.",
  affiliate: "Refer print shops and apparel brands to PrintCoPilot and earn a share of their plan every month they stay.",
  blog: "Guides for people who make and sell print and apparel online.",
  "blog-online-brand-app-stack": "The app stack a small online brand ends up paying for, and how to simplify it.",
  "blog-sell-dtf-gang-sheets-online": "How to sell DTF gang sheets online: sizes, pricing and what to automate.",
  "blog-tiered-wholesale-pricing-blank-apparel": "How to set up tiered wholesale pricing for blank apparel.",
  brands: "One store for brands that sell their own products direct, with reviews, loyalty, gift cards and returns built in.",
  dtf: "Let customers build their own DTF gang sheets on your site, priced and ready to print.",
  examples: "Live PrintCoPilot stores and demo stores, by kind of business.",
  help: "Answers about plans, your store, the builder, orders and payments.",
  "print-shops": "Run quotes, proofs and print jobs from one screen, with a store your customers order from.",
  wholesale: "Let trade buyers order from you online, with tiered pricing, net terms and quick order.",
};

export async function siteMetadata(key: SiteKey): Promise<Metadata> {
  const page = await loadSitePage(key);
  const title = key === "home" ? "PrintCoPilot" : page.title;
  // No canonical link: the app sets no metadataBase, and a relative one would be
  // resolved against the wrong host.
  return { title, description: page.description || DESCRIPTIONS[key] };
}
