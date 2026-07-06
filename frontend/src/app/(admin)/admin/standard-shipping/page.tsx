// frontend/src/app/(admin)/admin/standard-shipping/page.tsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface FullShippingBracket {
  min_units: number;
  max_units: number | null;
  min_order_value: number | null;
  max_order_value: number | null;
  cost: number;
}

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", display: "block", marginBottom: "5px",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA",
  borderRadius: "7px", fontSize: "13px", fontFamily: "var(--font-jakarta)",
  outline: "none", boxSizing: "border-box", background: "#fff",
};

function emptyBracket(): FullShippingBracket {
  return { min_units: 0, max_units: null, min_order_value: null, max_order_value: null, cost: 0 };
}

function BracketEditor({
  brackets, calcType, onChange,
}: {
  brackets: FullShippingBracket[];
  calcType: "units" | "order_value";
  onChange: (b: FullShippingBracket[]) => void;
}) {
  const thS: React.CSSProperties = {
    padding: "8px 12px", textAlign: "left", fontSize: "10px",
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
      <div style={{ overflowX: "auto", border: "1px solid #E2E0DA", borderRadius: "7px", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "420px" }}>
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
                    <td style={{ padding: "7px 10px" }}>
                      <input type="number" min={0} value={b.min_units}
                        onChange={e => update(i, "min_units", e.target.value)}
                        style={{ ...inputStyle, width: "100px" }} />
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <input type="number" min={1} value={b.max_units ?? ""}
                        onChange={e => update(i, "max_units", e.target.value)}
                        placeholder="∞ unlimited"
                        style={{ ...inputStyle, width: "130px" }} />
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ color: "#aaa" }}>$</span>
                        <input type="number" min={0} step="0.01" value={b.min_order_value ?? ""}
                          onChange={e => update(i, "min_order_value", e.target.value)}
                          placeholder="0.00" style={{ ...inputStyle, width: "100px" }} />
                      </div>
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ color: "#aaa" }}>$</span>
                        <input type="number" min={0} step="0.01" value={b.max_order_value ?? ""}
                          onChange={e => update(i, "max_order_value", e.target.value)}
                          placeholder="∞ unlimited" style={{ ...inputStyle, width: "110px" }} />
                      </div>
                    </td>
                  </>
                )}
                <td style={{ padding: "7px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#aaa" }}>$</span>
                    <input type="number" min={0} step="0.01" value={b.cost}
                      onChange={e => update(i, "cost", e.target.value)}
                      style={{ ...inputStyle, width: "80px" }} />
                    {Number(b.cost) === 0 && (
                      <span style={{
                        fontSize: "10px", fontWeight: 700, color: "#059669",
                        background: "rgba(5,150,105,.1)", padding: "2px 6px", borderRadius: "4px"
                      }}>FREE</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "7px 6px", textAlign: "center" }}>
                  <button onClick={() => onChange(brackets.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "18px", lineHeight: 1, padding: "0 4px" }}>×</button>
                </td>
              </tr>
            ))}
            {brackets.length === 0 && (
              <tr><td colSpan={4} style={{ padding: "14px 12px", textAlign: "center", color: "#aaa", fontSize: "12px" }}>
                No brackets yet. Click &quot;+ Add Bracket&quot; below.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={() => onChange([...brackets, emptyBracket()])}
        style={{
          marginTop: "8px", padding: "6px 14px", background: "#F4F3EF", border: "1px solid #E2E0DA",
          borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#2A2830"
        }}>
        + Add Bracket
      </button>
    </div>
  );
}

