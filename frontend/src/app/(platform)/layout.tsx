"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Platform (Super Admin) layout — only accessible to is_platform_admin users.
 * Regular brand admins are redirected to their own /admin panel. The console's
 * bar and content area are the page's (components/platform/ConsoleBar), since
 * the bar holds the page's tabs.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isPlatformAdmin, isAdmin, isLoading } = useAuthStore();
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

  return (
    <div style={{ minHeight: "100vh", background: "#F7F7F8", fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
      {children}
    </div>
  );
}
