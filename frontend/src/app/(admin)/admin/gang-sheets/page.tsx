"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GANG_SHEET_STATUS_COLOR,
  GANG_SHEET_STATUS_LABEL,
  gangSheetsService,
  type GangSheetOrder,
  type GangSheetSize,
  type GangSheetStatus,
  type GangSheetPlacement,
  type GangSheetLibraryDesign,
  type GangSheetDashboard,
  type GangSheetProduct,
  type GangSheetSetup,
  type GangSheetConfig,
  type GangSheetTier,
  type GangSheetSettings,
} from "@/services/gangSheets.service";
import { GangSheetCanvas } from "@/components/storefront/GangSheetCanvas";
import { GangSheetTimeline } from "@/components/storefront/GangSheetTimeline";
import { openSheetPdf } from "@/lib/gangSheetPdf";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8E6E1",
  borderRadius: "10px",
  padding: "20px",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #DDD9D2",
  borderRadius: "6px",
  fontSize: "13px",
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "#6B6B6B",
  textTransform: "uppercase",
  letterSpacing: ".05em",
  marginBottom: "4px",
};
const BTN: React.CSSProperties = {
  background: "var(--brand-primary, #1C3557)",
  color: "#fff",
  border: "none",
  padding: "9px 16px",
  borderRadius: "6px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const EMPTY_SIZE = {
  name: "",
  width_in: 22,
  height_in: 60,
  price_per_sheet: 0,
  bleed_in: 0.125,
  spacing_in: 0.25,
  is_active: true,
  sort_order: 0,
  pricing_mode: "fixed" as "fixed" | "custom_length",
  price_per_inch: 0,
  min_length_in: 12,
  max_length_in: 240,
  max_upload_mb: null as number | null,
};

// One-click seed of the sizes ~95% of DTF stores offer (22" wide).
const STANDARD_DTF_SIZES = [
  { name: "22 × 24", height_in: 24, price_per_sheet: 12.99 },
  { name: "22 × 36", height_in: 36, price_per_sheet: 18.99 },
  { name: "22 × 48", height_in: 48, price_per_sheet: 24.99 },
  { name: "22 × 60", height_in: 60, price_per_sheet: 29.99 },
  { name: "22 × 72", height_in: 72, price_per_sheet: 35.99 },
  { name: "22 × 84", height_in: 84, price_per_sheet: 41.99 },
  { name: "22 × 96", height_in: 96, price_per_sheet: 47.99 },
];

// The classic "N feet" gang-sheet ladder (22" wide) most DTF stores sell.
const STANDARD_FEET_SIZES = [
  { name: "2 feet", height_in: 24, price_per_sheet: 15 },
  { name: "3 feet", height_in: 36, price_per_sheet: 21 },
  { name: "4 feet", height_in: 48, price_per_sheet: 26 },
  { name: "5 feet", height_in: 60, price_per_sheet: 32 },
  { name: "6 feet", height_in: 72, price_per_sheet: 36 },
  { name: "7 feet", height_in: 84, price_per_sheet: 42 },
  { name: "8 feet", height_in: 96, price_per_sheet: 48 },
  { name: "10 feet", height_in: 120, price_per_sheet: 54 },
  { name: "12 feet", height_in: 144, price_per_sheet: 62 },
  { name: "15 feet", height_in: 180, price_per_sheet: 76 },
  { name: "20 feet", height_in: 240, price_per_sheet: 105 },
];

interface SizeRow { id?: string; name: string; width_in: number; height_in: number; price_per_sheet: number; }

