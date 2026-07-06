// frontend/src/app/(admin)/admin/customers/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminService } from "@/services/admin.service";
import { apiClient } from "@/lib/api-client";
import { MailIcon, PhoneIcon, UserIcon, BuildingIcon, GlobeIcon, CreditCardIcon, BookIcon, TagIcon } from "@/components/ui/icons";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  fax: string | null;
  website: string | null;
  tax_id: string | null;
  business_type: string | null;
  secondary_business: string | null;
  estimated_annual_volume: string | null;
  ppac_number: string | null;
  ppai_number: string | null;
  asi_number: string | null;
  // Registration fields
  company_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  how_heard: string | null;
  num_employees: string | null;
  num_sales_reps: string | null;
  pricing_tier_id: string | null;
  shipping_tier_id: string | null;
  shipping_override_amount: string | null;
  stripe_customer_id: string | null;
  qb_customer_id: string | null;
  admin_notes: string | null;
  tags: string[];
  tax_exempt: boolean;
  net30_enabled: boolean;
  created_at: string;
  updated_at: string;
  // enriched (may be missing)
  contact_name?: string;
  email?: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  company_name: string;
  status: string;
  payment_status: string;
  po_number: string | null;
  total: string | number;
  item_count: number;
  created_at: string;
  timeline?: Array<{ status: string; message: string; created_by: string; created_at: string }>;
}

interface DiscountGroup { id: string; title: string; customer_tag: string; applies_to: string; shipping_type: string; status: string; }


// ─── Status configs ───────────────────────────────────────────────────────────

const ORDER_STATUS: Record<string, { bg: string; color: string }> = {
  pending:    { bg: "rgba(217,119,6,.1)",   color: "#D97706" },
  confirmed:  { bg: "rgba(26,92,255,.1)",   color: "#1A5CFF" },
  processing: { bg: "rgba(8,145,178,.1)",   color: "#0891B2" },
  shipped:    { bg: "rgba(124,58,237,.1)",  color: "#7C3AED" },
  delivered:  { bg: "rgba(5,150,105,.1)",   color: "#059669" },
  completed:  { bg: "rgba(5,150,105,.1)",   color: "#059669" },
  cancelled:  { bg: "rgba(232,36,42,.1)",   color: "#E8242A" },
};

const COMPANY_STATUS: Record<string, { bg: string; color: string }> = {
  active:    { bg: "rgba(5,150,105,.1)",  color: "#059669" },
  suspended: { bg: "rgba(232,36,42,.1)",  color: "#E8242A" },
  pending:   { bg: "rgba(217,119,6,.1)",  color: "#D97706" },
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E0DA",
  borderRadius: "10px",
  padding: "18px 20px",
  marginBottom: "14px",
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  color: "#7A7880",
  marginBottom: "14px",
};

const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  border: "1.5px solid #E2E0DA",
  borderRadius: "7px",
  fontSize: "13px",
  fontFamily: "var(--font-jakarta)",
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};

