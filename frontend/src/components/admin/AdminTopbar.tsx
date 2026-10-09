"use client";

/**
 * The bar across the top of every admin page: find something, read the inbox,
 * ask the copilot, and the account.
 *
 * Search looks in the three places a shop looks things up, orders, customers
 * and products, through the same lists their own pages use, so what it finds
 * is what those pages would show. Ctrl+K (Cmd+K on a Mac) opens it from
 * anywhere in the admin.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, LogOut, Menu, Package, Search, ShoppingBag, Sparkles, Store, UserRound, Users } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { hasScope, type Scope } from "@/lib/permissions";
import { contactService } from "@/services/contact.service";
import { useAuthStore } from "@/stores/auth.store";
import { useCopilotStore } from "@/stores/copilot.store";
import { useBranding } from "@/components/providers/BrandingProvider";
import { OPEN_NAV } from "@/components/layout/AdminSidebar";

interface Hit { group: "Orders" | "Customers" | "Products"; id: string; title: string; note: string; href: string }

const money = (n: unknown) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AdminTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const can = useCallback((s: Scope) => hasScope(user?.role, s, user?.scopes), [user?.role, user?.scopes]);
  const branding = useBranding();
  const shop = (branding?.store_name && branding.store_name !== "Store" ? branding.store_name : "") || user?.first_name || "Your shop";
  const copilotOpen = useCopilotStore((s) => s.open);
  const setCopilotOpen = useCopilotStore((s) => s.setOpen);

  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);
  const [finding, setFinding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  useEffect(() => {
    if (!can("customers")) return;
    contactService.list().then((r) => setUnread(r.unread || 0)).catch(() => {});
  }, [pathname, can]);

  useEffect(() => { setMenu(false); setFinding(false); }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setFinding(true); }
    };
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, []);

  function signOut() {
    clearAuth();
    router.replace("/login");
  }

  const who = user?.first_name ? `${user.first_name} ${user.last_name ?? ""}`.trim() : user?.email ?? "";

  return (
    <header className="pc-top">
      <button type="button" className="pc-menu-burger" aria-label="Open the menu" onClick={() => window.dispatchEvent(new Event(OPEN_NAV))}>
        <Menu size={19} strokeWidth={2} />
      </button>

      <button type="button" className="pc-search" onClick={() => setFinding(true)} aria-label="Search orders, customers, products">
        <Search size={17} strokeWidth={2} />
        <span className="pc-search-words">Search orders, customers, products</span>
        <span className="pc-kbd">{isMac ? "Cmd K" : "Ctrl K"}</span>
      </button>

      <div className="pc-top-right">
        {can("customers") && (
          <Link href="/admin/messages" className="pc-btn" aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}>
            <Inbox size={17} strokeWidth={1.9} />
            <span className="pc-btn-words">Inbox</span>
            {unread > 0 && <span className="pc-btn-count">{unread > 99 ? "99+" : unread}</span>}
          </Link>
        )}
        <button type="button" className="pc-btn" data-kind="dark" aria-pressed={copilotOpen} onClick={() => setCopilotOpen(!copilotOpen)}>
          <Sparkles size={16} strokeWidth={2} />
          <span className="pc-btn-words">Copilot</span>
        </button>

        <div ref={menuRef} style={{ position: "relative" }}>
          <button type="button" className="pc-who" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <span className="pc-avatar" aria-hidden>{shop.trim().charAt(0) || "S"}</span>
            <span className="pc-who-name">{shop}</span>
          </button>
          {menu && (
            <div className="pc-menu" role="menu">
              <div className="pc-menu-head">
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--pc-ink)" }}>{who || shop}</div>
                {user?.email && who !== user.email && <div style={{ fontSize: "12.5px", color: "var(--pc-muted)", marginTop: "2px" }}>{user.email}</div>}
              </div>
              <a href="/" target="_blank" rel="noreferrer" role="menuitem"><Store size={16} strokeWidth={1.9} /> View your store</a>
              <Link href="/admin/settings/security" role="menuitem"><UserRound size={16} strokeWidth={1.9} /> Sign-in and security</Link>
              <button type="button" role="menuitem" onClick={signOut} style={{ color: "var(--pc-red)" }}><LogOut size={16} strokeWidth={1.9} /> Sign out</button>
            </div>
          )}
        </div>
      </div>

      {finding && <SearchPalette can={can} onClose={() => setFinding(false)} />}
    </header>
  );
}

function SearchPalette({ can, onClose }: { can: (s: Scope) => boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(0);
  const asked = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const mine = ++asked.current;
    const timer = window.setTimeout(async () => {
      const enc = encodeURIComponent(term);
      type Page<T> = { items?: T[] };
      const [orders, customers, products] = await Promise.allSettled([
        can("orders") ? apiClient.get<Page<Record<string, unknown>>>(`/api/v1/admin/orders?q=${enc}&page_size=5`) : Promise.resolve({ items: [] }),
        can("customers") ? apiClient.get<Page<Record<string, unknown>>>(`/api/v1/admin/companies?q=${enc}&page_size=5`) : Promise.resolve({ items: [] }),
        can("products") ? apiClient.get<Page<Record<string, unknown>>>(`/api/v1/admin/products?q=${enc}&page_size=5`) : Promise.resolve({ items: [] }),
      ]);
      if (mine !== asked.current) return;   // an older answer arriving after a newer question
      const list = <T,>(r: PromiseSettledResult<Page<T> | T[]>): T[] =>
        r.status !== "fulfilled" ? [] : Array.isArray(r.value) ? r.value : r.value.items ?? [];
      const found: Hit[] = [
        ...list(orders).map((o) => ({
          group: "Orders" as const, id: String(o.id), title: `Order ${o.order_number}`,
          note: [o.company_name || o.guest_name || "Guest", money(o.total), String(o.status ?? "")].filter(Boolean).join(" · "),
          href: `/admin/orders/${o.id}`,
        })),
        ...list(customers).map((c) => ({
          group: "Customers" as const, id: String(c.id), title: String(c.name ?? "Customer"),
          note: String(c.company_email ?? c.email ?? c.status ?? ""), href: `/admin/customers/${c.id}`,
        })),
        ...list(products).map((p) => ({
          group: "Products" as const, id: String(p.id), title: String(p.name ?? "Product"),
          note: String(p.status ?? ""), href: `/admin/products/${p.slug ?? p.id}/edit`,
        })),
      ];
      setHits(found);
      setAt(0);
      setBusy(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [q, can]);

  function go(h: Hit | undefined) {
    if (!h) return;
    onClose();
    router.push(h.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(hits[at]); }
  }

  const icon = { Orders: ShoppingBag, Customers: Users, Products: Package } as const;
  let row = -1;

  return (
    <div className="pc-palette-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pc-palette" role="dialog" aria-label="Search">
        <div className="pc-palette-in">
          <Search size={18} strokeWidth={2} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search orders, customers, products" aria-label="Search" />
          <span className="pc-kbd">Esc</span>
        </div>
        <div className="pc-palette-list">
          {q.trim().length < 2 && <div className="pc-empty">Type an order number, a customer or a product name.</div>}
          {q.trim().length >= 2 && busy && <div className="pc-empty">Searching…</div>}
          {q.trim().length >= 2 && !busy && hits.length === 0 && <div className="pc-empty">Nothing found for “{q.trim()}”.</div>}
          {!busy && (["Orders", "Customers", "Products"] as const).map((group) => {
            const mine = hits.filter((h) => h.group === group);
            if (!mine.length) return null;
            const Icon = icon[group];
            return (
              <div key={group}>
                <div className="pc-palette-group">{group}</div>
                {mine.map((h) => {
                  row += 1;
                  const i = row;
                  return (
                    <button key={h.group + h.id} type="button" className="pc-palette-item" data-on={i === at ? "" : undefined}
                      onMouseEnter={() => setAt(i)} onClick={() => go(h)}>
                      <Icon size={17} strokeWidth={1.9} color="var(--pc-muted)" />
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</span>
                      <small>{h.note}</small>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
