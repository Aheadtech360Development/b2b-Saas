"use client";

/**
 * Layout: how a container arranges what is in it, and where a child sits in
 * its container — at the device the canvas is showing.
 *
 * The merchant chooses Flex or Grid and a preset or a few counts; what is
 * stored is that choice (display, columns, rows, gaps…), never CSS, and a
 * tablet or a phone inherits the larger screen's layout until it is changed
 * there. Empty fields show the inherited value in grey.
 */
import type { ReactNode } from "react";
import {
  AlignCenterHorizontal, AlignEndHorizontal, AlignStartHorizontal, ArrowDown, ArrowRight, Columns3, Grid3x3, LayoutGrid,
  Minus, MoveHorizontal, Plus, RotateCcw, StretchHorizontal,
} from "lucide-react";
import type { Breakpoint, BuilderNode, NodeStyle } from "@/lib/builder/types";
import {
  GRID_PRESETS, LAYOUT_CONTAINERS, applyFlex, applyGrid, autoPlace, clearLayout, columnsAt, equalWidths,
  modeAt, ownValue, placeInCell, setAt, setSpan, valueAt,
} from "@/lib/builder/layout";

const DEVICE: Record<Breakpoint, string> = { desktop: "desktop", tablet: "tablet", mobile: "phone" };

function Group({ title, children, onReset }: { title: string; children: ReactNode; onReset?: () => void }) {
  return (
    <div className="sbe-sec">
      <div className="sbe-h">
        <span>{title}</span>
        {onReset && <button type="button" className="sbe-icon sm" title="Back to inherited" aria-label={`Reset ${title.toLowerCase()}`} onClick={onReset}><RotateCcw size={13} /></button>}
      </div>
      {children}
    </div>
  );
}

function Stepper({ label, value, placeholder, min, max, onChange, allowEmpty }: {
  label: string; value: number | undefined; placeholder?: string; min: number; max: number;
  onChange: (v: number | undefined) => void; allowEmpty?: boolean;
}) {
  const shown = value ?? (placeholder !== undefined && placeholder !== "" ? Number(placeholder) : undefined);
  const step = (d: number) => {
    const base = shown ?? (d > 0 ? min - 1 : min + 1);
    const next = Math.max(min, Math.min(max, base + d));
    onChange(next);
  };
  return (
    <div className="sbe-field">
      <label>{label}</label>
      <div className="sbe-row" style={{ gap: 4 }}>
        <button type="button" className="sbe-icon sm" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => step(-1)} disabled={(shown ?? min) <= min && !allowEmpty}><Minus size={13} /></button>
        <input className="sbe-in" style={{ textAlign: "center", height: 30 }} inputMode="numeric" aria-label={label}
               value={value ?? ""} placeholder={placeholder ?? (allowEmpty ? "Auto" : "")}
               onChange={(e) => {
                 const t = e.target.value.trim();
                 if (!t) { onChange(undefined); return; }
                 const n = Math.round(Number(t));
                 if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
               }} />
        <button type="button" className="sbe-icon sm" aria-label={`More ${label.toLowerCase()}`} onClick={() => step(1)} disabled={(shown ?? 0) >= max}><Plus size={13} /></button>
      </div>
    </div>
  );
}

