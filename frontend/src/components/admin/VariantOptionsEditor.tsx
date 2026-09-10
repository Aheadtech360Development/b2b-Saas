"use client";

/**
 * VariantOptionsEditor — Shopify-style "define options, then generate variants".
 *
 * The admin builds two options as value chips — Color (each with a hex swatch)
 * and Size (any custom value, not fixed presets) — then clicks Add to generate
 * every Colour × Size combination. Colours carry their hex so storefront swatches
 * render exactly. Backend stays color/size (no migration); this only changes how
 * the values are entered.
 */
import { useState } from "react";

export interface ColorOption { name: string; hex: string; }

// Sensible default hex for common colour names so a freshly typed colour still
// gets a reasonable swatch; the admin can always override with the picker.
const KNOWN: Record<string, string> = {
  white: "#FFFFFF", black: "#111111", navy: "#1e3a5f", red: "#E8242A", blue: "#1A5CFF",
  royal: "#2251CC", "royal blue": "#2251CC", grey: "#9ca3af", gray: "#9ca3af",
  "dark grey": "#4b5563", "dark gray": "#4b5563", "light grey": "#d1d5db", charcoal: "#374151",
  "sport grey": "#9ca3af", "heather grey": "#b0b7c3", "athletic heather": "#b0b7c3",
  sand: "#c6a67f", natural: "#f5f0e8", tan: "#c9a96e", brown: "#78350f", maroon: "#7f1d1d",
  burgundy: "#881337", wine: "#722F37", green: "#166534", forest: "#1B4332", "forest green": "#14532d",
  "kelly green": "#15803d", olive: "#6B7233", sage: "#9CAF88", "deep teal": "#0f4c4c",
  teal: "#0d9488", coral: "#FF7F50", pink: "#EC4899", "dusty rose": "#C08497", dusk: "#8B7B9B",
  "powder blue": "#B0E0E6", ivory: "#FFFFF0", yellow: "#EAB308", orange: "#EA580C", purple: "#7C3AED",
};
const QUICK_SIZES = ["XS", "S", "S/M", "M", "M/L", "L", "XL", "2XL", "3XL", "4XL", "5XL", "One Size"];

function hexFor(name: string) { return KNOWN[name.trim().toLowerCase()] ?? "#888888"; }