export default function AdminGangSheetsPage() {
  const [tab, setTab] = useState<"dashboard" | "setup" | "products" | "orders" | "sizes" | "library" | "settings">("dashboard");
  const TAB_LABEL: Record<string, string> = { dashboard: "Dashboard", setup: "Set up", products: "Products", orders: "Designs", sizes: "Sheet Sizes", library: "Design Library", settings: "Settings" };

  return (
    <div style={{ padding: "24px", maxWidth: "1100px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "4px" }}>Gang Sheets</h1>
      <p style={{ fontSize: "13px", color: "#6B6B6B", marginBottom: "20px" }}>
        Review submitted gang sheet jobs and configure the sheet sizes you offer.
      </p>

      <div style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
        {(["dashboard", "setup", "products", "orders", "sizes", "library", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid " + (tab === t ? "var(--brand-primary, #1C3557)" : "#E8E6E1"),
              background: tab === t ? "var(--brand-primary, #1C3557)" : "#fff",
              color: tab === t ? "#fff" : "#555",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "dashboard" ? <DashboardTab /> : tab === "setup" ? <SetupTab /> : tab === "products" ? <ProductsTab onGoToSizes={() => setTab("sizes")} /> : tab === "orders" ? <OrdersTab /> : tab === "sizes" ? <SizesTab /> : tab === "library" ? <LibraryTab /> : <SettingsTab />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardTab() {
  const [data, setData] = useState<GangSheetDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gangSheetsService.adminDashboard().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>;
  if (!data) return <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>Could not load dashboard.</div>;

  const stats = [
    { label: "Total Sheets", value: data.total_sheets.toLocaleString(), sub: `${data.total_jobs.toLocaleString()} designs`, color: "#4338CA" },
    { label: "Total Orders", value: data.total_orders.toLocaleString(), sub: "checked out", color: "#166534" },
    { label: "Total Order Amount", value: `$${data.total_amount.toFixed(2)}`, sub: "from placed orders", color: "#075985" },
  ];
  const totalStatus = data.status_breakdown.reduce((s, r) => s + r.count, 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
        {stats.map((s) => (
          <div key={s.label} style={CARD}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#6B6B6B" }}>{s.label}</div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: s.color, margin: "6px 0 2px" }}>{s.value}</div>
            <div style={{ fontSize: "12px", color: "#9CA3AF" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div style={CARD}>
        <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>Designs by status</div>
        {data.status_breakdown.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: "13px" }}>No gang sheet designs yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {data.status_breakdown.map((r) => {
              const c = GANG_SHEET_STATUS_COLOR[r.status as GangSheetStatus] ?? { bg: "#eee", fg: "#555" };
              const pct = Math.round((r.count / totalStatus) * 100);
              return (
                <div key={r.status}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                    <span style={{ fontWeight: 600, color: c.fg }}>{GANG_SHEET_STATUS_LABEL[r.status as GangSheetStatus] ?? r.status}</span>
                    <span style={{ color: "#6B6B6B" }}>{r.count} · {pct}%</span>
                  </div>
                  <div style={{ height: "8px", background: "#F1EFEB", borderRadius: "20px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: c.fg, borderRadius: "20px" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent designs + recent orders */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1EFEB", fontSize: "14px", fontWeight: 700 }}>Recent designs</div>
          {data.recent_designs.length === 0 ? (
            <div style={{ padding: "18px", color: "#9CA3AF", fontSize: "13px" }}>None yet.</div>
          ) : data.recent_designs.map((d, i) => {
            const c = GANG_SHEET_STATUS_COLOR[d.status] ?? { bg: "#eee", fg: "#555" };
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderBottom: i < data.recent_designs.length - 1 ? "1px solid #F6F5F2" : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>{d.reference}</div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{d.contact || "—"} · {d.sheet_name}</div>
                </div>
                <span style={{ background: c.bg, color: c.fg, padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" }}>{GANG_SHEET_STATUS_LABEL[d.status] ?? d.status}</span>
              </div>
            );
          })}
        </div>

        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1EFEB", fontSize: "14px", fontWeight: 700 }}>Recent orders</div>
          {data.recent_orders.length === 0 ? (
            <div style={{ padding: "18px", color: "#9CA3AF", fontSize: "13px" }}>No orders yet.</div>
          ) : data.recent_orders.map((o, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderBottom: i < data.recent_orders.length - 1 ? "1px solid #F6F5F2" : "none" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>{o.reference}</div>
                <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>${o.subtotal.toFixed(2)}</div>
                <span style={{ fontSize: "10px", fontWeight: 700, color: o.paid ? "#166534" : "#92400E" }}>{o.paid ? "PAID" : "ORDERED"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Set up ────────────────────────────────────────────────────────────────────
function SetupTab() {
  const [data, setData] = useState<GangSheetSetup | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    gangSheetsService.adminSetup().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  const steps = [
    { done: !!data?.has_products, title: "Enable the builder on a product", desc: "In the Products tab, turn a product on and choose its builder type (Gang Sheet or Upload By Size)." },
    { done: !!data?.has_sizes, title: "Configure sheet sizes & prices", desc: "In the Sheet Sizes tab, add the sizes and prices you offer — globally or per product." },
    { done: !!data?.has_library, title: "Add ready-made designs (optional)", desc: "In the Design Library tab, upload artwork customers can drop straight onto a sheet." },
    { done: !!data?.has_designs, title: "Receive your first design", desc: "Once live, customers build gang sheets on your storefront and they show up under Designs." },
  ];

  return (
    <div style={{ maxWidth: "760px" }}>
      <div style={{ ...CARD, marginBottom: "16px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 4px" }}>Get your gang-sheet builder ready</h2>
        <p style={{ fontSize: "13px", color: "#6B6B6B", margin: 0 }}>Complete these steps to start selling custom gang sheets. The ticks update automatically as you go.</p>
      </div>

      {loading ? (
        <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ ...CARD, display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div style={{ width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, background: s.done ? "#DCFCE7" : "#F3F4F6", color: s.done ? "#166534" : "#9CA3AF" }}>
                {s.done ? "✓" : i + 1}
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: s.done ? "#166534" : "#2A2830" }}>{s.title}</div>
                <div style={{ fontSize: "13px", color: "#6B6B6B", marginTop: "2px" }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────────────────
function ProductsTab({ onGoToSizes }: { onGoToSizes: () => void }) {
  const [products, setProducts] = useState<GangSheetProduct[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<GangSheetProduct | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    gangSheetsService.adminListProducts(showAll).then(setProducts).catch(() => setProducts([])).finally(() => setLoading(false));
  }, [showAll]);
  useEffect(load, [load]);

  async function patch(id: string, data: { gang_sheet_enabled?: boolean; gang_sheet_type?: string }) {
    setBusyId(id);
    try {
      const updated = await gangSheetsService.adminUpdateProduct(id, data);
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch { /* ignore */ } finally { setBusyId(null); }
  }

  if (editing) {
    return <ProductEditor product={editing} onBack={() => { setEditing(null); load(); }} onGoToSizes={onGoToSizes} />;
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <p style={{ fontSize: "13px", color: "#6B6B6B", margin: 0, maxWidth: "620px" }}>
          Enable the gang-sheet builder on a product and choose its builder type. Configure each product&apos;s sizes &amp; prices with the <strong>edit</strong> button.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all products
        </label>
      </div>

      {loading ? (
        <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>
      ) : products.length === 0 ? (
        <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>
          {showAll ? "No products found." : "No gang-sheet products yet — tick “Show all products” to enable the builder on a product."}
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#FAFAF8", borderBottom: "1px solid #E8E6E1" }}>
                {["Product", "Builder", "Type", "Sizes", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #F1EFEB", opacity: busyId === p.id ? 0.55 : 1 }}>
                  <td style={{ padding: "11px 14px", fontWeight: 600, color: "#2A2830" }}>{p.name}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <button
                      onClick={() => patch(p.id, { gang_sheet_enabled: !p.gang_sheet_enabled })}
                      style={{ background: p.gang_sheet_enabled ? "#DCFCE7" : "#F3F4F6", color: p.gang_sheet_enabled ? "#166534" : "#6B7280", border: "none", padding: "3px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                    >
                      {p.gang_sheet_enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <select
                      value={p.gang_sheet_type ?? ""}
                      onChange={(e) => patch(p.id, { gang_sheet_type: e.target.value })}
                      disabled={!p.gang_sheet_enabled}
                      style={{ ...INPUT, padding: "5px 8px", width: "auto", opacity: p.gang_sheet_enabled ? 1 : 0.5 }}
                    >
                      <option value="">— choose —</option>
                      <option value="gang_sheet">Gang Sheet</option>
                      <option value="upload_by_size">Upload By Size</option>
                    </select>
                  </td>
                  <td style={{ padding: "11px 14px", color: "#6B6B6B" }}>{p.size_count}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <a href={`/products/${p.slug}`} target="_blank" rel="noopener noreferrer" title="View on store" style={{ textDecoration: "none", fontSize: "15px", marginRight: "12px" }}>👁</a>
                    <button title="Copy store link" onClick={() => { try { navigator.clipboard?.writeText(`${window.location.origin}/products/${p.slug}`); } catch { /* ignore */ } }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", marginRight: "12px" }}>🔗</button>
                    <button title="Edit builder & sizes" onClick={() => setEditing(p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "var(--brand-primary, #1C3557)", fontWeight: 700 }}>✎</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Per-product builder editor (opened from the Products edit button) ───────────
function ProductEditor({ product, onBack, onGoToSizes }: { product: GangSheetProduct; onBack: () => void; onGoToSizes: () => void }) {
  const [type, setType] = useState<"gang_sheet" | "upload_by_size">(product.gang_sheet_type ?? "gang_sheet");
  const [cfg, setCfg] = useState<GangSheetConfig>(product.gang_sheet_config ?? { printer_width: 22, max_height: 312, tiers: [] });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // This product's OWN fixed sizes (Gang Sheet type). Loaded once; saved as a diff.
  const [rows, setRows] = useState<SizeRow[]>([]);
  const [origIds, setOrigIds] = useState<string[]>([]);
  useEffect(() => {
    gangSheetsService.adminListSizes(product.id).then((list) => {
      setRows(list.map((s) => ({ id: s.id, name: s.name, width_in: s.width_in, height_in: s.height_in, price_per_sheet: s.price_per_sheet })));
      setOrigIds(list.map((s) => s.id));
    }).catch(() => {});
  }, [product.id]);

  function setRow(i: number, field: keyof SizeRow, val: string | number) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));
  }
  function addRow() { setRows((r) => [...r, { name: "", width_in: 22, height_in: 24, price_per_sheet: 0 }]); }
  function removeRow(i: number) { setRows((r) => r.filter((_, idx) => idx !== i)); }
  function addStandardFeet() {
    setRows((r) => [...r, ...STANDARD_FEET_SIZES.map((s) => ({ name: s.name, width_in: 22, height_in: s.height_in, price_per_sheet: s.price_per_sheet }))]);
  }

  const tiers: GangSheetTier[] = cfg.tiers ?? [];
  function setTier(i: number, field: keyof GangSheetTier, val: number) {
    setCfg((c) => ({ ...c, tiers: (c.tiers ?? []).map((t, idx) => (idx === i ? { ...t, [field]: val } : t)) }));
  }
  function addTier() {
    setCfg((c) => ({ ...c, tiers: [...(c.tiers ?? []), { max_height: 0, max_area: 0, price_per_sqin: 0, discount: 0 }] }));
  }
  function removeTier(i: number) {
    setCfg((c) => ({ ...c, tiers: (c.tiers ?? []).filter((_, idx) => idx !== i) }));
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const data: { gang_sheet_type: string; gang_sheet_config?: GangSheetConfig } = { gang_sheet_type: type };
      if (type === "upload_by_size") data.gang_sheet_config = cfg;
      await gangSheetsService.adminUpdateProduct(product.id, data);

      // Persist this product's own sizes (create / update / delete) when it's a
      // Gang Sheet product — each product is configured on its own, no shared set.
      if (type === "gang_sheet") {
        const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
        for (const id of origIds) if (!keptIds.has(id)) await gangSheetsService.adminDeleteSize(id);
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]!;
          const payload = { name: r.name || `Sheet ${i + 1}`, width_in: Number(r.width_in) || 22, height_in: Number(r.height_in) || 24, price_per_sheet: Number(r.price_per_sheet) || 0, sort_order: i, pricing_mode: "fixed" as const };
          if (r.id) await gangSheetsService.adminUpdateSize(r.id, payload);
          else await gangSheetsService.adminCreateSize({ ...EMPTY_SIZE, ...payload, product_id: product.id });
        }
        const list = await gangSheetsService.adminListSizes(product.id);
        setRows(list.map((s) => ({ id: s.id, name: s.name, width_in: s.width_in, height_in: s.height_in, price_per_sheet: s.price_per_sheet })));
        setOrigIds(list.map((s) => s.id));
      }
      setMsg({ text: "Saved", ok: true });
    } catch {
      setMsg({ text: "Could not save", ok: false });
    } finally {
      setSaving(false);
    }
  }

  const numInput: React.CSSProperties = { ...INPUT, width: "100%" };
  const cellInput: React.CSSProperties = { ...INPUT, padding: "6px 8px", width: "100%" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#6B6B6B" }}>←</button>
        <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>{product.name}</h2>
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: "13px", fontWeight: 600, color: msg.ok ? "#166534" : "#B91C1C" }}>{msg.text}</span>}
        <button onClick={save} disabled={saving} style={BTN}>{saving ? "Saving…" : "Save"}</button>
      </div>

      <div style={{ ...CARD, marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={LABEL}>Builder type</span>
        <select value={type} onChange={(e) => setType(e.target.value as "gang_sheet" | "upload_by_size")} style={{ ...INPUT, width: "auto", minWidth: "200px" }}>
          <option value="gang_sheet">Gang Sheet (combine designs)</option>
          <option value="upload_by_size">Upload By Size (area-priced)</option>
        </select>
      </div>

      {type === "gang_sheet" ? (
        <div style={{ ...CARD }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>Sizes &amp; Prices</div>
            <button onClick={addStandardFeet} style={{ ...BTN, background: "#fff", color: "var(--brand-primary, #1C3557)", border: "1px solid #DDD9D2" }}>
              + Add standard sizes (2–20 ft)
            </button>
          </div>
          <p style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "12px" }}>
            These sizes belong only to <strong>{product.name}</strong>. Buyers pick from exactly these on this product&apos;s builder — nothing is shared or auto-filled.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "520px" }}>
              <thead>
                <tr style={{ background: "#FAFAF8" }}>
                  {["Size name", "Width (in)", "Height (in)", "Price ($)", ""].map((h) => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? `new-${i}`}>
                    <td style={{ padding: "5px 8px", minWidth: "180px" }}><input value={r.name} placeholder="e.g. 2 feet" onChange={(e) => setRow(i, "name", e.target.value)} style={cellInput} /></td>
                    <td style={{ padding: "5px 8px" }}><input type="number" step="0.25" value={r.width_in} onChange={(e) => setRow(i, "width_in", Number(e.target.value))} style={cellInput} /></td>
                    <td style={{ padding: "5px 8px" }}><input type="number" step="1" value={r.height_in} onChange={(e) => setRow(i, "height_in", Number(e.target.value))} style={cellInput} /></td>
                    <td style={{ padding: "5px 8px" }}><input type="number" step="0.01" value={r.price_per_sheet} onChange={(e) => setRow(i, "price_per_sheet", Number(e.target.value))} style={cellInput} /></td>
                    <td style={{ padding: "5px 8px", textAlign: "center" }}><button onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "16px" }}>×</button></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "14px", textAlign: "center", color: "#9CA3AF", fontSize: "12px" }}>No sizes yet — add a row, or click “Add standard sizes (2–20 ft)”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "10px", flexWrap: "wrap" }}>
            <button onClick={addRow} style={{ ...BTN, background: "#F4F3EF", color: "#2A2830" }}>+ Add size</button>
            <button onClick={onGoToSizes} style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}>Open full Sheet Sizes manager →</button>
          </div>
          <p style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "8px" }}>Save (top-right) to apply. Buyers see the size name + an auto “Save %” based on these prices.</p>
        </div>
      ) : (
        <div style={{ ...CARD }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "14px", marginBottom: "18px" }}>
            <div>
              <label style={LABEL}>Printer width (in)</label>
              <input type="number" step="0.25" min="1" value={cfg.printer_width ?? 22} onChange={(e) => setCfg((c) => ({ ...c, printer_width: Number(e.target.value) }))} style={numInput} />
            </div>
            <div>
              <label style={LABEL}>Max height (in)</label>
              <input type="number" step="1" min="1" value={cfg.max_height ?? 312} onChange={(e) => setCfg((c) => ({ ...c, max_height: Number(e.target.value) }))} style={numInput} />
            </div>
          </div>

          <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>Tiered pricing (per square inch, by area)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "560px" }}>
              <thead>
                <tr style={{ background: "#FAFAF8" }}>
                  {["~Max height (in)", "Max area (sq in)", "Price ($/sq in)", "Discount (%)", ""].map((h) => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => (
                  <tr key={i}>
                    <td style={{ padding: "5px 8px" }}><input type="number" step="0.01" value={t.max_height} onChange={(e) => setTier(i, "max_height", Number(e.target.value))} style={{ ...INPUT, padding: "6px 8px" }} /></td>
                    <td style={{ padding: "5px 8px" }}><input type="number" step="0.01" value={t.max_area} onChange={(e) => setTier(i, "max_area", Number(e.target.value))} style={{ ...INPUT, padding: "6px 8px" }} /></td>
                    <td style={{ padding: "5px 8px" }}><input type="number" step="0.0001" value={t.price_per_sqin} onChange={(e) => setTier(i, "price_per_sqin", Number(e.target.value))} style={{ ...INPUT, padding: "6px 8px" }} /></td>
                    <td style={{ padding: "5px 8px" }}><input type="number" step="1" value={t.discount} onChange={(e) => setTier(i, "discount", Number(e.target.value))} style={{ ...INPUT, padding: "6px 8px" }} /></td>
                    <td style={{ padding: "5px 8px", textAlign: "center" }}><button onClick={() => removeTier(i)} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "16px" }}>×</button></td>
                  </tr>
                ))}
                {tiers.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "12px", textAlign: "center", color: "#9CA3AF", fontSize: "12px" }}>No tiers yet. Add a row below.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <button onClick={addTier} style={{ marginTop: "10px", ...BTN, background: "#F4F3EF", color: "#2A2830" }}>+ Add tier</button>
        </div>
      )}
    </div>
  );
}

// ── Orders / Designs ──────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState<GangSheetOrder[]>([]);
  const [selected, setSelected] = useState<GangSheetOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    gangSheetsService
      .adminListOrders(filter || undefined)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(load, [load]);

  if (loading) return <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>;

  return (
    <>
      <div style={{ marginBottom: "14px" }}>
        <select style={{ ...INPUT, width: "220px" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(GANG_SHEET_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {orders.length === 0 ? (
        <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>
          No gang sheet orders yet.
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#FAFAF8", borderBottom: "1px solid #E8E6E1" }}>
                {["Reference", "Customer", "Sheet", "Qty", "Total", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const c = GANG_SHEET_STATUS_COLOR[o.status] ?? { bg: "#eee", fg: "#555" };
                return (
                  <tr key={o.id} style={{ borderBottom: "1px solid #F1EFEB" }}>
                    <td style={{ padding: "11px 14px", fontWeight: 700 }}>{o.reference}</td>
                    <td style={{ padding: "11px 14px", color: "#555" }}>{o.contact_name || "—"}</td>
                    <td style={{ padding: "11px 14px", color: "#555" }}>
                      {o.sheet_name} <span style={{ color: "#999" }}>({o.sheet_width_in}″×{o.sheet_height_in}″)</span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>{o.sheet_quantity}</td>
                    <td style={{ padding: "11px 14px" }}>${o.subtotal.toFixed(2)}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: c.bg, color: c.fg, padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>
                        {GANG_SHEET_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                      {o.paid ? (
                        <span style={{ marginLeft: "6px", background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: "20px", fontSize: "10px", fontWeight: 700 }}>PAID</span>
                      ) : o.order_id ? (
                        <span style={{ marginLeft: "6px", background: "#FEF3C7", color: "#92400E", padding: "2px 8px", borderRadius: "20px", fontSize: "10px", fontWeight: 700 }}>ORDERED</span>
                      ) : (
                        <span style={{ marginLeft: "6px", background: "#F3F4F6", color: "#6B7280", padding: "2px 8px", borderRadius: "20px", fontSize: "10px", fontWeight: 700 }}>DRAFT</span>
                      )}
                      {o.revision_count > 0 && (
                        <span style={{ marginLeft: "6px", fontSize: "11px", color: "#9A3412" }}>
                          rev {o.revision_count}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "right" }}>
                      <button
                        onClick={() => gangSheetsService.adminOrder(o.id).then(setSelected).catch(() => {})}
                        style={{ background: "none", border: "none", color: "var(--brand-primary, #1C3557)", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}
                      >
                        Review →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ReviewModal
          order={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }}
        />
      )}
    </>
  );
}

function ReviewModal({ order, onClose, onChanged }: { order: GangSheetOrder; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState(order.supplier_notes ?? "");
  const [internalNotes, setInternalNotes] = useState(order.internal_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [size, setSize] = useState<GangSheetSize | null>(null);
  const [layout, setLayout] = useState<GangSheetPlacement[]>(order.layout ?? []);
  const [layoutMsg, setLayoutMsg] = useState<string | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  // Bleed/spacing live on the size, not the order snapshot; fetch them so the
  // canvas draws the same margins the buyer saw.
  useEffect(() => {
    gangSheetsService.adminListSizes()
      .then((sizes) => setSize(sizes.find((s) => s.id === order.sheet_size_id) ?? null))
      .catch(() => setSize(null));
  }, [order.sheet_size_id]);

  async function saveLayout() {
    setSavingLayout(true); setLayoutMsg(null);
    try {
      await gangSheetsService.adminSaveLayout(order.id, layout);
      setLayoutMsg("Layout saved");
    } catch {
      setLayoutMsg("Could not save layout");
    } finally {
      setSavingLayout(false);
    }
  }

  async function setStatus(status: GangSheetStatus) {
    setBusy(true); setErr(null);
    try {
      await gangSheetsService.adminSetStatus(order.id, status, notes || undefined, internalNotes || undefined);
      onChanged();
    } catch {
      setErr("Could not update this order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "620px", maxHeight: "88vh", overflowY: "auto", padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800 }}>
              {order.reference}
              {order.paid ? (
                <span style={{ marginLeft: "10px", background: "#DCFCE7", color: "#166534", padding: "2px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, verticalAlign: "middle" }}>PAID</span>
              ) : order.order_id ? (
                <span style={{ marginLeft: "10px", background: "#FEF3C7", color: "#92400E", padding: "2px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, verticalAlign: "middle" }}>ORDERED · unpaid</span>
              ) : (
                <span style={{ marginLeft: "10px", background: "#F3F4F6", color: "#6B7280", padding: "2px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, verticalAlign: "middle" }}>DRAFT · not checked out</span>
              )}
            </h2>
            <div style={{ fontSize: "12px", color: "#888" }}>
              {order.sheet_name} · {order.sheet_width_in}″ × {order.sheet_height_in}″ · {order.sheet_quantity} sheet(s) · ${order.subtotal.toFixed(2)}
            </div>
            {order.order_id && (
              <a href={`/admin/orders/${order.order_id}`} style={{ fontSize: "12px", color: "var(--brand-primary, #1C3557)", fontWeight: 700, textDecoration: "none" }}>
                View linked order →
              </a>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", color: "#999", cursor: "pointer" }}>×</button>
        </div>

        {/* Progress timeline */}
        <div style={{ margin: "6px 0 20px" }}>
          <GangSheetTimeline status={order.status} timeline={order.status_timeline} />
        </div>

        {order.contact_name || order.contact_email ? (
          <div style={{ fontSize: "13px", color: "#555", marginBottom: "14px" }}>
            <strong>Contact:</strong> {order.contact_name} {order.contact_email ? `· ${order.contact_email}` : ""}
          </div>
        ) : null}

        {order.customer_notes && (
          <div style={{ background: "#FAFAF8", border: "1px solid #EFEDE8", borderRadius: "8px", padding: "12px", fontSize: "13px", marginBottom: "16px" }}>
            <div style={{ ...LABEL, marginBottom: "6px" }}>Customer notes</div>
            {order.customer_notes}
          </div>
        )}

        <div style={{ ...LABEL, marginBottom: "8px" }}>Artwork ({order.artworks?.length ?? 0})</div>
        <div style={{ border: "1px solid #EFEDE8", borderRadius: "8px", marginBottom: "18px" }}>
          {(order.artworks ?? []).map((a, i) => (
            <div key={a.id ?? i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: i < (order.artworks?.length ?? 0) - 1 ? "1px solid #F1EFEB" : "none", fontSize: "13px" }}>
              <div style={{ minWidth: 0 }}>
                <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-primary, #1C3557)", fontWeight: 600, textDecoration: "none", wordBreak: "break-all" }}>
                  {a.file_name}
                </a>
                <div style={{ color: "#888", fontSize: "12px" }}>
                  {a.width_in}″ × {a.height_in}″ · qty {a.quantity}
                </div>
              </div>
              <a href={a.file_url} download target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#666", whiteSpace: "nowrap", marginLeft: "12px" }}>
                Download ↓
              </a>
            </div>
          ))}
        </div>

        {/* Sheet layout — supplier arranges for production */}
        {size && (order.artworks?.length ?? 0) > 0 && (
          <div style={{ marginBottom: "18px" }}>
            <div style={{ ...LABEL, marginBottom: "8px" }}>Sheet layout</div>
            <GangSheetCanvas
              sheet={{ width_in: order.sheet_width_in, height_in: order.sheet_height_in, bleed_in: size.bleed_in, spacing_in: size.spacing_in }}
              artworks={order.artworks ?? []}
              value={layout}
              onChange={(l) => { setLayout(l); setLayoutMsg(null); }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "12px" }}>
              <button onClick={saveLayout} disabled={savingLayout} style={{ ...BTN, background: "#1B3A5C" }}>
                {savingLayout ? "Saving…" : "Save layout"}
              </button>
              <button
                onClick={() => openSheetPdf({ reference: order.reference, customerName: order.contact_name, sheet: { width_in: order.sheet_width_in, height_in: order.sheet_height_in, bleed_in: size.bleed_in }, artworks: order.artworks ?? [], layout })}
                style={{ ...BTN, background: "#fff", color: "#1B3A5C", border: "1px solid #DDD9D2" }}
              >
                Download PDF
              </button>
              {layoutMsg && <span style={{ fontSize: "13px", color: layoutMsg.startsWith("Could") ? "#B91C1C" : "#166534", fontWeight: 600 }}>{layoutMsg}</span>}
            </div>
          </div>
        )}

        <div style={{ marginBottom: "16px" }}>
          <label style={LABEL}>Notes to customer</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Explain what needs changing if you request a revision…"
            style={{ ...INPUT, resize: "vertical" }}
          />
        </div>

        {/* Internal notes — supplier-only, never shown to the customer */}
        <div style={{ marginBottom: "16px" }}>
          <label style={LABEL}>Internal notes <span style={{ fontWeight: 400, textTransform: "none", color: "#9CA3AF" }}>· private, not visible to customer</span></label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            placeholder="Notes for your team only…"
            style={{ ...INPUT, resize: "vertical", background: "#FFFBEB" }}
          />
        </div>

        {/* Version history */}
        {(order.versions?.length ?? 0) > 1 && (
          <div style={{ marginBottom: "16px" }}>
            <button onClick={() => setShowVersions((v) => !v)} style={{ background: "none", border: "none", color: "var(--brand-primary, #1C3557)", fontWeight: 700, fontSize: "13px", cursor: "pointer", padding: 0 }}>
              {showVersions ? "▾" : "▸"} Version history ({order.versions!.length})
            </button>
            {showVersions && (
              <div style={{ marginTop: "8px", border: "1px solid #EFEDE8", borderRadius: "8px", overflow: "hidden" }}>
                {order.versions!.slice().reverse().map((v) => (
                  <div key={v.version} style={{ padding: "10px 12px", borderBottom: "1px solid #F1EFEB", fontSize: "12px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                      Version {v.version}{v.version === order.version ? " (current)" : ""}
                      <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: "8px" }}>{v.created_at ? new Date(v.created_at).toLocaleString() : ""}</span>
                    </div>
                    {v.artworks.map((a, k) => (
                      <div key={k} style={{ color: "#666", display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "#4338CA", textDecoration: "none", wordBreak: "break-all" }}>{a.file_name}</a>
                        <span style={{ whiteSpace: "nowrap" }}>{a.width_in}″×{a.height_in}″ · q{a.quantity}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {err && <div style={{ color: "#B91C1C", fontSize: "13px", marginBottom: "10px" }}>{err}</div>}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button disabled={busy} onClick={() => setStatus("approved")} style={{ ...BTN, background: "#166534" }}>Approve</button>
          <button disabled={busy} onClick={() => setStatus("production")} style={{ ...BTN, background: "#3730A3" }}>Start production</button>
          <button disabled={busy} onClick={() => setStatus("revision_requested")} style={{ ...BTN, background: "#C2410C" }}>Request revision</button>
          <button disabled={busy} onClick={() => setStatus("in_review")} style={{ ...BTN, background: "#B45309" }}>Mark in review</button>
          <button disabled={busy} onClick={() => setStatus("completed")} style={{ ...BTN, background: "#075985" }}>Completed</button>
          <button disabled={busy} onClick={() => setStatus("rejected")} style={{ ...BTN, background: "#991B1B" }}>Reject</button>
        </div>
      </div>
    </div>
  );
}

// ── Sheet sizes ───────────────────────────────────────────────────────────────
function SizesTab() {
  const [sizes, setSizes] = useState<GangSheetSize[]>([]);
  const [draft, setDraft] = useState({ ...EMPTY_SIZE });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Inline edit: which size is open, and its working values.
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<GangSheetSize>>({});
  // Which product these sizes belong to. "" = the brand's global default set.
  const [scopeProductId, setScopeProductId] = useState<string>("");
  const [products, setProducts] = useState<GangSheetProduct[]>([]);

  useEffect(() => {
    gangSheetsService.adminListProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const load = useCallback(() => {
    gangSheetsService.adminListSizes(scopeProductId || undefined).then(setSizes).catch(() => setSizes([]));
  }, [scopeProductId]);
  useEffect(load, [load]);

  async function create() {
    if (!draft.name.trim()) { setErr("Give the sheet size a name."); return; }
    setBusy(true); setErr(null);
    try {
      await gangSheetsService.adminCreateSize({ ...draft, product_id: scopeProductId || undefined });
      setDraft({ ...EMPTY_SIZE });
      load();
    } catch {
      setErr("Could not save this sheet size.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: GangSheetSize) {
    await gangSheetsService.adminUpdateSize(s.id, { is_active: !s.is_active }).catch(() => {});
    load();
  }

  async function remove(s: GangSheetSize) {
    if (!confirm(`Delete "${s.name}"? Existing orders keep their saved sheet details.`)) return;
    await gangSheetsService.adminDeleteSize(s.id).catch(() => {});
    load();
  }

  function startEdit(s: GangSheetSize) {
    setEditId(s.id);
    setEditDraft({ name: s.name, width_in: s.width_in, height_in: s.height_in, price_per_sheet: s.price_per_sheet, bleed_in: s.bleed_in, spacing_in: s.spacing_in });
  }

  async function saveEdit(id: string) {
    setBusy(true);
    try {
      await gangSheetsService.adminUpdateSize(id, editDraft);
      setEditId(null);
      load();
    } catch {
      setErr("Could not update this sheet size.");
    } finally {
      setBusy(false);
    }
  }

  async function seedStandard() {
    if (!confirm("Add the 7 standard DTF sizes (22×24 … 22×96)?")) return;
    setBusy(true); setErr(null);
    try {
      for (const s of STANDARD_DTF_SIZES) {
        await gangSheetsService.adminCreateSize({ ...EMPTY_SIZE, name: s.name, height_in: s.height_in, price_per_sheet: s.price_per_sheet, product_id: scopeProductId || undefined });
      }
      load();
    } catch {
      setErr("Could not add the standard sizes.");
    } finally {
      setBusy(false);
    }
  }

  const isCustom = draft.pricing_mode === "custom_length";

  return (
    <>
      {/* Scope: the brand's global default sizes, or one product's own sizes */}
      <div style={{ ...CARD, marginBottom: "18px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={LABEL}>Sizes for</span>
        <select value={scopeProductId} onChange={(e) => setScopeProductId(e.target.value)} style={{ ...INPUT, width: "auto", minWidth: "240px" }}>
          <option value="">Global default (all products)</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.gang_sheet_type ? ` — ${p.gang_sheet_type === "upload_by_size" ? "Upload By Size" : "Gang Sheet"}` : ""}
            </option>
          ))}
        </select>
        <span style={{ fontSize: "12px", color: "#9CA3AF" }}>
          {scopeProductId ? "Editing this product's own sizes." : "Default set — used when a product has no sizes of its own."}
        </span>
      </div>

      <div style={{ ...CARD, marginBottom: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700 }}>Add a sheet size</div>
          <button onClick={seedStandard} disabled={busy} style={{ ...BTN, background: "#fff", color: "var(--brand-primary, #1C3557)", border: "1px solid #DDD9D2" }}>
            + Add 7 standard DTF sizes
          </button>
        </div>

        {/* Pricing mode */}
        <div style={{ marginBottom: "14px" }}>
          <label style={LABEL}>Pricing</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {([["fixed", "Fixed size & price"], ["custom_length", "Custom length (per inch)"]] as const).map(([mode, lbl]) => (
              <button key={mode} type="button" onClick={() => setDraft({ ...draft, pricing_mode: mode })}
                style={{ padding: "8px 14px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                  border: "1px solid " + (draft.pricing_mode === mode ? "var(--brand-primary, #1C3557)" : "#DDD9D2"),
                  background: draft.pricing_mode === mode ? "var(--brand-primary, #1C3557)" : "#fff",
                  color: draft.pricing_mode === mode ? "#fff" : "#555" }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "12px", marginBottom: "14px" }}>
          <div>
            <label style={LABEL}>Name</label>
            <input style={INPUT} value={draft.name} placeholder={isCustom ? "Custom Gang Sheet" : "DTF 22×60"} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label style={LABEL}>Width (in)</label>
            <input style={INPUT} type="number" step="0.25" min="0.25" value={draft.width_in} onChange={(e) => setDraft({ ...draft, width_in: Number(e.target.value) })} />
          </div>
          {isCustom ? (
            <>
              <div>
                <label style={LABEL}>Price / inch</label>
                <input style={INPUT} type="number" step="0.01" min="0" value={draft.price_per_inch} onChange={(e) => setDraft({ ...draft, price_per_inch: Number(e.target.value) })} />
              </div>
              <div>
                <label style={LABEL}>Min length (in)</label>
                <input style={INPUT} type="number" step="1" min="1" value={draft.min_length_in} onChange={(e) => setDraft({ ...draft, min_length_in: Number(e.target.value) })} />
              </div>
              <div>
                <label style={LABEL}>Max length (in)</label>
                <input style={INPUT} type="number" step="1" min="1" value={draft.max_length_in} onChange={(e) => setDraft({ ...draft, max_length_in: Number(e.target.value) })} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={LABEL}>Height (in)</label>
                <input style={INPUT} type="number" step="0.25" min="0.25" value={draft.height_in} onChange={(e) => setDraft({ ...draft, height_in: Number(e.target.value) })} />
              </div>
              <div>
                <label style={LABEL}>Price / sheet</label>
                <input style={INPUT} type="number" step="0.01" min="0" value={draft.price_per_sheet} onChange={(e) => setDraft({ ...draft, price_per_sheet: Number(e.target.value) })} />
              </div>
            </>
          )}
          <div>
            <label style={LABEL}>Bleed (in)</label>
            <input style={INPUT} type="number" step="0.025" min="0" value={draft.bleed_in} onChange={(e) => setDraft({ ...draft, bleed_in: Number(e.target.value) })} />
          </div>
          <div>
            <label style={LABEL}>Spacing (in)</label>
            <input style={INPUT} type="number" step="0.025" min="0" value={draft.spacing_in} onChange={(e) => setDraft({ ...draft, spacing_in: Number(e.target.value) })} />
          </div>
        </div>
        {err && <div style={{ color: "#B91C1C", fontSize: "13px", marginBottom: "10px" }}>{err}</div>}
        <button style={BTN} disabled={busy} onClick={create}>{busy ? "Saving…" : "Add sheet size"}</button>
      </div>

      {sizes.length === 0 ? (
        <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>
          No sheet sizes yet. Customers cannot submit a gang sheet until at least one active size exists.
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#FAFAF8", borderBottom: "1px solid #E8E6E1" }}>
                {["Name", "Size", "Price", "Bleed / Spacing", "Active", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => {
                const editing = editId === s.id;
                const cell = { padding: "8px 14px" } as React.CSSProperties;
                const numIn = { ...INPUT, padding: "6px 8px", width: "70px" } as React.CSSProperties;
                if (editing) {
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid #F1EFEB", background: "#F8FAFF" }}>
                      <td style={cell}><input style={{ ...INPUT, padding: "6px 8px" }} value={editDraft.name ?? ""} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
                      <td style={cell}>
                        <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                          <input style={numIn} type="number" step="0.25" value={editDraft.width_in ?? 0} onChange={(e) => setEditDraft({ ...editDraft, width_in: Number(e.target.value) })} />×
                          <input style={numIn} type="number" step="0.25" value={editDraft.height_in ?? 0} onChange={(e) => setEditDraft({ ...editDraft, height_in: Number(e.target.value) })} />
                        </span>
                      </td>
                      <td style={cell}><input style={numIn} type="number" step="0.01" value={editDraft.price_per_sheet ?? 0} onChange={(e) => setEditDraft({ ...editDraft, price_per_sheet: Number(e.target.value) })} /></td>
                      <td style={cell}>
                        <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                          <input style={{ ...numIn, width: "56px" }} type="number" step="0.025" value={editDraft.bleed_in ?? 0} onChange={(e) => setEditDraft({ ...editDraft, bleed_in: Number(e.target.value) })} />/
                          <input style={{ ...numIn, width: "56px" }} type="number" step="0.025" value={editDraft.spacing_in ?? 0} onChange={(e) => setEditDraft({ ...editDraft, spacing_in: Number(e.target.value) })} />
                        </span>
                      </td>
                      <td style={cell} />
                      <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button disabled={busy} onClick={() => saveEdit(s.id)} style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", marginRight: "6px" }}>Save</button>
                        <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "12px" }}>Cancel</button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #F1EFEB" }}>
                    <td style={{ padding: "11px 14px", fontWeight: 700 }}>{s.name}</td>
                    <td style={{ padding: "11px 14px", color: "#555" }}>
                      {s.pricing_mode === "custom_length"
                        ? <>{s.width_in}″ × custom <span style={{ color: "#8B5CF6", fontWeight: 700 }}>({s.min_length_in}–{s.max_length_in}″)</span></>
                        : <>{s.width_in}″ × {s.height_in}″</>}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      {s.pricing_mode === "custom_length" ? `$${s.price_per_inch.toFixed(2)}/in` : `$${s.price_per_sheet.toFixed(2)}`}
                    </td>
                    <td style={{ padding: "11px 14px", color: "#888" }}>{s.bleed_in}″ / {s.spacing_in}″</td>
                    <td style={{ padding: "11px 14px" }}>
                      <button onClick={() => toggle(s)} style={{ background: s.is_active ? "#DCFCE7" : "#F3F4F6", color: s.is_active ? "#166534" : "#6B7280", border: "none", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                        {s.is_active ? "Active" : "Hidden"}
                      </button>
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => startEdit(s)} style={{ background: "none", border: "none", color: "var(--brand-primary, #1C3557)", cursor: "pointer", fontSize: "12px", fontWeight: 700, marginRight: "12px" }}>Edit</button>
                      <button onClick={() => remove(s)} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "12px" }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsTab() {
  const [s, setS] = useState<GangSheetSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    gangSheetsService.adminGetSettings().then((d) => setS(d ?? {})).catch(() => setS({})).finally(() => setLoading(false));
  }, []);

  function set(k: keyof GangSheetSettings, v: unknown) {
    setS((prev) => ({ ...prev, [k]: v }) as GangSheetSettings);
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await gangSheetsService.adminSaveSettings(s);
      setMsg({ text: "Settings saved", ok: true });
    } catch {
      setMsg({ text: "Could not save", ok: false });
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>;

  // Plain render helpers (NOT components) so text inputs don't lose focus on re-render.
  const toggle = (k: keyof GangSheetSettings, label: string, desc?: string) => (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", padding: "6px 0" }}>
      <input type="checkbox" checked={!!s[k]} onChange={(e) => set(k, e.target.checked)} style={{ marginTop: "2px" }} />
      <span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>{label}</span>
        {desc ? <span style={{ display: "block", fontSize: "12px", color: "#9CA3AF" }}>{desc}</span> : null}
      </span>
    </label>
  );
  const section = (title: string, children: React.ReactNode) => (
    <div style={{ ...CARD, marginBottom: "16px" }}>
      <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "12px" }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: "820px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
        {msg && <span style={{ fontSize: "13px", fontWeight: 600, color: msg.ok ? "#166534" : "#B91C1C" }}>{msg.text}</span>}
        <button onClick={save} disabled={saving} style={BTN}>{saving ? "Saving…" : "Save settings"}</button>
      </div>

      {section("General", <>
        <label style={LABEL}>Design-edit request email</label>
        <input style={{ ...INPUT, marginBottom: "14px" }} value={s.design_edit_email ?? ""} onChange={(e) => set("design_edit_email", e.target.value)} placeholder="art@yourbrand.com" />
        <label style={LABEL}>Customer agreement</label>
        <textarea style={{ ...INPUT, minHeight: "90px", resize: "vertical" }} value={s.customer_agreement ?? ""} onChange={(e) => set("customer_agreement", e.target.value)} placeholder="Terms the customer must accept before ordering…" />
      </>)}

      {section("Print output", <>
        <label style={LABEL}>Print file-name format</label>
        <input style={{ ...INPUT, marginBottom: "14px" }} value={s.filename_format ?? ""} onChange={(e) => set("filename_format", e.target.value)} placeholder="{order}-{customer}-{design}" />
        <label style={LABEL}>File type</label>
        <select style={{ ...INPUT, width: "auto", marginBottom: "8px" }} value={s.file_type ?? "PNG"} onChange={(e) => set("file_type", e.target.value)}>
          <option value="PNG">PNG (keeps transparency)</option>
          <option value="PDF">PDF (keeps vectors)</option>
        </select>
        {toggle("auto_trim", "Auto-trim whitespace", "Trim empty space around artwork — saves film.")}
        {toggle("print_qr_logo", "Print QR / logo on the sheet")}
      </>)}

      {section("Builder behaviour", <>
        {toggle("auto_resize_300", "Auto-resize uploads to 300 DPI")}
        {toggle("warn_background", "Warn about backgrounds")}
        {toggle("warn_transparent", "Warn about partial transparency")}
        {toggle("enable_flip", "Enable flipping (mirror)", "Useful for iron-on transfers printed in reverse.")}
        {toggle("disable_text", "Disable the text tool")}
        {toggle("auto_build", "Enable Auto Build")}
        {toggle("folder_organization", "Folder organisation in uploads")}
        {toggle("require_login", "Require customer login")}
        {toggle("allow_reorder", "Allow reorder of past designs")}
        <div style={{ marginTop: "8px" }}>
          <label style={LABEL}>Minimum resolution (DPI) — reject below</label>
          <input type="number" style={{ ...INPUT, width: "120px" }} value={s.min_resolution ?? 72} onChange={(e) => set("min_resolution", Number(e.target.value))} />
        </div>
      </>)}

      {section("Appearance", <>
        {toggle("welcome_popup", "Show welcome popup")}
        <label style={{ ...LABEL, marginTop: "8px" }}>Welcome message</label>
        <textarea style={{ ...INPUT, minHeight: "70px", resize: "vertical", marginBottom: "14px" }} value={s.welcome_message ?? ""} onChange={(e) => set("welcome_message", e.target.value)} placeholder="Welcome! Build your gang sheet below." />
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <label style={LABEL}>Primary colour</label>
            <input type="color" value={s.theme_primary ?? "#1C3557"} onChange={(e) => set("theme_primary", e.target.value)} style={{ width: "56px", height: "34px", border: "1px solid #DDD9D2", borderRadius: "6px", cursor: "pointer", display: "block" }} />
          </div>
          <div>
            <label style={LABEL}>Text colour</label>
            <input type="color" value={s.theme_text ?? "#2A2830"} onChange={(e) => set("theme_text", e.target.value)} style={{ width: "56px", height: "34px", border: "1px solid #DDD9D2", borderRadius: "6px", cursor: "pointer", display: "block" }} />
          </div>
        </div>
      </>)}

      {section("Gallery", <>
        {toggle("show_gallery", "Show the design gallery in the builder")}
        {toggle("watermark_enabled", "Watermark gallery previews", "Discourages screenshots of your stock artwork.")}
        <label style={{ ...LABEL, marginTop: "8px" }}>Watermark text</label>
        <input style={INPUT} value={s.watermark_text ?? ""} onChange={(e) => set("watermark_text", e.target.value)} placeholder="Your store name" />
      </>)}
    </div>
  );
}

// ── Design Library ──────────────────────────────────────────────────────────────
// Ready-made designs buyers can drop straight onto a sheet in the builder's
// "Designs" tab. Admin uploads the file, then it's saved as a library entry.
function LibraryTab() {
  const [designs, setDesigns] = useState<GangSheetLibraryDesign[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  const load = useCallback(() => {
    gangSheetsService.adminListLibrary().then(setDesigns).catch(() => setDesigns([]));
  }, []);
  useEffect(load, [load]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const res = await gangSheetsService.uploadArtwork(file);
        await gangSheetsService.adminCreateLibrary({
          name: res.file_name,
          file_url: res.url,
          file_type: res.type,
          category: category.trim() || undefined,
          is_active: true,
        });
      }
      load();
    } catch {
      setError("Could not upload one of those files.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    await gangSheetsService.adminDeleteLibrary(id).catch(() => {});
    load();
  }

  return (
    <div style={CARD}>
      <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>Ready-made designs</div>
      <p style={{ fontSize: "13px", color: "#777", marginBottom: "16px" }}>
        Upload artwork here and it appears in every buyer&apos;s builder under the <strong>Designs</strong> tab, ready to drop onto a sheet.
      </p>

      <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "18px" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={LABEL}>Category (optional)</label>
          <input style={INPUT} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Holidays, Sports" />
        </div>
        <label style={{ display: "inline-block" }}>
          <input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.svg" onChange={(e) => onFiles(e.target.files)} style={{ display: "none" }} />
          <span style={{ display: "inline-block", background: "var(--brand-primary, #1C3557)", color: "#fff", padding: "10px 18px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            {uploading ? "Uploading…" : "＋ Upload designs"}
          </span>
        </label>
      </div>

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>{error}</div>}

      {designs.length === 0 ? (
        <div style={{ color: "#999", fontSize: "13px" }}>No designs yet. Upload some to get started.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px" }}>
          {designs.map((d) => (
            <div key={d.id} style={{ position: "relative", border: "1px solid #E8E6E1", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.file_url} alt={d.name} style={{ width: "100%", height: "110px", objectFit: "contain", background: "#F7F7F5" }} />
              <div style={{ padding: "6px 8px", fontSize: "11px", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
              <button onClick={() => remove(d.id)} title="Remove" style={{ position: "absolute", top: "5px", right: "5px", background: "rgba(255,255,255,.9)", border: "1px solid #F0C9C9", color: "#B91C1C", borderRadius: "5px", width: "24px", height: "24px", fontSize: "12px", fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
