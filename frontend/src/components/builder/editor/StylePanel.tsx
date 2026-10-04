"use client";

/**
 * An element's look, at the device the canvas is showing.
 *
 * Desktop settings are the element's own; tablet and phone settings are
 * overrides on top of them, and a field left empty on a phone shows the
 * desktop value in grey — that is what the phone gets. Clearing a value puts
 * it back to what it inherits.
 */
import type { ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Italic, RotateCcw } from "lucide-react";
import type { Breakpoint, BuilderNode, NodeStyle, SiteSettings } from "@/lib/builder/types";
import type { ComponentDef } from "@/lib/builder/registry";
import { availableFamilies } from "@/lib/builder/fonts";
import { ImageField, type EditorEnv } from "./fields";

type Key = keyof NodeStyle;
const BP_KEY: Record<Breakpoint, "style" | "tablet" | "mobile"> = { desktop: "style", tablet: "tablet", mobile: "mobile" };
const SIZE_OK = /^(-?\d+(\.\d+)?(px|%|em|rem|vh|vw|cqi|ch)?|auto|none|0)$/;

function normal(v: string): string | number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) return `${t}px`;
  return t;
}

function Group({ title, children, onReset }: { title: string; children: ReactNode; onReset?: () => void }) {
  return (
    <div className="sbe-sec">
      <div className="sbe-h">
        <span>{title}</span>
        {onReset && <button type="button" className="sbe-icon sm" title="Clear these settings" aria-label={`Clear ${title.toLowerCase()}`} onClick={onReset}><RotateCcw size={13} /></button>}
      </div>
      {children}
    </div>
  );
}

