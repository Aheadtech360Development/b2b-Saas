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
import { useMemo, useState } from "react";
import { colorNames, knownColor, normalizeHex, parseColorEntry } from "@/lib/colors";
import { ColorSwatchPicker, UNSET_SWATCH } from "@/components/admin/ColorSwatchPicker";

/** A colour to make variants in. `hex` is "" when no colour could be found for the name and none was chosen. */
export interface ColorOption { name: string; hex: string; }

const QUICK_SIZES = ["XS", "S", "S/M", "M", "M/L", "L", "XL", "2XL", "3XL", "4XL", "5XL", "One Size"];

/**
 * The colour for what was typed: the hex written with it ("Seafoam #9FD5B8"),
 * else what the name means. This had a forty-name list of its own and gave
 * every other name #888888 — which was then saved, so "Heather Royal" or
 * "Safety Green" was a grey dot in the admin and on the shop.
 */
function entryFor(text: string): ColorOption | null {
  const { name, hex } = parseColorEntry(text);
  return name ? { name, hex: hex ?? knownColor(name) ?? "" } : null;
}

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
  /** A colour chosen by hand for what is being typed — the picker or the hex box. Empty: go by the name. */
  const [hexInput, setHexInput] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  const [price, setPrice] = useState("");
  const names = useMemo(() => colorNames(), []);

  const typing = entryFor(colorInput);
  const chosen = normalizeHex(hexInput);
  /** What the swatch shows as the name is typed: the hand-picked colour, else the name's, else nothing yet. */
  const live = chosen ?? (typing?.hex || null);

  /** Add colours, skipping any already there. */
  function addColors(list: ColorOption[]) {
    setColors((have) => {
      const out = [...have];
      for (const c of list) if (c.name && !out.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) out.push(c);
      return out;
    });
  }
  function addColor() {
    if (!typing) return;
    addColors([{ name: typing.name, hex: chosen ?? typing.hex }]);
    setColorInput(""); setHexInput("");
  }
  /** Several at once — "Black, Navy, Heather Royal" pasted or typed with commas: each gets its own colour. */
  function addList(text: string): boolean {
    if (!/[,;\n]/.test(text)) return false;
    const list = text.split(/[,;\n]+/).map((t) => entryFor(t.trim())).filter((c): c is ColorOption => !!c);
    // One name and a comma: the colour picked by hand for it still counts.
    if (list.length === 1 && chosen) list[0] = { ...list[0]!, hex: chosen };
    addColors(list);
    setColorInput(""); setHexInput("");
    return true;
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
          {/* A colour input paints its own square well that no border-radius can
              reach, so the round swatch is the wrapper and the input sits inside
              it, oversized and clipped — what shows is a circle of the colour. */}
          <label
            title={live ? `${live} — click to pick another colour` : "Pick this colour"}
            style={{
              width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0,
              background: live ?? UNSET_SWATCH, border: live ? "1.5px solid rgba(0,0,0,.14)" : "1.5px dashed #B45309",
              boxShadow: "inset 0 0 0 2px #fff", cursor: "pointer",
              overflow: "hidden", position: "relative", display: "inline-block",
            }}
          >
            <input
              type="color"
              aria-label="Pick this colour"
              value={(live ?? "#888888").toLowerCase()}
              onChange={(e) => setHexInput(e.target.value.toUpperCase())}
              style={{ position: "absolute", inset: "-8px", width: "calc(100% + 16px)", height: "calc(100% + 16px)", border: "none", padding: 0, background: "none", cursor: "pointer", opacity: 0 }}
            />
          </label>
          <input
            value={colorInput}
            list="variant-colour-names"
            aria-label="Colour name"
            onChange={(e) => {
              const text = e.target.value;
              if (/[,;]/.test(text) && addList(text)) return;
              setColorInput(text);
              // A colour picked by hand belongs to the name it was picked for.
              if (!text.trim()) setHexInput("");
            }}
            onPaste={(e) => { const text = e.clipboardData.getData("text"); if (/[,;\n]/.test(text) && addList(text)) e.preventDefault(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColor(); } }}
            placeholder="e.g. Black, Heather Royal, Safety Green…  (Enter to add)"
            style={{ ...INPUT, flex: 1, minWidth: "160px" }}
          />
          <datalist id="variant-colour-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          <input
            value={hexInput || (live ?? "")}
            aria-label="Hex code"
            spellCheck={false}
            onChange={(e) => setHexInput(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColor(); } }}
            placeholder="#hex"
            title="The colour's hex code — typed here, it is used straight away"
            style={{ ...INPUT, width: "104px", fontFamily: "ui-monospace, monospace", fontSize: "13px", borderColor: hexInput.trim() && !chosen ? "#F59E0B" : "#D6D3CC" }}
          />
          <button type="button" onClick={() => addColor()} disabled={!colorInput.trim()} style={ADD_BTN}>Add</button>
        </div>
        {typing && (
          <div style={{ fontSize: "12px", marginBottom: "10px", color: live ? "#6B6B6B" : "#B45309" }}>
            {hexInput.trim() && !chosen
              ? "A hex code looks like #1F3A93."
              : !live
                ? <>No colour is known for “{typing.name}”. Click the circle to pick it, or type its hex code — it is used straight away.</>
                : chosen
                  ? <>“{typing.name}” will use {chosen}.</>
                  : <>Colour found for “{typing.name}”. Not right? Click the circle or type a hex code.</>}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {colors.map((c) => (
            <span key={c.name} style={CHIP}>
              <ColorSwatchPicker name={c.name} hex={c.hex} size={16}
                onPick={(hex) => setColors((list) => list.map((x) => (x.name === c.name ? { ...x, hex } : x)))} />
              {c.name}
              <button type="button" onClick={() => setColors((list) => list.filter((x) => x.name !== c.name))} style={CHIP_X}>×</button>
            </span>
          ))}
          {colors.length === 0 && <span style={EMPTY}>No colours yet — add at least one. Several at once: paste them with commas.</span>}
        </div>
        {colors.some((c) => !c.hex) && (
          <div style={{ fontSize: "12px", color: "#B45309", marginTop: "8px" }}>
            A hatched dot has no colour yet — click it to choose one, or it will show as a plain dot on your shop.
          </div>
        )}
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
const CHIP: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", background: "#F6F6F7", border: "1px solid #E3E3E3", borderRadius: "18px", padding: "5px 6px 5px 10px", fontSize: "13px", fontWeight: 600, color: "#2A2830" };
const CHIP_X: React.CSSProperties = { background: "#fff", border: "1px solid #E3E3E3", color: "#B91C1C", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "12px", lineHeight: 1, padding: 0 };
const ADD_BTN: React.CSSProperties = { padding: "9px 16px", background: "#2A2830", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const QUICK: React.CSSProperties = { padding: "5px 10px", background: "#fff", border: "1px solid #D6D3CC", borderRadius: "16px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#444" };
const EMPTY: React.CSSProperties = { fontSize: "12px", color: "#AAA" };
const GHOST: React.CSSProperties = { padding: "10px 18px", background: "#fff", border: "1px solid #D6D3CC", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#444" };
const PRIMARY: React.CSSProperties = { padding: "10px 20px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
