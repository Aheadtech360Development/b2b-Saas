"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { accountService } from "@/services/account.service";

interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  total: string;
  created_at: string;
}

interface Profile {
  first_name: string;
  last_name: string;
  email: string;
}

export default function AccountOverviewPage() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const hasLoaded = useRef(false);

  useEffect(() => {
    // Don't fetch until auth is settled and user is a non-admin customer
    if (isLoading || !user || user.is_admin) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    async function load() {
      const [p, o] = await Promise.all([
        accountService.getProfile() as Promise<Profile>,
        accountService.getOrders({ page: 1 }) as Promise<{ items: OrderSummary[] }>,
      ]);
      setProfile(p);
      setRecentOrders((o.items ?? []).slice(0, 5));
    }
    load();
  }, [isLoading]);

  // Admin accounts don't have a customer dashboard
  if (!isLoading && user?.is_admin) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-amber-800 mb-1">Admin Account</h2>
        <p className="text-sm text-amber-700">
          Admin accounts don&apos;t have a customer dashboard.{" "}
          <Link href="/admin/dashboard" className="underline font-medium">
            Use the Admin Panel →
          </Link>
        </p>
      </div>
    );
  }

  const TILES = [
    { label: "Orders", note: "Track and reorder", href: "/account/orders", icon: "📦" },
    { label: "My Print Jobs", note: "Gang sheets & transfers", href: "/account/gang-sheets", icon: "🖨️" },
    { label: "Invoices", note: "Pay and download", href: "/account/invoices", icon: "🧾" },
    { label: "Price list", note: "Your prices", href: "/account/price-list", icon: "🏷️" },
    { label: "Purchase history", note: "What you bought", href: "/account/sales-history", icon: "📈" },
    { label: "Addresses", note: "Ship-to locations", href: "/account/addresses", icon: "📍" },
  ];
  const statusTone = (st: string) => {
    const s = (st || "").toLowerCase();
    if (["delivered", "shipped"].includes(s)) return { bg: "rgba(5,150,105,.1)", fg: "#059669" };
    if (["cancelled", "refunded"].includes(s)) return { bg: "rgba(232,36,42,.1)", fg: "#E8242A" };
    if (["processing", "confirmed"].includes(s)) return { bg: "rgba(26,92,255,.08)", fg: "#1A5CFF" };
    return { bg: "rgba(156,163,175,.16)", fg: "#6B7280" };
  };

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      {/* Welcome */}
      <div style={{ background: "#fff", border: "1px solid #ECEAE4", borderRadius: "16px", padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#9A98A0", letterSpacing: ".04em" }}>Your account</div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "4px 0 0" }}>
            Welcome back{profile ? `, ${profile.first_name}` : ""}
          </h1>
          {profile?.email && <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>{profile.email}</p>}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Link href="/account/orders" style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid #E6E4DE", background: "#fff", color: "#1A1A1A", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
            View orders
          </Link>
          <Link href="/products" style={{ padding: "10px 16px", borderRadius: "10px", background: "var(--brand-primary, #1C3557)", color: "#fff", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
            Shop now →
          </Link>
        </div>
      </div>

      {/* Shortcuts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "12px" }}>
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            style={{ background: "#fff", border: "1px solid #ECEAE4", borderRadius: "14px", padding: "16px", textDecoration: "none", display: "flex", gap: "12px", alignItems: "center", transition: "border-color .15s, box-shadow .15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D6D3CB"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#ECEAE4"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <span aria-hidden style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#F6F5F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>{t.icon}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>{t.label}</span>
              <span style={{ display: "block", fontSize: "12px", color: "#8A8890", marginTop: "2px" }}>{t.note}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* Recent orders */}
      <div style={{ background: "#fff", border: "1px solid #ECEAE4", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #F2F0EA" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 800, color: "#1A1A1A", margin: 0 }}>Recent orders</h2>
          <Link href="/account/orders" style={{ fontSize: "13px", fontWeight: 600, color: "#1A5CFF", textDecoration: "none" }}>See all →</Link>
        </div>
        {recentOrders.length === 0 ? (
          <div style={{ padding: "36px 20px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>No orders yet</div>
            <div style={{ fontSize: "13px", color: "#8A8890", marginTop: "4px" }}>Your orders will show up here.</div>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {recentOrders.map((order, i) => {
              const tone = statusTone(order.status);
              return (
                <li key={order.id} style={{ borderTop: i ? "1px solid #F4F2EC" : "none" }}>
                  <Link href={`/account/orders/${order.id}`} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 20px", textDecoration: "none", flexWrap: "wrap" }}>
                    <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>#{order.order_number}</span>
                      <span style={{ display: "block", fontSize: "12px", color: "#8A8890", marginTop: "2px" }}>{new Date(order.created_at).toLocaleDateString()}</span>
                    </span>
                    <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: tone.bg, color: tone.fg, textTransform: "capitalize" }}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                    <span style={{ flex: "0 0 90px", textAlign: "right", fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>${Number(order.total).toFixed(2)}</span>
                    <span aria-hidden style={{ color: "#C4C2C8", fontSize: "18px" }}>›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
