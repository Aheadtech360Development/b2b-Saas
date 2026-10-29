// frontend/src/app/(customer)/account/layout.tsx
"use client";

/**
 * The customer portal's shell: the shop's own top bar (logo, search, Shop,
 * Cart, Help, who is signed in), the side menu and a footer with how to reach
 * the shop. Its look is portal.css; its menu is components/portal/nav.
 *
 * The storefront's header and footer stay off these pages (ShellGate lists
 * /account as bare), so the portal is the only chrome on screen. Who may be
 * here is unchanged: an admin is sent to the admin, somebody signed out to the
 * sign-in page.
 */
import "./portal.css";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { forgetOrderKeys } from "@/lib/orderThanks";
import { apiClient } from "@/lib/api-client";
import { useBranding } from "@/components/providers/BrandingProvider";
import { SupportChat } from "@/components/storefront/SupportChat";
import { COMPANY_NAV, RETAIL_NAV, activeItem, withRewards, withoutPrinting, type NavGroup } from "@/components/portal/nav";
import { claimBuyerReferral } from "@/lib/buyerReferral";
import { ICONS, Icon } from "@/components/portal/ui";
import { PortalContext } from "@/components/portal/context";
import { isTradeAccount } from "@/components/portal/data";

/** Dark text on a light shop colour, white on a dark one. */
function inkOn(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return "#fff";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.45 ? "#1B2430" : "#fff";
}

