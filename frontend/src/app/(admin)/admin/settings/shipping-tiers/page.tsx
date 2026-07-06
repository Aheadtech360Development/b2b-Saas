"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShippingBracket {
  id?: string;
  min_units: number;
  max_units: number | null;
  min_order_value: number | null;
  max_order_value: number | null;
  cost: number;
}

interface ShippingTier {
  id: string;
  name: string;
  description: string | null;
  calculation_type: "units" | "order_value";
  cutoff_time: string | null;
  is_active: boolean;
  brackets: ShippingBracket[];
}

type CalcType = "units" | "order_value";

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", display: "block", marginBottom: "5px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "7px",
  fontSize: "13px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};

const TYPE_BADGE: Record<CalcType, { bg: string; color: string; label: string }> = {
  units:       { bg: "rgba(26,92,255,.08)",   color: "#1A5CFF", label: "Per Unit Count" },
  order_value: { bg: "rgba(5,150,105,.08)",   color: "#059669", label: "Per Order Value" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyBracket(): ShippingBracket {
  return { min_units: 0, max_units: null, min_order_value: null, max_order_value: null, cost: 0 };
}

function buildBracketPayload(b: ShippingBracket) {
  return {
    min_units: b.min_units ?? 0,
    max_units: b.max_units ?? null,
    min_order_value: b.min_order_value ?? null,
    max_order_value: b.max_order_value ?? null,
    cost: b.cost,
  };
}

// ─── Bracket Editor ───────────────────────────────────────────────────────────

function BracketEditor({
  brackets,
  calcType,
  onChange,
}: {
  brackets: ShippingBracket[];
  calcType: CalcType;
  onChange: (b: ShippingBracket[]) => void;
}) {
  const thS: React.CSSProperties = {
    padding: "9px 12px", textAlign: "left", fontSize: "10px",
    textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700,
  };

  function update(i: number, field: string, val: string) {
    onChange(brackets.map((b, idx) => {
      if (idx !== i) return b;
      if (field === "cost") return { ...b, cost: parseFloat(val) || 0 };
      if (field === "min_units" || field === "max_units")
        return { ...b, [field]: val === "" ? null : parseInt(val) || 0 };
      if (field === "min_order_value" || field === "max_order_value")
        return { ...b, [field]: val === "" ? null : parseFloat(val) || null };
      return b;
    }));
  }

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "520px" }}>
          <thead>
            <tr style={{ background: "#F4F3EF", borderBottom: "1px solid #E2E0DA" }}>
              {calcType === "units" ? (
                <><th style={thS}>Min Units</th><th style={thS}>Max Units (blank = no limit)</th></>
              ) : (
                <><th style={thS}>Min Order $</th><th style={thS}>Max Order $ (blank = no limit)</th></>
              )}
              <th style={thS}>Shipping Cost ($)</th>
              <th style={{ ...thS, width: "36px" }} />
            </tr>
          </thead>
          <tbody>
            {brackets.map((b, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F4F3EF" }}>
                {calcType === "units" ? (
                  <>
                    <td style={{ padding: "8px 10px" }}>
                      <input type="number" min={0} value={b.min_units}
                        onChange={e => update(i, "min_units", e.target.value)}
                        style={{ ...inputStyle, width: "120px" }} />
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <input type="number" min={1} value={b.max_units ?? ""}
                        onChange={e => update(i, "max_units", e.target.value)}
                        placeholder="∞ unlimited"
                        style={{ ...inputStyle, width: "140px" }} />
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ color: "#aaa" }}>$</span>
                        <input type="number" min={0} step="0.01" value={b.min_order_value ?? ""}
                          onChange={e => update(i, "min_order_value", e.target.value)}
                          placeholder="0.00" style={{ ...inputStyle, width: "110px" }} />
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ color: "#aaa" }}>$</span>
                        <input type="number" min={0} step="0.01" value={b.max_order_value ?? ""}
                          onChange={e => update(i, "max_order_value", e.target.value)}
                          placeholder="∞ unlimited" style={{ ...inputStyle, width: "120px" }} />
                      </div>
                    </td>
                  </>
                )}
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#aaa" }}>$</span>
                    <input type="number" min={0} step="0.01" value={b.cost}
                      onChange={e => update(i, "cost", e.target.value)}
                      style={{ ...inputStyle, width: "90px" }} />
                    {Number(b.cost) === 0 && (
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#059669",
                        background: "rgba(5,150,105,.1)", padding: "2px 6px", borderRadius: "4px" }}>FREE</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "8px 6px", textAlign: "center" }}>
                  <button onClick={() => onChange(brackets.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "18px", lineHeight: 1, padding: "0 4px" }}>×</button>
                </td>
              </tr>
            ))}
            {brackets.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "16px 12px", textAlign: "center", color: "#aaa", fontSize: "12px" }}>
                  No brackets yet. Click "+ Add Bracket" below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={() => onChange([...brackets, emptyBracket()])}
        style={{ marginTop: "10px", padding: "6px 16px", background: "#F4F3EF", border: "1px solid #E2E0DA",
          borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#2A2830" }}>
        + Add Bracket
      </button>
    </div>
  );
}

