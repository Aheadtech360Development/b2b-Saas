"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Footer } from "@/components/layout/Footer";
import { isReadOnly } from "@/lib/permissions";
import { CopilotDock } from "@/components/admin/CopilotDock";
import { EntitlementsProvider } from "@/lib/entitlements";
import { TrialBanner } from "@/components/admin/TrialBanner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading, user } = useAuthStore();
  const router = useRouter();
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard hydration: server has no auth state, so render the same neutral
  // "loading" tree on the server AND the client's first paint, then reveal the
  // real layout after mount — otherwise sessionStorage-restored auth mismatches.
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
    } else if (!isAdmin()) {
      router.replace("/account");
    }

    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [mounted, isLoading, isAuthenticated, isAdmin, router]);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated() || !isAdmin()) {
    return null;
  }

  return (
  <EntitlementsProvider>
  <div className="flex justify-center bg-gray-50 min-h-screen">
    <div className="admin-layout-root flex w-full max-w-[1500px] mx-auto">
      <AdminSidebar />
      <CopilotDock />
      {/* Padding comes from .admin-content, which scales it with the window —
          a flat one left the page heading up against the sidebar's border. */}
      <main className="flex-1 overflow-auto admin-content">
        {/* How long the free period has left, above the work rather than
            on a billing page nobody passes. */}
        <TrialBanner />
        {isReadOnly(user?.role, user?.read_only) && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "15px" }}>👁</span> <strong>View-only access</strong> — you can browse but cannot make changes.
          </div>
        )}
        {children}
      </main>
    </div>
  </div>
  </EntitlementsProvider>
);
}
