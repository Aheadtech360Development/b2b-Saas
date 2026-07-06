// frontend/src/app/(admin)/admin/discounts/page.tsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscountCode {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed_amount" | "free_shipping";
  discount_value: number;
  minimum_order_amount: number | null;
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  applicable_to: string;
  applicable_ids: string[];
  customer_eligibility: string;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_count: number;
}

interface FormState {
  code: string;
  discount_type: string;
  discount_value: string;
  minimum_order_amount: string;
  usage_limit_total: string;
  usage_limit_per_customer: string;
  applicable_to: string;
  customer_eligibility: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  code: "",
  discount_type: "percentage",
  discount_value: "",
  minimum_order_amount: "",
  usage_limit_total: "",
  usage_limit_per_customer: "",
  applicable_to: "all",
  customer_eligibility: "all",
  starts_at: "",
  expires_at: "",
  is_active: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function discountTypeLabel(t: string) {
  if (t === "percentage") return "% Off";
  if (t === "fixed_amount") return "$ Off";
  return "Free Shipping";
}

function discountValueDisplay(dc: DiscountCode) {
  if (dc.discount_type === "percentage") return `${dc.discount_value}%`;
  if (dc.discount_type === "fixed_amount") return formatCurrency(dc.discount_value);
  return "Free Shipping";
}

function couponStatus(dc: DiscountCode) {
  if (!dc.is_active) return { label: "Inactive", color: "#7A7880" };
  const now = new Date();
  if (dc.expires_at && new Date(dc.expires_at) < now) return { label: "Expired", color: "#E8242A" };
  if (dc.starts_at && new Date(dc.starts_at) > now) return { label: "Scheduled", color: "#d97706" };
  return { label: "Active", color: "#059669" };
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function fromDatetimeLocal(s: string): string | null {
  if (!s) return null;
  return new Date(s).toISOString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiscountsPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load(p = page, q = search) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: "50" });
      if (q) params.set("q", q);
      const data = await apiClient.get<{ items: DiscountCode[]; total: number; pages: number }>(
        `/api/v1/admin/discounts?${params}`
      );
      setCodes(data.items ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch {
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1, search); }, []);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(dc: DiscountCode) {
    setEditId(dc.id);
    setForm({
      code: dc.code,
      discount_type: dc.discount_type,
      discount_value: String(dc.discount_value),
      minimum_order_amount: dc.minimum_order_amount != null ? String(dc.minimum_order_amount) : "",
      usage_limit_total: dc.usage_limit_total != null ? String(dc.usage_limit_total) : "",
      usage_limit_per_customer: dc.usage_limit_per_customer != null ? String(dc.usage_limit_per_customer) : "",
      applicable_to: dc.applicable_to,
      customer_eligibility: dc.customer_eligibility,
      starts_at: toDatetimeLocal(dc.starts_at),
      expires_at: toDatetimeLocal(dc.expires_at),
      is_active: dc.is_active,
    });
    setFormError(null);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.code.trim()) { setFormError("Code is required."); return; }
    if (!form.discount_value && form.discount_type !== "free_shipping") {
      setFormError("Discount value is required."); return;
    }
    setSaving(true);
    setFormError(null);
    const body = {
      code: form.code.trim(),
      discount_type: form.discount_type,
      discount_value: form.discount_type === "free_shipping" ? 0 : Number(form.discount_value),
      minimum_order_amount: form.minimum_order_amount ? Number(form.minimum_order_amount) : null,
      usage_limit_total: form.usage_limit_total ? Number(form.usage_limit_total) : null,
      usage_limit_per_customer: form.usage_limit_per_customer ? Number(form.usage_limit_per_customer) : null,
      applicable_to: form.applicable_to,
      applicable_ids: [],
      customer_eligibility: form.customer_eligibility,
      starts_at: fromDatetimeLocal(form.starts_at),
      expires_at: fromDatetimeLocal(form.expires_at),
      is_active: form.is_active,
    };
    try {
      if (editId) {
        await apiClient.patch(`/api/v1/admin/discounts/${editId}`, body);
      } else {
        await apiClient.post("/api/v1/admin/discounts", body);
      }
      setShowModal(false);
      load(page, search);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Deactivate this discount code?")) return;
    await apiClient.delete(`/api/v1/admin/discounts/${id}`);
    load(page, search);
  }

  function handleCopy(code: string, id: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  const F = form;
  const set = (key: keyof FormState, val: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1100px", margin: "0 auto", fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "30px", letterSpacing: ".04em", color: "#2A2830", marginBottom: "3px" }}>Discounts</h1>
          <p style={{ fontSize: "13px", color: "#7A7880" }}>{total} coupon code{total !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={openCreate}
          style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
        >
          + Create Discount
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "18px" }}>
        <input
          type="text"
          placeholder="Search by code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { setPage(1); load(1, search); } }}
          style={{ padding: "9px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", width: "280px", outline: "none", fontFamily: "var(--font-jakarta)" }}
        />
        <button
          onClick={() => { setPage(1); load(1, search); }}
          style={{ marginLeft: "8px", padding: "9px 16px", background: "#F4F3EF", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          Search
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#F9F8F5", borderBottom: "1.5px solid #E2E0DA" }}>
              {["Code", "Type / Value", "Usage", "Expiry", "Eligibility", "Status", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>Loading…</td></tr>
            ) : codes.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>No discount codes yet</td></tr>
            ) : codes.map(dc => {
              const status = couponStatus(dc);
              return (
                <tr key={dc.id} style={{ borderBottom: "1px solid #F0EEE9" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#FAFAF8"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
                >
                  {/* Code + copy */}
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "13px", color: "#2A2830", background: "#F4F3EF", padding: "3px 8px", borderRadius: "5px" }}>{dc.code}</span>
                      <button
                        onClick={() => handleCopy(dc.code, dc.id)}
                        title="Copy code"
                        style={{ padding: "3px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", background: copiedId === dc.id ? "#d1fae5" : "#fff", fontSize: "11px", fontWeight: 600, cursor: "pointer", color: copiedId === dc.id ? "#059669" : "#7A7880", transition: "all .15s" }}
                      >
                        {copiedId === dc.id ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </td>
                  {/* Type / value */}
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#2A2830" }}>{discountValueDisplay(dc)}</div>
                    <div style={{ fontSize: "11px", color: "#7A7880" }}>{discountTypeLabel(dc.discount_type)}</div>
                    {dc.minimum_order_amount != null && (
                      <div style={{ fontSize: "11px", color: "#7A7880" }}>Min order: {formatCurrency(dc.minimum_order_amount)}</div>
                    )}
                  </td>
                  {/* Usage */}
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#2A2830" }}>{dc.usage_count}</div>
                    <div style={{ fontSize: "11px", color: "#7A7880" }}>
                      {dc.usage_limit_total != null ? `/ ${dc.usage_limit_total} total` : "Unlimited"}
                    </div>
                    {dc.usage_limit_per_customer != null && (
                      <div style={{ fontSize: "11px", color: "#7A7880" }}>{dc.usage_limit_per_customer}/customer</div>
                    )}
                  </td>
                  {/* Expiry */}
                  <td style={{ padding: "12px 16px" }}>
                    {dc.expires_at ? (
                      <div style={{ fontSize: "12px", color: new Date(dc.expires_at) < new Date() ? "#E8242A" : "#2A2830" }}>
                        {new Date(dc.expires_at).toLocaleDateString()}
                      </div>
                    ) : (
                      <span style={{ fontSize: "12px", color: "#bbb" }}>No expiry</span>
                    )}
                    {dc.starts_at && (
                      <div style={{ fontSize: "11px", color: "#7A7880" }}>Starts: {new Date(dc.starts_at).toLocaleDateString()}</div>
                    )}
                  </td>
                  {/* Eligibility */}
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: "12px", color: "#2A2830", textTransform: "capitalize" }}>
                      {dc.customer_eligibility === "all" ? "All customers" : dc.customer_eligibility}
                    </span>
                  </td>
                  {/* Status */}
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: status.color + "18", color: status.color }}>
                      {status.label}
                    </span>
                  </td>
                  {/* Actions */}
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => openEdit(dc)}
                        style={{ padding: "5px 12px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#2A2830" }}
                      >
                        Edit
                      </button>
                      {dc.is_active && (
                        <button
                          onClick={() => handleDeactivate(dc.id)}
                          style={{ padding: "5px 12px", border: "1px solid rgba(232,36,42,.3)", borderRadius: "6px", background: "rgba(232,36,42,.04)", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#E8242A" }}
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginTop: "20px" }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => { setPage(p); load(p, search); }}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "1.5px solid #E2E0DA", background: p === page ? "#1A5CFF" : "#fff", color: p === page ? "#fff" : "#2A2830", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "540px", boxShadow: "0 24px 80px rgba(0,0,0,.2)", overflow: "hidden" }}>
            {/* Modal header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F0EEE9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", letterSpacing: ".04em", color: "#2A2830" }}>
                {editId ? "Edit Discount Code" : "Create Discount Code"}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ fontSize: "18px", color: "#7A7880", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "20px 24px", maxHeight: "70vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
              {formError && (
                <div style={{ padding: "10px 14px", background: "rgba(232,36,42,.07)", border: "1px solid rgba(232,36,42,.25)", borderRadius: "7px", fontSize: "13px", color: "#E8242A" }}>{formError}</div>
              )}

              {/* Code */}
              <div>
                <label style={labelStyle}>Coupon Code *</label>
                <input
                  value={F.code}
                  onChange={e => set("code", e.target.value.toUpperCase())}
                  placeholder="e.g. SUMMER20"
                  style={inputStyle}
                  disabled={!!editId}
                />
                {!editId && <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "3px" }}>Will be saved in uppercase.</p>}
              </div>

              {/* Discount type + value */}
              <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Discount Type *</label>
                  <select value={F.discount_type} onChange={e => set("discount_type", e.target.value)} style={inputStyle}>
                    <option value="percentage">Percentage (% Off)</option>
                    <option value="fixed_amount">Fixed Amount ($ Off)</option>
                    <option value="free_shipping">Free Shipping</option>
                  </select>
                </div>
                {F.discount_type !== "free_shipping" && (
                  <div>
                    <label style={labelStyle}>{F.discount_type === "percentage" ? "Percentage" : "Amount ($)"} *</label>
                    <input
                      type="number"
                      min="0"
                      step={F.discount_type === "percentage" ? "1" : "0.01"}
                      value={F.discount_value}
                      onChange={e => set("discount_value", e.target.value)}
                      placeholder={F.discount_type === "percentage" ? "e.g. 10" : "e.g. 25.00"}
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>

              {/* Minimums */}
              <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Min Order Amount ($)</label>
                  <input type="number" min="0" step="0.01" value={F.minimum_order_amount} onChange={e => set("minimum_order_amount", e.target.value)} placeholder="None" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Total Usage Limit</label>
                  <input type="number" min="1" value={F.usage_limit_total} onChange={e => set("usage_limit_total", e.target.value)} placeholder="Unlimited" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Per-Customer Limit</label>
                <input type="number" min="1" value={F.usage_limit_per_customer} onChange={e => set("usage_limit_per_customer", e.target.value)} placeholder="Unlimited" style={inputStyle} />
              </div>

              {/* Eligibility */}
              <div>
                <label style={labelStyle}>Customer Eligibility</label>
                <select value={F.customer_eligibility} onChange={e => set("customer_eligibility", e.target.value)} style={inputStyle}>
                  <option value="all">All Customers</option>
                  <option value="wholesale">Wholesale Only</option>
                  <option value="retail">Retail Only</option>
                </select>
              </div>

              {/* Date range */}
              <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Start Date (optional)</label>
                  <input type="datetime-local" value={F.starts_at} onChange={e => set("starts_at", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Expiry Date (optional)</label>
                  <input type="datetime-local" value={F.expires_at} onChange={e => set("expires_at", e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Active toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Active</label>
                <button
                  type="button"
                  onClick={() => set("is_active", !F.is_active)}
                  style={{
                    width: "42px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer",
                    background: F.is_active ? "#059669" : "#E2E0DA", position: "relative", transition: "background .2s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: "3px", width: "16px", height: "16px", borderRadius: "50%",
                    background: "#fff", transition: "left .2s", left: F.is_active ? "23px" : "3px",
                  }} />
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EEE9", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "10px 18px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#7A7880" }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: "10px 24px", background: saving ? "#E2E0DA" : "#1A5CFF", color: saving ? "#aaa" : "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "Saving…" : editId ? "Save Changes" : "Create Code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 700, color: "#2A2830", marginBottom: "5px", textTransform: "uppercase", letterSpacing: ".05em",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px",
  fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box", background: "#fff",
};
