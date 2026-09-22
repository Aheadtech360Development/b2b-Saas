"use client";

/**
 * The theme editor on its own screen.
 *
 * It lives outside the admin layout on purpose: the storefront preview is the
 * thing being worked on, and an admin sidebar beside it only makes the store
 * look smaller than it is. The guard here matches the admin layout's — the
 * editor is admin-only.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import ThemeCustomizer from "@/components/admin/ThemeCustomizer";

export default function ThemeEditorPage() {
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

  return (
    <div style={{ background: "#F7F7F5" }}>
      <div style={{ position: "absolute", top: "18px", left: "18px", zIndex: 5 }}>
        <Link href="/admin" style={{ fontSize: "12.5px", fontWeight: 700, color: "#7A7880", textDecoration: "none" }}>← Admin</Link>
      </div>
      <ThemeCustomizer fullScreen />
    </div>
  );
}
