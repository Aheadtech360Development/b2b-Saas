// frontend/src/app/(customer)/account/layout.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

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
          top: "68px",
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
            top: "88px",
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
