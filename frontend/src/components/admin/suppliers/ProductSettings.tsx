"use client";

import { useState } from "react";
import {
  suppliersService, type FieldMap, type PriceRule, type SupplierConfig, type SupplierMeta,
} from "@/services/suppliers.service";
import { Btn, INPUT, LABEL, MUTED, Toggle, errText } from "./ui";

type Product = SupplierConfig["product"];
type Pricing = SupplierConfig["pricing"];

const SCOPES: { id: PriceRule["scope"]; label: string }[] = [
  { id: "all", label: "All products" },
  { id: "brand", label: "Brand" },
  { id: "category", label: "Category" },
  { id: "style", label: "Style" },
];
const ROUNDING: { v: number | null; label: string }[] = [
  { v: null, label: "No rounding" },
  { v: 0.99, label: "End in .99" },
  { v: 0.95, label: "End in .95" },
  { v: 0, label: "Whole dollars" },
];

export function ProductSettings({ id, meta, product, pricing, onProduct, onPricing, connected }: {
  id: string; meta: SupplierMeta; product: Product; pricing: Pricing;
  onProduct: (p: Product) => void; onPricing: (p: Pricing) => void; connected: boolean;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof suppliersService.previewFields>> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState("");

  const fields = product.fields;
  const setFields = (f: FieldMap[]) => { onProduct({ ...product, fields: f }); setPreview(null); };
  const setRow = (i: number, patch: Partial<FieldMap>) => setFields(fields.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const targetLabel = (k: string) => meta.targets.find((t) => t.key === k)?.label ?? k;
  const missing = ["sku", "retail_price"].filter((t) => !fields.some((f) => f.target === t));

  const runPreview = async () => {
    setPreviewing(true);
    setPreviewErr("");
    try {
      setPreview(await suppliersService.previewFields(id, fields));
    } catch (e) {
      setPreviewErr(errText(e));
    }
    setPreviewing(false);
  };

  return (
    <div style={{ display: "grid", gap: 26 }}>
      <section>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Publish Imported Products</div>
        <p style={MUTED}>Whether new supplier products go live on your storefront straight away.</p>
        <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap", fontSize: 13 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input type="radio" checked={product.status === "active"} onChange={() => onProduct({ ...product, status: "active" })} />
            Active — visible on the storefront
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input type="radio" checked={product.status === "draft"} onChange={() => onProduct({ ...product, status: "draft" })} />
            Draft — I&apos;ll review and publish them
          </label>
        </div>
      </section>

      <section>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: "1 1 320px" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Match Fields</div>
            <p style={MUTED}>Which supplier field fills which product field. For most stores the defaults work.</p>
          </div>
          <Btn kind="ghost" onClick={() => { setFields(JSON.parse(JSON.stringify(meta.default_fields))); setOpen({}); }}>Restore Default Fields</Btn>
          <Btn kind="ghost" onClick={() => { setFields([...fields, { source: "title", target: "meta_title", modify: "" }]); setOpen({ ...open, [fields.length]: false }); }}>+ Add Field</Btn>
        </div>

        <div style={{ display: "grid", gap: 0, borderTop: "1px solid #EEE" }}>
          {fields.map((f, i) => {
            const showModify = open[i] ?? !!f.modify;
            return (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid #EEE" }}>
                <select value={f.source} onChange={(e) => setRow(i, { source: e.target.value })} style={{ ...INPUT, flex: "0 1 230px" }}>
                  {meta.sources.map((s) => <option key={s.key} value={s.key}>Source {s.label}</option>)}
                </select>
                <span style={{ color: "#8A8A8A" }}>›</span>
                <select value={f.target} onChange={(e) => setRow(i, { target: e.target.value })} style={{ ...INPUT, flex: "0 1 230px" }}>
                  {meta.targets.map((t) => <option key={t.key} value={t.key}>Store {t.label}</option>)}
                </select>
                {showModify ? (
                  <input value={f.modify} onChange={(e) => setRow(i, { modify: e.target.value })} spellCheck={false}
                    placeholder={f.target === "retail_price" ? "Empty = your markup rules below" : "{{ value }}"}
                    style={{ ...INPUT, flex: "1 1 260px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }} />
                ) : (
                  <Btn kind="ghost" onClick={() => setOpen({ ...open, [i]: true })}>Modify</Btn>
                )}
                {f.target === "retail_price" && !f.modify && (
                  <span style={{ fontSize: 12, color: "#8A8A8A" }}>priced by your markup rules</span>
                )}
                <div style={{ flex: showModify ? "0 0 auto" : "1 1 auto" }} />
                <button type="button" aria-label={`Remove ${targetLabel(f.target)} mapping`} onClick={() => {
                  setFields(fields.filter((_, j) => j !== i));
                  setOpen({});
                }} style={{ ...INPUT, width: 34, padding: 0, cursor: "pointer", color: "#B42318" }}>×</button>
              </div>
            );
          })}
        </div>
        {missing.length > 0 && (
          <p style={{ fontSize: 13, color: "#B42318", marginTop: 8 }}>
            Keep a mapping for {missing.map(targetLabel).join(" and ")} — products can&apos;t be created without it.
          </p>
        )}
        <details style={{ marginTop: 10, fontSize: 12, color: "#6B6B6B" }}>
          <summary style={{ cursor: "pointer" }}>How Modify works</summary>
          <div style={{ lineHeight: 1.7, marginTop: 6 }}>
            Use <code>{"{{ value }}"}</code> for the source field, or any S&S field as <code>{"{{ style.brandName }}"}</code> /{" "}
            <code>{"{{ variant.customerPrice }}"}</code>. Add filters with <code>|</code>:{" "}
            <code>times</code>, <code>plus</code>, <code>minus</code>, <code>divided_by</code>, <code>round</code>, <code>ceil</code>,{" "}
            <code>floor</code>, <code>at_least</code>, <code>at_most</code>, <code>prepend</code>, <code>append</code>, <code>upcase</code>,{" "}
            <code>downcase</code>, <code>capitalize</code>, <code>replace</code>, <code>remove</code>, <code>strip_html</code>,{" "}
            <code>truncate</code>, <code>default</code>.<br />
            Examples: <code>{"{{ variant.salePrice | times: 1.25 | round: 2 }}"}</code> ·{" "}
            <code>{"{{ style.brandName }} {{ style.styleName }}"}</code> · <code>{"{{ value | prepend: \"SS-\" }}"}</code>
          </div>
        </details>

        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn kind="ghost" onClick={runPreview} busy={previewing} disabled={!connected || missing.length > 0}>Preview on a real product</Btn>
          <span style={{ ...MUTED, fontSize: 12 }}>Runs these mappings (saved or not) on the first product your import filters select.</span>
        </div>
        {previewErr && <p style={{ color: "#B42318", fontSize: 13, marginTop: 8 }}>{previewErr}</p>}
        {preview && (
          <div style={{ marginTop: 12, border: "1px solid #EEE", borderRadius: 10, padding: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{preview.style.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, max-content) 1fr", gap: "4px 14px" }}>
              {Object.entries(preview.product).map(([k, v]) => (
                <Row key={k} k={targetLabel(k)} v={v} />
              ))}
            </div>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 560 }}>
                <thead>
                  <tr>{Object.keys(preview.variants[0] ?? {}).map((k) => (
                    <th key={k} style={{ textAlign: "left", padding: "4px 10px", color: "#6B6B6B", borderBottom: "1px solid #EEE" }}>{targetLabel(k)}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {preview.variants.map((v, i) => (
                    <tr key={i}>{Object.values(v).map((x, j) => (
                      <td key={j} style={{ padding: "4px 10px", borderBottom: "1px solid #F4F4F4" }}>{fmt(x)}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <PricingRules value={pricing} onChange={onPricing} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: unknown }) {
  return (
    <>
      <span style={{ color: "#6B6B6B" }}>{k}</span>
      <span style={{ wordBreak: "break-word" }}>{fmt(v)}</span>
    </>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

// ── Markup rules ─────────────────────────────────────────────────────────────

function PricingRules({ value, onChange }: { value: Pricing; onChange: (p: Pricing) => void }) {
  const rules = value.rules;
  const setRules = (r: PriceRule[]) => onChange({ ...value, rules: r });
  const set = (i: number, patch: Partial<PriceRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ex = rules.find((r) => r.active && r.scope === "all") ?? rules.find((r) => r.active);
  const exPrice = roundPrice(ex ? 10 * (1 + ex.markup_pct / 100) + ex.markup_fixed : 14, value.round_to);

  return (
    <section>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Markup Rules</div>
      <p style={MUTED}>
        Sets Variant Price when its mapping has no Modify: supplier cost + markup. The most specific rule wins —
        style, then brand, then category, then all products. With no rule, cost + 40%.
      </p>
      <div style={{ marginTop: 10 }}>
        {rules.map((r, i) => (
          <div key={r.id ?? `new-${i}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8, opacity: r.active ? 1 : 0.55 }}>
            <select value={r.scope} onChange={(e) => set(i, { scope: e.target.value as PriceRule["scope"], value: e.target.value === "all" ? "" : r.value })} style={{ ...INPUT, flex: "0 1 140px" }}>
              {SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {r.scope !== "all" && (
              <input value={r.value} onChange={(e) => set(i, { value: e.target.value })}
                placeholder={r.scope === "brand" ? "e.g. Gildan" : r.scope === "category" ? "e.g. T-Shirts" : "Style number, e.g. 5000"}
                style={{ ...INPUT, flex: "1 1 150px" }} />
            )}
            <span style={{ fontSize: 13 }}>+</span>
            <input type="number" value={r.markup_pct} onChange={(e) => set(i, { markup_pct: Number(e.target.value) || 0 })} style={{ ...INPUT, width: 80 }} />
            <span style={{ fontSize: 13 }}>% +$</span>
            <input type="number" step="0.01" value={r.markup_fixed} onChange={(e) => set(i, { markup_fixed: Number(e.target.value) || 0 })} style={{ ...INPUT, width: 80 }} />
            <Toggle on={r.active} onChange={() => set(i, { active: !r.active })} title={r.active ? "Active" : "Paused"} />
            <button type="button" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Remove rule"
              style={{ ...INPUT, width: 34, padding: 0, cursor: "pointer", color: "#B42318" }}>×</button>
          </div>
        ))}
        <Btn kind="ghost" onClick={() => setRules([...rules, { scope: rules.length ? "brand" : "all", value: "", markup_pct: 50, markup_fixed: 0, active: true }])}>
          + Add markup rule
        </Btn>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={LABEL}>Price rounding</label>
          <select value={value.round_to === null ? "none" : String(value.round_to)}
            onChange={(e) => onChange({ ...value, round_to: e.target.value === "none" ? null : Number(e.target.value) })} style={{ ...INPUT, width: 200 }}>
            {ROUNDING.map((o) => <option key={o.label} value={o.v === null ? "none" : String(o.v)}>{o.label}</option>)}
          </select>
        </div>
        <p style={{ ...MUTED, fontSize: 12 }}>Example: a $10.00 cost sells for <b>${exPrice.toFixed(2)}</b>.</p>
      </div>
      {rules.some((r) => r.scope !== "all" && !r.value.trim()) && (
        <p style={{ fontSize: 13, color: "#B45309", marginTop: 8 }}>Rules without a brand, category or style are ignored when saved.</p>
      )}
    </section>
  );
}

function roundPrice(p: number, to: number | null) {
  if (to === null || p <= 0) return p;
  if (to === 0) return Math.ceil(p);
  const whole = Math.floor(p);
  const cand = whole + to;
  return cand >= p ? cand : whole + 1 + to;
}
