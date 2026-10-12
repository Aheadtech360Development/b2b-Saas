"use client";

/**
 * One product's gang sheet pricing: its builder, and the sizes or the price
 * tiers it sells by.
 *
 *   gang_sheet     the buyer arranges designs on one of these sheet sizes
 *   upload_own     the buyer sends a finished sheet, at one of these sizes
 *   upload_by_size one design at an exact size, priced per square inch by area
 *
 * The same editor is used by Gang sheet setup → Products, by a product's own
 * Pricing tab and by the new-product steps, so a product is priced one way
 * wherever it is opened. Sizes belong to this product only; a product with
 * none sells from the shop's default set (Gang sheet setup → Sheet sizes).
 */
import { useEffect, useState } from "react";
import { gangSheetsService, type GangSheetConfig, type GangSheetTier } from "@/services/gangSheets.service";

export type SheetKind = "gang_sheet" | "upload_by_size" | "upload_own";

interface SizeRow { id?: string; name: string; width_in: number; height_in: number; price_per_sheet: number }

// The sheet lengths most DTF shops sell, 22 inches wide.
const STANDARD_FEET: { name: string; height_in: number; price_per_sheet: number }[] = [
  { name: "2 feet", height_in: 24, price_per_sheet: 15 }, { name: "3 feet", height_in: 36, price_per_sheet: 22 },
  { name: "4 feet", height_in: 48, price_per_sheet: 26 }, { name: "5 feet", height_in: 60, price_per_sheet: 32 },
  { name: "6 feet", height_in: 72, price_per_sheet: 36 }, { name: "8 feet", height_in: 96, price_per_sheet: 48 },
  { name: "10 feet", height_in: 120, price_per_sheet: 54 }, { name: "20 feet", height_in: 240, price_per_sheet: 105 },
];

const KIND_CHOICES: [SheetKind, string, string][] = [
  ["gang_sheet", "Gang sheet", "Buyers arrange their designs on a sheet in the builder."],
  ["upload_own", "Upload your own sheet", "Buyers send a finished, print ready sheet."],
  ["upload_by_size", "Upload by size", "Buyers send one design and pick its size; priced by area."],
];

