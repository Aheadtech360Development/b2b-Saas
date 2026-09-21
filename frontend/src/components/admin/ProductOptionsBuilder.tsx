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
import { MediaPicker } from "@/components/admin/MediaPicker";

type PriceMode = "flat" | "per_unit" | "percent";
type InputType = "select" | "radio" | "swatch" | "checkbox" | "number" | "text";
type RuleAction = "hide_option" | "disable_option" | "disable_value";

interface OptValue {
  id?: string;
  label: string;
  price_delta: number;
  price_mode: PriceMode;
  image_url?: string | null;
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

/**
 * A rule points at options/values by **position**, not id — the group it refers
 * to may not have been saved yet. Reordering or deleting a group therefore has
 * to shift these indices too (see `removeOption` / `moveOption` / `removeVal`).
 */
interface Rule {
  id?: string;
  when_option: number;
  when_value: number;
  action: RuleAction;
  target_option: number | null;
  target_value: number | null;
  note?: string | null;
}

/** Whatever the field currently holds, as a usable number. */
const num = (v: string, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};


/**
 * Starter sets for the product types brands ask for most.
 *
 * Typing thirty rows by hand before you can see anything work is the slowest
 * part of adding a product, and it's the same thirty rows every time. A
 * template drops in a working configuration to edit rather than a blank page to
 * fill — prices are realistic defaults, meant to be changed.
 */
interface Template { key: string; label: string; blurb: string; base: number; options: Opt[]; tiers: Tier[] }

const V = (
  label: string, price = 0, mode: PriceMode = "per_unit", isDefault = false,
): OptValue => ({ label, price_delta: price, price_mode: mode, is_default: isDefault, enabled: true });

const G = (name: string, input_type: InputType, values: OptValue[], required = true): Opt =>
  ({ name, input_type, required, is_active: true, values });

const TEMPLATES: Template[] = [
  {
    key: "yard_signs",
    label: "Yard signs",
    blurb: "Size, material, sides, stakes, grommets, turnaround",
    base: 8,
    tiers: [
      { min_qty: 1, unit_price: 8 }, { min_qty: 5, unit_price: 6.5 },
      { min_qty: 10, unit_price: 5.4 }, { min_qty: 25, unit_price: 4.8 },
      { min_qty: 50, unit_price: 4.2 }, { min_qty: 100, unit_price: 3.6 },
      { min_qty: 250, unit_price: 3.1 }, { min_qty: 500, unit_price: 2.85 },
    ],
    options: [
      G("Size", "radio", [V("12 × 18", 0, "per_unit", true), V("18 × 24"), V("24 × 18"), V("24 × 36", 4)]),
      G("Material", "radio", [V("4mm Coroplast", 0, "per_unit", true), V("10mm Coroplast", 2.5), V("3mm PVC", 6), V("Aluminium", 14)]),
      G("Printed sides", "radio", [V("Single sided", 0, "per_unit", true), V("Double sided", 2)]),
      G("H-Stake", "radio", [V("No stake", 0, "per_unit", true), V("1 stake per sign", 1.25)]),
      G("Grommets", "select", [V("None", 0, "per_unit", true), V("Top 2 corners", 0.5), V("All 4 corners", 0.9)], false),
      G("Rounded corners", "checkbox", [V("Round the corners", 0.35)], false),
      G("Turnaround", "radio", [V("Standard (5 days)", 0, "percent", true), V("3-day rush", 25, "percent"), V("Next day", 60, "percent")]),
      G("Artwork", "radio", [V("I'll upload my design", 0, "flat", true), V("Design it for me", 45, "flat")]),
    ],
  },
  {
    key: "business_cards",
    label: "Business cards",
    blurb: "Stock, coating, corners, finishing, turnaround",
    base: 0.12,
    tiers: [
      { min_qty: 100, unit_price: 0.12 }, { min_qty: 250, unit_price: 0.08 },
      { min_qty: 500, unit_price: 0.06 }, { min_qty: 1000, unit_price: 0.042 },
      { min_qty: 2500, unit_price: 0.032 }, { min_qty: 5000, unit_price: 0.025 },
    ],
    options: [
      G("Paper stock", "radio", [V("14pt Coated", 0, "per_unit", true), V("16pt Coated", 0.01), V("18pt Uncoated", 0.018), V("32pt Ultra Thick", 0.06)]),
      G("Coating", "radio", [V("Matte", 0, "per_unit", true), V("Gloss UV", 0.008), V("Soft Touch", 0.022), V("No coating")]),
      G("Printed sides", "radio", [V("Front only", 0, "per_unit", true), V("Both sides", 0.01)]),
      G("Corners", "radio", [V("Square", 0, "per_unit", true), V("Rounded", 0.012)]),
      G("Finishing", "checkbox", [V("Spot UV", 0.03), V("Foil stamping", 0.05)], false),
      G("Turnaround", "radio", [V("Standard (5 days)", 0, "percent", true), V("3-day rush", 25, "percent"), V("Next day", 55, "percent")]),
      G("Setup", "radio", [V("Print-ready file supplied", 0, "flat", true), V("Design service", 65, "flat")]),
    ],
  },
  {
    key: "banners",
    label: "Vinyl banners",
    blurb: "Size, material, hemming, grommets, turnaround",
    base: 22,
    tiers: [
      { min_qty: 1, unit_price: 22 }, { min_qty: 3, unit_price: 19 },
      { min_qty: 5, unit_price: 16.5 }, { min_qty: 10, unit_price: 14 },
      { min_qty: 25, unit_price: 12 },
    ],
    options: [
      G("Size", "radio", [V("2ft × 4ft", 0, "per_unit", true), V("3ft × 6ft", 14), V("4ft × 8ft", 32), V("4ft × 10ft", 48)]),
      G("Material", "radio", [V("13oz Vinyl", 0, "per_unit", true), V("18oz Heavy Duty", 9), V("Mesh (windy sites)", 7)]),
      G("Hemming", "radio", [V("Hemmed edges", 0, "per_unit", true), V("No hem", -3)]),
      G("Grommets", "select", [V("Every 2ft", 0, "per_unit", true), V("Corners only"), V("None")], false),
      G("Pole pockets", "checkbox", [V("Top and bottom pockets", 6)], false),
      G("Turnaround", "radio", [V("Standard (5 days)", 0, "percent", true), V("2-day rush", 30, "percent")]),
    ],
  },
];

/**
 * How a choice's price effect is applied. Getting this wrong is the costliest
 * mistake in the builder — a $45 design fee left on "per unit" becomes $22,500
 * on an order of 500 — so each option says what it does rather than naming it.
 */
const PRICE_MODE_LABEL: Record<PriceMode, string> = {
  per_unit: "Per item",
  flat: "Once per order",
  percent: "% of the item price",
};

/** What this choice actually adds, in money, at the quantity being previewed. */
function priceEffect(v: { price_delta: number; price_mode: PriceMode }, unit: number, qty: number): string {
  if (!v.price_delta) return "no change";
  const sign = v.price_delta > 0 ? "+" : "−";
  const n = Math.abs(v.price_delta);
  if (v.price_mode === "flat") return `${sign}$${n.toFixed(2)} on the order`;
  if (v.price_mode === "percent") return `${sign}${n}% — ${sign}$${((unit * n) / 100 * qty).toFixed(2)} on ${qty}`;
  return `${sign}$${n.toFixed(2)} each — ${sign}$${(n * qty).toFixed(2)} on ${qty}`;
}

/** Worked example for each mode, shown under the choices table. */
const PRICE_MODE_HINT: Record<PriceMode, string> = {
  per_unit: "charged on every item — $2 on 100 = +$200",
  flat: "charged once for the whole order — $2 whether it's 10 or 500",
  percent: "scales with the unit price — 10% of a $9 unit = +$0.90 each",
};

/**
 * How the customer picks. Named for what they will see, because the raw values
 * ("select", "swatch") gave no hint that only one of them uses the swatch colour.
 */
const INPUT_TYPE_LABEL: Record<"select" | "radio" | "swatch" | "checkbox", string> = {
  select: "Dropdown",
  radio: "Buttons — pick one",
  swatch: "Colour circles",
  checkbox: "Checkboxes — pick any",
};

const RULE_ACTION_LABEL: Record<RuleAction, string> = {
  disable_option: "grey out the field",
  hide_option: "hide the field",
  disable_value: "grey out one choice",
};

function Step({ n, title, blurb, children }: { n: number; title: string; blurb: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", margin: "28px 0 12px" }}>
      <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#1A1A1A", color: "#fff", fontSize: "12px", fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0, marginTop: "1px" }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.01em" }}>{title}</div>
        <div style={{ fontSize: "12.5px", color: "#6B6B6B", marginTop: "3px", lineHeight: 1.6 }}>{blurb}</div>
      </div>
      {children}
    </div>
  );
}

export function ProductOptionsBuilder({ productId }: { productId: string }) {
  const [mode, setMode] = useState<"variant" | "configurable">("variant");
  const [basePrice, setBasePrice] = useState<string>("");
  const [options, setOptions] = useState<Opt[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewQty, setPreviewQty] = useState(50);
  const [picker, setPicker] = useState<{ oi: number; vi: number } | null>(null);
  // Which groups are folded away. A long list is unreadable open; this is view
  // state only and never saved.
  const [folded, setFolded] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await apiClient.get<{
        pricing_mode: "variant" | "configurable"; base_price: number | null;
        options: Opt[]; qty_tiers: Tier[]; rules?: Rule[];
      }>(`/api/v1/admin/products/${productId}/options`);
      setMode(cfg.pricing_mode ?? "variant");
      setBasePrice(cfg.base_price != null ? String(cfg.base_price) : "");
      setOptions(cfg.options ?? []);
      setTiers(cfg.qty_tiers ?? []);
      setRules(cfg.rules ?? []);
    } catch (e) {
      // A product with nothing configured yet 404s, which is normal. Anything
      // else means the page is showing blank state that isn't real, so say so.
      const err = e as { status?: number; message?: string };
      if (err?.status && err.status !== 404) {
        setMsg({ ok: false, text: `Could not load this product's options — ${err.message ?? "please reload"}` });
      }
    }
    setLoading(false);
  }, [productId]);
  useEffect(() => { load(); }, [load]);

  function flash(text: string, ok = true) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 2500); }

  // ── Option mutations ───────────────────────────────────────────────────────
  const patchOpt = (i: number, p: Partial<Opt>) => setOptions(o => o.map((x, k) => k === i ? { ...x, ...p } : x));
  /** Drop a starter set in, leaving anything already built alone. */
  function applyTemplate(t: Template) {
    setOptions(o => [...o, ...t.options.map(g => ({ ...g, values: g.values.map(v => ({ ...v })) }))]);
    if (!tiers.length) setTiers(t.tiers.map(x => ({ ...x })));
    if (!basePrice.trim()) setBasePrice(String(t.base));
    flash(`${t.label} template added — edit anything, then save`);
  }

  const addOption = () => setOptions(o => [...o, {
    name: "", input_type: "select", required: true, is_active: true,
    values: [{ label: "", price_delta: 0, price_mode: "per_unit", is_default: true, enabled: true }],
  }]);
  const removeOption = (i: number) => {
    setOptions(o => o.filter((_, k) => k !== i));
    // Rules that referred to this group go with it; the ones after it shift up.
    setRules(rs => rs
      .filter(r => r.when_option !== i && r.target_option !== i)
      .map(r => ({
        ...r,
        when_option: r.when_option > i ? r.when_option - 1 : r.when_option,
        target_option: r.target_option != null && r.target_option > i ? r.target_option - 1 : r.target_option,
      })));
  };
  const moveOption = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    setOptions(o => { const n = [...o]; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
    const swap = (k: number | null) => (k === i ? j : k === j ? i : k);
    setRules(rs => rs.map(r => ({ ...r, when_option: swap(r.when_option)!, target_option: swap(r.target_option) })));
  };

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
  const removeVal = (oi: number, vi: number) => {
    setOptions(o => o.map((x, k) => k !== oi ? x : { ...x, values: x.values.filter((_, m) => m !== vi) }));
    setRules(rs => rs
      .filter(r => !(r.when_option === oi && r.when_value === vi)
                && !(r.action === "disable_value" && r.target_option === oi && r.target_value === vi))
      .map(r => ({
        ...r,
        when_value: r.when_option === oi && r.when_value > vi ? r.when_value - 1 : r.when_value,
        target_value: r.target_option === oi && r.target_value != null && r.target_value > vi
          ? r.target_value - 1 : r.target_value,
      })));
  };

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
      // Unnamed groups and blank choices are dropped before saving — which
      // renumbers everything, so the rules' index references are remapped onto
      // the payload's positions rather than the editor's.
      const optMap = new Map<number, number>();
      const valMap = new Map<string, number>();
      const payloadOptions: Opt[] = [];
      options.forEach((o, oi) => {
        if (!o.name.trim()) return;
        optMap.set(oi, payloadOptions.length);
        const values: OptValue[] = [];
        o.values.forEach((v, vi) => {
          if (!v.label.trim()) return;
          valMap.set(`${oi}:${vi}`, values.length);
          values.push(v);
        });
        payloadOptions.push({ ...o, values });
      });

      const payloadRules = rules.flatMap<Rule>(r => {
        const whenO = optMap.get(r.when_option);
        const whenV = valMap.get(`${r.when_option}:${r.when_value}`);
        if (whenO == null || whenV == null) return [];        // trigger is gone
        if (r.action === "disable_value") {
          const tv = r.target_option != null && r.target_value != null
            ? valMap.get(`${r.target_option}:${r.target_value}`) : undefined;
          const to = r.target_option != null ? optMap.get(r.target_option) : undefined;
          if (to == null || tv == null) return [];
          return [{ ...r, when_option: whenO, when_value: whenV, target_option: to, target_value: tv }];
        }
        const to = r.target_option != null ? optMap.get(r.target_option) : undefined;
        if (to == null || to === whenO) return [];            // no target, or itself
        return [{ ...r, when_option: whenO, when_value: whenV, target_option: to, target_value: null }];
      });

      await apiClient.put(`/api/v1/admin/products/${productId}/options`, {
        pricing_mode: mode,
        base_price: basePrice.trim() === "" ? null : num(basePrice),
        options: payloadOptions,
        qty_tiers: tiers.filter(t => t.min_qty > 0),
        rules: payloadRules,
      });
      flash("Configuration saved");
      load();
    } catch (e) {
      const err = e as { message?: string; status?: number; detail?: string };
      const detail = err?.detail || err?.message || "";
      setMsg({
        ok: false,
        text: detail ? `Could not save — ${detail}` : "Could not save. Please try again.",
      });
      // Left on screen: a save failure needs reading, not a 2.5s flash.
    }
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
              <label style={LABEL}>Price per item, before options</label>
              <input type="number" step="0.0001" min="0" value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="0.00" style={{ ...INPUT, width: "170px" }} />
            </div>
            <div>
              <label style={LABEL}>Check the price for</label>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input type="number" min={1} value={previewQty} onChange={e => setPreviewQty(Math.max(1, num(e.target.value, 1)))} style={{ ...INPUT, width: "110px" }} />
                <span style={{ fontSize: "13px", color: "#6B6B6B" }}>items</span>
              </div>
            </div>
            <div style={{ background: "#FAFAF9", border: "1px solid #EFEFEC", borderRadius: "12px", padding: "12px 16px", minWidth: "250px" }}>
              <div style={{ fontSize: "12px", color: "#6B6B6B", fontWeight: 700 }}>What the customer would pay</div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#1A1A1A", marginTop: "2px" }}>${p.total.toFixed(2)}</div>
              <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
                ${p.unit.toFixed(4)} each × {previewQty}{p.flat ? ` + $${p.flat.toFixed(2)} once` : ""}
              </div>
              <div style={{ fontSize: "11.5px", color: "#9CA3AF", marginTop: "4px" }}>with the pre-picked answers below</div>
            </div>
          </div>

          {/* Step 1 — the choices */}
          <Step n={1} title="What the customer chooses"
            blurb="Each group is one question on the product page — Size, Paper stock, Turnaround. Every answer can change the price." />

          {options.length === 0 ? (
            <div style={{ border: "1px dashed #D8D6D0", borderRadius: "14px", padding: "24px", background: "#FCFCFB" }}>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#1A1A1A" }}>Start with a ready-made setup</div>
              <div style={{ fontSize: "12.5px", color: "#6B6B6B", marginTop: "4px", marginBottom: "14px" }}>
                Everything is editable afterwards — names, choices and prices.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px" }}>
                {TEMPLATES.map(t => (
                  <button key={t.key} onClick={() => applyTemplate(t)}
                    style={{ textAlign: "left", background: "#fff", border: "1px solid #E3E3E3", borderRadius: "12px", padding: "14px", cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#1A1A1A"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#E3E3E3"; }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#1A1A1A" }}>{t.label}</div>
                    <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "4px", lineHeight: 1.5 }}>{t.blurb}</div>
                    <div style={{ fontSize: "11.5px", color: "#9CA3AF", marginTop: "8px" }}>
                      {t.options.length} questions · {t.tiers.length} price breaks
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "16px" }}>
                <button onClick={addOption} style={BTN_DARK}>+ Build it myself</button>
                <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Start with one empty question.</span>
              </div>
            </div>
          ) : (
            <>
              {options.map((o, oi) => {
                const open = folded[oi] !== true;
                const chosen = o.values.find(v => v.is_default) ?? o.values[0];
                return (
                  <div key={o.id ?? `new-${oi}`} style={{ border: "1px solid #E3E3E3", borderRadius: "12px", marginBottom: "12px", overflow: "hidden", background: "#fff" }}>
                    {/* Header: name, how it is asked, and the fold control */}
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px 12px", background: "#FAFAF9", borderBottom: open ? "1px solid #EFEFEC" : "none", flexWrap: "wrap" }}>
                      <button onClick={() => setFolded(f => ({ ...f, [oi]: open }))} title={open ? "Collapse" : "Expand"}
                        style={{ ...ICON_BTN, border: "none", background: "none", width: "22px" }}>{open ? "▾" : "▸"}</button>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#9CA3AF", minWidth: "58px" }}>Question {oi + 1}</span>
                      <input value={o.name} onChange={e => patchOpt(oi, { name: e.target.value })} placeholder="e.g. Paper stock"
                        style={{ ...INPUT, flex: 1, minWidth: "170px", fontWeight: 700 }} />
                      {open ? (
                        <>
                          <select value={o.input_type} onChange={e => patchOpt(oi, { input_type: e.target.value as InputType })} style={{ ...INPUT, width: "auto" }}>
                            {(["select", "radio", "swatch", "checkbox"] as const).map(t => <option key={t} value={t}>{INPUT_TYPE_LABEL[t]}</option>)}
                          </select>
                          <label style={CHECK} title="The customer cannot order without answering">
                            <input type="checkbox" checked={o.required} onChange={e => patchOpt(oi, { required: e.target.checked })} /> Must answer
                          </label>
                        </>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#6B6B6B" }}>
                          {o.values.length} choice{o.values.length === 1 ? "" : "s"}
                          {chosen?.label ? ` · default ${chosen.label}` : ""}
                        </span>
                      )}
                      <button onClick={() => moveOption(oi, -1)} disabled={oi === 0} style={ICON_BTN} title="Move up">↑</button>
                      <button onClick={() => moveOption(oi, 1)} disabled={oi === options.length - 1} style={ICON_BTN} title="Move down">↓</button>
                      <button onClick={() => removeOption(oi)} style={{ ...ICON_BTN, color: "#B91C1C" }} title="Remove this question">✕</button>
                    </div>

                    {open && (
                      <div style={{ padding: "12px 14px" }}>
                        <input value={o.help_text ?? ""} onChange={e => patchOpt(oi, { help_text: e.target.value })}
                          placeholder="Note under the question for the customer (optional)" style={{ ...INPUT, width: "100%", marginBottom: "12px", fontSize: "13px" }} />

                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "640px" }}>
                            <thead>
                              <tr style={{ background: "#FAFAF9" }}>
                                {["Choice", "Extra cost", "Charged", "What that means", "Image", ...(o.input_type === "swatch" ? ["Colour"] : []), "Pre-picked", ""].map(h => (
                                  <th key={h} style={TH}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {o.values.map((v, vi) => (
                                <tr key={v.id ?? `nv-${vi}`}>
                                  <td style={TD}><input value={v.label} onChange={e => patchVal(oi, vi, { label: e.target.value })} placeholder="e.g. 16pt Coated" style={{ ...INPUT, width: "100%" }} /></td>
                                  <td style={TD}><input type="number" step="0.0001" value={v.price_delta} onChange={e => patchVal(oi, vi, { price_delta: num(e.target.value) })} style={{ ...INPUT, width: "96px" }} /></td>
                                  <td style={TD}>
                                    <select value={v.price_mode} onChange={e => patchVal(oi, vi, { price_mode: e.target.value as PriceMode })} style={{ ...INPUT, width: "auto" }}>
                                      {(Object.keys(PRICE_MODE_LABEL) as PriceMode[]).map(m => <option key={m} value={m}>{PRICE_MODE_LABEL[m]}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ ...TD, fontSize: "12px", color: v.price_delta ? "#1A1A1A" : "#9CA3AF", whiteSpace: "nowrap" }}>
                                    {priceEffect(v, p.unit, previewQty)}
                                  </td>
                                  <td style={TD}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      <button onClick={() => setPicker({ oi, vi })} title={v.image_url ? "Change image" : "Add an image for this choice"}
                                        style={{ width: "34px", height: "30px", border: "1px solid #E3E3E3", borderRadius: "6px", background: "#fff", padding: 0, cursor: "pointer", overflow: "hidden", display: "grid", placeItems: "center", color: "#6B6B6B", fontSize: "15px" }}>
                                        {v.image_url
                                          // eslint-disable-next-line @next/next/no-img-element
                                          ? <img src={v.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                          : "+"}
                                      </button>
                                      {v.image_url && (
                                        <button onClick={() => patchVal(oi, vi, { image_url: null })} title="Remove image"
                                          style={{ border: "none", background: "none", cursor: "pointer", color: "#B91C1C", fontSize: "12px", padding: "2px" }}>✕</button>
                                      )}
                                    </div>
                                  </td>
                                  {o.input_type === "swatch" && (
                                    <td style={TD}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                        <label title={v.image_url ? "The image fills this circle — the colour is only used without one" : v.swatch_hex ? "Change colour" : "Pick a colour"}
                                          style={v.swatch_hex ? SWATCH_WELL(v.swatch_hex) : SWATCH_EMPTY}>
                                          <input type="color" value={v.swatch_hex ?? "#000000"}
                                            onChange={e => patchVal(oi, vi, { swatch_hex: e.target.value })}
                                            style={SWATCH_INPUT} />
                                        </label>
                                        {v.swatch_hex && (
                                          <button onClick={() => patchVal(oi, vi, { swatch_hex: null })} title="Clear colour"
                                            style={{ border: "none", background: "none", cursor: "pointer", color: "#B91C1C", fontSize: "12px", padding: "2px" }}>✕</button>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                  <td style={{ ...TD, textAlign: "center" }}><input type="radio" name={`def-${oi}`} checked={v.is_default} onChange={() => patchVal(oi, vi, { is_default: true })} style={{ accentColor: "#1A1A1A" }} title="Selected for the customer before they choose" /></td>
                                  <td style={{ ...TD, textAlign: "center" }}><button onClick={() => removeVal(oi, vi)} style={{ ...ICON_BTN, color: "#B91C1C" }} title="Remove this choice">✕</button></td>
                                </tr>
                              ))}
                              {o.values.length === 0 && (
                                <tr><td colSpan={o.input_type === "swatch" ? 8 : 7} style={{ ...TD, color: "#9CA3AF", textAlign: "center" }}>No choices yet — add the first one below.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                          <button onClick={() => addVal(oi)} style={BTN_LIGHT}>+ Add choice</button>
                          <span style={{ fontSize: "11.5px", color: "#9CA3AF" }}>
                            {o.input_type === "swatch"
                              ? "Colour circles: give each choice a colour, or an image to fill the circle."
                              : o.input_type === "checkbox"
                                ? "Checkboxes: the customer can tick any number of these."
                                : "Add an image to a choice and they become picture tiles."}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={addOption} style={{ ...BTN_LIGHT, borderStyle: "dashed", fontWeight: 700 }}>+ Add another question</button>
                {options.length > 1 && (
                  <button onClick={() => setFolded(Object.fromEntries(options.map((_, i) => [i, options.every((_, k) => folded[k] === true) ? false : true])))}
                    style={{ ...BTN_LIGHT, border: "none", background: "none", color: "#6B6B6B" }}>
                    {options.every((_, i) => folded[i] === true) ? "Expand all" : "Collapse all"}
                  </button>
                )}
              </div>
            </>
          )}

          <details style={{ marginTop: "14px", fontSize: "12px", color: "#6B6B6B", background: "#FAFAF9", border: "1px solid #EFEFEC", borderRadius: "10px", padding: "10px 14px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#1A1A1A" }}>How the price is built</summary>
            <div style={{ lineHeight: 1.8, marginTop: "8px" }}>
              <div>Start from the <strong>base unit price</strong> (or the quantity break the order reaches).</div>
              <div><strong>Per item</strong> — added to every item. {PRICE_MODE_HINT.per_unit}.</div>
              <div><strong>% of the item price</strong> — {PRICE_MODE_HINT.percent}.</div>
              <div><strong>Once per order</strong> — {PRICE_MODE_HINT.flat}. Use it for setup and design fees.</div>
              <div style={{ color: "#B45309", marginTop: "6px" }}>A design fee left on &quot;Per item&quot; is the costly mistake: $45 on 500 becomes $22,500.</div>
            </div>
          </details>

          {/* Quantity tiers */}
          <Step n={2} title="Cheaper by the dozen (optional)"
            blurb="Set the unit price at quantity steps. The highest step the order reaches wins — e.g. 50 → $0.57, 500 → $0.25." />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
            {tiers.map((t, i) => (
              <div key={t.id ?? `nt-${i}`} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#6B6B6B", width: "60px" }}>From qty</span>
                <input type="number" min={1} value={t.min_qty} onChange={e => setTiers(x => x.map((y, k) => k === i ? { ...y, min_qty: Math.max(1, num(e.target.value, 1)) } : y))} style={{ ...INPUT, width: "110px" }} />
                <span style={{ fontSize: "12px", color: "#6B6B6B" }}>unit $</span>
                <input type="number" step="0.0001" min={0} value={t.unit_price} onChange={e => setTiers(x => x.map((y, k) => k === i ? { ...y, unit_price: Math.max(0, num(e.target.value)) } : y))} style={{ ...INPUT, width: "130px" }} />
                <button onClick={() => setTiers(x => x.filter((_, k) => k !== i))} style={{ ...ICON_BTN, color: "#B91C1C" }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setTiers(t => [...t, { min_qty: (t[t.length - 1]?.min_qty ?? 0) + 50, unit_price: 0 }])} style={{ ...BTN_LIGHT, marginTop: "10px" }}>+ Add break</button>

          {/* Conditional rules */}
          <Step n={3} title="Answers that rule others out (optional)"
            blurb="Switch a question off when another answer makes it impossible — e.g. Coating = UV greys out Laminating. The customer sees your note, and a hidden question is left out of the price." />

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {rules.map((r, ri) => {
              const whenOpt = options[r.when_option];
              const targetOpt = r.target_option != null ? options[r.target_option] : undefined;
              const patchRule = (p: Partial<Rule>) => setRules(x => x.map((y, k) => k === ri ? { ...y, ...p } : y));
              return (
                <div key={r.id ?? `nr-${ri}`} style={{ border: "1px solid #E3E3E3", borderRadius: "10px", padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  <span style={RULE_WORD}>When</span>
                  <select value={r.when_option} onChange={e => patchRule({ when_option: Number(e.target.value), when_value: 0 })} style={{ ...INPUT, width: "auto", maxWidth: "180px" }}>
                    {options.map((o, i) => <option key={i} value={i}>{o.name || `Field ${i + 1}`}</option>)}
                  </select>
                  <span style={RULE_WORD}>is</span>
                  <select value={r.when_value} onChange={e => patchRule({ when_value: Number(e.target.value) })} style={{ ...INPUT, width: "auto", maxWidth: "180px" }}>
                    {(whenOpt?.values ?? []).map((v, i) => <option key={i} value={i}>{v.label || `Choice ${i + 1}`}</option>)}
                  </select>
                  <span style={RULE_WORD}>→</span>
                  <select value={r.action} onChange={e => patchRule({ action: e.target.value as RuleAction, target_value: null })} style={{ ...INPUT, width: "auto" }}>
                    {(Object.keys(RULE_ACTION_LABEL) as RuleAction[]).map(a => <option key={a} value={a}>{RULE_ACTION_LABEL[a]}</option>)}
                  </select>
                  <select value={r.target_option ?? ""} onChange={e => patchRule({ target_option: e.target.value === "" ? null : Number(e.target.value), target_value: null })} style={{ ...INPUT, width: "auto", maxWidth: "180px" }}>
                    <option value="">Choose a field…</option>
                    {options.map((o, i) => i === r.when_option ? null : <option key={i} value={i}>{o.name || `Field ${i + 1}`}</option>)}
                  </select>
                  {r.action === "disable_value" && (
                    <select value={r.target_value ?? ""} onChange={e => patchRule({ target_value: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...INPUT, width: "auto", maxWidth: "180px" }}>
                      <option value="">Choose a choice…</option>
                      {(targetOpt?.values ?? []).map((v, i) => <option key={i} value={i}>{v.label || `Choice ${i + 1}`}</option>)}
                    </select>
                  )}
                  <input value={r.note ?? ""} onChange={e => patchRule({ note: e.target.value })} maxLength={200}
                    placeholder='Note shown to the customer — e.g. "N/A with UV Coating"'
                    style={{ ...INPUT, flex: 1, minWidth: "200px" }} />
                  <button onClick={() => setRules(x => x.filter((_, k) => k !== ri))} style={{ ...ICON_BTN, color: "#B91C1C" }} title="Remove rule">✕</button>
                </div>
              );
            })}
          </div>

          {options.length < 2 ? (
            <div style={{ ...NOTE, marginTop: "10px" }}>Add at least two option groups to link them with a rule.</div>
          ) : (
            <button onClick={() => setRules(r => [...r, { when_option: 0, when_value: 0, action: "disable_option", target_option: null, target_value: null, note: "" }])}
              style={{ ...BTN_LIGHT, marginTop: "10px" }}>+ Add rule</button>
          )}
        </>
      )}

      {picker && (
        <MediaPicker
          onSelect={(url) => { patchVal(picker.oi, picker.vi, { image_url: url }); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
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
const SWATCH_WELL = (hex: string): React.CSSProperties => ({
  width: "30px", height: "30px", borderRadius: "50%", display: "inline-block",
  background: hex, border: "1.5px solid rgba(0,0,0,.14)", boxShadow: "inset 0 0 0 2px #fff",
  cursor: "pointer", overflow: "hidden", position: "relative",
});
const SWATCH_EMPTY: React.CSSProperties = {
  width: "30px", height: "30px", borderRadius: "50%", display: "inline-block",
  background: "repeating-linear-gradient(45deg,#fff 0 4px,#EFEFEC 4px 8px)",
  border: "1.5px dashed #BDBAB2", cursor: "pointer", overflow: "hidden", position: "relative",
};
const SWATCH_INPUT: React.CSSProperties = {
  position: "absolute", inset: "-8px", width: "calc(100% + 16px)", height: "calc(100% + 16px)",
  border: "none", padding: 0, background: "none", cursor: "pointer", opacity: 0,
};
const RULE_WORD: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#6B6B6B" };
