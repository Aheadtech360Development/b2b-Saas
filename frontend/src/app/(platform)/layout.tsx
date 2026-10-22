"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter, Outfit } from "next/font/google";
import { useAuthStore } from "@/stores/auth.store";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ConsoleShell } from "@/components/platform/console/ConsoleShell";
import { ClassicConsole } from "@/components/platform/classic/ClassicConsole";
import "../(admin)/admin-shell.css";
import "@/components/platform/console/console.css";

// The admin's two faces, so the two consoles read alike.
const sans = Inter({ subsets: ["latin"], variable: "--pc-font-sans", display: "swap" });
const display = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--pc-font-display", display: "swap" });

// Whether the server has the redesigned console's routes, asked once per page
// load. Only a 404 says no: a server older than the website (its deploy has
// not run yet), which gets the old console it can answer. Search without a
// query is refused (422) by a server that has it, without touching the data.
let serverHasConsole: Promise<boolean> | null = null;
function askServer(): Promise<boolean> {
  if (!serverHasConsole) {
    serverHasConsole = apiClient.get("/api/v1/platform/console/search")
      .then(() => true)
      .catch((err) => !(err instanceof ApiClientError && err.status === 404));
  }
  return serverHasConsole;
}

/**
 * Platform (Super Admin) layout — only accessible to is_platform_admin users.
 * Regular brand admins are redirected to their own /admin panel. The console's
 * frame (components/platform/console/ConsoleShell) is drawn here, around every
 * console page.
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

  // null until the server has said which console it can answer.
  const [classic, setClassic] = useState<boolean | null>(null);
  useEffect(() => {
    if (!mounted || isLoading || !isAuthenticated() || !isPlatformAdmin()) return;
    let live = true;
    void askServer().then((has) => { if (live) setClassic(!has); });
    return () => { live = false; };
  }, [mounted, isLoading, isAuthenticated, isPlatformAdmin]);

  if (!mounted || isLoading || (classic === null && isAuthenticated() && isPlatformAdmin())) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FA" }}>
        <div style={{ color: "#888", fontSize: "14px" }}>Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated() || !isPlatformAdmin()) {
    return null;
  }

  if (classic) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F7F8", fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
        <ClassicConsole />
      </div>
    );
  }

  return (
    <div className={`pc-admin pc-console ${sans.variable} ${display.variable}`}>
      <ConsoleShell>{children}</ConsoleShell>
    </div>
  );
}