function Choice<T extends string>({ label, value, inherited, options, onChange }: {
  label: string; value: T | undefined; inherited?: string; options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="sbe-field">
      <label>{label}</label>
      <div className="sbe-seg" role="group" aria-label={label} style={{ flexWrap: "wrap", width: "100%" }}>
        {options.map((o) => {
          const on = value === o.value;
          const ghost = !value && inherited === o.value;
          return (
            <button key={o.value} type="button" aria-pressed={on} title={o.label} aria-label={o.label}
                    onClick={() => onChange(on ? undefined : o.value)}
                    style={{ flex: "1 1 0", minWidth: 0, ...(ghost ? { outline: "1px dashed #A5ABB8", outlineOffset: -2 } : {}) }}>
              {o.icon ?? <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{o.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Size({ label, value, placeholder, onChange }: { label: string; value: string | number | undefined; placeholder?: string; onChange: (v: string | undefined) => void }) {
  return (
    <div className="sbe-field">
      <label>{label}</label>
      <input className="sbe-in" value={value === undefined ? "" : String(value)} placeholder={placeholder} aria-label={label}
             onChange={(e) => onChange(e.target.value || undefined)}
             onBlur={(e) => {
               const t = e.target.value.trim();
               if (!t) return;
               if (/^\d+(\.\d+)?$/.test(t)) onChange(`${t}px`);
               else if (!/^\d+(\.\d+)?(px|%|em|rem)$/.test(t)) onChange(undefined);
             }} />
    </div>
  );
}

/** A preset drawn as what it is. */
function PresetTile({ cols, rows, label, active, onClick }: { cols: number; rows: number; label: string; active: boolean; onClick: () => void }) {
  const r = Math.max(1, rows || 1);
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={label} aria-label={label}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 6, borderRadius: 9, cursor: "pointer",
                     border: `1.5px solid ${active ? "#4F46E5" : "#E3E6EC"}`, background: active ? "#EEF2FF" : "#fff", minWidth: 0 }}>
      <span aria-hidden style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 2, width: 40, height: 26 }}>
        {Array.from({ length: cols * r }, (_, i) => (
          <span key={i} style={{ background: active ? "#818CF8" : "#C9CED8", borderRadius: 2, opacity: rows ? 1 : (i < cols ? 1 : 0.35) }} />
        ))}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: "#3B404B", whiteSpace: "nowrap" }}>{label.replace(" columns", " cols")}</span>
    </button>
  );
}

const ALIGN_ITEMS = [
  { value: "start", label: "Start", icon: <AlignStartHorizontal size={15} /> },
  { value: "center", label: "Center", icon: <AlignCenterHorizontal size={15} /> },
  { value: "end", label: "End", icon: <AlignEndHorizontal size={15} /> },
  { value: "stretch", label: "Stretch", icon: <StretchHorizontal size={15} /> },
] as const;

const JUSTIFY = [
  { value: "flex-start", label: "Start" }, { value: "center", label: "Center" }, { value: "flex-end", label: "End" },
  { value: "space-between", label: "Between" }, { value: "space-around", label: "Around" }, { value: "space-evenly", label: "Evenly" },
] as const;

export function ContainerLayout({ node, device, onChange }: { node: BuilderNode; device: Breakpoint; onChange: (n: BuilderNode) => void }) {
  if (!LAYOUT_CONTAINERS.has(node.type)) return null;
  const mode = modeAt(node, device);
  const own = (k: keyof NodeStyle) => ownValue(node, device, k);
  const inh = (k: keyof NodeStyle) => {
    const own0 = own(k);
    const v = valueAt(node, device, k);
    return own0 === undefined && v !== undefined ? String(v) : undefined;
  };
  const set = (patch: Partial<Record<keyof NodeStyle, string | number | undefined>>) => onChange(setAt(node, device, patch));
  const cols = columnsAt(node, device);
  const rows = Number(valueAt(node, device, "gridRows") ?? 0) || 0;
  const fit = valueAt(node, device, "gridAuto");
  const kids = node.children?.length ?? 0;

  return (
    <>
      <Group title={`Layout · ${DEVICE[device]}`} onReset={device === "desktop" ? undefined : () => onChange(clearLayout(node, device))}>
        <div className="sbe-seg" role="group" aria-label="Layout" style={{ width: "100%" }}>
          {(["default", "flex", "grid"] as const).map((m) => {
            const on = m === "default" ? !valueAt(node, device, "display") : valueAt(node, device, "display") === m;
            return (
              <button key={m} type="button" aria-pressed={on} style={{ flex: 1 }}
                      onClick={() => {
                        if (m === "default") onChange(clearLayout(node, device));
                        else if (m === "flex") onChange(applyFlex(node, device, (valueAt(node, device, "flexDirection") as "row" | "column") || "row"));
                        else onChange(applyGrid(node, device, cols ?? 3, rows, device === "desktop" && kids === 0));
                      }}>
                {m === "default" ? "Default" : m === "flex" ? "Flex" : "Grid"}
              </button>
            );
          })}
        </div>
        <div className="sbe-help" style={{ marginTop: 6 }}>
          {!valueAt(node, device, "display")
            ? `Laid out the ${node.type === "stack" ? "way a stack is" : node.type === "row" ? "way columns are" : "usual way"}.`
            : device !== "desktop" && !own("display")
              ? `Same as the larger screen. Change anything here to make the ${DEVICE[device]} different.`
              : mode === "grid" ? "Children sit in cells. Drag one onto a cell to place it, or drag its corner to span cells." : "Children sit in a line that can wrap."}
        </div>
      </Group>

      {mode === "grid" && valueAt(node, device, "display") === "grid" && (
        <>
          <Group title="Grid">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6, marginBottom: 12 }}>
              {GRID_PRESETS.map((p) => (
                <PresetTile key={p.key} cols={p.cols} rows={p.rows} label={p.label}
                            active={!fit && cols === p.cols && rows === p.rows}
                            onClick={() => onChange(applyGrid(node, device, p.cols, p.rows, device === "desktop"))} />
              ))}
            </div>
            <Choice label="Columns" value={(own("gridAuto") ? "fit" : own("gridColumns") !== undefined ? "fixed" : undefined) as "fit" | "fixed" | undefined}
                    inherited={fit ? "fit" : "fixed"}
                    options={[{ value: "fixed", label: "Fixed count" }, { value: "fit", label: "Fit to width" }]}
                    onChange={(v) => set(v === "fit" ? { gridAuto: "fit", gridMin: own("gridMin") ?? "240px" } : { gridAuto: undefined, gridMin: undefined, gridColumns: cols ?? 3 })} />
            {fit ? (
              <Size label="Smallest card width" value={own("gridMin")} placeholder={inh("gridMin") ?? "240px"} onChange={(v) => set({ gridMin: v })} />
            ) : (
              <div className="sbe-grid2">
                <Stepper label="Columns" value={own("gridColumns") as number | undefined} placeholder={cols !== null ? String(cols) : undefined}
                         min={1} max={12} onChange={(v) => set({ gridColumns: v, display: "grid" })} />
                <Stepper label="Rows" value={own("gridRows") as number | undefined} placeholder={rows ? String(rows) : "Auto"}
                         min={0} max={12} allowEmpty onChange={(v) => set({ gridRows: v === 0 ? undefined : v })} />
              </div>
            )}
            {device === "desktop" && !fit && cols !== null && kids < cols * Math.max(1, rows) && (
              <button type="button" className="sbe-btn sm" style={{ width: "100%", marginBottom: 12 }}
                      onClick={() => onChange(applyGrid(node, device, cols, rows, true))}>
                <LayoutGrid size={13} /> Add {cols * Math.max(1, rows) - kids} empty {cols * Math.max(1, rows) - kids === 1 ? "cell" : "cells"} to drop into
              </button>
            )}
            <div className="sbe-grid2">
              <Size label="Space across" value={own("columnGap") ?? own("gap")} placeholder={inh("columnGap") ?? inh("gap") ?? "16px"} onChange={(v) => set({ columnGap: v })} />
              <Size label="Space down" value={own("rowGap")} placeholder={inh("rowGap") ?? inh("gap") ?? "16px"} onChange={(v) => set({ rowGap: v })} />
            </div>
            <Choice label="Line up in cells (vertically)" value={own("alignItems") as typeof ALIGN_ITEMS[number]["value"] | undefined}
                    inherited={inh("alignItems") ?? "stretch"} options={[...ALIGN_ITEMS]} onChange={(v) => set({ alignItems: v })} />
            <Choice label="Line up in cells (across)" value={own("justifyItems") as typeof ALIGN_ITEMS[number]["value"] | undefined}
                    inherited={inh("justifyItems") ?? "stretch"} options={[...ALIGN_ITEMS]} onChange={(v) => set({ justifyItems: v })} />
            <Choice label="Fill order" value={own("gridAutoFlow") as "row" | "column" | "row dense" | undefined} inherited={inh("gridAutoFlow") ?? "row"}
                    options={[{ value: "row", label: "Rows" }, { value: "column", label: "Columns" }, { value: "row dense", label: "Fill gaps" }]}
                    onChange={(v) => set({ gridAutoFlow: v })} />
            <div className="sbe-field">
              <label>Column widths (optional)</label>
              <input className="sbe-in" value={String(own("gridTemplate") ?? "")} placeholder={inh("gridTemplate") ?? "e.g. 2fr 1fr — leave empty for equal"}
                     aria-label="Column widths" onChange={(e) => set({ gridTemplate: e.target.value || undefined })} />
              <div className="sbe-help">Shares like <b>2fr 1fr</b>, sizes like <b>240px 1fr</b>. Empty makes every column equal.</div>
            </div>
          </Group>
        </>
      )}

      {mode === "flex" && valueAt(node, device, "display") === "flex" && (
        <Group title="Flex">
          <Choice label="Direction" value={own("flexDirection") as "row" | "column" | undefined} inherited={inh("flexDirection") ?? "row"}
                  options={[{ value: "row", label: "Across", icon: <ArrowRight size={15} /> }, { value: "column", label: "Down", icon: <ArrowDown size={15} /> }]}
                  onChange={(v) => set({ flexDirection: v })} />
          <Choice label="Wrap to a new line" value={own("flexWrap") as "wrap" | "nowrap" | undefined} inherited={inh("flexWrap") ?? "nowrap"}
                  options={[{ value: "wrap", label: "On" }, { value: "nowrap", label: "Off" }]} onChange={(v) => set({ flexWrap: v })} />
          <Choice label="Spread" value={own("justifyContent") as typeof JUSTIFY[number]["value"] | undefined} inherited={inh("justifyContent") ?? "flex-start"}
                  options={[...JUSTIFY]} onChange={(v) => set({ justifyContent: v })} />
          <Choice label="Line up" value={own("alignItems") as "flex-start" | "center" | "flex-end" | "stretch" | undefined} inherited={inh("alignItems") ?? "stretch"}
                  options={[{ value: "flex-start", label: "Start" }, { value: "center", label: "Center" }, { value: "flex-end", label: "End" }, { value: "stretch", label: "Stretch" }]}
                  onChange={(v) => set({ alignItems: v })} />
          <div className="sbe-grid2">
            <Size label="Space between" value={own("gap")} placeholder={inh("gap") ?? "0"} onChange={(v) => set({ gap: v })} />
            <Size label="Space between lines" value={own("rowGap")} placeholder={inh("rowGap") ?? inh("gap") ?? "0"} onChange={(v) => set({ rowGap: v })} />
          </div>
          {kids > 1 && (
            <div className="sbe-row" style={{ gap: 6 }}>
              <button type="button" className="sbe-btn sm" style={{ flex: 1 }} onClick={() => onChange(equalWidths(node, device, true))}><Columns3 size={13} /> Equal widths</button>
              <button type="button" className="sbe-btn sm" style={{ flex: 1 }} onClick={() => onChange(equalWidths(node, device, false))}><MoveHorizontal size={13} /> Natural widths</button>
            </div>
          )}
        </Group>
      )}
    </>
  );
}

