"use client";

/**
 * The admin's sidebar: eight places and Settings.
 *
 * It used to list every screen, twenty-five links in seven headed groups, and
 * a shop owner had to read the whole column to find one. Each screen now
 * belongs to one of eight places; the place that is open shows its own screens
 * under it, and the rest stay one line each.
 *
 * What a person may see is still decided by their role (`can`) and what the
 * shop's plan includes (a screen the plan lacks is shown locked, not hidden:
 * a shop that never sees a feature never buys the tier that has it).
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Home, Lock, Megaphone, Package, Printer, ShoppingBag, SlidersHorizontal, Store, Users,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { hasScope, type Scope } from "@/lib/permissions";
import { contactService } from "@/services/contact.service";
import { apiClient } from "@/lib/api-client";
import { HIDDEN_ADMIN_SECTIONS } from "@/lib/constants";
import { useEntitlements } from "@/lib/entitlements";
import { PlatformLogo } from "@/components/shared/PlatformLogo";

interface Child {
  href: string;
  label: string;
  /** Shown only to somebody with this section. */
  scope?: Scope;
  /** A plan feature: without it the link is drawn locked. */
  feature?: string;
  /** Opens outside the admin, in a new tab. */
  external?: boolean;
  count?: number;
  hidden?: boolean;
}

interface Place {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Any one of these sections lets a person in. None: everybody. */
  scopes?: Scope[];
  /** Addresses that belong here besides its children's own. */
  also?: string[];
  /** Addresses under this one that belong to another place. */
  not?: string[];
  count?: number;
  children?: Child[];
  /** Shows its screens wherever somebody is, not only once they are in it. */
  alwaysOpen?: boolean;
}

interface Counts { products?: number; orders?: number; customers?: number; returns?: number; production?: number }