const thSt: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  color: "#7A7880",
  fontWeight: 700,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [customer, setCustomer]           = useState<Customer | null>(null);
  const [orders, setOrders]               = useState<OrderRow[]>([]);
  const [discountGroups, setDiscountGroups] = useState<DiscountGroup[]>([]);
  const [loading, setLoading]             = useState(true);

  // tags
  const [tags, setTags]       = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [savingTags, setSavingTags] = useState(false);

  // notes
  const [note, setNote]           = useState("");
  const [noteText, setNoteText]   = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote]   = useState(false);

  // suspend
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspending, setSuspending] = useState(false);

  // tax exempt
  const [taxExempt, setTaxExempt] = useState(false);
  const [savingTaxExempt, setSavingTaxExempt] = useState(false);

  // net 30
  const [net30Enabled, setNet30Enabled] = useState(false);
  const [savingNet30, setSavingNet30] = useState(false);

  // feedback
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const co = await adminService.getCompany(id) as Customer;
        setCustomer(co);
        setTags(co.tags ?? []);
        setNote(co.admin_notes ?? "");
        setNoteText(co.admin_notes ?? "");
        setTaxExempt(co.tax_exempt ?? false);
        setNet30Enabled(co.net30_enabled ?? false);

        const groups = await apiClient.get<DiscountGroup[]>("/api/v1/admin/discount-groups").catch(() => []);
        setDiscountGroups(Array.isArray(groups) ? groups : []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    async function loadOrders() {
      try {
        const data = await adminService.listOrders({ company_id: id, page_size: 50 }) as { items?: OrderRow[] } | OrderRow[];
        const items = Array.isArray(data) ? data : (data.items ?? []);
        setOrders(items);
      } catch {
        // non-fatal
      }
    }
    if (id) loadOrders();
  }, [id]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const totalSpend = useMemo(
    () => orders.reduce((s, o) => s + Number(o.total || 0), 0),
    [orders]
  );

  const lastOrderDate = useMemo(
    () => orders.length > 0 && orders[0] ? orders[0].created_at : null,
    [orders]
  );


  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleAddTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    const next = [...tags, t];
    setSavingTags(true);
    try {
      await adminService.updateCompany(id, { tags: next });
      setTags(next);
      setTagInput("");
    } catch {
      showToast("Failed to save tag", false);
    } finally {
      setSavingTags(false);
    }
  }

  async function handleRemoveTag(tag: string) {
    const next = tags.filter(t => t !== tag);
    try {
      await adminService.updateCompany(id, { tags: next });
      setTags(next);
    } catch {
      showToast("Failed to remove tag", false);
    }
  }

  async function handleSaveNote() {
    setSavingNote(true);
    try {
      await adminService.updateCompany(id, { admin_notes: noteText });
      setNote(noteText);
      setEditingNote(false);
      showToast("Notes saved");
    } catch {
      showToast("Failed to save notes", false);
    } finally {
      setSavingNote(false);
    }
  }

  async function handleSuspend() {
    if (!suspendReason.trim()) return;
    setSuspending(true);
    try {
      await adminService.suspendCompany(id, suspendReason);
      setCustomer(c => c ? { ...c, status: "suspended" } : c);
      setShowSuspend(false);
      setSuspendReason("");
      showToast("Company suspended");
    } catch {
      showToast("Failed to suspend", false);
    } finally {
      setSuspending(false);
    }
  }

  async function handleReactivate() {
    try {
      await adminService.reactivateCompany(id);
      setCustomer(c => c ? { ...c, status: "active" } : c);
      showToast("Company reactivated");
    } catch {
      showToast("Failed to reactivate", false);
    }
  }

  async function handleToggleTaxExempt() {
    const newValue = !taxExempt;
    setSavingTaxExempt(true);
    try {
      await adminService.updateCompany(id, { tax_exempt: newValue });
      setTaxExempt(newValue);
      setCustomer(c => c ? { ...c, tax_exempt: newValue } : c);
      showToast(newValue ? "Tax Exempt enabled — no tax will be charged" : "Tax Exempt disabled");
    } catch {
      showToast("Failed to update tax exempt status", false);
    } finally {
      setSavingTaxExempt(false);
    }
  }

  async function handleToggleNet30() {
    const newValue = !net30Enabled;
    setSavingNet30(true);
    try {
      await apiClient.patch(`/api/v1/admin/companies/${id}/net30`, { net30_enabled: newValue });
      setNet30Enabled(newValue);
      setCustomer(c => c ? { ...c, net30_enabled: newValue } : c);
      showToast(newValue ? "Net 30 enabled — customer can pay within 30 days" : "Net 30 disabled");
    } catch {
      showToast("Failed to update Net 30 status", false);
    } finally {
      setSavingNet30(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !customer) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "220px", color: "#bbb", fontSize: "14px", fontFamily: "var(--font-jakarta)" }}>
        Loading…
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "220px", gap: "12px", fontFamily: "var(--font-jakarta)" }}>
        <div style={{ fontSize: "14px", color: "#E8242A" }}>Customer not found</div>
        <button onClick={() => router.back()} style={{ fontSize: "13px", color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>← Back</button>
      </div>
    );
  }

  const statusCfg = COMPANY_STATUS[customer.status] ?? { bg: "rgba(156,163,175,.15)", color: "#9CA3AF" };
  const initials = customer.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "20px", right: "20px", zIndex: 9999,
          background: toast.ok ? "#059669" : "#E8242A", color: "#fff",
          padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,.15)", transition: "opacity .2s",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Back */}
      <button
        onClick={() => router.back()}
        style={{ fontSize: "13px", color: "#1A5CFF", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "18px" }}
      >
        ← Back to Customers
      </button>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px", padding: "20px 24px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>

          {/* Avatar + info */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "56px", height: "56px", borderRadius: "50%",
              background: "linear-gradient(135deg,#1A5CFF,#7C3AED)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontFamily: "var(--font-bebas)", fontSize: "22px", flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "30px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>
                  {customer.name}
                </h1>
                <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: statusCfg.bg, color: statusCfg.color, textTransform: "capitalize" }}>
                  {customer.status}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#7A7880", marginTop: "5px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                {customer.email && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><MailIcon size={12} color="#7A7880" /> {customer.email}</span>}
                {customer.phone && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><PhoneIcon size={12} color="#7A7880" /> {customer.phone}</span>}
                {customer.contact_name && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><UserIcon size={12} color="#7A7880" /> {customer.contact_name}</span>}
                <span>Since {new Date(customer.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {customer.status === "active" ? (
              <button
                onClick={() => setShowSuspend(true)}
                style={{ padding: "9px 16px", border: "1px solid rgba(232,36,42,.3)", borderRadius: "8px", background: "rgba(232,36,42,.05)", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#E8242A" }}>
                Suspend
              </button>
            ) : (
              <button
                onClick={handleReactivate}
                style={{ padding: "9px 16px", border: "1px solid rgba(5,150,105,.3)", borderRadius: "8px", background: "rgba(5,150,105,.05)", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#059669" }}>
                Reactivate
              </button>
            )}
          </div>
        </div>

        {/* Suspend form */}
        {showSuspend && (
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #F4F3EF" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#E8242A", marginBottom: "8px" }}>Suspend Company</div>
            <textarea
              rows={2}
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
              placeholder="Reason for suspension (required)"
              style={{ ...inp, resize: "vertical", borderColor: "rgba(232,36,42,.4)", marginBottom: "8px" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleSuspend}
                disabled={suspending || !suspendReason.trim()}
                style={{ padding: "8px 18px", background: "#E8242A", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: !suspendReason.trim() ? "not-allowed" : "pointer", opacity: !suspendReason.trim() ? 0.5 : 1 }}>
                {suspending ? "Suspending…" : "Confirm Suspend"}
              </button>
              <button
                onClick={() => { setShowSuspend(false); setSuspendReason(""); }}
                style={{ padding: "8px 14px", border: "1px solid #E2E0DA", borderRadius: "7px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── TOP STATS ────────────────────────────────────────────────────── */}
      <div className="admin-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "20px" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "16px 18px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#059669", marginBottom: "6px" }}>Amount Spent</div>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#059669", lineHeight: 1 }}>
            ${totalSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "16px 18px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#1A5CFF", marginBottom: "6px" }}>Total Orders</div>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#1A5CFF", lineHeight: 1 }}>
            {orders.length}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "16px 18px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "6px" }}>Customer Since</div>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#2A2830", lineHeight: 1 }}>
            {new Date(customer.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "16px 18px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "6px" }}>Last Order</div>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", lineHeight: 1 }}>
            {lastOrderDate ? new Date(lastOrderDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
          </div>
        </div>
      </div>

      {/* ── 2-COLUMN LAYOUT ─────────────────────────────────────────────── */}
      <div className="admin-two-col" style={{ display: "grid", gridTemplateColumns: "65% 35%", gap: "14px", alignItems: "start" }}>

        {/* ── LEFT ─────────────────────────────────────────────────────── */}
        <div>

          {/* Last Order */}
          {orders.length > 0 && orders[0] && (() => {
            const last = orders[0]!;
            const oCfg = ORDER_STATUS[last.status] ?? { bg: "rgba(156,163,175,.15)", color: "#9CA3AF" };
            return (
              <div style={card}>
                <div style={sectionTitle}>Last Order</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px", color: "#2A2830" }}>#{last.order_number}</div>
                    {last.po_number && <div style={{ fontSize: "11px", color: "#7A7880" }}>PO: {last.po_number}</div>}
                    <div style={{ fontSize: "12px", color: "#7A7880", marginTop: "2px" }}>
                      {new Date(last.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {last.item_count > 0 && ` · ${last.item_count} item${last.item_count !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830" }}>
                      ${Number(last.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: oCfg.bg, color: oCfg.color, textTransform: "capitalize" }}>
                      {last.status}
                    </span>
                    <button
                      onClick={() => router.push(`/admin/orders/${last.id}`)}
                      style={{ padding: "5px 12px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                      View
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Order History */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={sectionTitle}>Order History</div>
              <span style={{ fontSize: "12px", color: "#7A7880" }}>{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
            </div>
            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px", color: "#bbb", fontSize: "13px" }}>No orders yet</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F4F3EF", borderBottom: "1.5px solid #E2E0DA" }}>
                      <th style={thSt}>Order #</th>
                      <th style={thSt}>Date</th>
                      <th style={{ ...thSt, textAlign: "right" }}>Items</th>
                      <th style={{ ...thSt, textAlign: "right" }}>Total</th>
                      <th style={thSt}>Status</th>
                      <th style={thSt}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => {
                      const oCfg = ORDER_STATUS[o.status] ?? { bg: "rgba(156,163,175,.15)", color: "#9CA3AF" };
                      return (
                        <tr key={o.id}
                          style={{ borderBottom: "1px solid #F4F3EF", cursor: "pointer", transition: "background .1s" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          onClick={() => router.push(`/admin/orders/${o.id}`)}>
                          <td style={{ padding: "11px 14px", fontWeight: 700, fontSize: "13px", color: "#2A2830" }}>
                            #{o.order_number}
                            {o.po_number && <div style={{ fontSize: "10px", color: "#7A7880", fontWeight: 400 }}>PO: {o.po_number}</div>}
                          </td>
                          <td style={{ padding: "11px 14px", fontSize: "12px", color: "#7A7880", whiteSpace: "nowrap" }}>
                            {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td style={{ padding: "11px 14px", textAlign: "right", fontSize: "13px", color: "#2A2830", fontWeight: 600 }}>{o.item_count}</td>
                          <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "var(--font-bebas)", fontSize: "16px", color: "#2A2830" }}>
                            ${Number(o.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "11px 14px" }}>
                            <span style={{ padding: "3px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: oCfg.bg, color: oCfg.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
                              {o.status}
                            </span>
                          </td>
                          <td style={{ padding: "11px 14px" }} onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => router.push(`/admin/orders/${o.id}`)}
                              style={{ padding: "4px 10px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Timeline */}
          {(() => {
            type TLEntry = { date: string; label: string; sub: string; color: string; key: string };
            const entries: TLEntry[] = [
              {
                date: customer.created_at,
                label: "Account created",
                sub: "Wholesale account registered",
                color: "#059669",
                key: "created",
              },
            ];
            orders.forEach((o, oi) => {
              entries.push({
                date: o.created_at,
                label: `Order #${o.order_number} placed`,
                sub: `${o.item_count} item${o.item_count !== 1 ? "s" : ""} · $${Number(o.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                color: "#1A5CFF",
                key: `order-placed-${oi}`,
              });
              (o.timeline ?? []).forEach((e, ei) => {
                entries.push({
                  date: e.created_at,
                  label: e.message,
                  sub: `Order #${o.order_number}`,
                  color: ORDER_STATUS[e.status]?.color ?? "#8B5CF6",
                  key: `tl-${oi}-${ei}`,
                });
              });
            });
            const sorted = entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            return (
              <div style={card}>
                <div style={sectionTitle}>Timeline</div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {sorted.map((ev, i, arr) => (
                    <div key={ev.key} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: ev.color, marginTop: "4px" }} />
                        {i < arr.length - 1 && <div style={{ width: "2px", background: "#E2E0DA", flexGrow: 1, minHeight: "20px" }} />}
                      </div>
                      <div style={{ paddingBottom: "16px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>{ev.label}</div>
                        <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "1px" }}>{ev.sub}</div>
                        <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>
                          {new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── RIGHT ────────────────────────────────────────────────────── */}
        <div>

          {/* Customer Details */}
          <div style={card}>
            <div style={sectionTitle}>Customer Details</div>

            {/* Contact info */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
              {[
                { icon: <MailIcon size={13} color="#7A7880" />, label: "Email",       val: customer.email },
                { icon: <MailIcon size={13} color="#7A7880" />, label: "Co. Email",   val: customer.company_email },
                { icon: <PhoneIcon size={13} color="#7A7880" />, label: "Phone",       val: customer.phone },
                { icon: <PhoneIcon size={13} color="#7A7880" />, label: "Fax",         val: customer.fax },
                { icon: <UserIcon size={13} color="#7A7880" />, label: "Contact",     val: customer.contact_name },
                { icon: <BuildingIcon size={13} color="#7A7880" />, label: "Biz Type",   val: customer.business_type },
                { icon: <BuildingIcon size={13} color="#7A7880" />, label: "Secondary",  val: customer.secondary_business },
                { icon: <GlobeIcon size={13} color="#7A7880" />, label: "Website",    val: customer.website },
                { icon: <TagIcon size={13} color="#7A7880" />, label: "Tax ID",      val: customer.tax_id },
                { icon: <TagIcon size={13} color="#7A7880" />, label: "Est. Volume", val: customer.estimated_annual_volume },
                { icon: <CreditCardIcon size={13} color="#7A7880" />, label: "Stripe",    val: customer.stripe_customer_id },
              ].filter(r => r.val).map(r => (
                <div key={r.label} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px" }}>
                  <span style={{ flexShrink: 0, marginTop: "1px" }}>{r.icon}</span>
                  <div style={{ minWidth: "72px", color: "#7A7880", flexShrink: 0 }}>{r.label}</div>
                  <div style={{ color: "#2A2830", fontWeight: 600, wordBreak: "break-all" }}>{r.val}</div>
                </div>
              ))}
              {/* Address block */}
              {(customer.address_line1 || customer.city) && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px" }}>
                  <span style={{ flexShrink: 0, marginTop: "1px" }}><BuildingIcon size={13} color="#7A7880" /></span>
                  <div style={{ minWidth: "72px", color: "#7A7880", flexShrink: 0 }}>Address</div>
                  <div style={{ color: "#2A2830", fontWeight: 600, lineHeight: 1.5 }}>
                    {customer.address_line1 && <div>{customer.address_line1}</div>}
                    {customer.address_line2 && <div>{customer.address_line2}</div>}
                    {[customer.city, customer.state_province, customer.postal_code].filter(Boolean).length > 0 && (
                      <div>{[customer.city, customer.state_province, customer.postal_code].filter(Boolean).join(", ")}</div>
                    )}
                    {customer.country && <div>{customer.country}</div>}
                  </div>
                </div>
              )}
              {/* Trade association numbers */}
              {(customer.ppac_number || customer.ppai_number || customer.asi_number) && (
                <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", paddingLeft: "21px", fontSize: "13px" }}>
                  {customer.ppac_number && <span style={{ color: "#7A7880" }}>PPAC: <strong style={{ color: "#2A2830" }}>{customer.ppac_number}</strong></span>}
                  {customer.ppai_number && <span style={{ color: "#7A7880" }}>PPAI: <strong style={{ color: "#2A2830" }}>{customer.ppai_number}</strong></span>}
                  {customer.asi_number && <span style={{ color: "#7A7880" }}>ASI: <strong style={{ color: "#2A2830" }}>{customer.asi_number}</strong></span>}
                </div>
              )}
              {/* Staff size + how heard */}
              {(customer.num_employees || customer.num_sales_reps || customer.how_heard) && (
                <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", paddingLeft: "21px", fontSize: "12px", color: "#7A7880" }}>
                  {customer.num_employees && <span>Employees: <strong style={{ color: "#2A2830" }}>{customer.num_employees}</strong></span>}
                  {customer.num_sales_reps && <span>Sales Reps: <strong style={{ color: "#2A2830" }}>{customer.num_sales_reps}</strong></span>}
                  {customer.how_heard && <span>Heard via: <strong style={{ color: "#2A2830" }}>{customer.how_heard}</strong></span>}
                </div>
              )}
            </div>

            {/* Pricing & Shipping — Discount Group */}
            <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px" }}>
              <div style={{ ...sectionTitle, marginBottom: "10px" }}>Pricing &amp; Shipping</div>
              {(() => {
                const matched = discountGroups.filter(g => g.customer_tag && tags.includes(g.customer_tag));
                if (matched.length === 0) {
                  return (
                    <div style={{ fontSize: "12px", color: "#bbb", padding: "8px 0" }}>
                      No discount group assigned
                    </div>
                  );
                }
                return matched.map(g => (
                  <div key={g.id} style={{ padding: "10px 12px", background: "rgba(26,92,255,.05)", border: "1px solid rgba(26,92,255,.15)", borderRadius: "8px", marginBottom: "8px" }}>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "#1A5CFF" }}>{g.title}</div>
                    <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "3px" }}>
                      Tag: <strong style={{ color: "#2A2830" }}>@{g.customer_tag}</strong>
                      {" · "}
                      {g.applies_to === "store" ? "All products" : g.applies_to === "collections" ? "Selected collections" : "Selected products"}
                    </div>
                    <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "2px" }}>
                      Shipping: <strong style={{ color: "#2A2830" }}>{g.shipping_type === "flat_rate" ? "Flat Rate" : "Store Default"}</strong>
                      {" · "}
                      Status: <strong style={{ color: g.status === "enabled" ? "#059669" : "#E8242A" }}>{g.status}</strong>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Tax Exempt */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <div style={sectionTitle}>Tax Exempt</div>
              {taxExempt && (
                <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(5,150,105,.1)", color: "#059669" }}>
                  ACTIVE
                </span>
              )}
            </div>
            <p style={{ fontSize: "12px", color: "#7A7880", marginBottom: "12px", lineHeight: 1.5 }}>
              When enabled, this customer will not be charged or shown any tax at checkout.
            </p>
            <label
              onClick={!savingTaxExempt ? handleToggleTaxExempt : undefined}
              style={{ display: "flex", alignItems: "center", gap: "12px", cursor: savingTaxExempt ? "not-allowed" : "pointer", opacity: savingTaxExempt ? 0.6 : 1 }}
            >
              <div style={{
                position: "relative", width: "44px", height: "24px", borderRadius: "12px",
                background: taxExempt ? "#059669" : "#E2E0DA",
                transition: "background .2s", flexShrink: 0,
              }}>
                <div style={{
                  position: "absolute", top: "3px",
                  left: taxExempt ? "23px" : "3px",
                  width: "18px", height: "18px", borderRadius: "50%",
                  background: "#fff", transition: "left .2s",
                  boxShadow: "0 1px 4px rgba(0,0,0,.2)",
                }} />
              </div>
              <span style={{ fontSize: "13px", fontWeight: 600, color: taxExempt ? "#059669" : "#7A7880" }}>
                {savingTaxExempt ? "Saving…" : taxExempt ? "Tax Exempt — no tax charged" : "Not exempt (standard tax)"}
              </span>
            </label>
          </div>

          {/* Net 30 — only show for active (approved wholesale) companies */}
          {customer.status === "active" && (
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <div style={sectionTitle}>Net 30 Payment Terms</div>
                {net30Enabled && (
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(26,92,255,.1)", color: "#1A5CFF" }}>
                    ACTIVE
                  </span>
                )}
              </div>
              <p style={{ fontSize: "12px", color: "#7A7880", marginBottom: "12px", lineHeight: 1.5 }}>
                When enabled, this wholesale customer can place orders and pay within 30 days.<br />
                Only available for approved wholesale accounts.
              </p>
              <label
                onClick={!savingNet30 ? handleToggleNet30 : undefined}
                style={{ display: "flex", alignItems: "center", gap: "12px", cursor: savingNet30 ? "not-allowed" : "pointer", opacity: savingNet30 ? 0.6 : 1 }}
              >
                <div style={{
                  position: "relative", width: "44px", height: "24px", borderRadius: "12px",
                  background: net30Enabled ? "#1A5CFF" : "#E2E0DA",
                  transition: "background .2s", flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute", top: "3px",
                    left: net30Enabled ? "23px" : "3px",
                    width: "18px", height: "18px", borderRadius: "50%",
                    background: "#fff", transition: "left .2s",
                    boxShadow: "0 1px 4px rgba(0,0,0,.2)",
                  }} />
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: net30Enabled ? "#1A5CFF" : "#7A7880" }}>
                  {savingNet30 ? "Saving…" : net30Enabled ? "Net 30 enabled — pay within 30 days" : "Net 30 disabled"}
                </span>
              </label>
            </div>
          )}

          {/* Tags */}
          <div style={card}>
            <div style={sectionTitle}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", minHeight: "28px", marginBottom: "10px" }}>
              {tags.length === 0 && <span style={{ fontSize: "12px", color: "#bbb" }}>No tags yet</span>}
              {tags.map(tag => (
                <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", background: "rgba(26,92,255,.08)", color: "#1A5CFF", borderRadius: "20px", fontSize: "12px", fontWeight: 600 }}>
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#1A5CFF", padding: 0, fontSize: "14px", lineHeight: 1, marginLeft: "2px" }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
                placeholder="Add tag… (Enter to save)"
                style={{ ...inp, flex: 1 }}
              />
              <button
                onClick={handleAddTag}
                disabled={savingTags || !tagInput.trim()}
                style={{ padding: "8px 13px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "7px", fontSize: "16px", fontWeight: 700, cursor: !tagInput.trim() ? "not-allowed" : "pointer", opacity: !tagInput.trim() ? 0.4 : 1 }}>
                +
              </button>
            </div>
          </div>

          {/* Registration Info — always shown, fields render only when populated */}
          <div style={card}>
              <div style={sectionTitle}>Registration Information</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {customer.company_email && (
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>Company Email</div>
                    <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.company_email}</div>
                  </div>
                )}
                {(customer.address_line1 || customer.city) && (
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>Address</div>
                    <div style={{ fontSize: "13px", color: "#2A2830", lineHeight: 1.5 }}>
                      {customer.address_line1 && <div>{customer.address_line1}</div>}
                      {customer.address_line2 && <div>{customer.address_line2}</div>}
                      {(customer.city || customer.state_province || customer.postal_code) && (
                        <div>{[customer.city, customer.state_province, customer.postal_code].filter(Boolean).join(", ")}</div>
                      )}
                      {customer.country && <div>{customer.country}</div>}
                    </div>
                  </div>
                )}
                {customer.secondary_business && (
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>Secondary Business</div>
                    <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.secondary_business}</div>
                  </div>
                )}
                {customer.estimated_annual_volume && (
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>Est. Annual Volume</div>
                    <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.estimated_annual_volume}</div>
                  </div>
                )}
                {(customer.ppac_number || customer.ppai_number || customer.asi_number) && (
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {customer.ppac_number && (
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>PPAC #</div>
                        <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.ppac_number}</div>
                      </div>
                    )}
                    {customer.ppai_number && (
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>PPAI #</div>
                        <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.ppai_number}</div>
                      </div>
                    )}
                    {customer.asi_number && (
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>ASI #</div>
                        <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.asi_number}</div>
                      </div>
                    )}
                  </div>
                )}
                {(customer.num_employees || customer.num_sales_reps) && (
                  <div style={{ display: "flex", gap: "16px" }}>
                    {customer.num_employees && (
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>Employees</div>
                        <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.num_employees}</div>
                      </div>
                    )}
                    {customer.num_sales_reps && (
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>Sales Reps</div>
                        <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.num_sales_reps}</div>
                      </div>
                    )}
                  </div>
                )}
                {customer.how_heard && (
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>How Heard About Us</div>
                    <div style={{ fontSize: "13px", color: "#2A2830" }}>{customer.how_heard}</div>
                  </div>
                )}
              </div>
            </div>

          {/* Notes */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={sectionTitle}>Admin Notes</div>
              {!editingNote && (
                <button
                  onClick={() => { setNoteText(note); setEditingNote(true); }}
                  style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  Edit
                </button>
              )}
            </div>
            {editingNote ? (
              <>
                <textarea
                  rows={5}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add internal notes about this customer…"
                  style={{ ...inp, resize: "vertical", marginBottom: "8px" }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote}
                    style={{ flex: 1, padding: "8px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: savingNote ? "not-allowed" : "pointer", opacity: savingNote ? 0.6 : 1 }}>
                    {savingNote ? "Saving…" : "Save Notes"}
                  </button>
                  <button
                    onClick={() => { setEditingNote(false); setNoteText(note); }}
                    style={{ padding: "8px 14px", border: "1px solid #E2E0DA", borderRadius: "7px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <p style={{ fontSize: "13px", color: note ? "#2A2830" : "#bbb", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
                {note || "No notes yet. Click Edit to add internal notes."}
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
