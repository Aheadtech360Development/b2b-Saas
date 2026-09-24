"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import {
  platformService,
  tenantUrl,
  enterBrandDashboard,
  type CreateTenantPayload,
  type CreateTenantResponse,
  type FeatureFlag,
  type Commission,
} from "@/services/platform.service";
import { AnalyticsTab, ActivityTab, SearchTab, HealthTab } from "@/components/platform/InsightTabs";
import type { Tenant } from "@/types/user.types";

// The service is sold as a single flat offering — there are no tiers to choose
// between. New brands are created on one fixed plan value purely to satisfy the
// API contract; it is never surfaced as a choice in the UI.
const DEFAULT_PLAN = "standard";

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:    { bg: "#ECFDF5", color: "#047857" },
  suspended: { bg: "#FFFBEB", color: "#B45309" },
  cancelled: { bg: "#FEF2F2", color: "#B42318" },
};

function slugify(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function PlatformDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<CreateTenantResponse | null>(null);
  const [manageTenant, setManageTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<"brands" | "analytics" | "activity" | "search" | "health">("brands");

  async function loadTenants() {
    setLoading(true);
    setError(null);
    try {
      const list = await platformService.listTenants();
      setTenants(list);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load brands");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTenants();
  }, []);

  const stats = useMemo(() => {
    return {
      total: tenants.length,
      active: tenants.filter((t) => t.status === "active").length,
      suspended: tenants.filter((t) => t.status === "suspended").length,
      users: tenants.reduce((sum, t) => sum + (t.user_count ?? 0), 0),
    };
  }, [tenants]);

  async function handleToggleStatus(t: Tenant) {
    const next = t.status === "active" ? "suspended" : "active";
    try {
      await platformService.updateTenant(t.slug, { status: next });
      setTenants((prev) => prev.map((x) => (x.slug === t.slug ? { ...x, status: next } : x)));
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Update failed");
    }
  }

  return (
    <div style={{ color: "#18181B" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#18181B", letterSpacing: ".01em" }}>Brands</h1>
          <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>
            Every brand is an isolated tenant with its own store, admin, products &amp; customers.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: "#18181B", color: "#fff", border: "none",
            padding: "11px 20px", borderRadius: "9px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,.08)",
          }}
        >
          + Create Brand
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #E4E4E7", marginBottom: "24px" }}>
        {([
          ["brands", "Brands"],
          ["analytics", "Analytics"],
          ["activity", "Activity"],
          ["search", "Search"],
          ["health", "Brand Health"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: "10px 16px", fontSize: "13px",
              color: tab === key ? "#18181B" : "#71717A",
              fontWeight: tab === key ? 700 : 500,
              borderBottom: "2px solid " + (tab === key ? "#18181B" : "transparent"),
              marginBottom: "-1px",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "analytics" && <AnalyticsTab />}
      {tab === "activity" && <ActivityTab tenants={tenants} />}
      {tab === "search" && <SearchTab />}
      {tab === "health" && <HealthTab onEnter={(slug) => enterBrandDashboard(slug).catch(() => alert("Could not open dashboard"))} />}

      {tab === "brands" && <>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "28px" }}>
        {[
          { label: "Total Brands", value: stats.total, color: "#18181B" },
          { label: "Active", value: stats.active, color: "#18181B" },
          { label: "Suspended", value: stats.suspended, color: stats.suspended > 0 ? "#B45309" : "#18181B" },
          { label: "Total Users", value: stats.users, color: "#18181B" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: "12px", padding: "18px 20px" }}>
            <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "8px" }}>{s.label}</div>
            <div style={{ fontSize: "30px", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B42318", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {/* Brands table */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: "12px", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>Loading brands…</div>
        ) : tenants.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>
            No brands yet. Click <strong style={{ color: "#52525B" }}>Create Brand</strong> to onboard your first one.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#0E1017", borderBottom: "1px solid #E4E4E7" }}>
                {["Brand", "Plan", "Open", "Users", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 18px", textAlign: h === "Users" ? "center" : "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".06em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: i < tenants.length - 1 ? "1px solid #171B26" : "none" }}>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontWeight: 700, color: "#18181B" }}>{t.name}</div>
                    <div style={{ fontSize: "11px", color: "#6B7280" }}>{t.email}</div>
                  </td>
                  {/* What this brand is on, and whether it is actually paying
                      for it. A bare key said neither. */}
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontWeight: 700, color: "#18181B" }}>
                      {t.plan_detail?.name ?? t.plan ?? "—"}
                    </div>
                    <div style={{ fontSize: "11px", color: "#6B7280" }}>
                      {t.plan_detail?.price_display ?? "—"}
                      {t.plan_detail?.commission_display
                        ? ` · ${t.plan_detail.commission_display} commission` : ""}
                    </div>
                    <BillingBadge status={t.billing_status} />
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <button
                        onClick={() => enterBrandDashboard(t.slug).catch(() => alert("Could not open dashboard"))}
                        title="Enter this brand's admin dashboard"
                        style={{ background: "transparent", border: "none", color: "#18181B", fontSize: "13px", fontWeight: 700, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "4px" }}
                      >
                        Dashboard ↗
                      </button>
                      <a href={tenantUrl(t.slug)} target="_blank" rel="noopener noreferrer" title="View public store" style={{ color: "#6B7280", textDecoration: "none", fontSize: "12px" }}>
                        Store
                      </a>
                    </div>
                  </td>
                  <td style={{ padding: "14px 18px", textAlign: "center", color: "#3F3F46" }}>{t.user_count}</td>
                  <td style={{ padding: "14px 18px" }}>
                    <span style={{ ...(STATUS_STYLE[t.status] ?? { bg: "#333", color: "#aaa" }), background: (STATUS_STYLE[t.status] ?? { bg: "#333" }).bg, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize" }}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => setManageTenant(t)}
                        style={{ background: "#F4F4F5", color: "#18181B", border: "1px solid #E4E4E7", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                      >
                        Manage
                      </button>
                      {t.status !== "cancelled" && (
                        <button
                          onClick={() => handleToggleStatus(t)}
                          style={{ background: t.status === "active" ? "#FFFBEB" : "#ECFDF5", color: t.status === "active" ? "#B45309" : "#047857", border: `1px solid ${t.status === "active" ? "#FDE68A" : "#A7F3D0"}`, padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                        >
                          {t.status === "active" ? "Suspend" : "Activate"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>}

      {/* Create modal */}
      {showCreate && (
        <CreateBrandModal
          onClose={() => setShowCreate(false)}
          onCreated={(info) => {
            setShowCreate(false);
            setCreatedInfo(info);
            loadTenants();
          }}
        />
      )}

      {/* Success modal */}
      {createdInfo && (
        <SuccessModal info={createdInfo} onClose={() => setCreatedInfo(null)} />
      )}

      {/* Manage tenant modal */}
      {manageTenant && (
        <ManageTenantModal
          tenant={manageTenant}
          onClose={() => setManageTenant(null)}
          onChanged={() => loadTenants()}
        />
      )}
    </div>
  );
}

/** What the platform takes on this brand's Gang Sheet Builder orders.
 *
 *  Normally the plan's rate. Sometimes a brand is owed something different —
 *  an early customer, a deal that was struck — and that has to be settable
 *  without moving them to a tier they did not buy.
 */
function CommissionEditor({ slug }: { slug: string }) {
  const [rate, setRate] = useState<Commission | null>(null);
  const [percent, setPercent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    platformService.getCommission(slug)
      .then((r) => { setRate(r); setPercent(r.override_bps !== null ? String(r.override_bps / 100) : ""); })
      .catch(() => setErr("Could not read the commission"));
  }, [slug]);

  async function save(bps: number | null) {
    setBusy(true); setErr(null);
    try {
      const r = await platformService.setCommission(slug, bps);
      setRate(r);
      setPercent(r.override_bps !== null ? String(r.override_bps / 100) : "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that rate");
    } finally {
      setBusy(false);
    }
  }

  if (!rate) return null;
  const typed = percent.trim();
  // Entered as a percentage, stored in basis points: 2.8 → 280.
  const asBps = typed === "" ? null : Math.round(parseFloat(typed) * 100);
  const valid = typed === "" || (Number.isFinite(asBps as number) && (asBps as number) >= 0 && (asBps as number) <= 1000);

  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "#52525B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>
        Gang Sheet Builder commission
      </div>
      <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "10px" }}>
        Taken on Gang Sheet Builder orders only. Leave blank to use this plan&apos;s
        rate of <strong style={{ color: "#3F3F46" }}>{(rate.plan_bps / 100).toFixed(1)}%</strong>.
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "0 0 130px" }}>
          <input
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder={(rate.plan_bps / 100).toFixed(1)}
            inputMode="decimal"
            style={{ width: "100%", padding: "8px 26px 8px 11px", borderRadius: "8px", border: `1px solid ${valid ? "#E4E4E7" : "#FCA5A5"}`, fontSize: "13px", background: "#fff", color: "#18181B" }}
          />
          <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#6B7280", fontSize: "13px" }}>%</span>
        </div>
        <button
          onClick={() => save(asBps)}
          disabled={busy || !valid}
          style={{ background: busy || !valid ? "#D4D4D8" : "#18181B", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: busy || !valid ? "not-allowed" : "pointer" }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {rate.override_bps !== null && (
          <button
            onClick={() => save(null)}
            disabled={busy}
            style={{ background: "#F4F4F5", color: "#52525B", border: "1px solid #E4E4E7", padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
          >
            Use plan rate
          </button>
        )}
      </div>
      <div style={{ fontSize: "12px", marginTop: "8px", color: err ? "#B91C1C" : "#6B7280" }}>
        {err ?? (rate.override_bps !== null
          ? `Charging ${rate.display} — set for this brand, not by its plan.`
          : `Charging ${rate.display}, this plan's rate.`)}
      </div>
      {!valid && <div style={{ fontSize: "12px", color: "#B91C1C", marginTop: "4px" }}>A commission is between 0% and 10%.</div>}
    </div>
  );
}

/** Whether the plan a brand is on is actually being billed. A shop can sit on
 *  Wholesale and have paid nothing, and the console said nothing about it. */
function BillingBadge({ status }: { status?: string }) {
  const s = (status ?? "none").toLowerCase();
  const look =
    s === "active" || s === "trialing"
      ? { bg: "#ECFDF5", fg: "#047857", text: s === "trialing" ? "Trialing" : "Paid" }
      : s === "past_due" || s === "unpaid"
        ? { bg: "#FEF2F2", fg: "#B91C1C", text: "Past due" }
        : s === "canceled" || s === "cancelled"
          ? { bg: "#F4F4F5", fg: "#52525B", text: "Cancelled" }
          : { bg: "#FFFBEB", fg: "#B45309", text: "No card yet" };
  return (
    <span style={{ display: "inline-block", marginTop: "4px", background: look.bg, color: look.fg, padding: "2px 8px", borderRadius: "20px", fontSize: "10px", fontWeight: 700 }}>
      {look.text}
    </span>
  );
}

// ── Manage Tenant Modal (features, lifecycle) ─────────────────────────────────
// Subscription tiers are deliberately absent: the product is sold as one flat
// service, so exposing plan pickers here would imply a tier that does not exist.
/** The catalogue, in the order it came, grouped the way it is grouped. */
function groupFeatures(rows: FeatureFlag[]): [string, FeatureFlag[]][] {
  const out: [string, FeatureFlag[]][] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last[0] === row.group) last[1].push(row);
    else out.push([row.group, [row]]);
  }
  return out;
}

function ManageTenantModal({ tenant, onClose, onChanged }: { tenant: Tenant; onClose: () => void; onChanged: () => void }) {
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [purgeText, setPurgeText] = useState("");
  const [domain, setDomain] = useState(tenant.custom_domain ?? "");
  const [savingDomain, setSavingDomain] = useState(false);
  const [brandName, setBrandName] = useState(tenant.name);
  const [savingName, setSavingName] = useState(false);
  const [handle, setHandle] = useState(tenant.slug);
  const [savingHandle, setSavingHandle] = useState(false);

  const [plan, setPlan] = useState("");

  useEffect(() => {
    platformService.getFeatures(tenant.slug)
      .then((r) => { setFeatures(r.features); setPlan(r.plan); })
      .catch(() => {});
  }, [tenant.slug]);

  /** Grant it, take it away, or hand it back to the plan. */
  async function setFeature(feature: string, next: boolean | null) {
    const before = features;
    setFeatures((prev) => prev.map((f) => (
      f.feature === feature
        ? { ...f, override: next, enabled: next === null ? f.in_plan : next }
        : f
    )));
    try {
      const r = await platformService.setFeature(tenant.slug, feature, next);
      setFeatures(r.features);
      setPlan(r.plan);
    } catch {
      setFeatures(before);
      setMsg("Could not change that feature.");
    }
  }

  async function cancelBrand() {
    if (!confirm(`Suspend & cancel "${tenant.name}"? (reversible)`)) return;
    try { await platformService.deleteTenant(tenant.slug); onChanged(); onClose(); } catch { alert("Failed"); }
  }

  async function purge() {
    if (purgeText !== tenant.slug) return;
    setBusy(true);
    try { await platformService.purgeTenant(tenant.slug); onChanged(); onClose(); }
    catch { setMsg("Purge failed"); setBusy(false); }
  }


  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", zIndex: 1000, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: "14px", width: "100%", maxWidth: "520px", padding: "26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#18181B" }}>Manage {tenant.name}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7280", fontSize: "22px", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "16px", fontFamily: "monospace" }}>{tenant.slug}</div>

        {/* What this brand bought, first thing — before deciding anything about
            it, the plan it is on is the thing worth knowing. */}
        <div style={{ background: "#FAFAF9", border: "1px solid #E4E4E7", borderRadius: "10px", padding: "14px 16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".06em" }}>Plan</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#18181B", marginTop: "2px" }}>
                {tenant.plan_detail?.name ?? tenant.plan ?? "—"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#18181B", fontFamily: "'IBM Plex Mono', monospace" }}>
                {tenant.plan_detail?.price_display ?? "—"}
              </div>
              <div style={{ fontSize: "11px", color: "#6B7280" }}>
                {tenant.plan_detail?.commission_display
                  ? `${tenant.plan_detail.commission_display} on Gang Sheet Builder orders` : ""}
              </div>
            </div>
          </div>
          {tenant.plan_detail?.limits_display && (
            <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #E4E4E7" }}>
              {tenant.plan_detail.limits_display}
            </div>
          )}
          <div style={{ marginTop: "10px" }}><BillingBadge status={tenant.billing_status} /></div>
        </div>

        <CommissionEditor slug={tenant.slug} />

        {msg && <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", marginBottom: "14px" }}>{msg}</div>}

        {/* What the brand is called — on its orders, its emails and its console. */}
        <div style={{ marginBottom: "22px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#52525B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>Brand name</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              style={{ flex: 1, background: "#F7F7F8", border: "1px solid #E4E4E7", borderRadius: "8px", padding: "10px 12px", color: "#18181B", fontSize: "13px" }}
            />
            <button
              onClick={async () => {
                const next = brandName.trim();
                if (!next) { setMsg("A brand needs a name."); return; }
                setSavingName(true);
                setMsg(null);
                try {
                  await platformService.updateTenant(tenant.slug, { name: next });
                  setMsg(`Renamed to ${next}.`);
                  onChanged();
                } catch (err) {
                  setMsg(err instanceof Error && err.message ? err.message : "Could not rename it.");
                } finally {
                  setSavingName(false);
                }
              }}
              disabled={savingName || brandName.trim() === tenant.name}
              style={{ background: "#F4F4F5", color: "#52525B", border: "1px solid #D4D4D8", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: savingName ? "wait" : "pointer", opacity: brandName.trim() === tenant.name ? 0.5 : 1 }}
            >
              {savingName ? "Saving…" : "Rename"}
            </button>
          </div>
          <p style={{ fontSize: "11.5px", color: "#6B7280", marginTop: "8px", lineHeight: 1.6 }}>
            The web address stays <span style={{ fontFamily: "monospace" }}>{tenant.slug}</span> — renaming
            does not move the shop, so links that already exist keep working.
          </p>
        </div>

        {/* Where the brand lives on the platform, until it has a domain. */}
        <div style={{ marginBottom: "22px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#52525B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>Platform address</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#6B7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>/?tenant=</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              style={{ flex: 1, background: "#F7F7F8", border: "1px solid #E4E4E7", borderRadius: "8px", padding: "10px 12px", color: "#18181B", fontSize: "13px", fontFamily: "monospace" }}
            />
            <button
              onClick={async () => {
                const next = handle.trim();
                if (!next || next === tenant.slug) return;
                if (!confirm(`Move this shop to "${next}"?

Any link with the old address stops working, and anyone browsing it right now will have to open the new one.`)) return;
                setSavingHandle(true);
                setMsg(null);
                try {
                  await platformService.updateTenant(tenant.slug, { slug: next });
                  setMsg(`Moved to /?tenant=${next}`);
                  onChanged();
                  onClose();
                } catch (err) {
                  setMsg(err instanceof Error && err.message ? err.message : "Could not move it.");
                } finally {
                  setSavingHandle(false);
                }
              }}
              disabled={savingHandle || !handle.trim() || handle.trim() === tenant.slug}
              style={{ background: "#F4F4F5", color: "#52525B", border: "1px solid #D4D4D8", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: savingHandle ? "wait" : "pointer", opacity: handle.trim() === tenant.slug ? 0.5 : 1 }}
            >
              {savingHandle ? "Moving…" : "Move"}
            </button>
          </div>
          <p style={{ fontSize: "11.5px", color: "#6B7280", marginTop: "8px", lineHeight: 1.6 }}>
            Lower-case letters, numbers and hyphens. This is where the shop is until the
            brand has a domain of its own — moving it breaks any link that already points
            at the old one, so it is worth doing early and not again.
          </p>
        </div>

        {/* The address this shop is reached at. Without it, a link opened in
            a fresh browser — no cookie, no subdomain — lands on no brand. */}
        <div style={{ marginBottom: "22px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#52525B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>Shop address</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="shop.example.com"
              style={{ flex: 1, background: "#F7F7F8", border: "1px solid #E4E4E7", borderRadius: "8px", padding: "10px 12px", color: "#18181B", fontSize: "13px", fontFamily: "monospace" }}
            />
            <button
              onClick={async () => {
                setSavingDomain(true);
                setMsg(null);
                try {
                  await platformService.updateTenant(tenant.slug, { custom_domain: domain.trim() });
                  setMsg(domain.trim() ? `This shop now answers at ${domain.trim()}` : "Address cleared.");
                  onChanged();
                } catch (err) {
                  setMsg(err instanceof Error && err.message ? err.message : "Could not save that address.");
                } finally {
                  setSavingDomain(false);
                }
              }}
              disabled={savingDomain}
              style={{ background: "#F4F4F5", color: "#52525B", border: "1px solid #D4D4D8", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: savingDomain ? "wait" : "pointer" }}
            >
              {savingDomain ? "Saving…" : "Save"}
            </button>
          </div>
          <p style={{ fontSize: "11.5px", color: "#6B7280", marginTop: "8px", lineHeight: 1.6 }}>
            This brand&apos;s <em>own</em> domain, once it has one — the host on its own,
            no https:// and no path. Leave it empty until then: the brand is reached at
            <span style={{ fontFamily: "monospace" }}>{`/?tenant=${tenant.slug}`}</span>, and
            this platform&apos;s own address stays the platform&apos;s.
          </p>
        </div>

        {/* What this brand may use. The plan decides the default and anything
            here overrides it, either way, for any feature. */}
        <div style={{ marginBottom: "22px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#52525B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "4px" }}>
            Features
          </div>
          <p style={{ fontSize: "11.5px", color: "#6B7280", margin: "0 0 12px", lineHeight: 1.6 }}>
            Plan <strong style={{ color: "#3F3F46" }}>{plan || "—"}</strong> decides the default.
            Grant or remove anything regardless of it; <em>Plan</em> puts it back.
          </p>
          {features.length === 0 && <div style={{ fontSize: "13px", color: "#6B7280" }}>Loading…</div>}
          {groupFeatures(features).map(([group, rows]) => (
            <div key={group} style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "6px" }}>
                {group}
              </div>
              {rows.map((f) => (
                <div key={f.feature} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "9px 12px", background: "#F7F7F8", border: "1px solid #E4E4E7", borderRadius: "8px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12.5px", color: f.enabled ? "#18181B" : "#6B7280", lineHeight: 1.4 }}>
                    {f.label}
                    {f.override !== null && (
                      <span style={{ marginLeft: "6px", fontSize: "10.5px", color: "#52525B", fontWeight: 700 }}>
                        {f.override ? "GRANTED" : "REMOVED"}
                      </span>
                    )}
                  </span>
                  <span style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    {([["On", true], ["Off", false], ["Plan", null]] as [string, boolean | null][]).map(([text, value]) => {
                      const active = f.override === value;
                      return (
                        <button
                          key={text}
                          onClick={() => setFeature(f.feature, value)}
                          style={{
                            fontSize: "11px", fontWeight: 700, padding: "4px 9px", borderRadius: "6px",
                            cursor: "pointer",
                            border: `1px solid ${active ? "#18181B" : "#E4E4E7"}`,
                            background: active ? "#EFEFF1" : "transparent",
                            color: active ? "#52525B" : "#6B7280",
                          }}
                        >
                          {text}
                        </button>
                      );
                    })}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Danger zone */}
        <div style={{ borderTop: "1px solid #F0D2D2", paddingTop: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#B42318", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>Danger Zone</div>
          {tenant.status !== "cancelled" && (
            <button onClick={cancelBrand} style={{ width: "100%", background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", marginBottom: "12px" }}>
              Suspend &amp; Cancel (reversible)
            </button>
          )}
          <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "12px" }}>
            <p style={{ fontSize: "12px", color: "#B42318", margin: "0 0 8px", lineHeight: 1.6 }}>
              Permanently delete this brand and <b>ALL its data</b> (products, orders, customers, users). This cannot be undone.
              Type <b style={{ fontFamily: "monospace" }}>{tenant.slug}</b> to confirm.
            </p>
            <input value={purgeText} onChange={(e) => setPurgeText(e.target.value)} placeholder={tenant.slug} style={{ width: "100%", background: "#F7F7F8", border: "1px solid #E4E4E7", color: "#18181B", padding: "9px 12px", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", marginBottom: "8px" }} />
            <button onClick={purge} disabled={purgeText !== tenant.slug || busy} style={{ width: "100%", background: purgeText === tenant.slug ? "#DC2626" : "#3a1518", color: purgeText === tenant.slug ? "#fff" : "#7f4a4a", border: "none", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: purgeText === tenant.slug ? "pointer" : "not-allowed" }}>
              Permanently Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create Brand Modal ────────────────────────────────────────────────────────
function CreateBrandModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (info: CreateTenantResponse) => void;
}) {
  const [form, setForm] = useState<CreateTenantPayload>({
    name: "",
    slug: "",
    email: "",
    plan: DEFAULT_PLAN,
    admin_email: "",
    admin_password: "",
    admin_first_name: "",
    admin_last_name: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  function set<K extends keyof CreateTenantPayload>(key: K, value: CreateTenantPayload[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function goNext() {
    setError(null);
    if (!form.name.trim() || !form.slug.trim() || !form.email.trim()) {
      setError("Please fill brand name, subdomain and contact email.");
      return;
    }
    setStep(2);
  }

  function handleNameChange(v: string) {
    set("name", v);
    if (!slugEdited) set("slug", slugify(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.admin_password.length < 8) {
      setError("Admin password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const info = await platformService.createTenant({ ...form, slug: slugify(form.slug) });
      onCreated(info);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create brand");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#F7F7F8", border: "1px solid #E4E4E7", color: "#18181B",
    padding: "10px 12px", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "11px", fontWeight: 600, color: "#71717A",
    textTransform: "uppercase", letterSpacing: ".04em", marginBottom: "6px",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", zIndex: 1000, overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: "14px", width: "100%", maxWidth: "560px", padding: "28px" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "19px", fontWeight: 800, color: "#18181B" }}>Create New Brand</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7280", fontSize: "22px", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[{ n: 1, t: "Brand & Subdomain" }, { n: 2, t: "Admin Account" }].map(({ n, t }) => (
            <div key={n} style={{ flex: 1, padding: "8px 10px", borderRadius: "8px", background: step === n ? "#F4F4F5" : "#FAFAFA", border: `1px solid ${step === n ? "#18181B" : "#E4E4E7"}` }}>
              <div style={{ fontSize: "10px", color: step >= n ? "#52525B" : "#6B7280", fontWeight: 700 }}>STEP {n}</div>
              <div style={{ fontSize: "12px", color: step >= n ? "#18181B" : "#6B7280" }}>{t}</div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B42318", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Brand Name *</label>
                <input style={inputStyle} autoFocus value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Nike Wholesale" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label style={labelStyle}>Subdomain (slug) *</label>
                  <input style={inputStyle} value={form.slug} onChange={(e) => { setSlugEdited(true); set("slug", e.target.value); }} placeholder="nike" />
                  <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "4px" }}>
                    {form.slug ? tenantUrl(slugify(form.slug)) : "brand's store URL"}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Brand Contact Email *</label>
                <input style={inputStyle} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="contact@nike.com" />
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid #D4D4D8", color: "#52525B", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button type="button" onClick={goNext} style={{ background: "#18181B", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Next →</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p style={{ fontSize: "12px", color: "#71717A", marginBottom: "16px" }}>Set up the brand owner's login. Share these credentials with them.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label style={labelStyle}>First Name *</label>
                  <input style={inputStyle} autoFocus required value={form.admin_first_name} onChange={(e) => set("admin_first_name", e.target.value)} placeholder="John" />
                </div>
                <div>
                  <label style={labelStyle}>Last Name *</label>
                  <input style={inputStyle} required value={form.admin_last_name} onChange={(e) => set("admin_last_name", e.target.value)} placeholder="Doe" />
                </div>
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Admin Email *</label>
                <input style={inputStyle} type="email" required value={form.admin_email} onChange={(e) => set("admin_email", e.target.value)} placeholder="owner@nike.com" />
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Admin Password *</label>
                <input style={inputStyle} type="text" required value={form.admin_password} onChange={(e) => set("admin_password", e.target.value)} placeholder="min 8 characters" />
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "space-between" }}>
                <button type="button" onClick={() => { setError(null); setStep(1); }} style={{ background: "transparent", border: "1px solid #D4D4D8", color: "#52525B", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                <button type="submit" disabled={submitting} style={{ background: submitting ? "#4B4F63" : "#18181B", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}>{submitting ? "Creating…" : "Create Brand"}</button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

// ── Success Modal ─────────────────────────────────────────────────────────────
function SuccessModal({ info, onClose }: { info: CreateTenantResponse; onClose: () => void }) {
  const storeUrl = tenantUrl(info.slug);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 1001 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: "14px", width: "100%", maxWidth: "460px", padding: "28px", textAlign: "center" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#ECFDF5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", margin: "0 auto 16px" }}>✓</div>
        <h2 style={{ fontSize: "19px", fontWeight: 800, color: "#18181B", marginBottom: "6px" }}>Brand Created!</h2>
        <p style={{ fontSize: "13px", color: "#71717A", marginBottom: "20px", lineHeight: 1.6 }}>
          <strong style={{ color: "#18181B" }}>{info.name}</strong> is live. Share the login below with the brand owner.
        </p>

        <div style={{ background: "#F7F7F8", border: "1px solid #E4E4E7", borderRadius: "10px", padding: "16px", textAlign: "left", marginBottom: "20px" }}>
          <Row label="Store / Login URL" value={storeUrl} link={storeUrl} />
          <Row label="Admin Email" value={info.admin_email} />
        </div>

        <button onClick={onClose} style={{ width: "100%", background: "#18181B", color: "#fff", border: "none", padding: "11px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
          Done
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "3px", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "#18181B", fontSize: "13px", fontFamily: "monospace", textDecoration: "none", wordBreak: "break-all" }}>{value} ↗</a>
      ) : (
        <div style={{ color: "#18181B", fontSize: "13px", fontFamily: "monospace", wordBreak: "break-all" }}>{value}</div>
      )}
    </div>
  );
}
