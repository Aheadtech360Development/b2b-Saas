"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ask } from "@/lib/dialog";
import { GangSheetProductEditor } from "@/components/admin/GangSheetProductEditor";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";
import {
  gangSheetsService,
  type GangSheetOrder,
  type GangSheetSize,
  type GangSheetStatus,
  type GangSheetLibraryDesign,
  type GangSheetDashboard,
  type GangSheetProduct,
  type GangSheetSetup,
  type GangSheetConfig,
  type GangSheetTier,
  type GangSheetSettings,
} from "@/services/gangSheets.service";

// The new admin's look (admin-shell.css tokens), for the tabs not redone yet.
const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid var(--pc-line)",
  borderRadius: "12px",
  padding: "20px",
};
/** A section's title, in the admin's display font. */
const H2: React.CSSProperties = {
  fontFamily: "var(--pc-display)",
  fontSize: "18px",
  fontWeight: 600,
  letterSpacing: "-.01em",
  color: "var(--pc-ink)",
  margin: 0,
};
/** The three ways a brand can sell a gang sheet, named once. */
type GSType = "gang_sheet" | "upload_by_size" | "upload_own";
const TYPE_LABEL: Record<string, string> = {
  gang_sheet: "Gang Sheet",
  upload_by_size: "Upload By Size",
  upload_own: "Upload Your Own Gang Sheet",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--pc-line)",
  borderRadius: "8px",
  fontSize: "14px",
  fontFamily: "inherit",
  color: "var(--pc-ink)",
  background: "#fff",
  boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "13.5px",
  fontWeight: 600,
  color: "var(--pc-ink)",
  marginBottom: "6px",
};
/** The admin's main button: the theme's blue. */
const BTN: React.CSSProperties = {
  background: "var(--pc-blue)",
  color: "#fff",
  border: "1px solid var(--pc-blue)",
  padding: "0 16px",
  height: "42px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
};
/** The admin's plain button: white, the ink's colour. */
const BTN_LIGHT: React.CSSProperties = { ...BTN, background: "#fff", color: "var(--pc-ink)", border: "1px solid var(--pc-line)" };

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

/** The page's tabs, in the address (?tab=), so a link, Back and a refresh all land on the same one. */
const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "jobs", label: "Print jobs" },
  { key: "setup", label: "Set up" },
  { key: "products", label: "Products" },
  { key: "sizes", label: "Sheet sizes" },
  { key: "library", label: "Design library" },
  { key: "settings", label: "Settings" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** A job's status in the admin's words and tones, the order the work goes in. */
const JOB_STATUSES: [GangSheetStatus, string, string][] = [
  ["submitted", "Submitted", ""], ["in_review", "In review", "amber"], ["revision_requested", "Sent back", "red"],
  ["approved", "Approved", "green"], ["production", "In production", "blue"], ["completed", "Completed", "green"],
  ["rejected", "Rejected", "red"],
];
const jobPill = (s: string): [string, string] => {
  const hit = JOB_STATUSES.find(([k]) => k === s);
  return hit ? [hit[1], hit[2]] : [s.replace(/_/g, " "), ""];
};
const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const shortDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : "–");

export default function AdminGangSheetsPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading gang sheets…</div></div>}>
      <GangSheetsAdmin />
    </Suspense>
  );
}

