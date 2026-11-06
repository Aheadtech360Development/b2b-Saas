"use client";

/** Small controls the designer panels share. */
import {
  AlignCenterVertical, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, FlipHorizontal2, FlipVertical2,
  Lock, Plus, RotateCcw, RotateCw, Unlock,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { SelectionInfo } from "@/stores/designer.store";
import type { DesignController } from "./controller";
import { luminance } from "@/lib/designer/mockups";
import s from "./designer.module.css";

export function Section({ label, aside, children }: { label?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={s.section}>
      {label && <p className={s.label}><span>{label}</span>{aside}</p>}
      {children}
    </div>
  );
}

export function Swatches({
  colors, value, onPick, allowCustom = true, names,
}: {
  colors: string[];
  value?: string;
  onPick: (hex: string) => void;
  allowCustom?: boolean;
  names?: Record<string, string>;
}) {
  const v = value?.toLowerCase();
  return (
    <div className={s.swatches} role="radiogroup">
      {colors.map((c) => {
        const on = v === c.toLowerCase();
        const name = names?.[c] ?? c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={name}
            title={name}
            className={`${s.swatch} ${on ? s.swatchOn : ""}`}
            style={{ background: c }}
            onClick={() => onPick(c)}
          >
            {on && (
              <span className={s.swatchTick}>
                <Check size={14} strokeWidth={3} color={luminance(c) > 0.5 ? "#15171C" : "#fff"} />
              </span>
            )}
          </button>
        );
      })}
      {allowCustom && (
        // The native picker, invisible over a dashed "+" circle.
        <label className={s.colorPick} data-tip="Any colour">
          <Plus size={15} aria-hidden />
          <input
            type="color"
            aria-label="Pick any colour"
            className={s.colorInput}
            value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "#000000"}
            onChange={(e) => onPick(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

export function Slider({
  label, value, min, max, step = 1, onChange, onCommit, format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  onCommit?: (n: number) => void;
  format?: (n: number) => string;
}) {
  return (
    <div className={s.section}>
      <label className={s.label}>
        <span>{label}</span>
        <span className={s.num}>{format ? format(value) : value}</span>
      </label>
      <input
        className={s.slider}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}

export function Switch({ label, hint, on, onToggle }: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`${s.switchRow} ${s.btnGhost}`} onClick={onToggle}
      style={{ width: "100%", background: "none", font: "inherit", color: "inherit", textAlign: "left" }}>
      <span>
        <strong style={{ display: "block" }}>{label}</strong>
        {hint && <span className={s.hint} style={{ margin: 0 }}>{hint}</span>}
      </span>
      <span className={`${s.switch} ${on ? s.switchOn : ""}`} aria-hidden />
    </button>
  );
}

export function Segment<T extends string>({
  options, value, onChange, label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={s.segment} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? s.segOn : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A number that commits on Enter or when the field loses focus. */
function NumberField({ label, value, step, min, max, suffix, onCommit }: {
  label: string; value: number; step: number; min: number; max: number; suffix: string;
  onCommit: (n: number) => void;
}) {
  return (
    <label className={s.numField}>
      <span className={s.numLabel}>{label}</span>
      <input
        key={value.toFixed(2)}
        className={`${s.input} ${s.num}`}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        defaultValue={Number(value.toFixed(2))}
        onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && Math.abs(n - value) > 0.004) onCommit(Math.min(max, Math.max(min, n))); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      <span className={s.numSuffix}>{suffix}</span>
    </label>
  );
}

/**
 * Size, position, rotation and flip for the selected art, as fields and
 * buttons: everything the handles on the shirt do, without having to aim.
 */
export function ArrangeSection({ sel, ctrl }: { sel: SelectionInfo; ctrl: DesignController | null }) {
  const [lock, setLock] = useState(!sel.stretched);
  const [angle, setAngle] = useState(sel.angle);
  useEffect(() => { setAngle(sel.angle); }, [sel.angle, sel.id]);
  // A newly selected piece starts locked unless it is already stretched.
  useEffect(() => { setLock(!sel.stretched); }, [sel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const small = { minHeight: 36, padding: "0 10px" };
  return (
    <>
      <Section label="Size">
        <div className={s.row}>
          <NumberField label="W" value={sel.widthIn} step={0.1} min={0.2} max={20} suffix="in"
            onCommit={(w) => ctrl?.setSize({ widthIn: w }, lock)} />
          <button type="button" className={`${s.iconBtn} ${lock ? s.lockOn : ""}`} aria-pressed={lock}
            aria-label={lock ? "Unlock proportions" : "Lock proportions"} data-tip={lock ? "Unlock to stretch" : "Keep proportions"}
            onClick={() => setLock(!lock)}>
            {lock ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
          <NumberField label="H" value={sel.heightIn} step={0.1} min={0.2} max={20} suffix="in"
            onCommit={(h) => ctrl?.setSize({ heightIn: h }, lock)} />
        </div>
        <p className={s.hint}>
          {lock ? "Unlock to stretch it wider or taller." : "Width and height change on their own."} The side handles on the shirt stretch it too.
        </p>
      </Section>

      <Section label="Position">
        <div className={s.row}>
          <NumberField label="X" value={sel.xIn} step={0.1} min={-20} max={20} suffix="in" onCommit={(x) => ctrl?.setPosition(x, sel.yIn)} />
          <NumberField label="Y" value={sel.yIn} step={0.1} min={-5} max={25} suffix="in" onCommit={(y) => ctrl?.setPosition(sel.xIn, y)} />
        </div>
        <p className={s.hint}>X is from the centre of the shirt, Y from the top of the print area.</p>
        <div className={s.row} style={{ marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" className={s.iconBtn} aria-label="Move left" data-tip="Move left" onClick={() => ctrl?.nudge(-0.25, 0)}><ArrowLeft size={16} /></button>
          <button type="button" className={s.iconBtn} aria-label="Move right" data-tip="Move right" onClick={() => ctrl?.nudge(0.25, 0)}><ArrowRight size={16} /></button>
          <button type="button" className={s.iconBtn} aria-label="Move up" data-tip="Move up" onClick={() => ctrl?.nudge(0, -0.25)}><ArrowUp size={16} /></button>
          <button type="button" className={s.iconBtn} aria-label="Move down" data-tip="Move down" onClick={() => ctrl?.nudge(0, 0.25)}><ArrowDown size={16} /></button>
          <span className={s.toolbarSep} />
          <button type="button" className={s.btn} style={small} onClick={() => ctrl?.centre("x")}>
            <AlignCenterVertical size={15} /> Centre on shirt
          </button>
        </div>
      </Section>

      <Section label="Rotate" aside={<span className={s.num}>{angle}°</span>}>
        <div className={s.row}>
          <button type="button" className={s.iconBtn} aria-label="Rotate left 15 degrees" data-tip="Rotate left 15°" onClick={() => ctrl?.rotateBy(-15)}><RotateCcw size={16} /></button>
          <input className={`${s.slider} ${s.grow}`} type="range" min={-180} max={180} step={1} value={angle} aria-label="Rotation in degrees"
            onChange={(e) => { const n = Number(e.target.value); setAngle(n); ctrl?.setAngle(n); }} />
          <button type="button" className={s.iconBtn} aria-label="Rotate right 15 degrees" data-tip="Rotate right 15°" onClick={() => ctrl?.rotateBy(15)}><RotateCw size={16} /></button>
        </div>
        <div className={s.row} style={{ marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" className={s.btn} style={small} disabled={angle === 0} onClick={() => ctrl?.setAngle(0)}>Straighten</button>
          <button type="button" className={s.btn} style={small} onClick={() => ctrl?.flip("x")}><FlipHorizontal2 size={15} /> Flip across</button>
          <button type="button" className={s.btn} style={small} onClick={() => ctrl?.flip("y")}><FlipVertical2 size={15} /> Flip upside down</button>
        </div>
      </Section>
    </>
  );
}

/** How a new shirt starts: a copy of the shirt on the stage, or blank. */
export function StartWith({ copy, onChange }: { copy: boolean; onChange: (copy: boolean) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p className={s.label}><span>New shirt starts with</span></p>
      <Segment<"copy" | "blank"> label="New shirt starts with" value={copy ? "copy" : "blank"} onChange={(v) => onChange(v === "copy")}
        options={[{ value: "copy", label: "This shirt's design" }, { value: "blank", label: "Nothing" }]} />
    </div>
  );
}

/** Width of the selection in inches, editable. */
export function WidthField({ widthIn, heightIn, onChange }: { widthIn: number; heightIn: number; onChange: (w: number) => void }) {
  return (
    <Section label="Size on the shirt">
      <div className={s.row}>
        <label className={s.grow}>
          <span className={s.srOnly}>Width in inches</span>
          <input
            key={widthIn.toFixed(2)}
            className={`${s.input} ${s.num}`}
            type="number"
            min={0.5}
            max={16}
            step={0.1}
            defaultValue={widthIn.toFixed(1)}
            onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && Math.abs(n - widthIn) > 0.04) onChange(n); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </label>
        <span className={s.hint} style={{ margin: 0, whiteSpace: "nowrap" }}>
          in wide × <span className={s.num}>{heightIn.toFixed(1)}</span> in tall
        </span>
      </div>
    </Section>
  );
}