/** Where a child sits in a grid or a flex row — shown when its parent is one. */
export function ItemPlacement({ node, parent, device, onChange, onParentChange }: {
  node: BuilderNode; parent: BuilderNode | null; device: Breakpoint;
  onChange: (n: BuilderNode) => void; onParentChange: (p: BuilderNode) => void;
}) {
  if (!parent) return null;
  const mode = modeAt(parent, device);
  const own = (k: keyof NodeStyle) => ownValue(node, device, k);
  const inh = (k: keyof NodeStyle) => (own(k) === undefined && valueAt(node, device, k) !== undefined ? String(valueAt(node, device, k)) : undefined);
  const set = (patch: Partial<Record<keyof NodeStyle, string | number | undefined>>) => onChange(setAt(node, device, patch));
  if (mode === "grid") {
    const cols = columnsAt(parent, device) ?? 12;
    const rows = Number(valueAt(parent, device, "gridRows") ?? 0) || 0;
    const placed = valueAt(node, device, "gridColumn") !== undefined || valueAt(node, device, "gridRow") !== undefined;
    return (
      <Group title={`In the grid · ${DEVICE[device]}`} onReset={() => onChange(autoPlace(node, device))}>
        <div className="sbe-help" style={{ marginBottom: 8 }}>
          {placed ? "Placed in a cell by hand. The other items arrange themselves around it." : "Flows into the next free cell. Pick a cell to pin it there."}
        </div>
        <div className="sbe-grid2">
          <div className="sbe-field"><label>Column</label>
            <select className="sbe-in" value={String(own("gridColumn") ?? "")} aria-label="Column"
                    onChange={(e) => {
                      const col = e.target.value ? Number(e.target.value) : undefined;
                      if (col === undefined) set({ gridColumn: undefined });
                      else onParentChange(placeAndKeepRow(parent, node, device, col, undefined));
                    }}>
              <option value="">{inh("gridColumn") ? `As larger (${inh("gridColumn")})` : "Next free"}</option>
              {Array.from({ length: cols }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div className="sbe-field"><label>Row</label>
            <select className="sbe-in" value={String(own("gridRow") ?? "")} aria-label="Row"
                    onChange={(e) => {
                      const row = e.target.value ? Number(e.target.value) : undefined;
                      if (row === undefined) set({ gridRow: undefined });
                      else onParentChange(placeAndKeepRow(parent, node, device, undefined, row));
                    }}>
              <option value="">{inh("gridRow") ? `As larger (${inh("gridRow")})` : "Next free"}</option>
              {Array.from({ length: Math.max(rows, 6) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <Stepper label="Columns wide" value={own("gridColumnSpan") as number | undefined} placeholder={inh("gridColumnSpan") ?? "1"} min={1} max={cols}
                   onChange={(v) => onParentChange(setSpan(parent, node.id, device, v ?? 1, Number(valueAt(node, device, "gridRowSpan") ?? 1)))} />
          <Stepper label="Rows tall" value={own("gridRowSpan") as number | undefined} placeholder={inh("gridRowSpan") ?? "1"} min={1} max={12}
                   onChange={(v) => onParentChange(setSpan(parent, node.id, device, Number(valueAt(node, device, "gridColumnSpan") ?? 1), v ?? 1))} />
        </div>
        <Choice label="Line up in its cell" value={own("alignSelf") as "start" | "center" | "end" | "stretch" | undefined} inherited={inh("alignSelf")}
                options={[...ALIGN_ITEMS]} onChange={(v) => set({ alignSelf: v })} />
        <button type="button" className="sbe-btn sm" style={{ width: "100%" }} onClick={() => onChange(autoPlace(node, device))}>
          <Grid3x3 size={13} /> Let it flow with the others
        </button>
      </Group>
    );
  }
  if (mode === "flex") {
    return (
      <Group title={`In the row · ${DEVICE[device]}`} onReset={() => set({ flexGrow: undefined, flexShrink: undefined, flexBasis: undefined, alignSelf: undefined, order: undefined })}>
        <Choice label="Width" value={(own("flexGrow") !== undefined ? (Number(own("flexGrow")) > 0 ? "fill" : "fixed") : undefined) as "fill" | "fixed" | undefined}
                inherited={Number(valueAt(node, device, "flexGrow") ?? 0) > 0 ? "fill" : "fixed"}
                options={[{ value: "fixed", label: "Its own" }, { value: "fill", label: "Share the space" }]}
                onChange={(v) => set(v === "fill" ? { flexGrow: 1, flexBasis: own("flexBasis") ?? 0 } : v === "fixed" ? { flexGrow: 0, flexBasis: undefined } : { flexGrow: undefined, flexBasis: undefined })} />
        <div className="sbe-grid2">
          <Size label="Starting width" value={own("flexBasis")} placeholder={inh("flexBasis") ?? "auto"} onChange={(v) => set({ flexBasis: v })} />
          <Size label="Smallest width" value={own("minWidth")} placeholder={inh("minWidth") ?? "0"} onChange={(v) => set({ minWidth: v })} />
        </div>
        <Choice label="Shrink when tight" value={(own("flexShrink") !== undefined ? (Number(own("flexShrink")) > 0 ? "yes" : "no") : undefined) as "yes" | "no" | undefined}
                inherited="yes" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                onChange={(v) => set({ flexShrink: v === "no" ? 0 : v === "yes" ? 1 : undefined })} />
        <Choice label="Line up" value={own("alignSelf") as "flex-start" | "center" | "flex-end" | "stretch" | undefined} inherited={inh("alignSelf")}
                options={[{ value: "flex-start", label: "Start" }, { value: "center", label: "Center" }, { value: "flex-end", label: "End" }, { value: "stretch", label: "Stretch" }]}
                onChange={(v) => set({ alignSelf: v })} />
        <Stepper label="Order" value={own("order") as number | undefined} placeholder={inh("order") ?? "0"} min={-20} max={20} onChange={(v) => set({ order: v })} />
      </Group>
    );
  }
  return null;
}

/** Pin to a column or a row, keeping whichever of the two is already set. */
function placeAndKeepRow(parent: BuilderNode, node: BuilderNode, bp: Breakpoint, col: number | undefined, row: number | undefined): BuilderNode {
  const c = col ?? Number(valueAt(node, bp, "gridColumn") ?? 1);
  const r = row ?? Number(valueAt(node, bp, "gridRow") ?? 1);
  // placeInCell handles a hand-placed item already in that cell (it swaps).
  return placeInCell(parent, node.id, bp, c, r);
}