function GangSheetsAdmin() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  // "orders" was this tab's name before; an old link still lands on it.
  const tab: TabKey = raw === "orders" ? "jobs" : TABS.some((t) => t.key === raw) ? (raw as TabKey) : "dashboard";
  const status = params.get("status") ?? "";

  // ?sheet=<id> — an order's "Admin edit" link from before the Production
  // screens: that sheet now has a page of its own.
  useEffect(() => {
    const id = params.get("sheet");
    if (id) window.location.replace(`/admin/production/${encodeURIComponent(id)}`);
  }, [params]);

  const href = (key: TabKey, s = "") => `/admin/gang-sheets?tab=${key}${s ? `&status=${encodeURIComponent(s)}` : ""}`;

  return (
    <ProductsFrame active="gang-sheets" sub="The sheet sizes, prices, builder and design library your customers order from, and every sheet job."
      actions={<Link href="/admin/production" className="pc-btn" data-kind="primary">Open the print queue</Link>}>
    <div data-gang-sheets data-tab={tab}>
      <nav className="pc-subtabs" aria-label="Gang sheets">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} className="pc-subtab" data-tab={t.key}
            data-on={tab === t.key ? "" : undefined} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "dashboard" ? <DashboardTab jobsHref={(s) => href("jobs", s)} />
        : tab === "jobs" ? <JobsTab status={status} onStatus={(s) => router.replace(href("jobs", s), { scroll: false })} />
        : tab === "setup" ? <SetupTab />
        : tab === "products" ? <ProductsTab onGoToSizes={() => router.push(href("sizes"))} />
        : tab === "sizes" ? <SizesTab />
        : tab === "library" ? <LibraryTab />
        : <SettingsTab />}
    </div>
    </ProductsFrame>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardTab({ jobsHref }: { jobsHref: (status?: string) => string }) {
  const [data, setData] = useState<GangSheetDashboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    gangSheetsService.adminDashboard().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return <div className="pc-card pc-empty">The dashboard could not be loaded.</div>;
  if (!data) return <div className="pc-card pc-empty">Loading the dashboard…</div>;

  const total = data.status_breakdown.reduce((s, r) => s + r.count, 0) || 1;
  const waiting = data.status_breakdown.find((r) => r.status === "in_review")?.count ?? 0;
  const rank = (s: string) => { const i = JOB_STATUSES.findIndex(([k]) => k === s); return i < 0 ? 99 : i; };
  const rows = [...data.status_breakdown].sort((a, b) => rank(a.status) - rank(b.status));

  return (
    <div className="pc-stack" data-gs-dashboard>
      <div className="pc-stats4" style={{ marginBottom: 0 }}>
        <div className="pc-card pc-stat4">
          <div className="pc-stat4-v">{data.total_sheets.toLocaleString()}</div>
          <div className="pc-stat4-l">Sheets made</div>
          <div className="pc-stat4-s">{data.total_jobs.toLocaleString()} {data.total_jobs === 1 ? "job" : "jobs"}</div>
        </div>
        <div className="pc-card pc-stat4">
          <div className="pc-stat4-v">{data.total_orders.toLocaleString()}</div>
          <div className="pc-stat4-l">Checked out</div>
          <div className="pc-stat4-s">Jobs on a placed order</div>
        </div>
        <div className="pc-card pc-stat4">
          <div className="pc-stat4-v">{usd(data.total_amount)}</div>
          <div className="pc-stat4-l">Ordered</div>
          <div className="pc-stat4-s">From placed orders</div>
        </div>
        <div className="pc-card pc-stat4">
          <div className="pc-stat4-v">{waiting}</div>
          <div className="pc-stat4-l">Waiting for review</div>
          <div className="pc-stat4-s"><Link href="/admin/production" className="pc-link" style={{ fontSize: "12.5px" }}>Open the print queue</Link></div>
        </div>
      </div>

      <section className="pc-card" aria-labelledby="gs-status-title">
        <div className="pc-card-head">
          <h2 className="pc-h2" id="gs-status-title">Jobs by status</h2>
          <Link href={jobsHref()} className="pc-link">All print jobs</Link>
        </div>
        {rows.length === 0 ? (
          <div className="pc-empty">No gang sheet jobs yet.</div>
        ) : (
          <div className="pc-pad" style={{ display: "grid", gap: "14px" }}>
            {rows.map((r) => {
              const [label, tone] = jobPill(r.status);
              const pct = Math.round((r.count / total) * 100);
              return (
                <Link key={r.status} href={jobsHref(r.status)} className="pc-bar-row" data-status={r.status} title={`Show the ${label.toLowerCase()} jobs`}>
                  <span className="pc-bar-top">
                    <span className="pc-pill" data-tone={tone || undefined}>{label}</span>
                    <span>{r.count} · {pct}%</span>
                  </span>
                  <span className="pc-bar"><span data-tone={tone || undefined} style={{ width: `${Math.max(pct, 2)}%` }} /></span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="pc-grid-2" style={{ gap: "24px" }}>
        <section className="pc-card" aria-labelledby="gs-recent-title">
          <div className="pc-card-head">
            <h2 className="pc-h2" id="gs-recent-title">Recent jobs</h2>
            <Link href={jobsHref()} className="pc-link">See all</Link>
          </div>
          {data.recent_designs.length === 0 ? <div className="pc-empty">None yet.</div> : (
            <div>
              {data.recent_designs.map((d) => {
                const [label, tone] = jobPill(d.status);
                return (
                  <Link key={d.id ?? d.reference} href={d.id ? `/admin/production/${d.id}` : jobsHref()} className="pc-rowlink" data-recent-job={d.reference}>
                    <span style={{ minWidth: 0 }}>
                      <span className="pc-rowlink-title">{d.reference}</span>
                      <span className="pc-rowlink-sub">{d.contact || "Guest"} · {d.sheet_name}</span>
                    </span>
                    <span className="pc-pill" data-tone={tone || undefined}>{label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="pc-card" aria-labelledby="gs-orders-title">
          <div className="pc-card-head">
            <h2 className="pc-h2" id="gs-orders-title">Recent orders</h2>
            <Link href="/admin/orders" className="pc-link">All orders</Link>
          </div>
          {data.recent_orders.length === 0 ? <div className="pc-empty">No orders yet.</div> : (
            <div>
              {data.recent_orders.map((o) => (
                <Link key={o.id ?? o.reference} href={o.id ? `/admin/production/${o.id}` : jobsHref()} className="pc-rowlink" data-recent-order={o.reference}>
                  <span style={{ minWidth: 0 }}>
                    <span className="pc-rowlink-title">{o.reference}</span>
                    <span className="pc-rowlink-sub">{o.order_number ? `Order ${o.order_number} · ` : ""}{shortDay(o.created_at)}</span>
                  </span>
                  <span style={{ display: "grid", justifyItems: "end", gap: "4px" }}>
                    <b style={{ fontSize: "14px" }}>{usd(o.subtotal)}</b>
                    <span className="pc-pill" data-tone={o.paid ? "green" : "amber"}>{o.paid ? "Paid" : "Unpaid"}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
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
        <h2 style={{ ...H2, margin: "0 0 4px" }}>Get your gang-sheet builder ready</h2>
        <p style={{ fontSize: "13px", color: "#6B6B6B", margin: 0 }}>Complete these steps to start selling custom gang sheets. The ticks update automatically as you go.</p>
      </div>

      {loading ? (
        <div style={{ padding: "26px" }}>{[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}</div>
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
    return (
      <div className="pc-stack" style={{ gap: "16px" }} data-gs-product-editor={editing.slug}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <button type="button" className="pc-link" onClick={() => { setEditing(null); load(); }}>← All gang sheet products</button>
          <h2 style={{ ...H2, fontSize: "20px" }}>{editing.name}</h2>
          <span style={{ flex: 1 }} />
          <Link href={`/admin/products/${editing.slug}/edit?tab=pricing`} className="pc-link">Open the product</Link>
          <button type="button" className="pc-link" onClick={onGoToSizes}>Default sizes</button>
        </div>
        <GangSheetProductEditor productId={editing.id} productName={editing.name} kind={editing.gang_sheet_type} config={editing.gang_sheet_config} />
      </div>
    );
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
        <div style={{ padding: "26px" }}>{[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}</div>
      ) : products.length === 0 ? (
        <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>
          {showAll ? "No products found." : "No gang-sheet products yet — tick “Show all products” to enable the builder on a product."}
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F6F6F7", borderBottom: "1px solid #E8E6E1" }}>
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
                      <option value="upload_own">Upload Your Own Gang Sheet</option>
                    </select>
                  </td>
                  <td style={{ padding: "11px 14px", color: "#6B6B6B" }}>{p.size_count}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <a href={`/products/${p.slug}`} target="_blank" rel="noopener noreferrer" title="View on store" style={{ textDecoration: "none", fontSize: "15px", marginRight: "12px" }}>👁</a>
                    <button title="Copy store link" onClick={() => { try { navigator.clipboard?.writeText(`${window.location.origin}/products/${p.slug}`); } catch { /* ignore */ } }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", marginRight: "12px" }}>🔗</button>
                    <button title="Edit builder & sizes" onClick={() => setEditing(p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1A1A1A", fontWeight: 700 }}>✎</button>
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

// ── Print jobs: every job, whatever its status ────────────────────────────────
// A job opens on its own page (/admin/production/<id>), the one the print queue
// opens, so there is one place a job is reviewed, approved and printed.
type JobRow = GangSheetOrder & { order_number?: string | null; order_payment_status?: string | null };

function JobsTab({ status, onStatus }: { status: string; onStatus: (status: string) => void }) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setJobs(null);
    setFailed(false);
    gangSheetsService.adminListOrders(status || undefined)
      .then((rows) => { if (!cancelled) setJobs(rows as JobRow[]); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [status]);

  const words = q.trim().toLowerCase();
  const shown = (jobs ?? []).filter((j) => !words || `${j.reference} ${j.contact_name ?? ""} ${j.contact_email ?? ""} ${j.order_number ?? ""}`.toLowerCase().includes(words));

  return (
    <div className="pc-stack" style={{ gap: "16px" }} data-gs-jobs>
      <div className="pc-filters">
        <label className="pc-field">
          <Search size={17} strokeWidth={2} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job, customer, email or order" aria-label="Search print jobs" />
        </label>
        <select className="pc-input" style={{ width: "220px", height: "42px" }} value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {JOB_STATUSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      <div className="pc-card" data-shown={jobs ? status : undefined} aria-busy={jobs === null && !failed}>
        {failed ? (
          <div className="pc-empty">The print jobs could not be loaded.</div>
        ) : jobs === null ? (
          <div className="pc-empty">Loading the print jobs…</div>
        ) : shown.length === 0 ? (
          <div className="pc-empty">{words ? "No job matches that search." : status ? "No job has that status." : "No gang sheet jobs yet."}</div>
        ) : (
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ minWidth: "900px" }}>
              <thead>
                <tr><th>Job</th><th>Customer</th><th>Sheet</th><th className="pc-num">Qty</th><th className="pc-num">Total</th><th>Status</th><th>Order</th><th>Created</th></tr>
              </thead>
              <tbody>
                {shown.map((j) => {
                  const [label, tone] = jobPill(j.status);
                  const paid = j.order_payment_status === "paid";
                  return (
                    <tr key={j.id} data-gs-job={j.reference}>
                      <td><Link href={`/admin/production/${j.id}`} className="pc-link">{j.reference}</Link>{j.revision_count > 0 && <div className="pc-sub-line" style={{ fontSize: "12px" }}>sent back {j.revision_count === 1 ? "once" : `${j.revision_count} times`}</div>}</td>
                      <td>{j.contact_name || "Guest"}{j.contact_email ? <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{j.contact_email}</div> : null}</td>
                      <td>{j.sheet_name} <span style={{ color: "var(--pc-faint)" }}>({j.sheet_width_in}″ × {j.sheet_height_in}″)</span></td>
                      <td className="pc-num">{j.sheet_quantity}</td>
                      <td className="pc-num" style={{ fontWeight: 600 }}>{usd(j.subtotal)}</td>
                      <td><span className="pc-pill" data-tone={tone || undefined}>{label}</span></td>
                      <td>
                        {j.order_id ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            <Link href={`/admin/orders/${j.order_id}`} className="pc-link">{j.order_number ?? "Order"}</Link>
                            <span className="pc-pill" data-tone={paid ? "green" : "amber"}>{paid ? "Paid" : "Unpaid"}</span>
                          </span>
                        ) : <span className="pc-pill">Draft</span>}
                      </td>
                      <td style={{ color: "var(--pc-muted)" }}>{shortDay(j.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
    if (!await ask(`Delete "${s.name}"? Existing orders keep their saved sheet details.`)) return;
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
    if (!await ask("Add the 7 standard DTF sizes (22×24 … 22×96)?")) return;
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
              {p.name}{p.gang_sheet_type ? ` — ${TYPE_LABEL[p.gang_sheet_type] ?? "Gang Sheet"}` : ""}
            </option>
          ))}
        </select>
        <span style={{ fontSize: "12px", color: "#9CA3AF" }}>
          {scopeProductId ? "Editing this product's own sizes." : "Default set — used when a product has no sizes of its own."}
        </span>
      </div>

      <div style={{ ...CARD, marginBottom: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div style={H2}>Add a sheet size</div>
          <button onClick={seedStandard} disabled={busy} style={BTN_LIGHT}>
            + Add 7 standard DTF sizes
          </button>
        </div>

        {/* Pricing mode */}
        <div style={{ marginBottom: "14px" }}>
          <label style={LABEL}>Pricing</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {([["fixed", "Fixed size & price"], ["custom_length", "Custom length (per inch)"]] as const).map(([mode, lbl]) => (
              <button key={mode} type="button" onClick={() => setDraft({ ...draft, pricing_mode: mode })}
                style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                  border: "1px solid " + (draft.pricing_mode === mode ? "var(--pc-blue)" : "var(--pc-line)"),
                  background: draft.pricing_mode === mode ? "var(--pc-blue)" : "#fff",
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
              <tr style={{ background: "#F6F6F7", borderBottom: "1px solid #E8E6E1" }}>
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
                        <button disabled={busy} onClick={() => saveEdit(s.id)} style={{ background: "var(--pc-blue)", color: "#fff", border: "none", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", marginRight: "6px" }}>Save</button>
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
                      <button onClick={() => startEdit(s)} style={{ background: "none", border: "none", color: "var(--pc-blue)", cursor: "pointer", fontSize: "12px", fontWeight: 700, marginRight: "12px" }}>Edit</button>
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

  if (loading) return <div style={{ padding: "26px" }}>{[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}</div>;

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
      <div style={{ ...H2, marginBottom: "12px" }}>{title}</div>
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
            <input type="color" value={s.theme_primary ?? "#1A1A1A"} onChange={(e) => set("theme_primary", e.target.value)} style={{ width: "56px", height: "34px", border: "1px solid #E3E3E3", borderRadius: "6px", cursor: "pointer", display: "block" }} />
          </div>
          <div>
            <label style={LABEL}>Text colour</label>
            <input type="color" value={s.theme_text ?? "#2A2830"} onChange={(e) => set("theme_text", e.target.value)} style={{ width: "56px", height: "34px", border: "1px solid #E3E3E3", borderRadius: "6px", cursor: "pointer", display: "block" }} />
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
      <div style={{ ...H2, marginBottom: "4px" }}>Ready-made designs</div>
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
          <span style={{ ...BTN, display: "inline-flex" }}>
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
              <button onClick={() => remove(d.id)} title="Remove" style={{ position: "absolute", top: "5px", right: "5px", background: "rgba(255,255,255,.9)", border: "1px solid #F0C9C9", color: "#B91C1C", borderRadius: "6px", width: "24px", height: "24px", fontSize: "12px", fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
