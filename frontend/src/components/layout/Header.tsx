"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { apiClient } from "@/lib/api-client";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { ShoppingCartIcon } from "@/components/ui/icons";
import { useBranding, type MenuItem } from "@/components/providers/BrandingProvider";

/** A storefront nav item — plain link, or a dropdown when it has children. */
function StoreNavItem({ item, navLinkStyle }: { item: MenuItem; navLinkStyle: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const children = item.children ?? [];
  if (children.length === 0) {
    return (
      <Link href={item.href || "#"} style={navLinkStyle}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1c3557"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1C3557"; }}>
        {item.label}
      </Link>
    );
  }
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link href={item.href || "#"} style={{ ...navLinkStyle, display: "flex", alignItems: "center", gap: "4px" }}>
        {item.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, background: "#fff", border: "1px solid #E2E2DE", padding: "6px", minWidth: "210px", boxShadow: "0 8px 24px rgba(0,0,0,.1)", zIndex: 100 }}>
          {children.map((c) => (
            <Link key={c.label + c.href} href={c.href || "#"}
              style={{ display: "block", padding: "9px 12px", color: "#1C3557", fontSize: "15px", fontWeight: 500, textDecoration: "none", fontFamily: "'DM Sans', sans-serif", transition: "background .15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F8F8F6")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { user, isAuthenticated, isAdmin, clearAuth, isLoading } = useAuthStore();
  const branding = useBranding();
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Resolve auth-dependent UI only AFTER mount so the server render (always
  // logged-out) and the first client render match — sessionStorage-restored
  // auth otherwise causes a hydration mismatch.
  useEffect(() => setMounted(true), []);
  const authed = mounted && isAuthenticated();
  const isAdminUser = mounted && isAdmin();

  // The storefront header is hidden inside the app consoles (platform + admin)
  // and on the minimal auth pages (login/register/forgot/activate).
  const _authPrefixes = ["/login", "/wholesale", "/forgot-password", "/reset-password", "/activate-account"];
  const hideStoreHeader =
    pathname?.startsWith("/platform") ||
    pathname?.startsWith("/admin") ||
    _authPrefixes.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (isLoading || !user || user.is_admin) return;
    function loadCount() {
      apiClient
        .get<{ items: { quantity: number }[] }>("/api/v1/cart")
        .then((r) => {
          const items = r?.items ?? [];
          setCartCount(items.reduce((sum, i) => sum + i.quantity, 0));
        })
        .catch(() => {});
    }
    loadCount();
    window.addEventListener("cart_updated", loadCount);
    return () => window.removeEventListener("cart_updated", loadCount);
  }, [isLoading, user]);

  useEffect(() => {
    if (isLoading || user) return;
    function readGuestCount() {
      try {
        const entries: { quantity: number }[] = JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
        setCartCount(entries.reduce((s, i) => s + i.quantity, 0));
      } catch {
        setCartCount(0);
      }
    }
    readGuestCount();
    window.addEventListener("storage", readGuestCount);
    window.addEventListener("af_guest_cart_updated", readGuestCount);
    return () => {
      window.removeEventListener("storage", readGuestCount);
      window.removeEventListener("af_guest_cart_updated", readGuestCount);
    };
  }, [isLoading, user]);

  async function handleLogout() {
    try {
      await authService.logout();
    } catch {
      // ignore
    }
    clearAuth();
    setCartCount(0);
    router.push("/login");
  }

  const navLinkStyle: React.CSSProperties = {
    color: "#1C3557",
    fontSize: "18px",
    fontWeight: 500,
    textDecoration: "none",
    letterSpacing: ".01em",
    padding: "6px 12px",
    transition: "color .15s",
    fontFamily: "'DM Sans', sans-serif",
  };

  if (hideStoreHeader) return null;

  return (
    <>
      <AnnouncementBar />

      {/* Main header */}
      <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E2DE", position: "sticky", top: 0, zIndex: 1 }}>
        <div className="header-inner" style={{ maxWidth: "1500px", margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "90px", gap: "24px" }}>

          {/* Logo / Store name (per-brand) */}
          <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", gap: "10px" }}>
            {branding.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logo_url} alt={branding.store_name} height={52} style={{ maxHeight: "52px", width: "auto", objectFit: "contain", display: "block" }} />
            ) : (
              <span style={{ fontFamily: "'Fraunces', serif", fontSize: "24px", fontWeight: 700, color: branding.primary_color, letterSpacing: "-.01em" }}>
                {branding.store_name}
              </span>
            )}
          </Link>

          {/* Desktop Nav (per-brand menu with submenus) */}
          <nav className="hidden md:flex" style={{ gap: "0px", alignItems: "center" }}>
            {(branding.menu_items?.length ? branding.menu_items : [{ href: "/products", label: "Shop All" }]).map((item) => (
              <StoreNavItem key={item.label + item.href} item={item} navLinkStyle={navLinkStyle} />
            ))}

            {/* Authenticated non-admin links */}
            {authed && !isAdminUser && (
              <>
                <Link href="/quick-order" style={navLinkStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1c3557"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1C3557"; }}>
                  Quick Order
                </Link>
                <Link href="/account" style={navLinkStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1c3557"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1C3557"; }}>
                  My Account
                </Link>
              </>
            )}
          </nav>

          {/* Right Actions */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* US flag */}
            <img src="https://flagcdn.com/w40/us.png" alt="US" width={28} height={18} style={{ objectFit: "cover", borderRadius: "2px", display: "block", marginRight: "8px" }} />
            {/* Cart */}
            {!isAdminUser && (
              <Link href="/cart" style={{ position: "relative", background: "transparent", border: "1px solid #E2E2DE", color: "#1C3557", padding: "8px 12px", cursor: "pointer", fontSize: "18px", transition: "all .2s", display: "flex", alignItems: "center" }}>
                <ShoppingCartIcon size={18} color="#1C3557" />
                {cartCount > 0 && (
                  <span style={{ position: "absolute", top: "-6px", right: "-6px", background: "#1C3557", color: "#fff", fontSize: "9px", fontWeight: 700, width: "18px", height: "18px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {cartCount}
                  </span>
                )}
              </Link>
            )}

            <div className="hidden md:flex" style={{ gap: "10px", alignItems: "center" }}>
              {authed ? (
                <>
                  {isAdminUser && (
                    <Link
                      href="/admin/dashboard"
                      title="Go to Admin Dashboard"
                      style={{ display: "flex", alignItems: "center", gap: "7px", background: branding.primary_color, color: "#fff", padding: "8px 15px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "6px", fontFamily: "'DM Sans', sans-serif", transition: "opacity .2s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                      </svg>
                      Admin Panel
                    </Link>
                  )}
                  <span style={{ fontSize: "15px", color: "#1C3557", fontFamily: "'DM Sans', sans-serif" }}>
                    {user?.first_name}
                  </span>
                  <button
                    onClick={handleLogout}
                    style={{ background: "transparent", color: "#1C3557", padding: "8px 16px", fontSize: "15px", border: "1px solid #E2E2DE", cursor: "pointer", fontWeight: 500, transition: "all .2s", fontFamily: "'DM Sans', sans-serif", borderRadius: "6px" }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" style={{ background: "transparent", color: "#1C3557", padding: "8px 16px", fontSize: "18px", border: "1px solid #1C3557", fontWeight: 500, textDecoration: "none", transition: "all .2s", fontFamily: "'DM Sans', sans-serif" }}>
                    Log In
                  </Link>
                  <Link href="/wholesale/register" style={{ background: "#1C3557", color: "#fff", padding: "8px 18px", fontSize: "18px", fontWeight: 500, textDecoration: "none", transition: "all .2s", fontFamily: "'DM Sans', sans-serif" }}>
                    Apply Now
                  </Link>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden"
              style={{ padding: "8px", color: "#1C3557", background: "transparent", border: "1px solid #E2E2DE", cursor: "pointer" }}
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile overlay nav */}
      {menuOpen && (
        <div className="md:hidden" style={{ position: "fixed", inset: 0, zIndex: 200 }}>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)" }}
            onClick={() => setMenuOpen(false)}
          />
          {/* Drawer */}
          <div style={{
            position: "fixed", left: 0, top: 0, bottom: 0, width: "300px",
            background: "#fff", overflowY: "auto", zIndex: 201,
            padding: "0 0 32px",
            boxShadow: "4px 0 24px rgba(0,0,0,.12)",
          }}>
            {/* Drawer header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #E2E2DE" }}>
              {branding.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logo_url} alt={branding.store_name} height={40} style={{ maxHeight: "40px", width: "auto", objectFit: "contain" }} />
              ) : (
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 700, color: branding.primary_color }}>{branding.store_name}</span>
              )}
              <button
                onClick={() => setMenuOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6B6B", fontSize: "13px", lineHeight: 1, padding: "4px" }}
              >
                ✕
              </button>
            </div>
            {/* Links (per-brand menu + submenus) */}
            <div style={{ padding: "16px 24px" }}>
              {(branding.menu_items?.length ? branding.menu_items : [{ href: "/products", label: "Shop All" }]).map((item) => (
                <div key={item.label + item.href}>
                  <Link href={item.href || "#"} onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    {item.label}
                  </Link>
                  {(item.children ?? []).map((c) => (
                    <Link key={c.label + c.href} href={c.href || "#"} onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "10px 0 10px 16px", color: "#6B6B6B", fontSize: "13px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #F0EFEA", fontFamily: "'DM Sans', sans-serif" }}>
                      {c.label}
                    </Link>
                  ))}
                </div>
              ))}
              {authed && !isAdminUser && (
                <>
                  <Link href="/quick-order" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    Quick Order
                  </Link>
                  <Link href="/account" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    My Account
                  </Link>
                  <Link href="/cart" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    Cart {cartCount > 0 && `(${cartCount})`}
                  </Link>
                </>
              )}
              {!authed && (
                <>
                  <Link href="/cart" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    Cart {cartCount > 0 && `(${cartCount})`}
                  </Link>
                  <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Link href="/wholesale/register" onClick={() => setMenuOpen(false)} style={{ display: "block", background: "#1C3557", color: "#fff", padding: "12px 20px", fontWeight: 500, fontSize: "13px", textDecoration: "none", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
                      Apply for Wholesale Account
                    </Link>
                    <Link href="/login" onClick={() => setMenuOpen(false)} style={{ display: "block", background: "transparent", color: "#1C3557", border: "1px solid #1C3557", padding: "12px 20px", fontWeight: 500, fontSize: "13px", textDecoration: "none", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
                      Log In
                    </Link>
                  </div>
                </>
              )}
              {authed && isAdminUser && (
                <Link href="/admin/dashboard" onClick={() => setMenuOpen(false)} style={{ marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", padding: "12px", color: "#fff", fontSize: "14px", fontWeight: 600, background: branding.primary_color, textDecoration: "none", fontFamily: "'DM Sans', sans-serif", borderRadius: "6px", boxSizing: "border-box" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Admin Panel
                </Link>
              )}
              {authed && (
                <button onClick={handleLogout} style={{ marginTop: "12px", display: "block", width: "100%", textAlign: "center", padding: "12px", color: "#1C3557", fontSize: "18px", fontWeight: 500, background: "transparent", border: "1px solid #E2E2DE", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @media (max-width: 768px) {
          .af-logo { height: 40px !important; width: auto !important; }
          .header-inner { padding: 0 16px !important; }
        }
      `}</style>
    </>
  );
}