/** Asked for by the top bar's menu button on a phone, where the sidebar is a drawer. */
export const OPEN_NAV = "pc:open-nav";

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const can = (s: Scope) => hasScope(user?.role, s, user?.scopes);
  const { locked } = useEntitlements();
  const lockOf = (feature: string) => locked.find((l) => l.feature === feature) ?? null;

  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [counts, setCounts] = useState<Counts>({});
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener(OPEN_NAV, open);
    return () => window.removeEventListener(OPEN_NAV, open);
  }, []);

  // Unread contact-form messages: read again on every navigation, so it drops
  // after they are read and picks up new ones as the admin moves around.
  useEffect(() => {
    if (!can("customers")) return;
    contactService.list("all", 1).then((r) => setUnreadMsgs(r.unread || 0)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user?.role]);

  // A failure leaves the counts off rather than breaking the nav.
  useEffect(() => {
    apiClient.get<Counts>("/api/v1/admin/nav-counts").then(setCounts).catch(() => {});
  }, [pathname]);

  const places: Place[] = [
    { key: "home", label: "Home", icon: Home, href: "/admin/dashboard" },
    // One line: its screens (drafts, returns, shipments) are the tabs across
    // the top of the order list.
    { key: "orders", label: "Orders", icon: ShoppingBag, href: "/admin/orders", scopes: ["orders"], count: counts.orders, also: ["/admin/returns"] },
    // One line each: Production is the print queue and its jobs; Products'
    // screens (collections, inventory, purchase orders, suppliers, gang sheet
    // setup…) are the tabs across the top of the product list.
    // The print queue's own section; a role with Products saw this line before it existed, and still does.
    { key: "production", label: "Production", icon: Printer, href: "/admin/production", scopes: ["production", "products"], count: counts.production },
    {
      key: "products", label: "Products", icon: Package, href: "/admin/products", scopes: ["products"],
      also: ["/admin/inventory", "/admin/suppliers", "/admin/purchase-orders", "/admin/gang-sheets"],
      // Reviews are a Marketing tab.
      not: ["/admin/products/reviews"],
    },
    // One line: All, Retail, Wholesale, Guest, Applications and Pricing tiers
    // are the tabs across the customer list; the Inbox (messages) is its own
    // page here, and Segments moved to Marketing, where they are used.
    {
      key: "customers", label: "Customers", icon: Users, href: "/admin/customers", scopes: ["customers"],
      also: ["/admin/messages"], not: ["/admin/customers/segments"], count: unreadMsgs || undefined,
    },
    // Always open: its first screen, the website builder, is a full page with
    // no sidebar, so nobody was ever "in" Storefront here and the Media
    // library under it could not be found.
    {
      key: "storefront", label: "Storefront", icon: Store, href: "/site-builder", scopes: ["storefront", "media"], alwaysOpen: true,
      children: [
        { href: "/site-builder", label: "Website builder", scope: "storefront" },
        { href: "/", label: "View store", scope: "storefront", external: true },
        { href: "/admin/storefront", label: "Storefront", scope: "storefront", hidden: HIDDEN_ADMIN_SECTIONS.storefront },
        { href: "/admin/storefront/pages", label: "Pages", scope: "storefront", hidden: HIDDEN_ADMIN_SECTIONS.pages },
        { href: "/admin/storefront/product-templates", label: "Product templates", scope: "storefront", hidden: HIDDEN_ADMIN_SECTIONS.productTemplates },
        { href: "/admin/storefront/menus", label: "Menus", scope: "storefront", hidden: HIDDEN_ADMIN_SECTIONS.menus },
        { href: "/admin/media", label: "Media library", scope: "media" },
      ],
    },
    // One line: Discounts, Gift cards, Loyalty, Abandoned carts, Reviews, Segments and Tracking are
    // the tabs across Marketing (components/admin/marketing/MarketingFrame).
    {
      key: "marketing", label: "Marketing", icon: Megaphone, href: "/admin/discounts", scopes: ["discounts", "orders", "customers"],
      also: ["/admin/gift-cards", "/admin/loyalty", "/admin/abandoned-carts", "/admin/products/reviews", "/admin/customers/segments", "/admin/settings/tracking"],
    },
    // One line: Sales, Customers and Production are the tabs across Reports.
    { key: "reports", label: "Reports", icon: BarChart3, href: "/admin/reports", scopes: ["analytics"], also: ["/admin/analytics"] },
  ];

  // One line: Store details, Markets, Shipping, Taxes, Billing and the rest are
  // the list down the left of every settings screen (components/admin/settings/SettingsFrame).
  const settings: Place = {
    key: "settings", label: "Settings", icon: SlidersHorizontal,
    // Opens on the first settings screen this person's role can use.
    href: can("settings") ? "/admin/settings" : can("billing") || can("payouts") ? "/admin/billing"
      : can("staff") ? "/admin/users" : can("audit") ? "/admin/settings/audit-log" : "/admin/settings/security",
    scopes: ["settings", "staff", "billing", "payouts", "audit"],
    also: ["/admin/settings", "/admin/users", "/admin/billing", "/admin/standard-shipping"], not: ["/admin/settings/tracking"],
  };

  const shown = (c: Child) => !c.hidden && (!c.scope || can(c.scope));
  const allowed = (p: Place) => !p.scopes || p.scopes.some(can);
  const path = (href: string) => href.split("?")[0]!;

  /** Whether an address is this child's own: the longest match wins, so
   *  /admin/orders/drafts lights Drafts and not All orders as well. */
  function childActive(c: Child, siblings: Child[]): boolean {
    if (c.external) return false;
    const [p, query] = c.href.split("?");
    const tab = query ? new URLSearchParams(query).get("tab") ?? "" : "";
    const currentTab = searchParams.get("tab") ?? "";
    const under = pathname === p || pathname.startsWith(p + "/");
    if (!under) return false;
    if (tab) return currentTab === tab || (!currentTab && siblings.filter((s) => path(s.href) === p)[0] === c);
    const longer = siblings.some((s) => s !== c && !s.external && path(s.href).length > p!.length
      && (pathname === path(s.href) || pathname.startsWith(path(s.href) + "/")));
    return !longer;
  }

  function placeActive(p: Place): boolean {
    const own = [p.href, ...(p.also ?? []), ...(p.children ?? []).filter((c) => !c.external).map((c) => path(c.href))];
    const under = (h: string) => pathname === path(h) || pathname.startsWith(path(h) + "/");
    if ((p.not ?? []).some(under)) return false;
    return own.some(under);
  }

  function render(p: Place) {
    if (!allowed(p)) return null;
    const kids = (p.children ?? []).filter(shown);
    const active = placeActive(p);
    // The place somebody is in shows its screens; the others are one line each.
    const open = (active || !!p.alwaysOpen) && kids.length > 1;
    const first = kids.find((c) => !c.external)?.href ?? p.href;
    const Icon = p.icon;
    return (
      <div key={p.key}>
        <Link
          href={first}
          className="pc-nav"
          data-active={active && !open ? "" : undefined}
          data-open={open ? "" : undefined}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={18} strokeWidth={1.9} />
          <span>{p.label}</span>
          {!!p.count && <span className="pc-nav-count">{p.count > 99 ? "99+" : p.count}</span>}
        </Link>
        {open && (
          <div className="pc-sub">
            {kids.map((c) => {
              const lock = c.feature ? lockOf(c.feature) : null;
              if (lock) {
                return (
                  <span key={c.href} data-locked title={lock.upgrade_to ? `Included from ${lock.upgrade_to}` : "Not available on this shop"}>
                    <Lock size={12} strokeWidth={2} /> {c.label}
                    {lock.upgrade_to && <span className="pc-sub-chip">{lock.upgrade_to}</span>}
                  </span>
                );
              }
              if (c.external) {
                return <a key={c.href} href={c.href} target="_blank" rel="noreferrer">{c.label} ↗</a>;
              }
              return (
                <Link key={c.href} href={c.href} data-active={childActive(c, kids) ? "" : undefined}>
                  {c.label}
                  {!!c.count && <span className="pc-sub-count">{c.count > 99 ? "99+" : c.count}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {mobileOpen && <div className="pc-side-back" onClick={() => setMobileOpen(false)} aria-hidden />}
      <aside className="pc-side" data-open={mobileOpen ? "" : undefined} aria-label="Admin">
        {/* The navy sidebar: the off-white wordmark, as on printcopilot.co. */}
        <Link href="/admin/dashboard" className="pc-brand">
          <PlatformLogo onDark width={190} />
        </Link>
        <nav className="pc-side-scroll">
          {places.map(render)}
          <div className="pc-side-foot">{render(settings)}</div>
        </nav>
      </aside>
    </>
  );
}
