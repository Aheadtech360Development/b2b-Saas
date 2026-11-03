import { RETAIL_LAUNCHED } from "@/lib/retailLaunch";

/**
 * A menu's links with Retail beside Pricing, once the Retail pages are
 * published (lib/retailLaunch): the header, the phone menu and the footer.
 */
export function withRetail<T extends { href: string }>(links: T[], retail: T): T[] {
  return RETAIL_LAUNCHED ? links.flatMap((l) => (l.href === "/pricing" ? [l, retail] : [l])) : links;
}

/** A partner's link (`/?ref=CODE`), landing on the Retail page instead of the home page. */
export function retailLinkOf(link: string): string {
  return link.replace("/?ref=", "/retail?ref=");
}
