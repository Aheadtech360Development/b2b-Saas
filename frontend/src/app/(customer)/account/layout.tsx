// frontend/src/app/(customer)/account/layout.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { useBranding } from "@/components/providers/BrandingProvider";
import { SupportChat } from "@/components/storefront/SupportChat";

const NAV_ITEMS = [
  { href: "/account", label: "Overview" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/change-password", label: "Password" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/contacts", label: "Contacts" },
  { href: "/account/users", label: "Team members" },
  { href: "/account/resend-emails", label: "Resend invites" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/gang-sheets", label: "My Print Jobs" },
  { href: "/account/statements", label: "Statements" },
  { href: "/account/invoices", label: "Invoices" },
  { href: "/account/sales-history", label: "Purchase history" },
  { href: "/account/inventory", label: "Inventory report" },
  { href: "/account/price-list", label: "Price list" },
  { href: "/account/abandoned-carts", label: "Saved carts" },
];

// The same links, grouped the way a buyer looks for them.
const NAV_GROUPS: { title: string; hrefs: string[] }[] = [
  { title: "", hrefs: ["/account"] },
  { title: "Orders & billing", hrefs: ["/account/orders", "/account/gang-sheets", "/account/invoices", "/account/statements", "/account/sales-history", "/account/abandoned-carts"] },
  { title: "Catalogue", hrefs: ["/account/price-list", "/account/inventory"] },
  { title: "Account", hrefs: ["/account/profile", "/account/addresses", "/account/contacts", "/account/users", "/account/change-password", "/account/resend-emails"] },
];

function NavLinks({ items, pathname, onClose }: { items: typeof NAV_ITEMS; pathname: string; onClose?: () => void }) {
  const byHref = new Map(items.map((i) => [i.href, i]));
  return (
    <div>
      {NAV_GROUPS.map((g) => (
        <div key={g.title || "top"} style={{ marginBottom: "10px" }}>
          {g.title && (
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#9A98A0", letterSpacing: ".06em", textTransform: "uppercase", padding: "10px 12px 6px" }}>
              {g.title}
            </div>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {g.hrefs.map((href) => {
              const item = byHref.get(href);
              if (!item) return null;
              const active = pathname === item.href || (item.href !== "/account" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "8px 12px", borderRadius: "9px", fontSize: "13px",
                      fontWeight: active ? 700 : 500,
                      color: active ? "#1A5CFF" : "#2A2830",
                      background: active ? "rgba(26,92,255,.08)" : "transparent",
                      boxShadow: active ? "inset 3px 0 0 #1A5CFF" : "none",
                      textDecoration: "none", transition: "background .15s", marginBottom: "1px",
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navItems = NAV_ITEMS;

  // Clean account portal — no store chrome. A store link + sign out live in
  // the sidebar so the buyer can jump back to shopping. The store home ("/")
  // resolves to their own brand via the active tenant.
  const branding = useBranding();
  async function handleSignOut() {
    try { await authService.logout(); } catch { /* ignore */ }
    useAuthStore.getState().clearAuth();
    router.push("/login" + (typeof window !== "undefined" ? window.location.search : ""));
  }

  // Get current page label for mobile breadcrumb
  const currentLabel =
    navItems.find(
      (i) =>
        pathname === i.href ||
        (i.href !== "/account" && pathname.startsWith(i.href))
    )?.label ?? "Account";

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

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated()) return null;

  return (
    <>
      <SupportChat />
      {/* ── Mobile nav bar ── */}
      <div
        className="account-sidebar-mobile"
        style={{
          background: "#fff",
          borderBottom: "1px solid #E2E0DA",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "7px 12px",
            background: "#F4F3EF",
            border: "1px solid #E2E0DA",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            color: "#2A2830",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          Menu
        </button>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#2A2830",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentLabel}
        </span>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 60 }}
          className="account-sidebar-mobile"
        >
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)" }}
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer */}
          <div
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              bottom: 0,
              width: "280px",
              background: "#fff",
              padding: "20px 16px",
              overflowY: "auto",
              zIndex: 61,
              boxShadow: "4px 0 24px rgba(0,0,0,.12)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".1em",
                  color: "#7A7880",
                }}
              >
                My Account
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "20px",
                  color: "#7A7880",
                  padding: "4px",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <Link
              href="/"
              onClick={() => setDrawerOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "11px 12px", marginBottom: "14px", borderRadius: "8px",
                background: "var(--brand-primary, #1C3557)", color: "#fff",
                textDecoration: "none", fontSize: "14px", fontWeight: 700,
              }}
            >
              🛍 {branding?.store_name ? `Visit ${branding.store_name}` : "Visit Store"} →
            </Link>
            <NavLinks items={navItems} pathname={pathname} onClose={() => setDrawerOpen(false)} />
            <button
              onClick={() => { setDrawerOpen(false); handleSignOut(); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                marginTop: "10px", padding: "10px 12px", borderRadius: "6px",
                fontSize: "14px", fontWeight: 600, color: "#B91C1C",
                background: "transparent", border: "1px solid #F3D0D0", cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* ── Desktop + main layout ── */}
      <div
        className="account-layout-wrapper"
        style={{
          maxWidth: "1500px",
          margin: "0 auto",
          padding: "32px 16px",
          display: "flex",
          gap: "24px",
          alignItems: "flex-start",
        }}
      >
        {/* Desktop sidebar */}
        <nav
          className="account-sidebar-desktop"
          style={{
            width: "236px",
            flexShrink: 0,
            position: "sticky",
            top: "20px",
            background: "#fff",
            border: "1px solid #ECEAE4",
            borderRadius: "16px",
            padding: "14px 10px",
            boxShadow: "0 1px 2px rgba(0,0,0,.03)",
          }}
        >
          <div style={{ padding: "4px 12px 12px", borderBottom: "1px solid #F2F0EA", marginBottom: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#9A98A0", letterSpacing: ".06em", textTransform: "uppercase" }}>My account</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.first_name ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}` : user?.email ?? ""}
            </div>
          </div>
          <NavLinks items={navItems} pathname={pathname} />
          <div style={{ borderTop: "1px solid #F2F0EA", marginTop: "6px", paddingTop: "10px", display: "grid", gap: "6px" }}>
            <Link
              href="/"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                padding: "10px 12px", borderRadius: "10px",
                background: "var(--brand-primary, #1C3557)", color: "#fff",
                textDecoration: "none", fontSize: "13px", fontWeight: 700,
              }}
            >
              {branding?.store_name ? `Shop ${branding.store_name}` : "Back to store"} →
            </Link>
            <button
              onClick={handleSignOut}
              style={{
                display: "block", width: "100%", textAlign: "center",
                padding: "9px 12px", borderRadius: "10px",
                fontSize: "13px", fontWeight: 600, color: "#B91C1C",
                background: "transparent", border: "1px solid #F3D0D0", cursor: "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              Sign out
            </button>
          </div>
        </nav>

        {/* Main content */}
        <main className="account-main" style={{ flex: 1, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </>
  );
}