function Menu({ groups, pathname, onPick, onSignOut }: {
  groups: NavGroup[];
  pathname: string;
  onPick?: () => void;
  onSignOut: () => void;
}) {
  const current = activeItem(groups, pathname);
  return (
    <>
      <nav aria-label="Account">
        {groups.map((g) => (
          <div key={g.title || "main"} style={{ display: "contents" }}>
            {g.title && <div className="cp-side-head">{g.title}</div>}
            {g.items.map((item) => (
              <Link key={item.href} href={item.href} onClick={onPick} className="cp-side-item"
                aria-current={current?.href === item.href ? "page" : undefined}>
                <Icon d={item.icon} />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <button type="button" className="cp-side-item cp-side-out" onClick={onSignOut}>Sign out</button>
    </>
  );
}

function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const term = q.trim();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const where = (path: string) => `${path}?q=${encodeURIComponent(term)}`;
  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };

  return (
    <div className="cp-search" ref={box}>
      <label htmlFor="cp-search" className="cp-sr">Search</label>
      <Icon d={ICONS.search} size={16} stroke={2} />
      <form onSubmit={(e) => { e.preventDefault(); if (term) go(where("/account/orders")); }}>
        <input id="cp-search" className="cp-input" type="search" autoComplete="off"
          placeholder="Search orders, print jobs, products" value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} />
      </form>
      {open && term && (
        <div className="cp-search-menu" role="menu">
          <a role="menuitem" href={where("/account/orders")} onClick={(e) => { e.preventDefault(); go(where("/account/orders")); }}>
            <Icon d={ICONS.orders} size={16} />Orders matching &ldquo;{term}&rdquo;<small>Order or PO number</small>
          </a>
          <a role="menuitem" href={where("/account/gang-sheets")} onClick={(e) => { e.preventDefault(); go(where("/account/gang-sheets")); }}>
            <Icon d={ICONS.jobs} size={16} />Print jobs matching &ldquo;{term}&rdquo;<small>Job number</small>
          </a>
          <a role="menuitem" href={where("/search")} onClick={(e) => { e.preventDefault(); go(where("/search")); }}>
            <Icon d={ICONS.price} size={16} />Products matching &ldquo;{term}&rdquo;<small>In the shop</small>
          </a>
        </div>
      )}
    </div>
  );
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/account";
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [printing, setPrinting] = useState<boolean | null>(null);
  // The shop's rewards program (backend services/loyalty): Rewards in the menu.
  const [rewards, setRewards] = useState(false);
  // The sign-in is read from this tab's session storage, which the server does
  // not have: drawing the portal before mount made the first client render
  // differ from the server's ("Hydration failed"). Both draw Loading first.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const branding = useBranding();

  const groups = useMemo(() => {
    const all = isTradeAccount(user) ? COMPANY_NAV : RETAIL_NAV;
    const shown = printing === false ? withoutPrinting(all) : all;
    return rewards ? withRewards(shown) : shown;
  }, [user, printing, rewards]);

  useEffect(() => {
    if (isLoading || !isAuthenticated() || user?.is_admin) return;
    apiClient.get<{ enabled?: boolean }>("/api/v1/account/rewards/summary")
      .then((r) => setRewards(!!r.enabled)).catch(() => setRewards(false));
    // A friend's referral link this browser kept: claimed once signed in.
    claimBuyerReferral();
  }, [isLoading, isAuthenticated, user]);
  const current = useMemo(() => activeItem(groups, pathname), [groups, pathname]);
  const portal = useMemo(() => ({ printing }), [printing]);

  async function handleSignOut() {
    try { await authService.logout(); } catch { /* ignore */ }
    useAuthStore.getState().clearAuth();
    forgetOrderKeys();
    router.push("/login" + (typeof window !== "undefined" ? window.location.search : ""));
  }

  useEffect(() => {
    if (isLoading) return;
    if (user?.is_admin) {
      router.replace("/admin/dashboard");
      return;
    }
    if (!isAuthenticated()) {
      redirectTimer.current = setTimeout(() => {
        if (!useAuthStore.getState().isAuthenticated()) {
          router.replace("/login");
        }
      }, 300);
    }
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [isLoading, user, isAuthenticated, router]);

  // Close the drawer when the page changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // What is in the cart, for the top bar: read again on each page, since a
  // reorder or a print job adds to it from inside the portal.
  useEffect(() => {
    // The account cart belongs to the account's company (the API refuses it otherwise).
    if (isLoading || !user || user.is_admin || !user.company_id) return;
    apiClient.get<{ items: { quantity: number }[] }>("/api/v1/cart")
      .then((r) => setCartCount((r?.items ?? []).reduce((sum, i) => sum + i.quantity, 0)))
      .catch(() => {});
  }, [isLoading, user, pathname]);

  // Whether the shop sells print jobs: its plan refuses the gang sheet API
  // otherwise. Asked once; the shell stays mounted across the portal's pages.
  useEffect(() => {
    if (isLoading || !user || user.is_admin || printing !== null) return;
    apiClient.get<unknown[]>("/api/v1/gang-sheets/sizes")
      .then(() => setPrinting(true))
      .catch((e: { status?: number }) => setPrinting(e?.status === 403 || e?.status === 402 ? false : true));
  }, [isLoading, user, printing]);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated()) return null;

  const shop = branding?.store_name || "Shop";
  const buyer = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "";
  const initial = (user?.first_name || user?.email || "?").trim().charAt(0).toUpperCase();
  const pickupOn = branding?.pickup_enabled !== false && !!branding?.pickup_address;
  const pickup = pickupOn
    ? `Pickup: ${[branding?.pickup_address, branding?.pickup_hours].filter(Boolean).join(", ")}`
    : null;

  return (
    <div className="cp" style={{ ["--cp-on-accent" as string]: inkOn(branding?.primary_color) }}>
      <SupportChat />
      <header className="cp-top">
        <button type="button" className="cp-btn cp-btn-ghost cp-menu-btn" aria-label="Open menu"
          onClick={() => setDrawerOpen(true)} style={{ padding: "0 10px" }}>
          <Icon d={ICONS.menu} size={20} />
        </button>
        <Link href="/" className="cp-brand" aria-label={`${shop} home`}>
          {branding?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt="" className="cp-logo" />
          ) : (
            <span className="cp-logo-letter" aria-hidden>{shop.charAt(0).toUpperCase()}</span>
          )}
          <span className="cp-brand-name">{shop}</span>
        </Link>
        <Search />
        <div className="cp-top-actions">
          <Link href="/products" className="cp-btn cp-hide-sm">Shop</Link>
          <Link href="/cart" className="cp-btn" aria-label={cartCount ? `Cart, ${cartCount} items` : "Cart"}>
            <Icon d={ICONS.cart} />
            <span className="cp-hide-sm">Cart</span>
            {cartCount > 0 && <span className="cp-count">{cartCount}</span>}
          </Link>
          <Link href="/account/messages" className="cp-btn cp-hide-sm">Help</Link>
          <Link href="/account/profile" className="cp-who" title={buyer}>
            <span className="cp-avatar" aria-hidden>{initial}</span>
            <span className="cp-who-name">{buyer}</span>
          </Link>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div className="cp-scrim" onClick={() => setDrawerOpen(false)} />
          <div className="cp-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="cp-drawer-head">
              <span className="cp-eyebrow">{current?.label ?? "My account"}</span>
              <button type="button" className="cp-x" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            <Link href="/products" className="cp-side-item" onClick={() => setDrawerOpen(false)}>
              <Icon d={ICONS.price} />Shop {shop}
            </Link>
            <Link href="/account/messages" className="cp-side-item" onClick={() => setDrawerOpen(false)}>
              <Icon d={ICONS.messages} />Help
            </Link>
            <hr className="cp-hr" style={{ margin: "8px 0" }} />
            <Menu groups={groups} pathname={pathname} onPick={() => setDrawerOpen(false)}
              onSignOut={() => { setDrawerOpen(false); handleSignOut(); }} />
          </div>
        </>
      )}

      <div className="cp-body">
        <aside className="cp-side">
          <div className="cp-side-inner">
            <Menu groups={groups} pathname={pathname} onSignOut={handleSignOut} />
          </div>
        </aside>
        <main className="cp-main">
          <PortalContext.Provider value={portal}>
            <div className="cp-wrap">{children}</div>
          </PortalContext.Provider>
        </main>
      </div>

      <footer className="cp-foot">
        <span>{shop}</span>
        {branding?.support_email && <a href={`mailto:${branding.support_email}`}>{branding.support_email}</a>}
        {branding?.support_phone && <a href={`tel:${branding.support_phone.replace(/[^\d+]/g, "")}`}>{branding.support_phone}</a>}
        {pickup && <span>{pickup}</span>}
      </footer>
    </div>
  );
}
