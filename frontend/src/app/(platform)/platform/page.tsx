"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import {
  platformService,
  tenantUrl,
  enterBrandDashboard,
  type CreateTenantPayload,
  type CreateTenantResponse,
} from "@/services/platform.service";
import type { Tenant } from "@/types/user.types";

// The service is sold as a single flat offering — there are no tiers to choose
// between. New brands are created on one fixed plan value purely to satisfy the
// API contract; it is never surfaced as a choice in the UI.
const DEFAULT_PLAN = "standard";

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:    { bg: "rgba(16,185,129,.15)", color: "#34D399" },
  suspended: { bg: "rgba(245,158,11,.15)", color: "#FBBF24" },
  cancelled: { bg: "rgba(239,68,68,.15)",  color: "#F87171" },
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
    <div style={{ color: "#E5E7EB" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#fff", letterSpacing: ".01em" }}>Brands</h1>
          <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>
            Every brand is an isolated tenant with its own store, admin, products &amp; customers.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none",
            padding: "11px 20px", borderRadius: "9px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
            boxShadow: "0 2px 12px rgba(99,102,241,.35)",
          }}
        >
          + Create Brand
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "28px" }}>
        {[
          { label: "Total Brands", value: stats.total, color: "#818CF8" },
          { label: "Active", value: stats.active, color: "#34D399" },
          { label: "Suspended", value: stats.suspended, color: "#FBBF24" },
          { label: "Total Users", value: stats.users, color: "#A78BFA" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#11141C", border: "1px solid #1E2230", borderRadius: "12px", padding: "18px 20px" }}>
            <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "8px" }}>{s.label}</div>
            <div style={{ fontSize: "30px", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "#F87171", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {/* Brands table */}
      <div style={{ background: "#11141C", border: "1px solid #1E2230", borderRadius: "12px", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>Loading brands…</div>
        ) : tenants.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>
            No brands yet. Click <strong style={{ color: "#A78BFA" }}>Create Brand</strong> to onboard your first one.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#0E1017", borderBottom: "1px solid #1E2230" }}>
                {["Brand", "Open", "Users", "Status", "Actions"].map((h) => (
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
                    <div style={{ fontWeight: 700, color: "#fff" }}>{t.name}</div>
                    <div style={{ fontSize: "11px", color: "#6B7280" }}>{t.email}</div>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <button
                        onClick={() => enterBrandDashboard(t.slug).catch(() => alert("Could not open dashboard"))}
                        title="Enter this brand's admin dashboard"
                        style={{ background: "transparent", border: "none", color: "#818CF8", fontSize: "13px", fontWeight: 700, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "4px" }}
                      >
                        Dashboard ↗
                      </button>
                      <a href={tenantUrl(t.slug)} target="_blank" rel="noopener noreferrer" title="View public store" style={{ color: "#6B7280", textDecoration: "none", fontSize: "12px" }}>
                        Store
                      </a>
                    </div>
                  </td>
                  <td style={{ padding: "14px 18px", textAlign: "center", color: "#C7CBD4" }}>{t.user_count}</td>
                  <td style={{ padding: "14px 18px" }}>
                    <span style={{ ...(STATUS_STYLE[t.status] ?? { bg: "#333", color: "#aaa" }), background: (STATUS_STYLE[t.status] ?? { bg: "#333" }).bg, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize" }}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => setManageTenant(t)}
                        style={{ background: "rgba(99,102,241,.15)", color: "#A5B4FC", border: "none", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                      >
                        Manage
                      </button>
                      {t.status !== "cancelled" && (
                        <button
                          onClick={() => handleToggleStatus(t)}
                          style={{ background: t.status === "active" ? "rgba(245,158,11,.12)" : "rgba(16,185,129,.12)", color: t.status === "active" ? "#FBBF24" : "#34D399", border: "none", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
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

// ── Manage Tenant Modal (features, lifecycle) ─────────────────────────────────
// Subscription tiers are deliberately absent: the product is sold as one flat
// service, so exposing plan pickers here would imply a tier that does not exist.
function ManageTenantModal({ tenant, onClose, onChanged }: { tenant: Tenant; onClose: () => void; onChanged: () => void }) {
  const [features, setFeatures] = useState<{ feature: string; is_enabled: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [purgeText, setPurgeText] = useState("");

  useEffect(() => {
    platformService.getFeatures(tenant.slug).then(setFeatures).catch(() => {});
  }, [tenant.slug]);

  async function toggleFeature(feature: string, enabled: boolean) {
    setFeatures((prev) => prev.map((f) => (f.feature === feature ? { ...f, is_enabled: enabled } : f)));
    try { await platformService.setFeature(tenant.slug, feature, enabled); }
    catch { setFeatures((prev) => prev.map((f) => (f.feature === feature ? { ...f, is_enabled: !enabled } : f))); }
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

  const label = (feat: string) => feat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", zIndex: 1000, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#11141C", border: "1px solid #1E2230", borderRadius: "14px", width: "100%", maxWidth: "520px", padding: "26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>Manage {tenant.name}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7280", fontSize: "22px", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "20px", fontFamily: "monospace" }}>{tenant.slug}</div>
        {msg && <div style={{ background: "rgba(52,211,153,.1)", color: "#34D399", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", marginBottom: "14px" }}>{msg}</div>}

        {/* Feature flags */}
        <div style={{ marginBottom: "22px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#A78BFA", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>Feature Flags</div>
          {features.length === 0 && <div style={{ fontSize: "13px", color: "#6B7280" }}>No feature flags.</div>}
          {features.map((f) => (
            <label key={f.feature} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "#0B0D12", border: "1px solid #1E2230", borderRadius: "8px", marginBottom: "8px", cursor: "pointer" }}>
              <span style={{ fontSize: "13px", color: "#E5E7EB" }}>{label(f.feature)}</span>
              <input type="checkbox" checked={f.is_enabled} onChange={(e) => toggleFeature(f.feature, e.target.checked)} style={{ width: "18px", height: "18px", cursor: "pointer" }} />
            </label>
          ))}
        </div>

        {/* Danger zone */}
        <div style={{ borderTop: "1px solid #2A1518", paddingTop: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#F87171", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>Danger Zone</div>
          {tenant.status !== "cancelled" && (
            <button onClick={cancelBrand} style={{ width: "100%", background: "rgba(245,158,11,.1)", color: "#FBBF24", border: "1px solid rgba(245,158,11,.3)", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", marginBottom: "12px" }}>
              Suspend &amp; Cancel (reversible)
            </button>
          )}
          <div style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "8px", padding: "12px" }}>
            <p style={{ fontSize: "12px", color: "#FCA5A5", margin: "0 0 8px" }}>
              Permanently delete this brand and <b>ALL its data</b> (products, orders, customers, users). This cannot be undone.
              Type <b style={{ fontFamily: "monospace" }}>{tenant.slug}</b> to confirm.
            </p>
            <input value={purgeText} onChange={(e) => setPurgeText(e.target.value)} placeholder={tenant.slug} style={{ width: "100%", background: "#0B0D12", border: "1px solid #262B39", color: "#fff", padding: "9px 12px", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", marginBottom: "8px" }} />
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
    width: "100%", background: "#0B0D12", border: "1px solid #262B39", color: "#fff",
    padding: "10px 12px", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "11px", fontWeight: 600, color: "#8B90A0",
    textTransform: "uppercase", letterSpacing: ".04em", marginBottom: "6px",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", zIndex: 1000, overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#11141C", border: "1px solid #1E2230", borderRadius: "14px", width: "100%", maxWidth: "560px", padding: "28px" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "19px", fontWeight: 800, color: "#fff" }}>Create New Brand</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7280", fontSize: "22px", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[{ n: 1, t: "Brand & Subdomain" }, { n: 2, t: "Admin Account" }].map(({ n, t }) => (
            <div key={n} style={{ flex: 1, padding: "8px 10px", borderRadius: "8px", background: step === n ? "rgba(99,102,241,.15)" : "#0B0D12", border: `1px solid ${step === n ? "#6366F1" : "#1E2230"}` }}>
              <div style={{ fontSize: "10px", color: step >= n ? "#A78BFA" : "#6B7280", fontWeight: 700 }}>STEP {n}</div>
              <div style={{ fontSize: "12px", color: step >= n ? "#E5E7EB" : "#6B7280" }}>{t}</div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "#F87171", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
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
                <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid #2A2F3D", color: "#A5AAB8", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button type="button" onClick={goNext} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Next →</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p style={{ fontSize: "12px", color: "#8B90A0", marginBottom: "16px" }}>Set up the brand owner's login. Share these credentials with them.</p>
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
                <button type="button" onClick={() => { setError(null); setStep(1); }} style={{ background: "transparent", border: "1px solid #2A2F3D", color: "#A5AAB8", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                <button type="submit" disabled={submitting} style={{ background: submitting ? "#4B4F63" : "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}>{submitting ? "Creating…" : "Create Brand"}</button>
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#11141C", border: "1px solid #1E2230", borderRadius: "14px", width: "100%", maxWidth: "460px", padding: "28px", textAlign: "center" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(16,185,129,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", margin: "0 auto 16px" }}>✓</div>
        <h2 style={{ fontSize: "19px", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>Brand Created!</h2>
        <p style={{ fontSize: "13px", color: "#8B90A0", marginBottom: "20px" }}>
          <strong style={{ color: "#fff" }}>{info.name}</strong> is live. Share the login below with the brand owner.
        </p>

        <div style={{ background: "#0B0D12", border: "1px solid #262B39", borderRadius: "10px", padding: "16px", textAlign: "left", marginBottom: "20px" }}>
          <Row label="Store / Login URL" value={storeUrl} link={storeUrl} />
          <Row label="Admin Email" value={info.admin_email} />
        </div>

        <button onClick={onClose} style={{ width: "100%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", padding: "11px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
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
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "#818CF8", fontSize: "13px", fontFamily: "monospace", textDecoration: "none", wordBreak: "break-all" }}>{value} ↗</a>
      ) : (
        <div style={{ color: "#fff", fontSize: "13px", fontFamily: "monospace", wordBreak: "break-all" }}>{value}</div>
      )}
    </div>
  );
}
