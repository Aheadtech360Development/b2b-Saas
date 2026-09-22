"use client";

/**
 * Bulk edit — a spreadsheet over the selected variants.
 *
 * Sixty variants used to mean sixty separate requests fired at once, against a
 * route that did not exist, so nothing happened and nothing said so. This sends
 * the whole edit as one request that either lands or does not: a half-applied
 * price rise across a colour range is the kind of thing nobody notices until a
 * customer is charged it.
 *
 * Three ways to change many rows, because they answer different questions:
 *
 *   Set        — every row to the same value ("all sixty at $27").
 *   Adjust     — every row moved relative to what it already has ("all sixty up
 *                ten percent"), which no single number in a box can express.
 *   Cell edits — different values on different rows, typed straight into the
 *                grid, still saved in one go.
 *
 * A value typed on a row wins over anything applied across the selection, so
 * the admin can set the lot and then correct two of them before saving.
 */
import { useMemo, useState } from "react";
import type { ProductVariant } from "@/types/product.types";
import { adminService } from "@/services/admin.service";

type Field =
  | "sku" | "color" | "size" | "retail_price" | "compare_price"
  | "cost_per_item" | "weight_grams" | "country_of_origin" | "status" | "stock_quantity";

interface Column {
  key: Field;
  label: string;
  kind: "text" | "money" | "number" | "status";
  width: number;
  /** Money columns can also be moved by a percentage or an amount. */
  adjustable?: boolean;
}

const COLUMNS: Column[] = [
  { key: "sku", label: "SKU", kind: "text", width: 150 },
  { key: "color", label: "Colour", kind: "text", width: 130 },
  { key: "size", label: "Size", kind: "text", width: 70 },
  { key: "retail_price", label: "Price", kind: "money", width: 100, adjustable: true },
  { key: "compare_price", label: "Compare at", kind: "money", width: 100, adjustable: true },
  { key: "cost_per_item", label: "Cost", kind: "money", width: 100, adjustable: true },
  { key: "stock_quantity", label: "Stock", kind: "number", width: 80 },
  { key: "weight_grams", label: "Weight (g)", kind: "number", width: 90 },
  { key: "country_of_origin", label: "Origin", kind: "text", width: 130 },
  { key: "status", label: "Status", kind: "status", width: 130 },
];

const STATUSES = ["active", "out_of_stock", "discontinued"] as const;

type Edits = Record<string, Partial<Record<Field, string>>>;

