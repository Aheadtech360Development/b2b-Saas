"use client";

import { useEffect, useState } from "react";
import {
  platformService,
  type PlatformAnalytics,
  type ActivityEntry,
  type GlobalSearchResult,
  type BrandHealth,
} from "@/services/platform.service";
import type { Tenant } from "@/types/user.types";

const PANEL: React.CSSProperties = { background: "#11141C", border: "1px solid #1E2230", borderRadius: "12px" };
const TH: React.CSSProperties = { padding: "11px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".05em" };
const TD: React.CSSProperties = { padding: "12px 16px", fontSize: "13px", color: "#C7CBD4" };

function money(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
}

// ── Analytics ──────────────────────────────────────────────────────────────────
export function AnalyticsTab() {
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { platformService.analytics().then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);

  if (loading) return <div style={{ color: "#6B7280", fontSize: "13px", padding: "20px" }}>Loading analytics…</div>;
  if (!data) return <div style={{ color: "#F87171", fontSize: "13px", padding: "20px" }}>Could not load analytics.</div>;

  const cards = [
    { label: "Revenue (paid)", value: money(data.totals.revenue), color: "#34D399" },
    { label: "Orders", value: String(data.totals.orders), color: "#818CF8" },
    { label: "Products", value: String(data.totals.products), color: "#A78BFA" },
    { label: "Companies", value: String(data.totals.companies), color: "#F0ABFC" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "24px" }}>
        {cards.map((c) => (
          <div key={c.label} style={{ ...PANEL, padding: "18px 20px" }}>
            <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "8px" }}>{c.label}</div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>
      <div style={{ ...PANEL, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1E2230", fontSize: "13px", fontWeight: 700, color: "#fff" }}>Revenue by brand</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#0E1017" }}>
              {["Brand", "Products", "Orders", "Companies", "Revenue"].map((h, i) => (
                <th key={h} style={{ ...TH, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.brands.map((b) => (
                <tr key={b.id} style={{ borderTop: "1px solid #171B26" }}>
                  <td style={{ ...TD, color: "#fff", fontWeight: 700 }}>{b.name}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{b.products}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{b.orders}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{b.companies}</td>
                  <td style={{ ...TD, textAlign: "right", color: b.revenue > 0 ? "#34D399" : "#6B7280", fontWeight: 700 }}>{money(b.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Activity log ───────────────────────────────────────────────────────────────
const ACTION_COLOR: Record<string, string> = { CREATE: "#34D399", UPDATE: "#FBBF24", DELETE: "#F87171" };

export function ActivityTab({ tenants }: { tenants: Tenant[] }) {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState("");

  useEffect(() => {
    setLoading(true);
    platformService.activity(brand ? { tenant_id: brand } : undefined)
      .then((r) => setItems(r.items)).catch(() => setItems([])).finally(() => setLoading(false));
  }, [brand]);

  return (
    <div>
      <div style={{ marginBottom: "14px" }}>
        <select value={brand} onChange={(e) => setBrand(e.target.value)}
          style={{ background: "#0B0D12", border: "1px solid #262B39", color: "#E5E7EB", padding: "8px 12px", borderRadius: "8px", fontSize: "13px" }}>
          <option value="">All brands</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div style={{ ...PANEL, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>Loading activity…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>No activity recorded yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#0E1017" }}>
                {["Action", "What", "Brand", "By", "When"].map((h) => <th key={h} style={TH}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid #171B26" }}>
                    <td style={TD}><span style={{ color: ACTION_COLOR[a.action] ?? "#C7CBD4", fontWeight: 700, fontSize: "12px" }}>{a.action}</span></td>
                    <td style={{ ...TD, color: "#E5E7EB" }}>{a.entity_type}{a.entity_id ? <span style={{ color: "#6B7280" }}> · {a.entity_id.slice(0, 8)}</span> : null}</td>
                    <td style={TD}>{a.brand_name ?? "—"}</td>
                    <td style={{ ...TD, color: "#9CA3AF" }}>{a.actor_email ?? "—"}</td>
                    <td style={{ ...TD, color: "#6B7280", whiteSpace: "nowrap" }}>{timeAgo(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Global search ──────────────────────────────────────────────────────────────
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid #171B26", fontSize: "13px" };

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...PANEL, overflow: "hidden", marginBottom: "16px" }}>
      <div style={{ padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: ".05em" }}>{title}</div>
      {children}
    </div>
  );
}

export function SearchTab() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const id = setTimeout(() => {
      setLoading(true);
      platformService.search(q.trim()).then(setRes).catch(() => setRes(null)).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const badge = (slug: string | null) => (
    <span style={{ background: "rgba(139,92,246,.15)", color: "#C4B5FD", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>{slug ?? "—"}</span>
  );
  const count = res ? res.orders.length + res.customers.length + res.products.length : 0;

  return (
    <div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search orders, customers, products across every brand…"
        style={{ width: "100%", background: "#0B0D12", border: "1px solid #262B39", color: "#fff", padding: "12px 16px", borderRadius: "10px", fontSize: "14px", boxSizing: "border-box", marginBottom: "18px" }} />

      {q.trim().length >= 2 && (
        <>
          {loading && <div style={{ color: "#6B7280", fontSize: "13px" }}>Searching…</div>}
          {!loading && res && count === 0 && <div style={{ color: "#6B7280", fontSize: "13px" }}>No matches for “{q}”.</div>}
          {!loading && res && res.products.length > 0 && (
            <SearchGroup title="Products">
              {res.products.map((p) => (
                <div key={p.id} style={rowStyle}><span style={{ color: "#fff" }}>{p.name}</span>{badge(p.brand_slug)}</div>
              ))}
            </SearchGroup>
          )}
          {!loading && res && res.orders.length > 0 && (
            <SearchGroup title="Orders">
              {res.orders.map((o) => (
                <div key={o.id} style={rowStyle}><span style={{ color: "#fff" }}>{o.order_number} <span style={{ color: "#6B7280" }}>· {o.status} · {money(o.total)}</span></span>{badge(o.brand_slug)}</div>
              ))}
            </SearchGroup>
          )}
          {!loading && res && res.customers.length > 0 && (
            <SearchGroup title="Customers">
              {res.customers.map((c) => (
                <div key={c.id} style={rowStyle}><span style={{ color: "#fff" }}>{c.name}</span>{badge(c.brand_slug)}</div>
              ))}
            </SearchGroup>
          )}
        </>
      )}
    </div>
  );
}

// ── Brand health ───────────────────────────────────────────────────────────────
const STATE_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  empty:    { label: "Empty",    bg: "rgba(148,163,184,.15)", fg: "#94A3B8" },
  no_sales: { label: "No sales", bg: "rgba(245,158,11,.15)",  fg: "#FBBF24" },
  selling:  { label: "Selling",  bg: "rgba(16,185,129,.15)",  fg: "#34D399" },
};

export function HealthTab({ onEnter }: { onEnter: (slug: string) => void }) {
  const [rows, setRows] = useState<BrandHealth[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { platformService.brandsHealth().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);

  if (loading) return <div style={{ color: "#6B7280", fontSize: "13px", padding: "20px" }}>Loading brand health…</div>;

  return (
    <div style={{ ...PANEL, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#0E1017" }}>
            {["Brand", "State", "Products", "Orders", "Users", "Last activity", ""].map((h) => (
              <th key={h} style={{ ...TH, textAlign: ["Products", "Orders", "Users"].includes(h) ? "right" : "left" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((b) => {
              const st = STATE_STYLE[b.state] ?? STATE_STYLE.empty!;
              return (
                <tr key={b.id} style={{ borderTop: "1px solid #171B26" }}>
                  <td style={{ ...TD, color: "#fff", fontWeight: 700 }}>{b.name}</td>
                  <td style={TD}><span style={{ background: st.bg, color: st.fg, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>{st.label}</span></td>
                  <td style={{ ...TD, textAlign: "right" }}>{b.products}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{b.orders}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{b.users}</td>
                  <td style={{ ...TD, color: "#9CA3AF", whiteSpace: "nowrap" }}>{timeAgo(b.last_activity)}</td>
                  <td style={{ ...TD, textAlign: "right" }}>
                    <button onClick={() => onEnter(b.slug)} style={{ background: "none", border: "none", color: "#818CF8", fontWeight: 700, cursor: "pointer", fontSize: "12px" }}>Open ↗</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