export function VariantOptionsEditor({
  busy, onAdd, onCancel, willReplace,
}: {
  busy?: boolean;
  onAdd: (colors: ColorOption[], sizes: string[], price: string) => void;
  onCancel?: () => void;
  willReplace?: boolean;
}) {
  const [colors, setColors] = useState<ColorOption[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colorInput, setColorInput] = useState("");
  const [colorHex, setColorHex] = useState("#888888");
  const [sizeInput, setSizeInput] = useState("");
  const [price, setPrice] = useState("");

  function addColor(name?: string, hex?: string) {
    const n = (name ?? colorInput).trim();
    if (!n) return;
    if (colors.some((c) => c.name.toLowerCase() === n.toLowerCase())) { setColorInput(""); return; }
    setColors((c) => [...c, { name: n, hex: hex ?? (colorHex !== "#888888" ? colorHex : hexFor(n)) }]);
    setColorInput(""); setColorHex("#888888");
  }
  function addSize(v?: string) {
    const s = (v ?? sizeInput).trim();
    if (!s) return;
    if (sizes.some((x) => x.toLowerCase() === s.toLowerCase())) { setSizeInput(""); return; }
    setSizes((list) => [...list, s]);
    setSizeInput("");
  }

  const total = colors.length * sizes.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* ── Color option ─────────────────────────────────────────────────────── */}
      <div>
        <div style={L}>Color — add each colour value</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
          <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} title="Swatch colour" style={{ width: "38px", height: "38px", border: "1px solid #E3E3E3", borderRadius: "8px", background: "none", cursor: "pointer", padding: 0 }} />
          <input
            value={colorInput}
            onChange={(e) => { setColorInput(e.target.value); const k = KNOWN[e.target.value.trim().toLowerCase()]; if (k) setColorHex(k); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addColor(); } }}
            placeholder="e.g. Black, Navy, Forest…  (Enter to add)"
            style={{ ...INPUT, flex: 1, minWidth: "160px" }}
          />
          <button type="button" onClick={() => addColor()} disabled={!colorInput.trim()} style={ADD_BTN}>Add</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {colors.map((c) => (
            <span key={c.name} style={CHIP}>
              <span style={{ width: "15px", height: "15px", borderRadius: "50%", background: c.hex, border: "1.5px solid rgba(0,0,0,.12)" }} />
              {c.name}
              <button type="button" onClick={() => setColors((list) => list.filter((x) => x.name !== c.name))} style={CHIP_X}>×</button>
            </span>
          ))}
          {colors.length === 0 && <span style={EMPTY}>No colours yet — add at least one.</span>}
        </div>
      </div>

      {/* ── Size option ──────────────────────────────────────────────────────── */}
      <div>
        <div style={L}>Size — add each size value</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
          <input
            value={sizeInput}
            onChange={(e) => setSizeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSize(); } }}
            placeholder="Any size — e.g. S, M, 32x30, One Size  (Enter to add)"
            style={{ ...INPUT, flex: 1, minWidth: "180px" }}
          />
          <button type="button" onClick={() => addSize()} disabled={!sizeInput.trim()} style={ADD_BTN}>Add</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
          {QUICK_SIZES.map((s) => (
            <button key={s} type="button" onClick={() => addSize(s)} disabled={sizes.some((x) => x.toLowerCase() === s.toLowerCase())}
              style={{ ...QUICK, opacity: sizes.some((x) => x.toLowerCase() === s.toLowerCase()) ? 0.4 : 1 }}>+ {s}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {sizes.map((s) => (
            <span key={s} style={CHIP}>{s}
              <button type="button" onClick={() => setSizes((list) => list.filter((x) => x !== s))} style={CHIP_X}>×</button>
            </span>
          ))}
          {sizes.length === 0 && <span style={EMPTY}>No sizes yet — add at least one.</span>}
        </div>
      </div>

      {/* ── Price + generate ─────────────────────────────────────────────────── */}
      <div>
        <div style={L}>Price ($) — applied to every generated variant (editable after)</div>
        <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" style={{ ...INPUT, width: "160px" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", color: "#6B6B6B" }}>
          Will {willReplace ? "create" : "generate"} <strong>{total}</strong> variant{total === 1 ? "" : "s"} ({colors.length} colour{colors.length === 1 ? "" : "s"} × {sizes.length} size{sizes.length === 1 ? "" : "s"})
        </span>
        <div style={{ flex: 1 }} />
        {onCancel && <button type="button" onClick={onCancel} style={GHOST}>Cancel</button>}
        <button type="button" onClick={() => onAdd(colors, sizes, price)} disabled={busy || total === 0}
          style={{ ...PRIMARY, opacity: busy || total === 0 ? 0.5 : 1 }}>
          {busy ? "Adding…" : "Add variants"}
        </button>
      </div>
    </div>
  );
}

const L: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#2A2830", marginBottom: "8px", textTransform: "uppercase", letterSpacing: ".03em" };
const INPUT: React.CSSProperties = { padding: "9px 11px", border: "1px solid #D6D3CC", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" };
const CHIP: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", background: "#F4F3EF", border: "1px solid #E3E3E3", borderRadius: "18px", padding: "5px 6px 5px 10px", fontSize: "13px", fontWeight: 600, color: "#2A2830" };
const CHIP_X: React.CSSProperties = { background: "#fff", border: "1px solid #E3E3E3", color: "#B91C1C", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "12px", lineHeight: 1, padding: 0 };
const ADD_BTN: React.CSSProperties = { padding: "9px 16px", background: "#2A2830", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const QUICK: React.CSSProperties = { padding: "5px 10px", background: "#fff", border: "1px solid #D6D3CC", borderRadius: "16px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#444" };
const EMPTY: React.CSSProperties = { fontSize: "12px", color: "#AAA" };
const GHOST: React.CSSProperties = { padding: "10px 18px", background: "#fff", border: "1px solid #D6D3CC", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#444" };
const PRIMARY: React.CSSProperties = { padding: "10px 20px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