export function StylePanel({ node, def, device, settings, env, onChange }: {
  node: BuilderNode; def: ComponentDef | undefined; device: Breakpoint; settings: SiteSettings; env: EditorEnv;
  onChange: (next: BuilderNode) => void;
}) {
  const bp = BP_KEY[device];
  const own: NodeStyle = node[bp] ?? {};
  const inherited: NodeStyle = device === "desktop" ? {} : device === "tablet" ? (node.style ?? {}) : { ...(node.style ?? {}), ...(node.tablet ?? {}) };

  const get = (k: Key): string => (own[k] === undefined ? "" : String(own[k]));
  const hint = (k: Key, fallback = ""): string => (inherited[k] === undefined ? fallback : String(inherited[k]));
  const set = (patch: Partial<Record<Key, string | number | undefined>>) => {
    const next: NodeStyle = { ...own };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") delete next[k as Key];
      else next[k as Key] = v;
    }
    const out: BuilderNode = { ...node };
    if (Object.keys(next).length) out[bp] = next; else delete out[bp];
    onChange(out);
  };
  const clear = (keys: Key[]) => set(Object.fromEntries(keys.map((k) => [k, undefined])));

  const size = (k: Key, label: string, placeholder = "") => (
    <div className="sbe-field">
      <label>{label}</label>
      <input className="sbe-in" value={get(k)} placeholder={hint(k, placeholder)} aria-label={label}
             onChange={(e) => set({ [k]: e.target.value })}
             onBlur={(e) => { const v = normal(e.target.value); set({ [k]: typeof v === "string" && !SIZE_OK.test(v) && !/^calc\(/.test(v) ? undefined : v }); }} />
    </div>
  );

  const color = (k: Key, label: string) => {
    const value = get(k);
    return (
      <div className="sbe-field">
        <label>{label}</label>
        <div className="sbe-color">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{6}$/i.test(hint(k)) ? hint(k) : "#000000"}
                 onChange={(e) => set({ [k]: e.target.value })} aria-label={label} />
          <input className="sbe-in" value={value} placeholder={hint(k, "Theme")} onChange={(e) => set({ [k]: e.target.value })} aria-label={`${label} value`} />
        </div>
        <div className="sbe-swatches">
          {Object.entries(env.themeColors).map(([name, hex]) => (
            <button key={name} type="button" className="sbe-swatch" title={`Theme ${name}`} aria-label={`Theme ${name}`}
                    style={{ background: hex }} onClick={() => set({ [k]: `var(--b-${name})` })} />
          ))}
        </div>
      </div>
    );
  };

  const box = (prefix: "padding" | "margin", label: string) => {
    const sides = ["Top", "Right", "Bottom", "Left"] as const;
    return (
      <div className="sbe-field">
        <label>{label}</label>
        <div className="sbe-grid4">
          {sides.map((s) => {
            const k = `${prefix}${s}` as Key;
            return (
              <div key={s} className="sbe-mini">
                <input className="sbe-in" value={get(k)} placeholder={hint(k, "0")} aria-label={`${label} ${s.toLowerCase()}`}
                       onChange={(e) => set({ [k]: e.target.value })}
                       onBlur={(e) => { const v = normal(e.target.value); set({ [k]: typeof v === "string" && !SIZE_OK.test(v) ? undefined : v }); }} />
                <span>{s}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const select = (k: Key, label: string, options: [string, string][]) => (
    <div className="sbe-field">
      <label>{label}</label>
      <select className="sbe-in" value={get(k)} aria-label={label} onChange={(e) => set({ [k]: e.target.value })}>
        <option value="">{hint(k) ? `As ${device === "mobile" ? "tablet/desktop" : "desktop"} (${hint(k)})` : "Default"}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  const groups = new Set(def?.styles ?? ["spacing"]);
  const families = availableFamilies(settings.fonts);
  const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];

  return (
    <div>
      {device !== "desktop" && (
        <div className="sbe-sec" style={{ paddingBottom: 0 }}>
          <div className="sbe-note">
            Changes here apply on {device === "tablet" ? "tablets and phones" : "phones"} only. Empty fields use the
            {device === "tablet" ? " desktop" : " larger screen's"} setting, shown in grey.
          </div>
        </div>
      )}

      {groups.has("typography") && (
        <Group title="Text" onReset={() => clear(["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "textTransform", "fontStyle", "color", "textDecoration"])}>
          <div className="sbe-field">
            <label>Font</label>
            <select className="sbe-in" value={get("fontFamily")} aria-label="Font" onChange={(e) => set({ fontFamily: e.target.value })}>
              <option value="">{hint("fontFamily") ? `As larger screens (${hint("fontFamily")})` : "Theme font"}</option>
              {families.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="sbe-help">Add more fonts under Theme → Fonts.</div>
          </div>
          <div className="sbe-grid2">
            {size("fontSize", "Size", "Theme")}
            <div className="sbe-field">
              <label>Weight</label>
              <select className="sbe-in" value={get("fontWeight")} aria-label="Weight" onChange={(e) => set({ fontWeight: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">{hint("fontWeight") || "Theme"}</option>
                {weights.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="sbe-field">
              <label>Line height</label>
              <input className="sbe-in" value={get("lineHeight")} placeholder={hint("lineHeight", "1.5")} aria-label="Line height"
                     onChange={(e) => set({ lineHeight: e.target.value && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value })} />
            </div>
            <div className="sbe-field">
              <label>Letter spacing</label>
              <input className="sbe-in" value={get("letterSpacing")} placeholder={hint("letterSpacing", "0em")} aria-label="Letter spacing"
                     onChange={(e) => set({ letterSpacing: e.target.value })}
                     onBlur={(e) => { const t = e.target.value.trim(); set({ letterSpacing: /^-?\d+(\.\d+)?$/.test(t) ? `${t}em` : (/^-?\d+(\.\d+)?(em|px)$/.test(t) ? t : undefined) }); }} />
            </div>
          </div>
          <div className="sbe-field">
            <label>Align</label>
            <div className="sbe-row">
              <div className="sbe-seg">
                {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([v, Icon]) => (
                  <button key={v} type="button" aria-label={`Align ${v}`} aria-pressed={get("textAlign") === v}
                          onClick={() => set({ textAlign: get("textAlign") === v ? undefined : v })}><Icon size={15} /></button>
                ))}
              </div>
              <div className="sbe-seg">
                <button type="button" aria-label="Italic" aria-pressed={get("fontStyle") === "italic"}
                        onClick={() => set({ fontStyle: get("fontStyle") === "italic" ? undefined : "italic" })}><Italic size={15} /></button>
              </div>
            </div>
          </div>
          {select("textTransform", "Capitals", [["none", "As typed"], ["uppercase", "ALL CAPITALS"], ["capitalize", "Each Word"], ["lowercase", "lowercase"]])}
          {color("color", "Text colour")}
        </Group>
      )}

      {groups.has("columns") && (
        <Group title="Columns" onReset={() => clear(["columns", "gap"])}>
          <div className="sbe-grid2">
            <div className="sbe-field">
              <label>Across</label>
              <select className="sbe-in" value={get("columns")} aria-label="Columns across" onChange={(e) => set({ columns: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">{hint("columns") ? `As larger (${hint("columns")})` : "Default"}</option>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {size("gap", "Space between", "24px")}
          </div>
          {node.type === "row" && select("alignItems", "Line up columns", [["start", "At the top"], ["center", "In the middle"], ["end", "At the bottom"], ["stretch", "Same height"]])}
        </Group>
      )}

      {groups.has("layout") && (
        <Group title="Arrangement" onReset={() => clear(["justifyContent", "alignItems", "gap", "flexWrap"])}>
          {node.type === "stack" || node.type === "menu" ? (
            <>
              {select("justifyContent", "Spread", [["flex-start", "From the start"], ["center", "Centred"], ["flex-end", "To the end"], ["space-between", "Spread out"]])}
              {select("alignItems", "Line up", [["flex-start", "Start"], ["center", "Middle"], ["flex-end", "End"], ["stretch", "Full width"]])}
              {size("gap", "Space between", "12px")}
              {select("flexWrap", "When it runs out of room", [["wrap", "Wrap to a new line"], ["nowrap", "Stay on one line"]])}
            </>
          ) : (
            <>
              {size("gap", "Space between items", "")}
              <div className="sbe-help">Sections hold their content in the site&apos;s width. Use Columns or a Stack inside for side-by-side layouts.</div>
            </>
          )}
        </Group>
      )}

      {groups.has("spacing") && (
        <Group title="Spacing" onReset={() => clear(["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft"])}>
          {box("padding", "Inside (padding)")}
          {box("margin", "Outside (margin)")}
        </Group>
      )}

      {groups.has("background") && (
        <Group title="Background" onReset={() => clear(["backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition", "backgroundRepeat"])}>
          {color("backgroundColor", "Colour")}
          <div className="sbe-field">
            <label>Picture</label>
            <ImageField env={env}
                        value={(/url\("?([^")]+)"?\)/.exec(get("backgroundImage"))?.[1]) ?? ""}
                        onChange={(url) => set(url ? { backgroundImage: `url(${url})`, backgroundSize: get("backgroundSize") || "cover", backgroundPosition: get("backgroundPosition") || "center" }
                                                   : { backgroundImage: undefined })} />
          </div>
          {get("backgroundImage") && (
            <div className="sbe-grid2">
              {select("backgroundSize", "Fit", [["cover", "Fill"], ["contain", "Whole picture"], ["auto", "Actual size"]])}
              {select("backgroundPosition", "Focus", [["center", "Centre"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]])}
            </div>
          )}
        </Group>
      )}

      {groups.has("border") && (
        <Group title="Border & corners" onReset={() => clear(["borderWidth", "borderStyle", "borderColor", "borderRadius", "boxShadow"])}>
          <div className="sbe-grid2">
            {size("borderWidth", "Border", "0")}
            {select("borderStyle", "Line", [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["none", "None"]])}
          </div>
          {get("borderWidth") && color("borderColor", "Border colour")}
          {size("borderRadius", "Rounded corners", "0")}
          {select("boxShadow", "Shadow", [
            ["none", "None"], ["0 1px 3px rgba(20,22,27,.10)", "Subtle"],
            ["0 8px 24px rgba(20,22,27,.12)", "Soft"], ["0 18px 48px rgba(20,22,27,.18)", "Strong"],
          ])}
        </Group>
      )}

      {groups.has("size") && (
        <Group title="Size" onReset={() => clear(["width", "maxWidth", "minHeight", "height", "aspectRatio", "objectFit", "overflow"])}>
          <div className="sbe-grid2">
            {size("width", "Width", "auto")}
            {size("maxWidth", "Widest", "none")}
            {size("minHeight", "Least height", "auto")}
            {size("height", "Height", "auto")}
          </div>
          {select("aspectRatio", "Shape", [["1 / 1", "Square"], ["4 / 3", "4:3"], ["3 / 2", "3:2"], ["16 / 9", "Wide 16:9"], ["21 / 9", "Banner 21:9"], ["3 / 4", "Portrait 3:4"]])}
        </Group>
      )}

      {!groups.size && <div className="sbe-empty">This element has no style settings.</div>}
    </div>
  );
}
