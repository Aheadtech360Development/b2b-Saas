/**
 * The portal's side menu, in the design's two shapes: a retail buyer's six
 * places, and a company account's places grouped by what they are for. Which
 * one a buyer gets is the company on their sign-in (user.company_id), the same
 * thing that separates a trade account everywhere else.
 *
 * Every older account address still opens; `owns` says which menu item it
 * belongs under, so the menu always shows where the buyer is.
 */
import { ICONS } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Addresses that count as this place, besides its own. */
  owns?: string[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const HOME: NavItem = { href: "/account", label: "Home", icon: ICONS.home };
const ORDERS: NavItem = {
  href: "/account/orders", label: "Orders", icon: ICONS.orders,
  owns: ["/account/abandoned-carts", "/account/templates", "/account/rma", "/account/returns"],
};
const JOBS: NavItem = { href: "/account/gang-sheets", label: "Print jobs", icon: ICONS.jobs };
const ARTWORK: NavItem = { href: "/account/artwork", label: "Artwork", icon: ICONS.artwork };
const MESSAGES: NavItem = { href: "/account/messages", label: "Messages", icon: ICONS.messages };
const ACCOUNT: NavItem = {
  href: "/account/profile", label: "Account", icon: ICONS.account,
  owns: ["/account/addresses", "/account/change-password", "/account/payment-methods", "/account/notifications"],
};

export const RETAIL_NAV: NavGroup[] = [
  { title: "", items: [HOME, ORDERS, JOBS, ARTWORK, MESSAGES, ACCOUNT] },
];

export const COMPANY_NAV: NavGroup[] = [
  {
    title: "Shop",
    items: [
      HOME,
      { href: "/account/quick-order", label: "Quick order", icon: ICONS.quick },
      { href: "/account/price-list", label: "Price list", icon: ICONS.price },
      { href: "/account/quotes", label: "Quotes", icon: ICONS.quotes },
    ],
  },
  {
    title: "Track",
    items: [
      ORDERS,
      JOBS,
      { href: "/account/sales-history", label: "Reports", icon: ICONS.reports, owns: ["/account/inventory"] },
    ],
  },
  {
    title: "Pay",
    items: [{ href: "/account/invoices", label: "Billing", icon: ICONS.billing, owns: ["/account/statements", "/account/billing"] }],
  },
  { title: "Library", items: [ARTWORK, MESSAGES] },
  {
    title: "Company",
    items: [
      { href: "/account/users", label: "Team", icon: ICONS.team, owns: ["/account/contacts", "/account/resend-emails"] },
      ACCOUNT,
    ],
  },
];

/** The menu without print jobs and artwork, for a shop that sells no print jobs. */
export function withoutPrinting(groups: NavGroup[]): NavGroup[] {
  const drop = new Set([JOBS.href, ARTWORK.href]);
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !drop.has(i.href)) }))
    .filter((g) => g.items.length > 0);
}

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** The menu item a page belongs to, for highlighting and the phone's title. */
export function activeItem(groups: NavGroup[], pathname: string): NavItem | null {
  for (const g of groups) {
    for (const item of g.items) {
      if (item.href === "/account" ? pathname === "/account" : under(pathname, item.href)) return item;
      if (item.owns?.some((o) => under(pathname, o))) return item;
    }
  }
  return null;
}
