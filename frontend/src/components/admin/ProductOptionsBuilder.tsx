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
import { knownColor } from "@/lib/colors";
import { apiClient } from "@/lib/api-client";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { CombinationPricing } from "@/components/admin/CombinationPricing";
import { PriceGridImport, type Imported } from "@/components/admin/PriceGridImport";

type PriceMode = "flat" | "per_unit" | "percent";
type InputType = "select" | "radio" | "swatch" | "checkbox" | "number" | "text" | "quantity";
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
  /** Does price genuinely turn on this question? Only these build the price
   *  table in step 4 — a fourteen-question product would otherwise produce a
   *  grid nobody could work through. */
  in_price_matrix?: boolean;
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
const INPUT_TYPE_LABEL: Record<"select" | "radio" | "swatch" | "checkbox" | "quantity", string> = {
  select: "Dropdown",
  radio: "Buttons — pick one",
  swatch: "Colour circles",
  checkbox: "Checkboxes — pick any",
  quantity: "Quantity — how many",
};

const RULE_ACTION_LABEL: Record<RuleAction, string> = {
  disable_option: "grey out the field",
  hide_option: "hide the field",
  disable_value: "grey out one choice",
};

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
  // Bumped on every successful save. The price table is generated from the
  // options the server has, so it is rebuilt when those change — and told to
  // wait while the editor holds changes it has not sent yet.
  const [savedStamp, setSavedStamp] = useState(0);
  const [dirtySinceLoad, setDirtySinceLoad] = useState(false);
  // What was loaded, to tell when anything in the builder changed (the Save bar).
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  // A supplier's spreadsheet, in and out of the price table.
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
      setDirtySinceLoad(false);
      setTiers(cfg.qty_tiers ?? []);
      setRules(cfg.rules ?? []);
      setSnapshot(JSON.stringify({ mode: cfg.pricing_mode ?? "variant", basePrice: cfg.base_price != null ? String(cfg.base_price) : "",
        options: cfg.options ?? [], tiers: cfg.qty_tiers ?? [], rules: cfg.rules ?? [] }));
    } catch (e) {
      // A product with nothing configured yet 404s, which is normal. Anything
      // else means the page is showing blank state that isn't real, so say so.
      const err = e as { status?: number; message?: string };
      if (err?.status === 404) setSnapshot(JSON.stringify({ mode: "variant", basePrice: "", options: [], tiers: [], rules: [] }));
      if (err?.status && err.status !== 404) {
        setMsg({ ok: false, text: `Could not load this product's options — ${err.message ?? "please reload"}` });
      }
    }
    setLoading(false);
  }, [productId]);
  useEffect(() => { load(); }, [load]);

  function flash(text: string, ok = true) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 2500); }

  /** The price table as a CSV, to edit in a spreadsheet and import again. */
  async function downloadGrid() {
    setDownloading(true);
    try {
      const blob = await apiClient.blob(`/api/v1/admin/products/${productId}/price-grid.csv`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prices.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      flash((e as { message?: string })?.message || "Could not download the price table.", false);
    }
    setDownloading(false);
  }

  /** After an import the questions, choices and rules may all be new. */
  async function afterImport(result: Imported) {
    setImporting(false);
    await load();
    setSavedStamp(n => n + 1);
    setShowGrid(true);
    const added = [
      result.questions_created ? `${result.questions_created} question${result.questions_created === 1 ? "" : "s"}` : "",
      result.choices_created ? `${result.choices_created} choice${result.choices_created === 1 ? "" : "s"}` : "",
      result.rules_added ? `${result.rules_added} rule${result.rules_added === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(", ");
    setMsg({ ok: true, text: `${result.message}${added ? ` Added ${added}.` : ""}` });
    setTimeout(() => setMsg(null), 6000);
  }

  // ── Option mutations ───────────────────────────────────────────────────────
  const patchOpt = (i: number, p: Partial<Opt>) => {
    setDirtySinceLoad(true);
    setOptions(o => o.map((x, k) => k === i ? { ...x, ...p } : x));
  };
  /** Drop a starter set in, leaving anything already built alone. */
  function applyTemplate(t: Template) {
    setOptions(o => [...o, ...t.options.map(g => ({ ...g, values: g.values.map(v => ({ ...v })) }))]);
    if (!tiers.length) setTiers(t.tiers.map(x => ({ ...x })));
    if (!basePrice.trim()) setBasePrice(String(t.base));
    flash(`${t.label} template added — edit anything, then save`);
  }

  const addOption = () => setOptions(o => [...o, {
    name: "", input_type: "select", required: true, is_active: true, in_price_matrix: false,
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
        payloadOptions.push({ ...o, in_price_matrix: !!o.in_price_matrix, values });
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
      setSavedStamp(n => n + 1);   // the price table is built from what was saved
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

  const shape = () => JSON.stringify({ mode, basePrice, options, tiers, rules });

  if (loading) {
    return <div className="pc-card pc-pad">{[60, 85, 50].map((w, i) => (
      <div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />
    ))}</div>;
  }

  const p = preview();
  const dirty = snapshot !== null && snapshot !== shape();

  return (
    <div className="pc-builder" data-options-builder>
      {(dirty || saving || (msg && !msg.ok)) && (
        <div className="pc-savebar" role="region" aria-label="Pricing and options" data-builder-savebar>
          <span style={{ fontWeight: 600 }}>{msg && !msg.ok ? msg.text : saving ? "Saving pricing and options…" : "Unsaved changes in pricing and options"}</span>
          <span style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="pc-btn" data-kind="ghost-dark" disabled={saving} onClick={() => { setMsg(null); void load(); }}>Discard</button>
            <button type="button" className="pc-btn" data-kind="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
          </span>
        </div>
      )}
      {msg && msg.ok && <div className="pc-flash" role="status">{msg.text}</div>}

      {/* How it sells: made to order (priced by its answers) or stocked variants */}
      <div className="pc-builder-mode">
        <span className="pc-label" style={{ margin: 0 }}>Sold as</span>
        <div className="pc-seg" role="group" aria-label="Sold as">
          <button type="button" aria-pressed={mode === "configurable"} onClick={() => setMode("configurable")}>Made to order</button>
          <button type="button" aria-pressed={mode === "variant"} onClick={() => setMode("variant")}>Stocked variants</button>
        </div>
      </div>

      {mode !== "configurable" ? (
        <div className="pc-note" data-tone="blue">This product sells as stocked variants: colour × size, each with its own SKU and stock, on the Variants and stock tab.</div>
      ) : (<>
        {/* Price */}
        <section className="pc-card pc-pad" aria-labelledby="ob-price">
          <h2 className="pc-h2" id="ob-price" style={{ marginBottom: "12px" }}>Price</h2>
          <label><span className="pc-label">Base price per item</span>
            <input className="pc-input" type="number" step="0.0001" min="0" value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="0.00" /></label>
          <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: "4px 0 12px" }}>Before any options.</p>
          <div className="pc-note" data-tone="blue" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }} data-price-check>
            <span>Price check:</span>
            <input className="pc-input" type="number" min={1} value={previewQty} aria-label="Items to price"
              onChange={e => setPreviewQty(Math.max(1, num(e.target.value, 1)))} style={{ width: "86px", height: "32px", padding: "0 8px" }} />
            <span>items = <b>${p.total.toFixed(2)}</b> (${(p.total / Math.max(1, previewQty)).toFixed(2)} each{p.flat ? `, with $${p.flat.toFixed(2)} once` : ""}), with the pre-picked answers.</span>
          </div>
          <details className="pc-builder-how" style={{ marginTop: "12px" }}>
            <summary>How the price is built</summary>
            <div style={{ lineHeight: 1.75, marginTop: "8px", fontSize: "13px", color: "var(--pc-muted)" }}>
              <div>It starts from the base price per item, or the quantity break the order reaches.</div>
              <div><b>Per item</b>: added to every item. {PRICE_MODE_HINT.per_unit}.</div>
              <div><b>% of the item price</b>: {PRICE_MODE_HINT.percent}.</div>
              <div><b>Once per order</b>: {PRICE_MODE_HINT.flat}. Use it for setup and design fees.</div>
              <div style={{ color: "var(--pc-amber)", marginTop: "6px" }}>A design fee left on &quot;Per item&quot; is the costly mistake: $45 on 500 becomes $22,500.</div>
            </div>
          </details>
        </section>

        {/* The questions */}
        <section className="pc-card pc-pad" aria-labelledby="ob-questions">
          <h2 className="pc-h2" id="ob-questions" style={{ marginBottom: "12px" }}>Questions the customer answers</h2>
          {options.length === 0 ? (
            <div className="pc-builder-start">
              <b>Start with a ready-made setup</b>
              <p className="pc-sub-line" style={{ fontSize: "13px", margin: "2px 0 12px" }}>Everything is editable afterwards: names, choices and prices.</p>
              <div className="pc-builder-templates">
                {TEMPLATES.map(t => (
                  <button key={t.key} type="button" className="pc-builder-template" onClick={() => applyTemplate(t)}>
                    <b>{t.label}</b>
                    <span>{t.blurb}</span>
                    <span className="pc-sub-line" style={{ fontSize: "12px" }}>{t.options.length} questions · {t.tiers.length} price breaks</span>
                  </button>
                ))}
              </div>
              <button type="button" className="pc-btn" style={{ marginTop: "14px" }} onClick={addOption}>+ Build it myself</button>
            </div>
          ) : (<>
            {options.map((o, oi) => {
              const open = folded[oi] !== true;
              const chosen = o.values.find(v => v.is_default) ?? o.values[0];
              return (
                <div key={o.id ?? `new-${oi}`} className="pc-q" data-question={oi + 1}>
                  <div className="pc-q-head">
                    <button type="button" className="pc-q-fold" onClick={() => setFolded(f => ({ ...f, [oi]: open }))} aria-label={open ? "Fold" : "Open"} aria-expanded={open}>{open ? "▾" : "▸"}</button>
                    <span className="pc-q-n">Question {oi + 1}:</span>
                    <input className="pc-input pc-q-name" value={o.name} onChange={e => patchOpt(oi, { name: e.target.value })} placeholder="e.g. Paper stock" aria-label={`Question ${oi + 1}`} />
                    <select className="pc-input" style={{ width: "auto" }} value={o.input_type} onChange={e => patchOpt(oi, { input_type: e.target.value as InputType })} aria-label="How it is asked">
                      {(["select", "radio", "swatch", "checkbox", "quantity"] as const).map(t => <option key={t} value={t}>{INPUT_TYPE_LABEL[t]}</option>)}
                    </select>
                    <span className="pc-q-move">
                      <button type="button" className="pc-btn" disabled={oi === 0} onClick={() => moveOption(oi, -1)} title="Move up">↑</button>
                      <button type="button" className="pc-btn" disabled={oi === options.length - 1} onClick={() => moveOption(oi, 1)} title="Move down">↓</button>
                    </span>
                    <button type="button" className="pc-btn" data-kind="danger" onClick={() => removeOption(oi)}>Delete</button>
                  </div>
                  {!open ? (
                    <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: "8px 0 0" }}>
                      {o.values.length} choice{o.values.length === 1 ? "" : "s"}{chosen?.label ? ` · pre-picked ${chosen.label}` : ""}
                    </p>
                  ) : (<>
                    <div className="pc-switch-row" style={{ margin: "12px 0" }}>
                      <span>Customer must answer</span>
                      <button type="button" className="pc-switch" role="switch" aria-checked={o.required} data-on={o.required ? "" : undefined}
                        aria-label={`Question ${oi + 1} must be answered`} onClick={() => patchOpt(oi, { required: !o.required })} />
                    </div>
                    <input className="pc-input" value={o.help_text ?? ""} onChange={e => patchOpt(oi, { help_text: e.target.value })}
                      placeholder="A note under the question for the customer (optional)" style={{ marginBottom: "12px", fontSize: "13.5px" }} />
                    <div className="pc-scroll-x">
                      <table className="pc-table pc-q-table">
                        <thead>
                          <tr>
                            <th>Choice</th><th>Extra cost</th><th>Charged</th><th>Image</th>
                            {o.input_type === "swatch" && <th>Colour</th>}
                            <th>Pre-picked</th><th />
                          </tr>
                        </thead>
                        <tbody>
                          {o.values.map((v, vi) => (
                            <tr key={v.id ?? `nv-${vi}`}>
                              <td><input className="pc-input" value={v.label} onChange={e => patchVal(oi, vi, { label: e.target.value })} placeholder="e.g. 16pt Coated" aria-label="Choice" /></td>
                              <td>
                                <input className="pc-input" type="number" step="0.0001" value={v.price_delta} onChange={e => patchVal(oi, vi, { price_delta: num(e.target.value) })} style={{ width: "96px" }} aria-label="Extra cost" />
                                <span className="pc-sub-line" style={{ display: "block", fontSize: "11.5px", whiteSpace: "nowrap" }}>{priceEffect(v, p.unit, previewQty)}</span>
                              </td>
                              <td>
                                <select className="pc-input" style={{ width: "auto" }} value={v.price_mode} onChange={e => patchVal(oi, vi, { price_mode: e.target.value as PriceMode })} aria-label="Charged">
                                  {(Object.keys(PRICE_MODE_LABEL) as PriceMode[]).map(m => <option key={m} value={m}>{PRICE_MODE_LABEL[m]}</option>)}
                                </select>
                              </td>
                              <td>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <button type="button" className="pc-q-img" onClick={() => setPicker({ oi, vi })} title={v.image_url ? "Change image" : "Add an image for this choice"}>
                                    {v.image_url
                                      // eslint-disable-next-line @next/next/no-img-element
                                      ? <img src={v.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                      : "+"}
                                  </button>
                                  {v.image_url && <button type="button" className="pc-link" style={{ color: "var(--pc-red)" }} onClick={() => patchVal(oi, vi, { image_url: null })} aria-label="Remove image">✕</button>}
                                </span>
                              </td>
                              {o.input_type === "swatch" && (
                                <td>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                    <label title={v.image_url ? "The image fills this circle; the colour is used without one" : v.swatch_hex ? "Change colour" : knownColor(v.label) ? "Drawn from its name: click to choose another" : "Pick a colour"}
                                      style={v.swatch_hex ? SWATCH_WELL(v.swatch_hex) : knownColor(v.label) ? { ...SWATCH_WELL(knownColor(v.label)!), borderStyle: "dashed" } : SWATCH_EMPTY}>
                                      <input type="color" value={(v.swatch_hex ?? knownColor(v.label) ?? "#000000").toLowerCase()} onChange={e => patchVal(oi, vi, { swatch_hex: e.target.value })} style={SWATCH_INPUT} />
                                    </label>
                                    {v.swatch_hex && <button type="button" className="pc-link" style={{ color: "var(--pc-red)" }} onClick={() => patchVal(oi, vi, { swatch_hex: null })} aria-label="Clear colour">✕</button>}
                                  </span>
                                </td>
                              )}
                              <td>
                                <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                                  <input type="radio" name={`def-${oi}`} checked={v.is_default} onChange={() => patchVal(oi, vi, { is_default: true })} />
                                  {v.is_default ? "Yes" : "No"}
                                </label>
                              </td>
                              <td style={{ textAlign: "right" }}><button type="button" className="pc-link" style={{ color: "var(--pc-red)" }} onClick={() => removeVal(oi, vi)} aria-label="Remove this choice">Remove</button></td>
                            </tr>
                          ))}
                          {o.values.length === 0 && (
                            <tr><td colSpan={o.input_type === "swatch" ? 7 : 6} style={{ color: "var(--pc-muted)", textAlign: "center" }}>No choices yet: add the first one.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                      <button type="button" className="pc-btn" onClick={() => addVal(oi)}>+ Add choice</button>
                      <span className="pc-sub-line" style={{ fontSize: "12px" }}>
                        {o.input_type === "swatch" ? "Colour circles: give each choice a colour, or an image to fill the circle."
                          : o.input_type === "checkbox" ? "Checkboxes: the customer can tick any number of these."
                          : o.input_type === "quantity" ? "Quantity: each choice is a number (1, 5, 10). The customer picks how many here, and the price table can price each quantity as a whole."
                          : "Give a choice an image and the choices become picture tiles."}
                      </span>
                    </div>
                  </>)}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="pc-btn" onClick={addOption}>+ Add question</button>
              {options.length > 1 && (
                <button type="button" className="pc-link" onClick={() => setFolded(Object.fromEntries(options.map((_, i) => [i, options.every((_, k) => folded[k] === true) ? false : true])))}>
                  {options.every((_, i) => folded[i] === true) ? "Open all" : "Fold all"}
                </button>
              )}
            </div>
          </>)}
        </section>

        {/* Quantity discounts */}
        <section className="pc-card pc-pad" aria-labelledby="ob-breaks">
          <h2 className="pc-h2" id="ob-breaks" style={{ marginBottom: "4px" }}>Quantity discounts</h2>
          <p className="pc-sub-line" style={{ fontSize: "13px", margin: "0 0 12px" }}>Cheaper by the dozen. Add price breaks by quantity: the highest break the order reaches sets the price per item.</p>
          {tiers.length > 0 && (
            <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
              {tiers.map((t, i) => (
                <div key={t.id ?? `nt-${i}`} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }} data-break>
                  <span className="pc-sub-line" style={{ fontSize: "13px" }}>From</span>
                  <input className="pc-input" type="number" min={1} value={t.min_qty} aria-label="From quantity" style={{ width: "100px" }}
                    onChange={e => setTiers(x => x.map((y, k) => k === i ? { ...y, min_qty: Math.max(1, num(e.target.value, 1)) } : y))} />
                  <span className="pc-sub-line" style={{ fontSize: "13px" }}>items, each $</span>
                  <input className="pc-input" type="number" step="0.0001" min={0} value={t.unit_price} aria-label="Price per item" style={{ width: "120px" }}
                    onChange={e => setTiers(x => x.map((y, k) => k === i ? { ...y, unit_price: Math.max(0, num(e.target.value)) } : y))} />
                  <button type="button" className="pc-link" style={{ color: "var(--pc-red)" }} onClick={() => setTiers(x => x.filter((_, k) => k !== i))}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="pc-btn" onClick={() => setTiers(t => [...t, { min_qty: (t[t.length - 1]?.min_qty ?? 0) + 50, unit_price: 0 }])}>+ Add break</button>
        </section>

        {/* Answers that rule others out */}
        <section className="pc-card pc-pad" aria-labelledby="ob-rules">
          <h2 className="pc-h2" id="ob-rules" style={{ marginBottom: "4px" }}>Answers that rule others out</h2>
          <p className="pc-sub-line" style={{ fontSize: "13px", margin: "0 0 12px" }}>Switch a question off when another answer makes it impossible: Coating = UV greys out Laminating. The customer sees your note, and a switched-off question is left out of the price.</p>
          {rules.map((r, ri) => {
            const whenOpt = options[r.when_option];
            const targetOpt = r.target_option != null ? options[r.target_option] : undefined;
            const patchRule = (pr: Partial<Rule>) => setRules(x => x.map((y, k) => k === ri ? { ...y, ...pr } : y));
            return (
              <div key={r.id ?? `nr-${ri}`} className="pc-q" style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                <span className="pc-q-n">When</span>
                <select className="pc-input" style={{ width: "auto", maxWidth: "180px" }} value={r.when_option} onChange={e => patchRule({ when_option: Number(e.target.value), when_value: 0 })}>
                  {options.map((o, i) => <option key={i} value={i}>{o.name || `Question ${i + 1}`}</option>)}
                </select>
                <span className="pc-q-n">is</span>
                <select className="pc-input" style={{ width: "auto", maxWidth: "180px" }} value={r.when_value} onChange={e => patchRule({ when_value: Number(e.target.value) })}>
                  {(whenOpt?.values ?? []).map((v, i) => <option key={i} value={i}>{v.label || `Choice ${i + 1}`}</option>)}
                </select>
                <select className="pc-input" style={{ width: "auto" }} value={r.action} onChange={e => patchRule({ action: e.target.value as RuleAction, target_value: null })}>
                  {(Object.keys(RULE_ACTION_LABEL) as RuleAction[]).map(a => <option key={a} value={a}>{RULE_ACTION_LABEL[a]}</option>)}
                </select>
                <select className="pc-input" style={{ width: "auto", maxWidth: "180px" }} value={r.target_option ?? ""} onChange={e => patchRule({ target_option: e.target.value === "" ? null : Number(e.target.value), target_value: null })}>
                  <option value="">Choose a question…</option>
                  {options.map((o, i) => i === r.when_option ? null : <option key={i} value={i}>{o.name || `Question ${i + 1}`}</option>)}
                </select>
                {r.action === "disable_value" && (
                  <select className="pc-input" style={{ width: "auto", maxWidth: "180px" }} value={r.target_value ?? ""} onChange={e => patchRule({ target_value: e.target.value === "" ? null : Number(e.target.value) })}>
                    <option value="">Choose a choice…</option>
                    {(targetOpt?.values ?? []).map((v, i) => <option key={i} value={i}>{v.label || `Choice ${i + 1}`}</option>)}
                  </select>
                )}
                <input className="pc-input" value={r.note ?? ""} onChange={e => patchRule({ note: e.target.value })} maxLength={200}
                  placeholder='Note for the customer, e.g. "N/A with UV Coating"' style={{ flex: 1, minWidth: "200px" }} />
                <button type="button" className="pc-link" style={{ color: "var(--pc-red)" }} onClick={() => setRules(x => x.filter((_, k) => k !== ri))}>Remove</button>
              </div>
            );
          })}
          {options.length < 2
            ? <p className="pc-sub-line" style={{ fontSize: "13px", margin: 0 }}>Add at least two questions to link them with a rule.</p>
            : <button type="button" className="pc-btn" onClick={() => setRules(r => [...r, { when_option: 0, when_value: 0, action: "disable_option", target_option: null, target_value: null, note: "" }])}>+ Add rule</button>}
        </section>

        {/* Price for every combination */}
        <section className="pc-card pc-pad" aria-labelledby="ob-combos" data-combinations>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 className="pc-h2" id="ob-combos" style={{ marginBottom: "4px" }}>Price for every combination</h2>
              <p className="pc-sub-line" style={{ fontSize: "13px", margin: 0 }}>A combination left empty is priced by rule, from the base price and its choices&apos; extra costs. Type a price to set that one combination, or import a supplier&apos;s spreadsheet to set them all.</p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" className="pc-btn" onClick={() => void downloadGrid()} disabled={downloading || dirtySinceLoad || dirty}
                title={dirtySinceLoad || dirty ? "Save your changes first" : "Every combination and its price, as a spreadsheet"}>
                {downloading ? "Preparing…" : "Download CSV"}
              </button>
              <button type="button" className="pc-btn" onClick={() => setImporting(true)} disabled={dirtySinceLoad || dirty}
                title={dirtySinceLoad || dirty ? "Save your changes first" : "Fill the price table from a spreadsheet"}>
                Import CSV
              </button>
              <button type="button" className="pc-btn" data-kind={showGrid ? undefined : "primary"} onClick={() => setShowGrid(!showGrid)} aria-expanded={showGrid}>
                {showGrid ? "Close the price grid" : "Open price grid"}
              </button>
            </div>
          </div>
          {showGrid && (
            <div style={{ marginTop: "14px" }}>
              <CombinationPricing key={savedStamp} productId={productId} unsaved={dirtySinceLoad || dirty} />
            </div>
          )}
        </section>
      </>)}

      {importing && (
        <PriceGridImport productId={productId} onClose={() => setImporting(false)} onImported={(r) => void afterImport(r)} />
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

// The admin's look (admin-shell.css tokens): this builder sits on the product's
// Pricing tab and in the new-product steps.
const CARD: React.CSSProperties = { background: "#fff", border: "1px solid var(--pc-line)", borderRadius: "12px", padding: "20px", marginBottom: "16px" };
const LABEL: React.CSSProperties = { fontSize: "13.5px", fontWeight: 600, color: "var(--pc-ink)", marginBottom: "6px", display: "block" };
const HINT: React.CSSProperties = { fontSize: "13px", color: "var(--pc-muted)", marginBottom: "12px", lineHeight: 1.55 };
const NOTE: React.CSSProperties = { background: "#F5F7FA", border: "1px solid var(--pc-line)", borderRadius: "8px", padding: "14px 16px", fontSize: "13.5px", color: "var(--pc-muted)" };
const INPUT: React.CSSProperties = { padding: "10px 12px", border: "1px solid var(--pc-line)", borderRadius: "8px", fontSize: "14px", fontFamily: "inherit", color: "var(--pc-ink)", boxSizing: "border-box", background: "#fff" };
const TH: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: "11.5px", fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: ".07em" };
const TD: React.CSSProperties = { padding: "8px 12px", borderTop: "1px solid var(--pc-line-soft)" };
const CHECK: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 600, color: "#444", whiteSpace: "nowrap" };
const ICON_BTN: React.CSSProperties = { width: "30px", height: "30px", border: "1px solid #E3E3E3", background: "#fff", borderRadius: "8px", cursor: "pointer", fontSize: "13px", lineHeight: 1, color: "#444" };
const BTN_DARK: React.CSSProperties = { padding: "0 16px", height: "40px", background: "var(--pc-blue)", color: "#fff", border: "1px solid var(--pc-blue)", borderRadius: "8px", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" };
const BTN_LIGHT: React.CSSProperties = { padding: "0 14px", height: "40px", background: "#fff", color: "var(--pc-ink)", border: "1px solid var(--pc-line)", borderRadius: "8px", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" };
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
