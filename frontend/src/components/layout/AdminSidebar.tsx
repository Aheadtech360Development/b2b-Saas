"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { hasScope, type Scope } from "@/lib/permissions";
import { contactService } from "@/services/contact.service";
import { apiClient } from "@/lib/api-client";
import {
  LayoutDashboard, ShoppingBag, RotateCcw, ClipboardList, Shirt, Boxes, LayoutGrid,
  Users, MessageSquare, Percent, Truck, FileText, Store, File, Image as ImageIcon,
  Settings, Compass,
} from "lucide-react";

const ICON_PROPS = { size: 17, strokeWidth: 1.75 } as const;

const SECTION_HEAD: React.CSSProperties = {
  fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".12em", color: "#bbb", padding: "14px 12px 5px",
};

const NAV_LINK_BASE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "10px",
  padding: "9px 12px", borderRadius: "8px", textDecoration: "none",
  fontSize: "13px", fontWeight: 600, transition: "all .15s", cursor: "pointer",
};

const SUB_LINK_BASE: React.CSSProperties = {
  display: "block", padding: "7px 12px", borderRadius: "6px",
  textDecoration: "none", fontSize: "13px", fontWeight: 500,
  marginBottom: "1px", transition: "all .15s",
  borderLeft: "2px solid #E3E3E3",
};

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const can = (s: Scope) => hasScope(user?.role, s, user?.scopes);

  function handleLogout() {
    clearAuth();
    router.replace("/login");
  }
  const isOrdersActive = pathname.startsWith("/admin/orders") || pathname === "/admin/abandoned-carts" || pathname.startsWith("/admin/purchase-orders");
  const isProductsActive = pathname.startsWith("/admin/products") || pathname.startsWith("/admin/inventory");
  const isCustomersActive = pathname.startsWith("/admin/customers");
  const isSettingsActive = pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/users") || pathname === "/admin/analytics" || pathname.startsWith("/admin/billing");
  const isContentActive = pathname.startsWith("/admin/style-sheets") || pathname.startsWith("/admin/product-specs") || pathname.startsWith("/admin/pages") || pathname.startsWith("/admin/blogs");
  const [ordersOpen, setOrdersOpen] = useState(isOrdersActive);
  const [productsOpen, setProductsOpen] = useState(isProductsActive);
  const [customersOpen, setCustomersOpen] = useState(isCustomersActive);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);
  const [contentOpen, setContentOpen] = useState(isContentActive);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  /** Live counts beside each nav group — see the /admin/nav-counts endpoint. */
  const [counts, setCounts] = useState<{ products?: number; orders?: number; customers?: number; returns?: number }>({});

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Unread contact-form submissions count (refreshes on navigation so it drops
  // after you read messages, and picks up new ones as you move around).
  useEffect(() => {
    if (!can("customers")) return;
    contactService.list().then((r) => setUnreadMsgs(r.unread || 0)).catch(() => {});
  }, [pathname, user?.role]);

  // Re-read on navigation so a new order or product shows up without a reload.
  // A failure leaves the badges off rather than breaking the nav.
  useEffect(() => {
    apiClient.get<typeof counts>("/api/v1/admin/nav-counts")
      .then(setCounts)
      .catch(() => {});
  }, [pathname]);

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
        background: active ? "#ECECEB" : "transparent",
        color: active ? "#1A1A1A" : "#555",
      }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#F6F6F7"; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: "15px", flexShrink: 0 }}>{icon}</span>
        <span>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ marginLeft: "auto", background: "#E5E5E4", color: "#4A4A4A", fontSize: "11px", fontWeight: 700, minWidth: "18px", height: "18px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  }

  /** Count pill for a collapsible group header, sitting before the chevron. */
  function GroupCount({ n }: { n?: number }) {
    if (!n) return null;
    return (
      <span style={{ marginLeft: "auto", marginRight: "8px", background: "#E5E5E4", color: "#4A4A4A", fontSize: "11px", fontWeight: 700, minWidth: "18px", height: "18px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
        {n > 999 ? "999+" : n}
      </span>
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
        background: active ? "#F1F1F0" : "transparent",
        color: active ? "#1A1A1A" : "#7A7880",
        borderLeftColor: active ? "#1A1A1A" : "#E3E3E3",
        fontWeight: active ? 700 : 500,
      }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#F6F6F7"; }}
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
      <NavLink href="/admin/dashboard" label="Dashboard" icon={<LayoutDashboard {...ICON_PROPS} />} />

      {/* ── ORDERS ── */}
      {can("orders") && <>
      <div style={SECTION_HEAD}>Orders</div>

      {/* Orders dropdown trigger */}
      <div
        onClick={() => setOrdersOpen(!ordersOpen)}
        style={{
          ...NAV_LINK_BASE,
          justifyContent: "space-between",
          background: isOrdersActive ? "#ECECEB" : "transparent",
          color: isOrdersActive ? "#1A1A1A" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isOrdersActive) (e.currentTarget as HTMLElement).style.background = "#F6F6F7"; }}
        onMouseLeave={e => { if (!isOrdersActive) (e.currentTarget as HTMLElement).style.background = isOrdersActive ? "#ECECEB" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ShoppingBag {...ICON_PROPS} />
          <span>Orders</span>
        </span>
        <GroupCount n={counts.orders} />
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

      <NavLink href="/admin/returns" label="Returns (RMA)" icon={<RotateCcw {...ICON_PROPS} />} badge={counts.returns} />
      </>}
      {can("inventory") && <NavLink href="/admin/purchase-orders" label="Purchase Orders" icon={<ClipboardList {...ICON_PROPS} />} />}

      {/* ── PRODUCTS ── */}
      {can("products") && <>
      <div style={SECTION_HEAD}>Products</div>

      {/* Products dropdown */}
      <div
        onClick={() => setProductsOpen(!productsOpen)}
        style={{
          ...NAV_LINK_BASE,
          justifyContent: "space-between",
          background: isProductsActive ? "#ECECEB" : "transparent",
          color: isProductsActive ? "#1A1A1A" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isProductsActive) (e.currentTarget as HTMLElement).style.background = "#F6F6F7"; }}
        onMouseLeave={e => { if (!isProductsActive) (e.currentTarget as HTMLElement).style.background = isProductsActive ? "#ECECEB" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Shirt {...ICON_PROPS} />
          <span>Products</span>
        </span>
        <GroupCount n={counts.products} />
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

      <NavLink href="/admin/supplier-catalog" label="Supplier Catalog" icon={<Boxes {...ICON_PROPS} />} />
      <NavLink href="/admin/gang-sheets" label="Gang Sheets" icon={<LayoutGrid {...ICON_PROPS} />} />
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
          background: isCustomersActive ? "#ECECEB" : "transparent",
          color: isCustomersActive ? "#1A1A1A" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isCustomersActive) (e.currentTarget as HTMLElement).style.background = "#F6F6F7"; }}
        onMouseLeave={e => { if (!isCustomersActive) (e.currentTarget as HTMLElement).style.background = isCustomersActive ? "#ECECEB" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Users {...ICON_PROPS} />
          <span>Customers</span>
        </span>
        <GroupCount n={counts.customers} />
        <span style={{ fontSize: "10px", color: "#aaa", transition: "transform .2s", transform: customersOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▼</span>
      </div>

      {customersOpen && (
        <div style={{ paddingLeft: "18px", marginTop: "3px", marginBottom: "3px" }}>
          <SubLink href="/admin/customers" label="All Customers" />
          <SubLink href="/admin/customers/segments" label="Segments" />
          <SubLink href="/admin/customers/applications" label="Applications" />
          <SubLink href="/admin/customers/tiers?tab=groups" label="Discount Groups" />
          <SubLink href="/admin/customers/tiers?tab=variants" label="Individual Variant Pricing" />
        </div>
      )}

      <NavLink href="/admin/messages" label="Messages" icon={<MessageSquare {...ICON_PROPS} />} badge={unreadMsgs} />
      </>}

      {/* ── DISCOUNTS ── */}
      {(can("discounts") || can("settings")) && <>
      <div style={SECTION_HEAD}>Discounts</div>
      {can("discounts") && <NavLink href="/admin/discounts" label="Discounts" icon={<Percent {...ICON_PROPS} />} />}
      {can("settings") && <NavLink href="/admin/standard-shipping" label="Standard Shipping" icon={<Truck {...ICON_PROPS} />} />}
      </>}

      {/* The Content group (Pages SEO / Blogs / Style Sheets / Product Specs) was
          taken out of the nav — those routes still exist and can be linked again
          by restoring this section. */}

      {/* ── ONLINE STORE ── */}
      {(can("storefront") || can("media")) && <>
      <div style={SECTION_HEAD}>Online Store</div>
      {can("storefront") && <NavLink href="/admin/storefront" label="Storefront" icon={<Store {...ICON_PROPS} />} exact />}
      {can("storefront") && <NavLink href="/admin/storefront/pages" label="Pages" icon={<File {...ICON_PROPS} />} />}
      {can("storefront") && <NavLink href="/admin/storefront/menus" label="Menus" icon={<Compass {...ICON_PROPS} />} />}
      {can("media") && <NavLink href="/admin/media" label="Media Library" icon={<ImageIcon {...ICON_PROPS} />} />}
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
          background: isSettingsActive ? "#ECECEB" : "transparent",
          color: isSettingsActive ? "#1A1A1A" : "#555",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isSettingsActive) (e.currentTarget as HTMLElement).style.background = "#F6F6F7"; }}
        onMouseLeave={e => { if (!isSettingsActive) (e.currentTarget as HTMLElement).style.background = isSettingsActive ? "#ECECEB" : "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Settings {...ICON_PROPS} />
          <span>Settings</span>
        </span>
        <span style={{ fontSize: "10px", color: "#aaa", transition: "transform .2s", transform: settingsOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▼</span>
      </div>

      {settingsOpen && (
        <div style={{ paddingLeft: "18px", marginTop: "3px", marginBottom: "3px" }}>
          {can("settings") && <SubLink href="/admin/billing" label="Billing & Payouts" />}
          {can("settings") && <SubLink href="/admin/settings/taxes" label="Taxes & Duties" />}
          {can("analytics") && <SubLink href="/admin/analytics" label="Analytics" />}
          {can("staff") && <SubLink href="/admin/users" label="Users" />}
          <SubLink href="/admin/settings/security" label="Security (2FA)" />
          {can("settings") && <SubLink href="/admin/settings/audit-log" label="Audit Log" />}
        </div>
      )}
      </>}

      {/* ── Account / Sign out (bottom) ── */}
      <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #E3E3E3" }}>
        {user && (
          <div style={{ padding: "0 12px 10px", fontSize: "12px", color: "#7A7880", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.first_name ? `${user.first_name} ${user.last_name ?? ""}`.trim() : user.email}
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            ...NAV_LINK_BASE,
            width: "100%", border: "1px solid #E3E3E3", background: "#fff",
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
          background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "50%",
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
            borderRight: "1px solid #E3E3E3",
            boxShadow: "4px 0 24px rgba(0,0,0,.15)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E3E3E3" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#7A7880" }}>Admin</span>
              <button onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#7A7880" }}>✕</button>
            </div>
            {sidebarInner}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="admin-sidebar-desktop" style={{ width: "220px", flexShrink: 0, borderRight: "1px solid #E3E3E3", background: "#fff", minHeight: "calc(100vh - 68px)" }}>
        {sidebarInner}
      </aside>
    </>
  );
}
