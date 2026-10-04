"use client";

/**
 * Admin-only, like the theme editor beside it: signed out goes to sign in,
 * signed in without admin rights goes to the customer account.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

export default function AdminGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || isLoading) return;
    if (!isAuthenticated()) {
      const t = setTimeout(() => {
        if (!useAuthStore.getState().isAuthenticated()) router.replace("/login");
      }, 300);
      return () => clearTimeout(t);
    }
    if (!isAdmin()) router.replace("/account");
    return;
  }, [mounted, isLoading, isAuthenticated, isAdmin, router]);

  if (!mounted || isLoading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8A8A", fontSize: "14px" }}>Loading…</div>;
  }
  if (!isAuthenticated() || !isAdmin()) return null;
  return <>{children}</>;
}
