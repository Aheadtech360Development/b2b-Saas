"use client";

import type { FilterField, FilterOp, FilterRule, Filters } from "@/services/suppliers.service";
import { Btn, INPUT } from "./ui";

const FIELDS: { id: FilterField; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "category", label: "Category" },
  { id: "style", label: "Style number / name" },
  { id: "title", label: "Product title" },
];
const OPS: { id: FilterOp; label: string }[] = [
  { id: "equals", label: "is" },
  { id: "contains", label: "contains" },
  { id: "not_equals", label: "is not" },
];

/** Rules that pick which supplier products to import. */
export function FilterEditor({
  value, onChange, brands, categories,
}: {
  value: Filters; onChange: (f: Filters) => void; brands: string[]; categories: string[];
}) {
  const set = (i: number, patch: Partial<FilterRule>) =>
    onChange({ ...value, rules: value.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, marginBottom: 10 }}>
        <span>Import products that match</span>
        <select value={value.match} onChange={(e) => onChange({ ...value, match: e.target.value as Filters["match"] })} style={{ ...INPUT, width: "auto" }}>
          <option value="any">any rule</option>
          <option value="all">all rules</option>
        </select>
      </div>

      {value.rules.length === 0 && (
        <div style={{ fontSize: 13, color: "#8A8A8A", padding: "10px 12px", background: "#FAFAFA", borderRadius: 8, marginBottom: 10 }}>
          No rules yet — nothing will be imported. Add a rule, e.g. <b>Brand is Bella + Canvas</b>.
        </div>
      )}

      {value.rules.map((r, i) => {
        const list = r.field === "brand" ? brands : r.field === "category" ? categories : [];
        const listId = `sup-filter-${r.field}`;
        return (
          <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
            <select value={r.field} onChange={(e) => set(i, { field: e.target.value as FilterField })} style={{ ...INPUT, flex: "0 1 190px" }}>
              {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <select value={r.op} onChange={(e) => set(i, { op: e.target.value as FilterOp })} style={{ ...INPUT, flex: "0 1 120px" }}>
              {OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <input value={r.value} onChange={(e) => set(i, { value: e.target.value })} list={list.length ? listId : undefined}
              placeholder={r.field === "brand" ? "Start typing a brand…" : r.field === "style" ? "e.g. 3001" : "Value"}
              style={{ ...INPUT, flex: "1 1 200px" }} />
            {list.length > 0 && (
              <datalist id={listId}>{list.map((b) => <option key={b} value={b} />)}</datalist>
            )}
            <button type="button" onClick={() => onChange({ ...value, rules: value.rules.filter((_, j) => j !== i) })}
              aria-label="Remove rule" style={{ ...INPUT, width: 36, padding: 0, cursor: "pointer", color: "#B42318" }}>×</button>
          </div>
        );
      })}

      <Btn kind="ghost" onClick={() => onChange({ ...value, rules: [...value.rules, { field: "brand", op: "equals", value: "" }] })}>
        + Add rule
      </Btn>
    </div>
  );
}

/** Rules as the server will store them: blank values dropped, trimmed. */
export function cleanFilters(f: Filters): Filters {
  return { match: f.match, rules: f.rules.map((r) => ({ ...r, value: r.value.trim() })).filter((r) => r.value) };
}

export function sameFilters(a: Filters, b: Filters): boolean {
  return JSON.stringify(cleanFilters(a)) === JSON.stringify(cleanFilters(b));
}
