"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Platform (Super Admin) layout — only accessible to is_platform_admin users.
 * Regular brand admins are redirected to their own /admin panel.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isPlatformAdmin, isAdmin, isLoading, user, clearAuth } = useAuthStore();
  const router = useRouter();
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `mounted` guards against SSR/client hydration mismatch: the server has no
  // auth state, so we render the same neutral "loading" tree on the server AND
  // on the client's first paint, then reveal the real UI after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || isLoading) return;

    if (!isAuthenticated()) {
      redirectTimer.current = setTimeout(() => {
        if (!useAuthStore.getState().isAuthenticated()) {
          router.replace("/login");
        }
      }, 300);
    } else if (!isPlatformAdmin()) {
      // Logged in but not a super admin → send to their own area
      router.replace(isAdmin() ? "/admin/dashboard" : "/account");
    }

    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [mounted, isLoading, isAuthenticated, isPlatformAdmin, isAdmin, router]);

  if (!mounted || isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F7F8" }}>
        <div style={{ color: "#888", fontSize: "14px" }}>Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated() || !isPlatformAdmin()) {
    return null;
  }

  function handleLogout() {
    clearAuth();
    router.replace("/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F7F8", fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
      {/* Top bar */}
      <header
        style={{
          background: "#FFFFFF",
          borderBottom: "1px solid #E4E4E7",
          padding: "0 28px",
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <Link href="/platform" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "28px", height: "28px", borderRadius: "7px",
                background: "#18181B",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "15px", fontWeight: 800, color: "#18181B",
              }}
            >
              ⬡
            </span>
            <span style={{ color: "#18181B", fontWeight: 700, fontSize: "15px", letterSpacing: ".02em" }}>
              Platform Console
            </span>
          </Link>
          <nav style={{ display: "flex", gap: "20px" }}>
            <Link href="/platform" style={{ color: "#52525B", textDecoration: "none", fontSize: "13px", fontWeight: 600 }}>
              Brands
            </Link>
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ color: "#6B7280", fontSize: "12px" }}>
            {user?.email}
          </span>
          <span
            style={{
              background: "#F4F4F5", color: "#52525B",
              padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
            }}
          >
            SUPER ADMIN
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: "transparent", border: "1px solid #D4D4D8", color: "#52525B",
              padding: "6px 14px", borderRadius: "7px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <main style={{ padding: "32px 28px", maxWidth: "1200px", margin: "0 auto" }}>{children}</main>
    </div>
  );
}