export function GangSheetProductEditor({
  productId, productName, kind: initialKind, config, fixedKind = false, onSaved,
}: {
  productId: string;
  productName: string;
  kind: SheetKind | null | undefined;
  config: GangSheetConfig | null | undefined;
  /** The new-product steps chose the kind already: no switch here. */
  fixedKind?: boolean;
  onSaved?: (kind: SheetKind) => void;
}) {
  const [kind, setKind] = useState<SheetKind>(initialKind ?? "gang_sheet");
  const [cfg, setCfg] = useState<GangSheetConfig>(config ?? { printer_width: 22, max_height: 312, tiers: [] });
  const [rows, setRows] = useState<SizeRow[]>([]);
  const [origIds, setOrigIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    gangSheetsService.adminListSizes(productId)
      .then((list) => {
        if (cancelled) return;
        // Only this product's own sizes: the shop's default set is not edited here.
        const own = list.filter((s) => s.product_id === productId);
        setRows(own.map((s) => ({ id: s.id, name: s.name, width_in: s.width_in, height_in: s.height_in, price_per_sheet: s.price_per_sheet })));
        setOrigIds(own.map((s) => s.id));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [productId]);

  const sized = kind === "gang_sheet" || kind === "upload_own";
  const tiers: GangSheetTier[] = cfg.tiers ?? [];
  const touch = () => { setDirty(true); setMsg(null); };

  function setRow(i: number, field: keyof SizeRow, val: string | number) { setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row))); touch(); }
  function setTier(i: number, field: keyof GangSheetTier, val: number) { setCfg((c) => ({ ...c, tiers: (c.tiers ?? []).map((t, idx) => (idx === i ? { ...t, [field]: val } : t)) })); touch(); }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const data: { gang_sheet_enabled: boolean; gang_sheet_type: string; gang_sheet_config?: GangSheetConfig } = { gang_sheet_enabled: true, gang_sheet_type: kind };
      if (kind === "upload_by_size") data.gang_sheet_config = cfg;
      await gangSheetsService.adminUpdateProduct(productId, data);
      if (sized) {
        // A gang sheet and a finished sheet both sell by this product's sizes.
        const kept = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
        for (const id of origIds) if (!kept.has(id)) await gangSheetsService.adminDeleteSize(id);
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]!;
          const payload = {
            name: r.name.trim() || `Sheet ${i + 1}`, width_in: Number(r.width_in) || 22, height_in: Number(r.height_in) || 24,
            price_per_sheet: Number(r.price_per_sheet) || 0, sort_order: i, pricing_mode: "fixed" as const,
          };
          if (r.id) await gangSheetsService.adminUpdateSize(r.id, payload);
          else await gangSheetsService.adminCreateSize({ ...payload, bleed_in: 0.125, spacing_in: 0.125, is_active: true, product_id: productId });
        }
        const own = (await gangSheetsService.adminListSizes(productId)).filter((s) => s.product_id === productId);
        setRows(own.map((s) => ({ id: s.id, name: s.name, width_in: s.width_in, height_in: s.height_in, price_per_sheet: s.price_per_sheet })));
        setOrigIds(own.map((s) => s.id));
      }
      setDirty(false);
      setMsg({ text: "Saved.", ok: true });
      onSaved?.(kind);
    } catch (e) {
      setMsg({ text: e instanceof Error && e.message ? e.message : "Not saved. Please try again.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pc-stack" style={{ gap: "16px" }} data-sheet-pricing={kind}>
      {!fixedKind && (
        <section className="pc-card pc-pad">
          <h2 className="pc-h2">How buyers order it</h2>
          <div className="pc-kinds" style={{ marginTop: "14px" }} role="radiogroup" aria-label="Builder">
            {KIND_CHOICES.map(([value, title, blurb]) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} className="pc-kind" data-on={kind === value ? "" : undefined}
                onClick={() => { setKind(value); touch(); }}>
                <span className="pc-kind-title">{title}</span>
                <span className="pc-kind-blurb">{blurb}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {sized ? (
        <section className="pc-card" aria-label="Sheet sizes and prices" data-sheet-sizes>
          <div className="pc-card-head">
            <div>
              <h2 className="pc-h2">Sheet sizes and prices</h2>
              <p className="pc-sub-line" style={{ marginTop: "4px" }}>
                These belong to {productName} only. With none, it sells from your default sizes.
              </p>
            </div>
            <button type="button" className="pc-btn" onClick={() => { setRows((r) => [...r, ...STANDARD_FEET.map((s) => ({ name: s.name, width_in: 22, height_in: s.height_in, price_per_sheet: s.price_per_sheet }))]); touch(); }}>
              + Standard sizes (2–20 ft)
            </button>
          </div>
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ minWidth: "560px" }}>
              <thead><tr><th>Size name</th><th>Width (in)</th><th>Length (in)</th><th>Price per sheet</th><th aria-label="Remove" /></tr></thead>
              <tbody>
                {!loaded ? (
                  <tr><td colSpan={5} className="pc-empty">Loading sizes…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="pc-empty">No sizes of its own yet. Add one, or the standard set.</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.id ?? `new-${i}`} data-size-row>
                    <td><input className="pc-input" value={r.name} placeholder="e.g. 2 feet" onChange={(e) => setRow(i, "name", e.target.value)} aria-label="Size name" /></td>
                    <td><input className="pc-input" type="number" step="0.25" value={r.width_in} onChange={(e) => setRow(i, "width_in", Number(e.target.value))} aria-label="Width in inches" /></td>
                    <td><input className="pc-input" type="number" step="1" value={r.height_in} onChange={(e) => setRow(i, "height_in", Number(e.target.value))} aria-label="Length in inches" /></td>
                    <td><input className="pc-input" type="number" step="0.01" value={r.price_per_sheet} onChange={(e) => setRow(i, "price_per_sheet", Number(e.target.value))} aria-label="Price per sheet" /></td>
                    <td className="pc-num"><button type="button" className="pc-link" style={{ color: "var(--pc-red)" }} onClick={() => { setRows((x) => x.filter((_, idx) => idx !== i)); touch(); }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pc-pad" style={{ paddingTop: "12px" }}>
            <button type="button" className="pc-btn" onClick={() => { setRows((r) => [...r, { name: "", width_in: 22, height_in: 24, price_per_sheet: 0 }]); touch(); }}>+ Add size</button>
          </div>
        </section>
      ) : (
        <section className="pc-card pc-pad" aria-label="Price by area" data-sheet-tiers>
          <h2 className="pc-h2">Price by area</h2>
          <p className="pc-sub-line" style={{ marginTop: "4px" }}>The buyer picks any size up to these limits; the price is the area times the rate of its tier.</p>
          <div className="pc-grid-2" style={{ marginTop: "14px" }}>
            <div>
              <label className="pc-label" htmlFor="gs-width">Printer width (in)</label>
              <input id="gs-width" className="pc-input" type="number" step="0.25" min="1" value={cfg.printer_width ?? 22} onChange={(e) => { setCfg((c) => ({ ...c, printer_width: Number(e.target.value) })); touch(); }} />
            </div>
            <div>
              <label className="pc-label" htmlFor="gs-max">Longest design (in)</label>
              <input id="gs-max" className="pc-input" type="number" step="1" min="1" value={cfg.max_height ?? 312} onChange={(e) => { setCfg((c) => ({ ...c, max_height: Number(e.target.value) })); touch(); }} />
            </div>
          </div>
          <div className="pc-scroll-x" style={{ marginTop: "16px", border: "1px solid var(--pc-line)", borderRadius: "10px" }}>
            <table className="pc-table" style={{ minWidth: "520px" }}>
              <thead><tr><th>Up to height (in)</th><th>Up to area (sq in)</th><th>Price per sq in</th><th aria-label="Remove" /></tr></thead>
              <tbody>
                {tiers.length === 0 ? (
                  <tr><td colSpan={4} className="pc-empty">No tiers yet. Add the first one.</td></tr>
                ) : tiers.map((t, i) => (
                  <tr key={i} data-tier-row>
                    <td><input className="pc-input" type="number" step="0.01" value={t.max_height} onChange={(e) => setTier(i, "max_height", Number(e.target.value))} aria-label="Up to height" /></td>
                    <td><input className="pc-input" type="number" step="0.01" value={t.max_area} onChange={(e) => setTier(i, "max_area", Number(e.target.value))} aria-label="Up to area" /></td>
                    <td><input className="pc-input" type="number" step="0.0001" value={t.price_per_sqin} onChange={(e) => setTier(i, "price_per_sqin", Number(e.target.value))} aria-label="Price per square inch" /></td>
                    <td className="pc-num"><button type="button" className="pc-link" style={{ color: "var(--pc-red)" }} onClick={() => { setCfg((c) => ({ ...c, tiers: (c.tiers ?? []).filter((_, idx) => idx !== i) })); touch(); }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="pc-btn" style={{ marginTop: "12px" }}
            onClick={() => { setCfg((c) => ({ ...c, tiers: [...(c.tiers ?? []), { max_height: 0, max_area: 0, price_per_sqin: 0, discount: 0 }] })); touch(); }}>
            + Add tier
          </button>
        </section>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
        {msg && <span style={{ fontSize: "13.5px", fontWeight: 600, color: msg.ok ? "var(--pc-green)" : "var(--pc-red)" }} role="status">{msg.text}</span>}
        {dirty && !msg && <span className="pc-sub-line" style={{ margin: 0, color: "var(--pc-amber)" }}>Not saved yet</span>}
        <button type="button" className="pc-btn" data-kind="primary" onClick={save} disabled={saving || !loaded} data-save-sheet-pricing>
          {saving ? "Saving…" : "Save pricing"}
        </button>
      </div>
    </div>
  );
}