export function VariantBulkEditor({
  productId,
  variants,
  onClose,
  onSaved,
}: {
  productId: string;
  /** The selection, already filtered by the page. */
  variants: ProductVariant[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [edits, setEdits] = useState<Edits>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The "apply to every row" bar.
  const [field, setField] = useState<Field>("retail_price");
  const [how, setHow] = useState<"set" | "percent" | "amount">("set");
  const [amount, setAmount] = useState("");
  const [rounding, setRounding] = useState<"" | "whole" | "ends_99">("");

  const column = COLUMNS.find(c => c.key === field)!;
  const dirtyRows = Object.keys(edits).length;

  function cell(v: ProductVariant, key: Field): string {
    const edited = edits[v.id]?.[key];
    if (edited !== undefined) return edited;
    const raw = (v as unknown as Record<string, unknown>)[key];
    return raw === null || raw === undefined ? "" : String(raw);
  }

  function setCell(id: string, key: Field, value: string) {
    setEdits(e => ({ ...e, [id]: { ...e[id], [key]: value } }));
  }

  /** Work out what each row becomes, so the grid shows the result before saving. */
  function applyToAll() {
    if (!amount.trim()) return;
    const n = Number(amount);
    if (how !== "set" && !Number.isFinite(n)) return;

    setEdits(prev => {
      const next: Edits = { ...prev };
      for (const v of variants) {
        let value: string;
        if (how === "set") {
          value = amount.trim();
        } else {
          const current = Number(cell(v, field));
          // Moving a field nobody has set would turn "+10%" into a price of
          // ten percent of nothing. Left alone instead, which is what the
          // server does too.
          if (!Number.isFinite(current) || cell(v, field) === "") continue;
          let result = how === "percent" ? current * (1 + n / 100) : current + n;
          if (result < 0) result = 0;
          if (rounding === "whole") result = Math.round(result);
          else if (rounding === "ends_99") result = Math.max(0, Math.round(result) - 0.01);
          value = result.toFixed(2);
        }
        next[v.id] = { ...next[v.id], [field]: value };
      }
      return next;
    });
  }

  /** Copy the top row's value down the column — the spreadsheet habit. */
  function fillDown(key: Field) {
    const first = variants[0];
    if (!first) return;
    const value = cell(first, key);
    setEdits(prev => {
      const next: Edits = { ...prev };
      for (const v of variants.slice(1)) next[v.id] = { ...next[v.id], [key]: value };
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Only rows the admin actually touched are sent — an untouched row has
      // nothing to say, and sending it back could overwrite a change somebody
      // else made while this grid was open.
      await adminService.bulkUpdateVariants(productId, { edits });
      await onSaved();
      onClose();
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail || err?.message || "Could not save these changes.");
    }
    setSaving(false);
  }

  const summary = useMemo(() => {
    if (how === "set") return `Set ${column.label.toLowerCase()} to ${amount || "…"}`;
    const sign = Number(amount) >= 0 ? "+" : "";
    return how === "percent"
      ? `${sign}${amount || "…"}% on ${column.label.toLowerCase()}`
      : `${sign}${amount || "…"} on ${column.label.toLowerCase()}`;
  }, [how, amount, column]);

  return (
    <div style={BACKDROP} onClick={onClose}>
      <div style={PANEL} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={HEADER}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#1A1A1A", margin: 0 }}>
              Bulk edit
            </h2>
            <p style={{ fontSize: 12.5, color: "#6B6B6B", margin: "3px 0 0" }}>
              {variants.length} variant{variants.length === 1 ? "" : "s"} selected
              {dirtyRows > 0 && ` · ${dirtyRows} changed`}
            </p>
          </div>
          <button onClick={onClose} style={ICON_BTN} title="Close">✕</button>
        </div>

        {/* Apply to every row */}
        <div style={BAR}>
          <select value={field} onChange={e => setField(e.target.value as Field)} style={INPUT}>
            {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>

          <select
            value={how}
            onChange={e => setHow(e.target.value as typeof how)}
            style={INPUT}
          >
            <option value="set">set to</option>
            {column.adjustable && <option value="percent">change by %</option>}
            {column.adjustable && <option value="amount">change by amount</option>}
          </select>

          {field === "status" && how === "set" ? (
            <select value={amount} onChange={e => setAmount(e.target.value)} style={{ ...INPUT, width: 150 }}>
              <option value="">choose…</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          ) : (
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={how === "percent" ? "e.g. 10 or -15" : "value"}
              style={{ ...INPUT, width: 130 }}
            />
          )}

          {how !== "set" && (
            <select value={rounding} onChange={e => setRounding(e.target.value as typeof rounding)} style={INPUT}>
              <option value="">no rounding</option>
              <option value="whole">round to whole</option>
              <option value="ends_99">round to .99</option>
            </select>
          )}

          <button onClick={applyToAll} disabled={!amount.trim()} style={{ ...BTN_DARK, opacity: amount.trim() ? 1 : 0.45 }}>
            Apply to all {variants.length}
          </button>
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>{summary}</span>
        </div>

        {/* The grid */}
        <div style={{ overflow: "auto", flex: 1, borderTop: "1px solid #E3E3E3" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13, minWidth: "100%" }}>
            <thead>
              <tr>
                {COLUMNS.map(c => (
                  <th key={c.key} style={{ ...TH, minWidth: c.width }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {c.label}
                      {variants.length > 1 && (
                        <button
                          onClick={() => fillDown(c.key)}
                          style={FILL_BTN}
                          title={`Copy the first row's ${c.label.toLowerCase()} down every row`}
                        >
                          ↓
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variants.map((v, rowIndex) => (
                <tr key={v.id} style={{ background: rowIndex % 2 ? "#FCFCFC" : "#fff" }}>
                  {COLUMNS.map(c => {
                    const changed = edits[v.id]?.[c.key] !== undefined;
                    return (
                      <td key={c.key} style={TD}>
                        {c.kind === "status" ? (
                          <select
                            value={cell(v, c.key)}
                            onChange={e => setCell(v.id, c.key, e.target.value)}
                            style={{ ...CELL, ...(changed ? CELL_CHANGED : {}) }}
                          >
                            {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                          </select>
                        ) : (
                          <input
                            value={cell(v, c.key)}
                            onChange={e => setCell(v.id, c.key, e.target.value)}
                            inputMode={c.kind === "text" ? "text" : "decimal"}
                            spellCheck={false}
                            style={{ ...CELL, ...(changed ? CELL_CHANGED : {}) }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={FOOTER}>
          {error && <span style={{ fontSize: 12.5, color: "#B91C1C", flex: 1 }}>{error}</span>}
          {!error && (
            <span style={{ fontSize: 12, color: "#9CA3AF", flex: 1 }}>
              Changed cells are highlighted. Nothing is saved until you press Save.
            </span>
          )}
          <button onClick={onClose} style={BTN_LIGHT}>Cancel</button>
          <button onClick={save} disabled={saving || !dirtyRows} style={{ ...BTN_DARK, opacity: saving || !dirtyRows ? 0.45 : 1 }}>
            {saving ? "Saving…" : `Save ${dirtyRows || ""} change${dirtyRows === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const BACKDROP: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(16,16,18,.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
};
const PANEL: React.CSSProperties = {
  background: "#fff", borderRadius: 12, width: "min(1180px, 100%)", maxHeight: "90vh",
  display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.25)",
  fontFamily: "var(--font-jakarta)",
};
const HEADER: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  padding: "18px 22px 14px",
};
const BAR: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
  padding: "0 22px 16px",
};
const FOOTER: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end",
  padding: "14px 22px", borderTop: "1px solid #E3E3E3",
};
const TH: React.CSSProperties = {
  padding: "9px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6B6B6B",
  textTransform: "uppercase", letterSpacing: ".06em", background: "#FAFAFA",
  position: "sticky", top: 0, zIndex: 1, borderBottom: "1px solid #E3E3E3", whiteSpace: "nowrap",
};
const TD: React.CSSProperties = { padding: "4px 6px", borderBottom: "1px solid #F4F4F5" };
const CELL: React.CSSProperties = {
  width: "100%", padding: "6px 8px", border: "1px solid transparent", borderRadius: 6,
  fontSize: 13, background: "transparent", boxSizing: "border-box", fontFamily: "inherit",
};
const CELL_CHANGED: React.CSSProperties = { background: "#FEF9E7", border: "1px solid #F0C36D" };
const INPUT: React.CSSProperties = {
  padding: "7px 9px", border: "1px solid #E3E3E3", borderRadius: 7, fontSize: 13,
  background: "#fff", boxSizing: "border-box",
};
const BTN_DARK: React.CSSProperties = {
  padding: "8px 16px", background: "#1A1A1A", color: "#fff", border: "none",
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const BTN_LIGHT: React.CSSProperties = {
  padding: "8px 16px", background: "#fff", color: "#1A1A1A", border: "1px solid #E3E3E3",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const ICON_BTN: React.CSSProperties = {
  width: 30, height: 30, border: "1px solid #E3E3E3", background: "#fff",
  borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#444",
};
const FILL_BTN: React.CSSProperties = {
  width: 18, height: 18, border: "1px solid #E3E3E3", background: "#fff", borderRadius: 4,
  cursor: "pointer", fontSize: 10, lineHeight: 1, color: "#6B6B6B", padding: 0,
};
