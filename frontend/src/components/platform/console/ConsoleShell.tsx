"use client";

/**
 * The Platform Console's frame, as designed ("PrintCoPilot Super Admin"): the
 * navy column of places, grouped (Tenants, Money, Growth, Platform), and the
 * bar across the top with search, who is signed in and the way out.
 *
 * Built from the admin's own parts (.pc-*), so the two consoles read alike.
 * Affiliates and Leads are live and have no place in the design's column;
 * they keep one here, under Growth.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, BadgePercent, Building2, CreditCard, HeartPulse, Inbox, LifeBuoy, Menu,
  Search, Settings, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth.store";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import { consoleApi, type SearchResults } from "./api";

interface Place { href: string; label: string; icon: LucideIcon; also?: string[] }

const GROUPS: [string, Place[]][] = [
  ["Tenants", [
    { href: "/platform", label: "Brands", icon: Building2, also: ["/platform/brands"] },
    { href: "/platform/users", label: "Users", icon: Users },
    { href: "/platform/support", label: "Support", icon: LifeBuoy },
  ]],
  ["Money", [
    { href: "/platform/revenue", label: "Revenue", icon: Wallet },
    { href: "/platform/plans", label: "Plans", icon: CreditCard },
    { href: "/platform/taxes", label: "Taxes", icon: BadgePercent },
  ]],
  ["Growth", [
    { href: "/platform/affiliates", label: "Affiliates", icon: Users },
    { href: "/platform/leads", label: "Leads", icon: Inbox },
  ]],
  ["Platform", [
    { href: "/platform/health", label: "Health", icon: HeartPulse },
    { href: "/platform/activity", label: "Activity", icon: Activity },
    { href: "/platform/settings", label: "Settings", icon: Settings },
  ]],
];

function isOn(pathname: string, p: Place): boolean {
  if (p.href === "/platform") {
    return pathname === "/platform" || (p.also ?? []).some((a) => pathname === a || pathname.startsWith(`${a}/`));
  }
  return pathname === p.href || pathname.startsWith(`${p.href}/`);
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/platform";
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => { setOpen(false); }, [pathname]);
  // Affiliate applications waiting for a decision, beside Affiliates.
  useEffect(() => {
    apiClient.get<{ applications: number }>("/api/v1/platform/affiliates/badge")
      .then((b) => setWaiting(b.applications || 0)).catch(() => undefined);
  }, [pathname]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <>
      {open && <div className="pc-side-back" onClick={() => setOpen(false)} aria-hidden />}
      <aside className="pc-side" data-open={open ? "" : undefined} aria-label="Platform console">
        <Link href="/platform" className="pc-console-brand" style={{ textDecoration: "none" }}>
          <PlatformLogo onDark width={176} />
          <span className="pc-console-chip">Platform console</span>
        </Link>
        <nav className="pc-side-scroll">
          {GROUPS.map(([group, places]) => (
            <div key={group}>
              <div className="pc-side-group">{group}</div>
              {places.map((p) => {
                const Icon = p.icon;
                const on = isOn(pathname, p);
                return (
                  <Link key={p.href} href={p.href} className="pc-nav" data-active={on ? "" : undefined}
                    aria-current={on ? "page" : undefined}>
                    <Icon size={18} strokeWidth={1.9} />
                    <span>{p.label}</span>
                    {p.href === "/platform/affiliates" && waiting > 0 && <span className="pc-nav-count">{waiting}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="pc-main">
        <TopBar onMenu={() => setOpen(true)} onSearch={() => setSearching(true)} />
        <main className="pc-content">
          <div className="pc-page" style={{ maxWidth: pathname.startsWith("/platform/affiliates") ? "none" : undefined }}>
            {children}
          </div>
        </main>
      </div>
      {searching && <Palette onClose={() => setSearching(false)} />}
    </>
  );
}

function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    // The token is revoked on the server too, not only forgotten here.
    try { await authService.logout(); } catch { /* signed out here regardless */ }
    clearAuth();
    router.replace("/login");
  }

  return (
    <header className="pc-top">
      <button type="button" className="pc-menu-burger" onClick={onMenu} aria-label="Open the menu"><Menu size={18} /></button>
      <button type="button" className="pc-search" onClick={onSearch}>
        <Search size={16} />
        <span className="pc-search-words">Search brands, users, orders, products</span>
        <span className="pc-kbd">Ctrl K</span>
      </button>
      <div className="pc-top-right">
        <span className="pc-role-chip">Super admin</span>
        <span className="pc-who-name" style={{ fontSize: "14px", color: "var(--pc-ink-2)" }}>{user?.email}</span>
        <button type="button" className="pc-btn" onClick={signOut} disabled={busy}>Log out</button>
      </div>
    </header>
  );
}

type Hit = { group: string; label: string; sub: string; href: string };

function hitsOf(r: SearchResults): Hit[] {
  return [
    ...r.brands.map((b) => ({ group: "Brands", label: b.name, sub: `Store: ${b.slug} · ${b.status}`, href: `/platform/brands/${b.slug}` })),
    ...r.users.map((u) => ({ group: "Users", label: u.name || u.email, sub: `${u.email} · ${u.brand_name} · ${u.type === "staff" ? "Staff" : "Buyer"}`, href: `/platform/users?q=${encodeURIComponent(u.email)}` })),
    ...r.orders.map((o) => ({ group: "Orders", label: `#${o.order_number}`, sub: `${o.brand_name ?? ""} · ${o.status} · $${o.total.toFixed(2)}`, href: o.brand_slug ? `/platform/brands/${o.brand_slug}` : "/platform" })),
    ...r.products.map((p) => ({ group: "Products", label: p.name, sub: `${p.brand_name ?? ""} · ${p.status}`, href: p.brand_slug ? `/platform/brands/${p.brand_slug}` : "/platform" })),
    ...r.customers.map((c) => ({ group: "Customers", label: c.name, sub: c.brand_name ?? "", href: c.brand_slug ? `/platform/brands/${c.brand_slug}` : "/platform" })),
  ];
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [on, setOn] = useState(0);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setState("idle"); return; }
    setState("busy");
    const timer = window.setTimeout(() => {
      consoleApi.search(term).then((r) => { setHits(hitsOf(r)); setOn(0); setState("done"); })
        .catch(() => { setHits([]); setState("done"); });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [q]);

  function go(h: Hit | undefined) {
    if (!h) return;
    onClose();
    router.push(h.href);
  }

  let group = "";
  return (
    <div className="pc-palette-back" onClick={onClose}>
      <div className="pc-palette" role="dialog" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <div className="pc-palette-in">
          <Search size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brands, users, orders, products"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setOn((n) => Math.min(n + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setOn((n) => Math.max(n - 1, 0)); }
              if (e.key === "Enter") go(hits[on]);
            }} />
        </div>
        <div className="pc-palette-list">
          {state === "idle" && <div className="pc-empty">Type two letters or more. Every result is a link.</div>}
          {state === "busy" && hits.length === 0 && <div className="pc-empty">Searching…</div>}
          {state === "done" && hits.length === 0 && <div className="pc-empty">Nothing found for “{q.trim()}”.</div>}
          {hits.map((h, i) => {
            const head = h.group !== group ? (group = h.group) : null;
            return (
              <div key={`${h.group}-${h.href}-${i}`}>
                {head && <div className="pc-palette-group">{head}</div>}
                <button type="button" className="pc-palette-item" data-on={i === on ? "" : undefined}
                  onMouseEnter={() => setOn(i)} onClick={() => go(h)}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</span>
                  <small>{h.sub}</small>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