export default function StandardShippingPage() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [shippingType, setShippingType] = useState<"store_default" | "flat_rate" | "live_shippo">("store_default");
  const [shippingAmount, setShippingAmount] = useState(0);
  const [calcType, setCalcType] = useState<"units" | "order_value">("order_value");
  const [cutoffTime, setCutoffTime] = useState("");
  const [brackets, setBrackets] = useState<FullShippingBracket[]>([]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadSettings() {
    setLoading(true);
    try {
      const settings = await apiClient.get<Record<string, string>>("/api/v1/admin/settings");
      if (settings?.standard_shipping) {
        const cfg = JSON.parse(settings.standard_shipping);
        setShippingType(cfg.shipping_type === "flat_rate" ? "flat_rate" : cfg.shipping_type === "live_shippo" ? "live_shippo" : "store_default");
        setShippingAmount(Number(cfg.shipping_amount ?? 0));
        setCalcType(cfg.calc_type === "units" ? "units" : "order_value");
        setCutoffTime(cfg.cutoff_time ?? "");
        setBrackets(Array.isArray(cfg.brackets) ? cfg.brackets : []);
      }
    } catch { /* use defaults */ }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiClient.patch("/api/v1/admin/settings", {
        standard_shipping: JSON.stringify({
          shipping_type: shippingType,
          shipping_amount: shippingType === "store_default" ? shippingAmount : 0,
          calc_type: calcType,
          cutoff_time: cutoffTime,
          brackets: shippingType === "flat_rate" ? brackets : [],
        }),
      });
      showToast("Standard shipping saved");
    } catch {
      showToast("Save failed", false);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { loadSettings(); }, []);

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 9999, background: toast.ok ? "#059669" : "#E8242A", color: "#fff", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,.15)" }}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>Standard Shipping</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Shipping rate for customers without a discount group or shipping tier</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: "rgba(26,92,255,.04)", border: "1px solid rgba(26,92,255,.15)", borderRadius: "8px", padding: "14px 18px", marginBottom: "24px", fontSize: "13px", color: "#2A2830", lineHeight: 1.7 }}>
        <strong>Standard Shipping</strong> — applies to customers who are not in any discount group and have no shipping tier assigned, including logged-out users.
        Configure a flat rate, bracket-based rate, or live carrier rates via Shippo for these customers.
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#bbb", fontSize: "14px" }}>Loading…</div>
      ) : (
        <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

            {/* Flat Rate option */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: shippingType === "store_default" ? "rgba(26,92,255,.06)" : "#fff", border: `1.5px solid ${shippingType === "store_default" ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", cursor: "pointer" }}>
                <input type="radio" name="shipping_type" value="store_default" checked={shippingType === "store_default"} onChange={() => setShippingType("store_default")} style={{ accentColor: "#1A5CFF" }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>Flat Rate</div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>A single shipping cost applied to every order</div>
                </div>
              </label>
              {shippingType === "store_default" && (
                <div style={{ marginTop: "10px", marginLeft: "12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", padding: "14px 16px" }}>
                  <label style={labelStyle}>Shipping Amount</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", color: "#7A7880" }}>$</span>
                    <input
                      type="number" min={0} step="0.01" value={shippingAmount}
                      onChange={e => setShippingAmount(parseFloat(e.target.value) || 0)}
                      placeholder="0.00" style={{ ...inputStyle, width: "130px" }}
                    />
                    {shippingAmount === 0 && (
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669", background: "rgba(5,150,105,.1)", padding: "2px 8px", borderRadius: "4px" }}>FREE</span>
                    )}
                  </div>
                  <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "6px" }}>Set 0.00 for free shipping on all standard orders.</p>
                </div>
              )}
            </div>

            {/* Live Shippo Rates option */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: shippingType === "live_shippo" ? "rgba(26,92,255,.06)" : "#fff", border: `1.5px solid ${shippingType === "live_shippo" ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", cursor: "pointer" }}>
                <input type="radio" name="shipping_type" value="live_shippo" checked={shippingType === "live_shippo"} onChange={() => setShippingType("live_shippo")} style={{ accentColor: "#1A5CFF" }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>Live Shipping Rates (via Shippo)</div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>Real-time carrier rates fetched at checkout based on the customer&apos;s address</div>
                </div>
              </label>
              {shippingType === "live_shippo" && (
                <div style={{ marginTop: "10px", marginLeft: "12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", padding: "14px 16px" }}>
                  <p style={{ fontSize: "12px", color: "#2A2830", lineHeight: 1.6, margin: 0 }}>
                    Customers will see a list of available carrier services (USPS, UPS, FedEx) with live pricing at checkout. They can select their preferred service before placing the order.
                  </p>
                  <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "8px", marginBottom: 0 }}>
                    Requires a valid <strong>SHIPPO_API_KEY</strong> configured in your environment.
                  </p>
                </div>
              )}
            </div>

            {/* Bracket-based option */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: shippingType === "flat_rate" ? "rgba(26,92,255,.06)" : "#fff", border: `1.5px solid ${shippingType === "flat_rate" ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", cursor: "pointer" }}>
                <input type="radio" name="shipping_type" value="flat_rate" checked={shippingType === "flat_rate"} onChange={() => setShippingType("flat_rate")} style={{ accentColor: "#1A5CFF" }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>Bracket-Based Rate</div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>Shipping cost varies by order size or value</div>
                </div>
              </label>

              {shippingType === "flat_rate" && (
                <div style={{ marginTop: "10px", marginLeft: "12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", padding: "16px" }}>
                  <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Calculation Type</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {(["units", "order_value"] as const).map(t => (
                        <button key={t} type="button"
                          onClick={() => { setCalcType(t); setBrackets([]); }}
                          style={{
                            flex: 1, padding: "9px 12px", border: `2px solid ${calcType === t ? "#1A5CFF" : "#E2E0DA"}`,
                            borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                            background: calcType === t ? "rgba(26,92,255,.06)" : "#fff",
                            color: calcType === t ? "#1A5CFF" : "#7A7880",
                          }}>
                          {t === "units" ? "Per Unit Count" : "Per Order Value"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Order Cutoff Time</label>
                    <input
                      value={cutoffTime} onChange={e => setCutoffTime(e.target.value)}
                      placeholder="e.g. 12PM CT" style={{ ...inputStyle, width: "130px" }}
                    />
                    <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>Shown to customers at checkout.</div>
                  </div>

                  <div>
                    <label style={{ ...labelStyle, marginBottom: "10px" }}>Pricing Brackets</label>
                    <BracketEditor brackets={brackets} calcType={calcType} onChange={setBrackets} />
                    <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>
                      {calcType === "units"
                        ? "Each row covers a unit range. Leave Max blank on the last row to cover all quantities above."
                        : "Each row covers a dollar range. Set cost $0.00 to offer free shipping above a certain amount."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
