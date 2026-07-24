"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { hasScope, type Scope } from "@/lib/permissions";
import { contactService } from "@/services/contact.service";
import {
  BarChartIcon, PackageIcon, BuildingIcon, ShirtIcon,
  SettingsIcon, BookIcon, SearchIcon, RefreshIcon, UsersIcon, TrendingUpIcon, TruckIcon, ShoppingCartIcon,
} from "@/components/ui/icons";

const SECTION_HEAD: React.CSSProperties = {
  fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".12em", color: "#bbb", padding: "14px 12px 5px",
};

const NAV_LINK_BASE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "10px",
  padding: "9px 12px", borderRadius: "7px", textDecoration: "none",
  fontSize: "13px", fontWeight: 600, transition: "all .15s", cursor: "pointer",
};

const SUB_LINK_BASE: React.CSSProperties = {
  display: "block", padding: "7px 12px", borderRadius: "6px",
  textDecoration: "none", fontSize: "13px", fontWeight: 500,
  marginBottom: "1px", transition: "all .15s",
  borderLeft: "2px solid #E2E0DA",
};

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const can = (s: Scope) => hasScope(user?.role, s);

  function handleLogout() {
    clearAuth();
    router.replace("/login");
  }
  const isOrdersActive = pathname.startsWith("/admin/orders") || pathname === "/admin/abandoned-carts" || pathname.startsWith("/admin/purchase-orders");
  const isProductsActive = pathname.startsWith("/admin/products") || pathname.startsWith("/admin/inventory");
  const isCustomersActive = pathname.startsWith("/admin/customers");
  const isSettingsActive = pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/users") || pathname === "/admin/analytics";
  const isContentActive = pathname.startsWith("/admin/style-sheets") || pathname.startsWith("/admin/product-specs") || pathname.startsWith("/admin/pages") || pathname.startsWith("/admin/blogs");
  const [ordersOpen, setOrdersOpen] = useState(isOrdersActive);
  const [productsOpen, setProductsOpen] = useState(isProductsActive);
  const [customersOpen, setCustomersOpen] = useState(isCustomersActive);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);
  const [contentOpen, setContentOpen] = useState(isContentActive);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Unread contact-form submissions count (refreshes on navigation so it drops
  // after you read messages, and picks up new ones as you move around).
  useEffect(() => {
    if (!can("customers")) return;
    contactService.list().then((r) => setUnreadMsgs(r.unread || 0)).catch(() => {});
  }, [pathname, user?.role]);

  useEffect(() => { if (isOrdersActive) setOrdersOpen(true); }, [isOrdersActive]);
  useEffect(() => { if (isProductsActive) setProductsOpen(true); }, [isProductsActive]);
  useEffect(() => { if (isCustomersActive) setCustomersOpen(true); }, [isCustomersActive]);
  useEffect(() => { if (isSettingsActive) setSettingsOpen(true); }, [isSettingsActive]);
  useEffect(() => { if (isContentActive) setContentOpen(true); }, [isContentActive]);

  function NavLink({ href, label, icon, exact, badge }: { href: string; label: string; icon: React.ReactNode; exact?: boolean; badge?: number }) {
    // `exact` links only light up on their own path — used when a child route has
    // its own nav entry (e.g. Storefront vs Storefront → Pages) so both don't
    // appear active at once.
    const active = pathname === href || (!exact && href !== "/admin" && pathname.startsWith(href + "/"));
    return (
      <Link href={href} style={{
        ...NAV_LINK_BASE,
        background: active ? "rgba(26,92,255,.08)" : "transparent",
        color: active ? "#1A5CFF" : "#555",
      }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#F4F3EF"; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: "15px", flexShrink: 0 }}>{icon}</span>
        <span>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ marginLeft: "auto", background: "#1A5CFF", color: "#fff", fontSize: "11px", fontWeight: 700, minWidth: "18px", height: "18px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  }

  function SubLink({ href, label }: { href: string; label: string }) {
    const [hrefPath, hrefQuery] = href.split("?");
    const currentTab = searchParams.get("tab") ?? "";
    const hrefTab = hrefQuery ? new URLSearchParams(hrefQuery).get("tab") ?? "" : "";
    const active = hrefQuery
      ? pathname === hrefPath && currentTab === hrefTab
      : pathname === href && !currentTab;
    return (
      <Link href={href} style={{
        ...SUB_LINK_BASE,
        background: active ? "rgba(26,92,255,.06)" : "transparent",
        color: active ? "#1A5CFF" : "#7A7880",
        borderLeftColor: active ? "#1A5CFF" : "#E2E0DA",
        fontWeight: active ? 700 : 500,
      }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#F4F3EF"; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {label}
      </Link>
    );
  }

  const sidebarInner = (
    <div style={{ padding: "8px 10px 32px" }}>

      {/* ── HOME ── */}
      <div style={SECTION_HEAD}>Home</div>
      <NavLink href="/admin/dashboard" label="Dashboard" icon={<BarChartIcon size={15} color="currentColor" />} />

      {/* ── ORDERS ── */}
      {can("orders") && <>
      <div style={SECTION_HEAD}>Orders</div>

      {/* Orders dropdown trigger */}
      <div
        onClick={() => setOrdersOpen(!ordersOpen)}
        style={{
          ...NAV_LINK_BASE,
          justifyContent: "space-between",
          background: isOrdersActive ? "rgba(26,92,255,.08)" : "transparent",
          color: isOrdersActive ? "#1A5CFF" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isOrdersActive) (e.currentTarget as HTMLElement).style.background = "#F4F3EF"; }}
        onMouseLeave={e => { if (!isOrdersActive) (e.currentTarget as HTMLElement).style.background = isOrdersActive ? "rgba(26,92,255,.08)" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <PackageIcon size={15} color="currentColor" />
          <span>Orders</span>
        </span>
        <span style={{ fontSize: "10px", color: "#aaa", transition: "transform .2s", transform: ordersOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▼</span>
      </div>

      {ordersOpen && (
        <div style={{ paddingLeft: "18px", marginTop: "3px", marginBottom: "3px" }}>
          <SubLink href="/admin/orders" label="All Orders" />
          <SubLink href="/admin/orders/drafts" label="Drafts" />
          <SubLink href="/admin/orders/shipping-labels" label="Shipping Labels" />
          <SubLink href="/admin/abandoned-carts" label="Abandoned Checkouts" />
        </div>
      )}

      <NavLink href="/admin/returns" label="Returns (RMA)" icon={<RefreshIcon size={15} color="currentColor" />} />
      </>}
      {can("inventory") && <NavLink href="/admin/purchase-orders" label="Purchase Orders" icon={<ShoppingCartIcon size={15} color="currentColor" />} />}

      {/* ── PRODUCTS ── */}
      {can("products") && <>
      <div style={SECTION_HEAD}>Products</div>

      {/* Products dropdown */}
      <div
        onClick={() => setProductsOpen(!productsOpen)}
        style={{
          ...NAV_LINK_BASE,
          justifyContent: "space-between",
          background: isProductsActive ? "rgba(26,92,255,.08)" : "transparent",
          color: isProductsActive ? "#1A5CFF" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isProductsActive) (e.currentTarget as HTMLElement).style.background = "#F4F3EF"; }}
        onMouseLeave={e => { if (!isProductsActive) (e.currentTarget as HTMLElement).style.background = isProductsActive ? "rgba(26,92,255,.08)" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ShirtIcon size={15} color="currentColor" />
          <span>Products</span>
        </span>
        <span style={{ fontSize: "10px", color: "#aaa", transition: "transform .2s", transform: productsOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▼</span>
      </div>

      {productsOpen && (
        <div style={{ paddingLeft: "18px", marginTop: "3px", marginBottom: "3px" }}>
          <SubLink href="/admin/products" label="All Products" />
          <SubLink href="/admin/products/collections" label="Collections" />
          <SubLink href="/admin/products/reviews" label="Reviews" />
          <SubLink href="/admin/inventory" label="Inventory" />
        </div>
      )}

      <NavLink href="/admin/supplier-catalog" label="Supplier Catalog" icon={<PackageIcon size={15} color="currentColor" />} />
      <NavLink href="/admin/gang-sheets" label="Gang Sheets" icon={<span style={{ fontSize: "14px" }}>🧩</span>} />
      </>}

      {/* ── CUSTOMERS ── */}
      {can("customers") && <>
      <div style={SECTION_HEAD}>Customers</div>

      {/* Customers dropdown */}
      <div
        onClick={() => setCustomersOpen(!customersOpen)}
        style={{
          ...NAV_LINK_BASE,
          justifyContent: "space-between",
          background: isCustomersActive ? "rgba(26,92,255,.08)" : "transparent",
          color: isCustomersActive ? "#1A5CFF" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isCustomersActive) (e.currentTarget as HTMLElement).style.background = "#F4F3EF"; }}
        onMouseLeave={e => { if (!isCustomersActive) (e.currentTarget as HTMLElement).style.background = isCustomersActive ? "rgba(26,92,255,.08)" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <BuildingIcon size={15} color="currentColor" />
          <span>Customers</span>
        </span>
        <span style={{ fontSize: "10px", color: "#aaa", transition: "transform .2s", transform: customersOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▼</span>
      </div>

      {customersOpen && (
        <div style={{ paddingLeft: "18px", marginTop: "3px", marginBottom: "3px" }}>
          <SubLink href="/admin/customers" label="All Customers" />
          <SubLink href="/admin/customers/applications" label="Applications" />
          <SubLink href="/admin/customers/tiers?tab=groups" label="Discount Groups" />
          <SubLink href="/admin/customers/tiers?tab=variants" label="Individual Variant Pricing" />
        </div>
      )}

      <NavLink href="/admin/messages" label="Messages" icon={<span style={{ fontSize: "14px" }}>✉️</span>} badge={unreadMsgs} />
      </>}

      {/* ── DISCOUNTS ── */}
      {(can("discounts") || can("settings")) && <>
      <div style={SECTION_HEAD}>Discounts</div>
      {can("discounts") && <NavLink href="/admin/discounts" label="Discounts" icon={<span style={{ fontSize: "15px" }}>%</span>} />}
      {can("settings") && <NavLink href="/admin/standard-shipping" label="Standard Shipping" icon={<TruckIcon size={15} color="currentColor" />} />}
      </>}

      {/* ── CONTENT ── */}
      {can("content") && <>
      <div style={SECTION_HEAD}>Content</div>
      <div
        onClick={() => setContentOpen(!contentOpen)}
        style={{
          ...NAV_LINK_BASE,
          justifyContent: "space-between",
          background: isContentActive ? "rgba(26,92,255,.08)" : "transparent",
          color: isContentActive ? "#1A5CFF" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isContentActive) (e.currentTarget as HTMLElement).style.background = "#F4F3EF"; }}
        onMouseLeave={e => { if (!isContentActive) (e.currentTarget as HTMLElement).style.background = isContentActive ? "rgba(26,92,255,.08)" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <BookIcon size={15} color="currentColor" />
          <span>Content</span>
        </span>
        <span style={{ fontSize: "10px", color: "#aaa", transition: "transform .2s", transform: contentOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▼</span>
      </div>
      {contentOpen && (
        <div style={{ paddingLeft: "18px", marginTop: "3px", marginBottom: "3px" }}>
          <SubLink href="/admin/pages" label="Pages SEO" />
          <SubLink href="/admin/blogs" label="Blogs" />
          <SubLink href="/admin/style-sheets" label="Style Sheets" />
          <SubLink href="/admin/product-specs" label="Product Specs" />
        </div>
      )}
      </>}

      {/* ── ONLINE STORE ── */}
      {(can("storefront") || can("media")) && <>
      <div style={SECTION_HEAD}>Online Store</div>
      {can("storefront") && <NavLink href="/admin/storefront" label="Storefront" icon={<BuildingIcon size={15} color="currentColor" />} exact />}
      {can("storefront") && <NavLink href="/admin/storefront/pages" label="Pages" icon={<BookIcon size={15} color="currentColor" />} />}
      {can("storefront") && <NavLink href="/admin/storefront/menus" label="Menus" icon={<span style={{ fontSize: "14px" }}>🧭</span>} />}
      {can("media") && <NavLink href="/admin/media" label="Media Library" icon={<BookIcon size={15} color="currentColor" />} />}
      </>}

      {/* ── SETTINGS ── */}
      {(can("settings") || can("staff") || can("analytics")) && <>
      <div style={SECTION_HEAD}>Settings</div>

      {/* Settings dropdown */}
      <div
        onClick={() => setSettingsOpen(!settingsOpen)}
        style={{
          ...NAV_LINK_BASE,
          justifyContent: "space-between",
          background: isSettingsActive ? "rgba(26,92,255,.08)" : "transparent",
          color: isSettingsActive ? "#1A5CFF" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isSettingsActive) (e.currentTarget as HTMLElement).style.background = "#F4F3EF"; }}
        onMouseLeave={e => { if (!isSettingsActive) (e.currentTarget as HTMLElement).style.background = isSettingsActive ? "rgba(26,92,255,.08)" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <SettingsIcon size={15} color="currentColor" />
          <span>Settings</span>
        </span>
        <span style={{ fontSize: "10px", color: "#aaa", transition: "transform .2s", transform: settingsOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▼</span>
      </div>

      {settingsOpen && (
        <div style={{ paddingLeft: "18px", marginTop: "3px", marginBottom: "3px" }}>
          {can("settings") && <SubLink href="/admin/settings/taxes" label="Taxes & Duties" />}
          {can("analytics") && <SubLink href="/admin/analytics" label="Analytics" />}
          {can("staff") && <SubLink href="/admin/users" label="Users" />}
          {can("settings") && <SubLink href="/admin/settings/audit-log" label="Audit Log" />}
        </div>
      )}
      </>}

      {/* ── Account / Sign out (bottom) ── */}
      <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #E2E0DA" }}>
        {user && (
          <div style={{ padding: "0 12px 10px", fontSize: "12px", color: "#7A7880", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.first_name ? `${user.first_name} ${user.last_name ?? ""}`.trim() : user.email}
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            ...NAV_LINK_BASE,
            width: "100%", border: "1px solid #E2E0DA", background: "#fff",
            color: "#B91C1C", justifyContent: "flex-start",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#FEF2F2"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
        >
          <span style={{ fontSize: "15px" }}>⎋</span> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger button — fixed bottom-left */}
      <button
        className="admin-mobile-menu-btn"
        onClick={() => setMobileOpen(true)}
        aria-label="Open admin menu"
        style={{
          position: "fixed", bottom: "20px", left: "16px", zIndex: 150,
          background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "50%",
          width: "48px", height: "48px", cursor: "pointer",
          alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,.25)",
        }}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="admin-mobile-menu-btn" style={{ position: "fixed", inset: 0, zIndex: 160 }}>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)" }} onClick={() => setMobileOpen(false)} />
          <aside style={{
            position: "fixed", left: 0, top: 0, bottom: 0, width: "260px",
            background: "#fff", overflowY: "auto", zIndex: 161,
            borderRight: "1px solid #E2E0DA",
            boxShadow: "4px 0 24px rgba(0,0,0,.15)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E2E0DA" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#7A7880" }}>Admin</span>
              <button onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#7A7880" }}>✕</button>
            </div>
            {sidebarInner}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="admin-sidebar-desktop" style={{ width: "220px", flexShrink: 0, borderRight: "1px solid #E2E0DA", background: "#fff", minHeight: "calc(100vh - 68px)" }}>
        {sidebarInner}
      </aside>
    </>
  );
}
