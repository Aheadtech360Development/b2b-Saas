"use client";

/**
 * ProductOptionsBuilder — the admin side of configurable products.
 *
 * A product is either a stocked `variant` matrix (Colour × Size, inventory per
 * combination) or `configurable`: UNLIMITED option groups whose combinations are
 * never stored. Each choice carries a price effect and the unit price is resolved
 * on demand — that's what lets a brand model a print product (Paper Stock,
 * Coating, Rounded Corners, …) that a variant matrix could never represent.
 *
 * The whole configuration is edited as one document and saved with a single PUT.
 * The price preview here mirrors the server formula so the admin can sanity-check
 * pricing while building — the server stays the only authority at checkout.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

type PriceMode = "flat" | "per_unit" | "percent";
type InputType = "select" | "radio" | "swatch" | "checkbox" | "number" | "text";

interface OptValue {
  id?: string;
  label: string;
  price_delta: number;
  price_mode: PriceMode;
  swatch_hex?: string | null;
  sku_suffix?: string | null;
  is_default: boolean;
  enabled: boolean;
}
interface Opt {
  id?: string;
  name: string;
  input_type: InputType;
  required: boolean;
  help_text?: string | null;
  is_active: boolean;
  values: OptValue[];
}
interface Tier { id?: string; min_qty: number; unit_price: number; }

const PRICE_MODE_LABEL: Record<PriceMode, string> = {
  per_unit: "per unit",
  flat: "one-off",
  percent: "% of unit",
};

export function ProductOptionsBuilder({ productId }: { productId: string }) {
  const [mode, setMode] = useState<"variant" | "configurable">("variant");
  const [basePrice, setBasePrice] = useState<string>("");
  const [options, setOptions] = useState<Opt[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewQty, setPreviewQty] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await apiClient.get<{
        pricing_mode: "variant" | "configurable"; base_price: number | null;
        options: Opt[]; qty_tiers: Tier[];
      }>(`/api/v1/admin/products/${productId}/options`);
      setMode(cfg.pricing_mode ?? "variant");
      setBasePrice(cfg.base_price != null ? String(cfg.base_price) : "");
      setOptions(cfg.options ?? []);
      setTiers(cfg.qty_tiers ?? []);
    } catch { /* new product / not configured yet */ }
    setLoading(false);
  }, [productId]);
  useEffect(() => { load(); }, [load]);

  function flash(text: string, ok = true) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 2500); }

  // ── Option mutations ───────────────────────────────────────────────────────
  const patchOpt = (i: number, p: Partial<Opt>) => setOptions(o => o.map((x, k) => k === i ? { ...x, ...p } : x));
  const addOption = () => setOptions(o => [...o, {
    name: "", input_type: "select", required: true, is_active: true,
    values: [{ label: "", price_delta: 0, price_mode: "per_unit", is_default: true, enabled: true }],
  }]);
  const removeOption = (i: number) => setOptions(o => o.filter((_, k) => k !== i));
  const moveOption = (i: number, dir: -1 | 1) => setOptions(o => {
    const j = i + dir; if (j < 0 || j >= o.length) return o;
    const n = [...o]; [n[i], n[j]] = [n[j]!, n[i]!]; return n;
  });

  const patchVal = (oi: number, vi: number, p: Partial<OptValue>) =>
    setOptions(o => o.map((x, k) => k !== oi ? x : {
      ...x,
      values: x.values.map((v, m) => {
        if (m !== vi) return p.is_default ? { ...v, is_default: false } : v; // only one default
        return { ...v, ...p };
      }),
    }));
  const addVal = (oi: number) => setOptions(o => o.map((x, k) => k !== oi ? x : {
    ...x, values: [...x.values, { label: "", price_delta: 0, price_mode: "per_unit", is_default: x.values.length === 0, enabled: true }],
  }));
  const removeVal = (oi: number, vi: number) =>
    setOptions(o => o.map((x, k) => k !== oi ? x : { ...x, values: x.values.filter((_, m) => m !== vi) }));

  // ── Live preview — mirrors the server formula ──────────────────────────────
  function preview() {
    const qty = Math.max(1, previewQty || 1);
    const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
    let unit = Number(basePrice) || 0;
    for (const t of sorted) if (qty >= t.min_qty) unit = Number(t.unit_price) || 0;
    let flat = 0; const pcts: number[] = [];
    for (const o of options) {
      if (!o.is_active) continue;
      const chosen = o.values.find(v => v.is_default && v.enabled) ?? o.values.find(v => v.enabled);
      if (!chosen) continue;
      const d = Number(chosen.price_delta) || 0;
      if (chosen.price_mode === "per_unit") unit += d;
      else if (chosen.price_mode === "percent") pcts.push(1 + d / 100);
      else flat += d;
    }
    for (const f of pcts) unit *= f;
    unit = Math.max(0, unit);
    return { unit, total: Math.max(0, unit * qty + flat), flat };
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient.put(`/api/v1/admin/products/${productId}/options`, {
        pricing_mode: mode,
        base_price: basePrice === "" ? null : Number(basePrice),
        options: options
          .filter(o => o.name.trim())
          .map(o => ({ ...o, values: o.values.filter(v => v.label.trim()) })),
        qty_tiers: tiers.filter(t => t.min_qty > 0),
      });
      flash("Configuration saved");
      load();
    } catch { flash("Could not save", false); }
    setSaving(false);
  }

  if (loading) {
    return <div style={CARD}>{[60, 85, 50].map((w, i) => (
      <div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />
    ))}</div>;
  }

  const p = preview();

  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1A1A1A" }}>Options &amp; pricing</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {msg && <span style={{ fontSize: "12px", fontWeight: 700, color: msg.ok ? "#166534" : "#B91C1C" }}>{msg.text}</span>}
          <button onClick={save} disabled={saving} style={BTN_DARK}>{saving ? "Saving…" : "Save configuration"}</button>
        </div>
      </div>

      {/* Pricing mode */}
      <p style={HINT}>Choose how this product is priced and sold.</p>
      <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", marginBottom: "18px" }}>
        {([
          ["variant", "Stocked variants", "Colour × Size combinations, each with its own SKU, stock and image. Best for apparel."],
          ["configurable", "Configurable (unlimited options)", "Add any fields — paper, coating, finishing — priced live. Combinations aren't stored, so there's no limit."],
        ] as const).map(([val, title, desc]) => {
          const active = mode === val;
          return (
            <label key={val} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "14px 16px", border: `1.5px solid ${active ? "#1A1A1A" : "#E3E3E3"}`, borderRadius: "10px", cursor: "pointer", background: active ? "#F6F6F7" : "#fff" }}>
              <input type="radio" name="pricing_mode" checked={active} onChange={() => setMode(val)} style={{ marginTop: "3px", accentColor: "#1A1A1A" }} />
              <span>
                <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>{title}</span>
                <span style={{ display: "block", fontSize: "12px", color: "#6B6B6B", marginTop: "2px", lineHeight: 1.5 }}>{desc}</span>
              </span>
            </label>
          );
        })}
      </div>

      {mode !== "configurable" ? (
        <div style={NOTE}>This product uses stocked variants — manage them in the Variants section above.</div>
      ) : (
        <>
          {/* Base price + preview */}
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "20px" }}>
            <div>
              <label style={LABEL}>Base unit price ($)</label>
              <input type="number" step="0.0001" min="0" value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="0.00" style={{ ...INPUT, width: "150px" }} />
            </div>
            <div>
              <label style={LABEL}>Preview at quantity</label>
              <input type="number" min={1} value={previewQty} onChange={e => setPreviewQty(Math.max(1, Number(e.target.value) || 1))} style={{ ...INPUT, width: "120px" }} />
            </div>
            <div style={{ background: "#F6F6F7", border: "1px solid #E3E3E3", borderRadius: "10px", padding: "12px 16px", minWidth: "230px" }}>
              <div style={{ fontSize: "11px", color: "#6B6B6B", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Live estimate</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#1A1A1A", marginTop: "2px" }}>${p.total.toFixed(2)}</div>
              <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
                unit ${p.unit.toFixed(4)} × {previewQty}{p.flat ? ` + $${p.flat.toFixed(2)} one-off` : ""}
              </div>
            </div>
          </div>

          {/* Options */}
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#1A1A1A", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>
            Option groups ({options.length})
          </div>

          {options.length === 0 && (
            <div style={{ ...NOTE, textAlign: "center", padding: "28px" }}>
              No options yet. Add your first field — e.g. <strong>Paper Stock</strong> or <strong>Size</strong>.
            </div>
          )}

          {options.map((o, oi) => (
            <div key={o.id ?? `new-${oi}`} style={{ border: "1px solid #E3E3E3", borderRadius: "10px", marginBottom: "14px", overflow: "hidden" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", padding: "12px 14px", background: "#F6F6F7", borderBottom: "1px solid #E3E3E3", flexWrap: "wrap" }}>
                <input value={o.name} onChange={e => patchOpt(oi, { name: e.target.value })} placeholder="Option name — e.g. Paper Stock"
                  style={{ ...INPUT, flex: 1, minWidth: "180px", fontWeight: 700 }} />
                <select value={o.input_type} onChange={e => patchOpt(oi, { input_type: e.target.value as InputType })} style={{ ...INPUT, width: "auto" }}>
                  {(["select", "radio", "swatch", "checkbox"] as const).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <label style={CHECK}><input type="checkbox" checked={o.required} onChange={e => patchOpt(oi, { required: e.target.checked })} /> Required</label>
                <button onClick={() => moveOption(oi, -1)} disabled={oi === 0} style={ICON_BTN} title="Move up">↑</button>
                <button onClick={() => moveOption(oi, 1)} disabled={oi === options.length - 1} style={ICON_BTN} title="Move down">↓</button>
                <button onClick={() => removeOption(oi)} style={{ ...ICON_BTN, color: "#B91C1C" }} title="Remove option">✕</button>
              </div>

              <div style={{ padding: "12px 14px" }}>
                <input value={o.help_text ?? ""} onChange={e => patchOpt(oi, { help_text: e.target.value })}
                  placeholder="Help text shown to the customer (optional)" style={{ ...INPUT, width: "100%", marginBottom: "12px", fontSize: "13px" }} />

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "600px" }}>
                    <thead>
                      <tr style={{ background: "#F6F6F7" }}>
                        {["Choice", "Price effect", "Type", "Swatch", "Default", ""].map(h => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {o.values.map((v, vi) => (
                        <tr key={v.id ?? `nv-${vi}`}>
                          <td style={TD}><input value={v.label} onChange={e => patchVal(oi, vi, { label: e.target.value })} placeholder="e.g. Coated Semigloss (C2S)" style={{ ...INPUT, width: "100%" }} /></td>
                          <td style={TD}><input type="number" step="0.0001" value={v.price_delta} onChange={e => patchVal(oi, vi, { price_delta: Number(e.target.value) })} style={{ ...INPUT, width: "100px" }} /></td>
                          <td style={TD}>
                            <select value={v.price_mode} onChange={e => patchVal(oi, vi, { price_mode: e.target.value as PriceMode })} style={{ ...INPUT, width: "auto" }}>
                              {(Object.keys(PRICE_MODE_LABEL) as PriceMode[]).map(m => <option key={m} value={m}>{PRICE_MODE_LABEL[m]}</option>)}
                            </select>
                          </td>
                          <td style={TD}><input type="color" value={v.swatch_hex ?? "#cccccc"} onChange={e => patchVal(oi, vi, { swatch_hex: e.target.value })} style={{ width: "34px", height: "30px", border: "1px solid #E3E3E3", borderRadius: "6px", background: "none", padding: 0, cursor: "pointer" }} /></td>
                          <td style={{ ...TD, textAlign: "center" }}><input type="radio" name={`def-${oi}`} checked={v.is_default} onChange={() => patchVal(oi, vi, { is_default: true })} style={{ accentColor: "#1A1A1A" }} /></td>
                          <td style={{ ...TD, textAlign: "center" }}><button onClick={() => removeVal(oi, vi)} style={{ ...ICON_BTN, color: "#B91C1C" }}>✕</button></td>
                        </tr>
                      ))}
                      {o.values.length === 0 && (
                        <tr><td colSpan={6} style={{ ...TD, color: "#9CA3AF", textAlign: "center" }}>No choices yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => addVal(oi)} style={{ ...BTN_LIGHT, marginTop: "10px" }}>+ Add choice</button>
              </div>
            </div>
          ))}

          <button onClick={addOption} style={{ ...BTN_LIGHT, borderStyle: "dashed", fontWeight: 700 }}>+ Add option group</button>

          {/* Quantity tiers */}
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#1A1A1A", textTransform: "uppercase", letterSpacing: ".05em", margin: "26px 0 8px" }}>
            Quantity breaks
          </div>
          <p style={HINT}>Optional. The highest break the order reaches sets the unit price — e.g. 50 → $0.57, 500 → $0.25.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
            {tiers.map((t, i) => (
              <div key={t.id ?? `nt-${i}`} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#6B6B6B", width: "60px" }}>From qty</span>
                <input type="number" min={1} value={t.min_qty} onChange={e => setTiers(x => x.map((y, k) => k === i ? { ...y, min_qty: Number(e.target.value) } : y))} style={{ ...INPUT, width: "110px" }} />
                <span style={{ fontSize: "12px", color: "#6B6B6B" }}>unit $</span>
                <input type="number" step="0.0001" min={0} value={t.unit_price} onChange={e => setTiers(x => x.map((y, k) => k === i ? { ...y, unit_price: Number(e.target.value) } : y))} style={{ ...INPUT, width: "130px" }} />
                <button onClick={() => setTiers(x => x.filter((_, k) => k !== i))} style={{ ...ICON_BTN, color: "#B91C1C" }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setTiers(t => [...t, { min_qty: (t[t.length - 1]?.min_qty ?? 0) + 50, unit_price: 0 }])} style={{ ...BTN_LIGHT, marginTop: "10px" }}>+ Add break</button>
        </>
      )}
    </div>
  );
}

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E3E3E3", borderRadius: "10px", padding: "24px", marginBottom: "16px" };
const LABEL: React.CSSProperties = { fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B6B6B", marginBottom: "6px", display: "block" };
const HINT: React.CSSProperties = { fontSize: "12px", color: "#6B6B6B", marginBottom: "12px", lineHeight: 1.6 };
const NOTE: React.CSSProperties = { background: "#F6F6F7", border: "1px solid #E3E3E3", borderRadius: "8px", padding: "14px 16px", fontSize: "13px", color: "#6B6B6B" };
const INPUT: React.CSSProperties = { padding: "9px 11px", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", background: "#fff" };
const TH: React.CSSProperties = { padding: "9px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".06em" };
const TD: React.CSSProperties = { padding: "6px 10px", borderTop: "1px solid #F1F1F1" };
const CHECK: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 600, color: "#444", whiteSpace: "nowrap" };
const ICON_BTN: React.CSSProperties = { width: "30px", height: "30px", border: "1px solid #E3E3E3", background: "#fff", borderRadius: "8px", cursor: "pointer", fontSize: "13px", lineHeight: 1, color: "#444" };
const BTN_DARK: React.CSSProperties = { padding: "9px 18px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const BTN_LIGHT: React.CSSProperties = { padding: "9px 16px", background: "#fff", color: "#1A1A1A", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
