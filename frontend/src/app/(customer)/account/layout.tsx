// frontend/src/app/(customer)/account/layout.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { apiClient } from "@/lib/api-client";
import { ShoppingCartIcon } from "@/components/ui/icons";
import { useBranding } from "@/components/providers/BrandingProvider";

const NAV_ITEMS = [
  { href: "/account", label: "Overview" },
  { href: "/account/profile", label: "Account Profile" },
  { href: "/account/change-password", label: "Change Password" },
  { href: "/account/addresses", label: "Address Book" },
  { href: "/account/contacts", label: "Manage Contacts" },
  { href: "/account/users", label: "Manage Users" },
  { href: "/account/resend-emails", label: "Resend Registration Emails" },
  { href: "/account/payment-methods", label: "Manage Payment Methods" },
  { href: "/account/orders", label: "Orders Status" },
  { href: "/account/gang-sheets", label: "My Gang Sheets" },
  { href: "/account/statements", label: "Statements" },
  { href: "/account/invoices", label: "Invoices" },
  { href: "/account/sales-history", label: "Purchase History" },
  { href: "/account/inventory", label: "Inventory Listing Report" },
  { href: "/account/price-list", label: "Price List" },
  { href: "/account/abandoned-carts", label: "Abandoned Carts" },
];

function NavLinks({ items, pathname, onClose }: { items: typeof NAV_ITEMS; pathname: string; onClose?: () => void }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/account" && pathname.startsWith(item.href));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onClose}
              style={{
                display: "block",
                padding: "9px 12px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: active ? 700 : 500,
                color: active ? "#1A5CFF" : "#2A2830",
                background: active ? "rgba(26,92,255,.07)" : "transparent",
                textDecoration: "none",
                transition: "background .15s",
                marginBottom: "2px",
              }}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navItems = NAV_ITEMS;

  // The store navbar is hidden on account pages, so this layout carries the
  // essentials it used to provide: brand name (back to shop), cart, sign out.
  const branding = useBranding();
  const [cartCount, setCartCount] = useState(0);
  useEffect(() => {
    apiClient
      .get<{ items: { quantity: number }[] }>("/api/v1/cart")
      .then((r) => setCartCount((r.items || []).reduce((s, i) => s + i.quantity, 0)))
      .catch(() => setCartCount(0));
  }, [pathname]);

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
      {/* ── Slim account header (replaces the store navbar on account pages) ── */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #E2E0DA",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          {branding?.logo_url ? (
            <img src={branding.logo_url} alt={branding.store_name} height={30} style={{ maxHeight: "30px", width: "auto", objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: "17px", fontWeight: 800, color: "var(--brand-primary, #1C3557)", fontFamily: "var(--brand-font-heading, 'DM Sans', sans-serif)" }}>
              {branding?.store_name || "Store"}
            </span>
          )}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Link href="/" style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830", textDecoration: "none" }}>
            ← Shop
          </Link>
          <Link href="/cart" style={{ position: "relative", display: "flex", alignItems: "center", border: "1px solid #E2E2DE", borderRadius: "6px", padding: "6px 10px", textDecoration: "none" }}>
            <ShoppingCartIcon size={17} color="var(--brand-primary, #1C3557)" />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: "-7px", right: "-7px", background: "var(--brand-primary, #1C3557)", color: "#fff", fontSize: "10px", fontWeight: 700, minWidth: "17px", height: "17px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                {cartCount}
              </span>
            )}
          </Link>
          <button
            onClick={handleSignOut}
            style={{ fontSize: "13px", fontWeight: 600, color: "#B91C1C", background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "7px 14px", cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </div>

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
          top: "52px",
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
            <NavLinks items={navItems} pathname={pathname} onClose={() => setDrawerOpen(false)} />
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
            width: "200px",
            flexShrink: 0,
            position: "sticky",
            top: "72px",
          }}
        >
          <h2
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".1em",
              color: "#7A7880",
              marginBottom: "10px",
            }}
          >
            My Account
          </h2>
          <NavLinks items={navItems} pathname={pathname} />
        </nav>

        {/* Main content */}
        <main className="account-main" style={{ flex: 1, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </>
  );
}