// ─── Tier Form (shared between create and edit) ───────────────────────────────

interface TierFormData {
  name: string;
  description: string;
  calculation_type: CalcType;
  cutoff_time: string;
  is_active: boolean;
  brackets: ShippingBracket[];
}

function emptyForm(): TierFormData {
  return {
    name: "", description: "", calculation_type: "units",
    cutoff_time: "12PM", is_active: true, brackets: [],
  };
}

function TierFormFields({
  form, setForm, tierId,
}: {
  form: TierFormData;
  setForm: React.Dispatch<React.SetStateAction<TierFormData>>;
  tierId?: string;
}) {
  return (
    <div>
      <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Tier Name <span style={{ color: "#E8242A" }}>*</span></label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Tier 1 — Standard Ground" style={{ ...inputStyle, fontSize: "15px", fontWeight: 600 }} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Description</label>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Brief description visible to admins…" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Calculation Type</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["units", "order_value"] as CalcType[]).map(t => (
              <button key={t} type="button"
                onClick={() => setForm(f => ({ ...f, calculation_type: t, brackets: [] }))}
                style={{
                  flex: 1, padding: "9px 12px", border: `2px solid ${form.calculation_type === t ? "#1A5CFF" : "#E2E0DA"}`,
                  borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                  background: form.calculation_type === t ? "rgba(26,92,255,.06)" : "#fff",
                  color: form.calculation_type === t ? "#1A5CFF" : "#7A7880",
                }}>
                {t === "units" ? "📦 Per Unit Count" : "💰 Per Order Value"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "5px" }}>
            {form.calculation_type === "units"
              ? "Shipping cost based on total number of items in the order."
              : "Shipping cost based on order dollar total. Set cost to $0 for free shipping above a threshold."}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Order Cutoff Time</label>
          <input value={form.cutoff_time} onChange={e => setForm(f => ({ ...f, cutoff_time: e.target.value }))}
            placeholder="e.g. 12PM"
            style={{ ...inputStyle, width: "120px" }} />
          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>Shown to customers on checkout.</div>
        </div>
        {tierId && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input id={`active-${tierId}`} type="checkbox" checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              style={{ width: "15px", height: "15px", accentColor: "#1A5CFF" }} />
            <label htmlFor={`active-${tierId}`} style={{ fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              Active (available for assignment to companies)
            </label>
          </div>
        )}
      </div>

      <div>
        <label style={{ ...labelStyle, marginBottom: "10px" }}>Pricing Brackets</label>
        <BracketEditor brackets={form.brackets} calcType={form.calculation_type}
          onChange={brackets => setForm(f => ({ ...f, brackets }))} />
        <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>
          {form.calculation_type === "units"
            ? "Each row covers a unit range. Leave Max blank on the last row to cover all quantities above."
            : "Each row covers a dollar range. Set cost $0.00 to offer free shipping above a certain amount."}
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<TierFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await adminService.createShippingTier({
        name: form.name.trim(),
        description: form.description || null,
        calculation_type: form.calculation_type,
        cutoff_time: form.cutoff_time || null,
        brackets: form.brackets.map(buildBracketPayload),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create tier. Make sure the database migration has been run.");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "740px",
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E0DA", display: "flex",
          justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", letterSpacing: ".04em", margin: 0 }}>
            NEW SHIPPING TIER
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#aaa" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px" }}>
          {error && (
            <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid #FECACA", borderRadius: "8px",
              padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#E8242A" }}>
              {error}
            </div>
          )}
          <TierFormFields form={form} setForm={setForm} />
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E0DA", display: "flex",
          gap: "10px", justifyContent: "flex-end", position: "sticky", bottom: 0, background: "#fff" }}>
          <button onClick={onClose}
            style={{ padding: "10px 20px", border: "1px solid #E2E0DA", borderRadius: "8px",
              background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving || !form.name.trim()}
            style={{ padding: "10px 24px", background: "#1A5CFF", color: "#fff", border: "none",
              borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px",
              opacity: (saving || !form.name.trim()) ? 0.6 : 1 }}>
            {saving ? "Creating…" : "Create Tier"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ tier, onClose, onSaved }: {
  tier: ShippingTier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TierFormData>({
    name: tier.name,
    description: tier.description ?? "",
    calculation_type: tier.calculation_type,
    cutoff_time: tier.cutoff_time ?? "",
    is_active: tier.is_active,
    brackets: tier.brackets.map(b => ({ ...b })),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await adminService.updateShippingTier(tier.id, {
        name: form.name.trim(),
        description: form.description || null,
        calculation_type: form.calculation_type,
        cutoff_time: form.cutoff_time || null,
        is_active: form.is_active,
        brackets: form.brackets.map(buildBracketPayload),
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "740px",
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E0DA", display: "flex",
          justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", letterSpacing: ".04em", margin: 0 }}>
            EDIT — {tier.name.toUpperCase()}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#aaa" }}>✕</button>
        </div>

        <div style={{ padding: "24px" }}>
          {error && (
            <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid #FECACA", borderRadius: "8px",
              padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#E8242A" }}>
              {error}
            </div>
          )}
          <TierFormFields form={form} setForm={setForm} tierId={tier.id} />
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E0DA", display: "flex",
          gap: "10px", justifyContent: "flex-end", position: "sticky", bottom: 0, background: "#fff" }}>
          <button onClick={onClose}
            style={{ padding: "10px 20px", border: "1px solid #E2E0DA", borderRadius: "8px",
              background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()}
            style={{ padding: "10px 24px", background: "#1A5CFF", color: "#fff", border: "none",
              borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px",
              opacity: (saving || !form.name.trim()) ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tier Card ────────────────────────────────────────────────────────────────

function TierCard({ tier, onEdit, onDelete }: {
  tier: ShippingTier;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = TYPE_BADGE[tier.calculation_type] ?? TYPE_BADGE.units;

  const sortedBrackets = [...tier.brackets].sort((a, b) =>
    tier.calculation_type === "order_value"
      ? (a.min_order_value ?? 0) - (b.min_order_value ?? 0)
      : a.min_units - b.min_units
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px",
      overflow: "hidden", marginBottom: "10px" }}>
      {/* Header row */}
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px",
        cursor: "pointer", background: expanded ? "#FAFAFA" : "#fff",
        borderBottom: expanded ? "1px solid #E2E0DA" : "none" }}
        onClick={() => setExpanded(v => !v)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#2A2830" }}>{tier.name}</span>
            <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px",
              fontWeight: 700, background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
            {tier.cutoff_time && (
              <span style={{ fontSize: "11px", color: "#7A7880", background: "#F4F3EF",
                padding: "2px 8px", borderRadius: "4px" }}>
                ⏰ Cutoff {tier.cutoff_time}
              </span>
            )}
            {!tier.is_active && (
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#E8242A",
                background: "rgba(232,36,42,.08)", padding: "2px 8px", borderRadius: "4px" }}>Inactive</span>
            )}
          </div>
          {tier.description && (
            <div style={{ fontSize: "12px", color: "#7A7880", marginTop: "3px" }}>{tier.description}</div>
          )}
        </div>
        <span style={{ fontSize: "12px", color: "#aaa", flexShrink: 0 }}>
          {tier.brackets.length} bracket{tier.brackets.length !== 1 ? "s" : ""}
        </span>
        <span style={{ fontSize: "11px", color: "#aaa", transition: "transform .2s",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", flexShrink: 0 }}>▼</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: "20px" }}>
          {sortedBrackets.length > 0 ? (
            <div style={{ overflowX: "auto", marginBottom: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#F4F3EF" }}>
                    <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "10px",
                      textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700 }}>
                      {tier.calculation_type === "order_value" ? "Order Value Range" : "Unit Range"}
                    </th>
                    <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "10px",
                      textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700 }}>
                      Shipping Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBrackets.map((b, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F4F3EF" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "#2A2830" }}>
                        {tier.calculation_type === "order_value" ? (
                          <>
                            ${Number(b.min_order_value ?? 0).toFixed(2)}
                            {" — "}
                            {b.max_order_value != null ? `$${Number(b.max_order_value).toFixed(2)}` : "and above"}
                          </>
                        ) : (
                          <>
                            {b.min_units} — {b.max_units != null ? b.max_units : "and above"} units
                          </>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {Number(b.cost) === 0 ? (
                          <span style={{ fontWeight: 700, color: "#059669" }}>FREE</span>
                        ) : (
                          <span style={{ fontWeight: 700, color: "#2A2830" }}>${Number(b.cost).toFixed(2)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "12px 0", fontSize: "13px", color: "#aaa", marginBottom: "16px" }}>
              No brackets configured.
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              onClick={async () => {
                if (!confirm(`Delete "${tier.name}"? Companies using this tier will need to be reassigned.`)) return;
                onDelete();
              }}
              style={{ padding: "8px 16px", background: "rgba(232,36,42,.06)", color: "#E8242A",
                border: "1px solid #FECACA", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
              Delete
            </button>
            <button onClick={onEdit}
              style={{ padding: "8px 20px", background: "#1A5CFF", color: "#fff", border: "none",
                borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShippingTiersPage() {
  const [tiers, setTiers] = useState<ShippingTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTier, setEditTier] = useState<ShippingTier | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminService.listShippingTiers() as ShippingTier[];
      setTiers(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    await adminService.deleteShippingTier(id);
    setTiers(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>
            SHIPPING TIERS
          </h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>
            Configure bracket-based shipping rates · {tiers.length} tier{tiers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: "11px 22px", background: "#1A5CFF", color: "#fff", border: "none",
            borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}>
          + New Tier
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: "rgba(26,92,255,.04)", border: "1px solid rgba(26,92,255,.15)", borderRadius: "8px",
        padding: "14px 18px", marginBottom: "20px", fontSize: "13px", color: "#2A2830", lineHeight: 1.7 }}>
        <strong>How tiers work:</strong> Each company is assigned a shipping tier.
        When an order is placed, the cost is automatically calculated from the tier's brackets.
        <br />
        <span style={{ color: "#1A5CFF", fontWeight: 600 }}>📦 Per Unit Count</span> — cost based on total pieces in the order.{" "}
        <span style={{ color: "#059669", fontWeight: 600 }}>💰 Per Order Value</span> — cost based on order dollar total.
        Set cost to <strong>$0.00</strong> on a bracket for free shipping above a threshold.
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid #FECACA", borderRadius: "8px",
          padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#E8242A" }}>
          {error}
          {error.toLowerCase().includes("column") && (
            <div style={{ marginTop: "6px", fontSize: "12px" }}>
              Run <code style={{ background: "rgba(232,36,42,.1)", padding: "1px 5px", borderRadius: "3px" }}>
                backend/migrations/shipping_tier_enhancements.sql
              </code> to apply the database migration first.
            </div>
          )}
        </div>
      )}

      {/* Tiers list */}
      {loading && tiers.length === 0 ? (
        <div style={{ padding: "48px", textAlign: "center", color: "#aaa", fontSize: "14px" }}>
          Loading shipping tiers…
        </div>
      ) : tiers.length === 0 ? (
        <div style={{ padding: "64px", textAlign: "center", background: "#fff",
          border: "1px solid #E2E0DA", borderRadius: "10px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚚</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#2A2830", marginBottom: "6px" }}>
            No shipping tiers yet
          </div>
          <div style={{ fontSize: "13px", color: "#7A7880", marginBottom: "20px" }}>
            Click <strong>"+ New Tier"</strong> to create your first shipping tier.
          </div>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: "11px 24px", background: "#1A5CFF", color: "#fff", border: "none",
              borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            + New Tier
          </button>
        </div>
      ) : (
        tiers.map(tier => (
          <TierCard
            key={tier.id}
            tier={tier}
            onEdit={() => setEditTier(tier)}
            onDelete={() => handleDelete(tier.id)}
          />
        ))
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}

      {/* Edit modal */}
      {editTier && (
        <EditModal
          tier={editTier}
          onClose={() => setEditTier(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
