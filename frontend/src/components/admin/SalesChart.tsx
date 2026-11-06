"use client";

/**
 * One number over time, beside the same days just before: the line chart in
 * Home's Sales (Shopify's "over time" card), in the admin's own colours.
 *
 * The days chosen are a solid blue line, the days before a lighter dashed one
 * (the dash says "before" for anyone who cannot tell the two blues apart).
 * A hairline follows the pointer, or the arrow keys, to the nearest step and
 * the box beside it gives both values; the table under the card gives every
 * value without hovering. Empty steps (no visits, so no conversion rate) are
 * gaps, not zeros.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const NOW_COLOR = "#1D5FD6";       // --pc-blue
export const BEFORE_COLOR = "#7FA6EA";    // checked against NOW_COLOR for colour-blind readers
const GRID = "#EEF1F5";                    // --pc-line-soft
const INK_MUTED = "#5F6B7A";               // --pc-muted
const HEIGHT = 240;                        // the plot; the date labels have their own band below
const AXIS_BAND = 28;
const TOP = 10;

export interface ChartSeries {
  values: (number | null)[];
  /** What each step is called in the box: "Sep 7, 2026". */
  names: string[];
  /** The legend's words: "Sep 7 – Nov 6, 2026". */
  legend: string;
}

/** 0 and a few round steps up to at least the largest value. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** A smooth line that never bends past its points (monotone in x). */
export function smoothPath(points: [number, number][]): string {
  const n = points.length;
  if (!n) return "";
  if (n === 1) return `M${points[0]![0]},${points[0]![1]}`;
  const slope = (i: number) => (points[i + 1]![1] - points[i]![1]) / (points[i + 1]![0] - points[i]![0] || 1);
  const t: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope(i - 1), s1 = slope(i);
    t[i] = s0 * s1 <= 0 ? 0 : (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs((s0 + s1) / 2));
  }
  t[0] = n > 2 ? (3 * slope(0) - t[1]!) / 2 : slope(0);
  t[n - 1] = n > 2 ? (3 * slope(n - 2) - t[n - 2]!) / 2 : slope(0);
  // Ends steeper than their segment would overshoot: held to it.
  if (Math.sign(t[0]!) !== Math.sign(slope(0))) t[0] = 0;
  if (Math.sign(t[n - 1]!) !== Math.sign(slope(n - 2))) t[n - 1] = 0;
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!, [x1, y1] = points[i + 1]!;
    const h = (x1 - x0) / 3;
    d += ` C${x0 + h},${y0 + h * t[i]!} ${x1 - h},${y1 - h * t[i + 1]!} ${x1},${y1}`;
  }
  return d;
}

/** The runs of steps that have a value, each drawn as its own line. */
function runs(values: (number | null)[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) { if (cur.length) out.push(cur); cur = []; }
    else cur.push(i);
  });
  if (cur.length) out.push(cur);
  return out;
}

export function SalesChart({ now, before, labels, format, axisFormat, title }: {
  now: ChartSeries;
  before: ChartSeries | null;
  /** The date each step would be written under the chart; as many are
   *  written as fit the width, evenly, never touching. */
  labels: string[];
  format: (v: number) => string;
  axisFormat: (v: number) => string;
  /** Read out for the chart as a whole. */
  title: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const n = Math.max(now.values.length, before?.values.length ?? 0);
  const all = [...now.values, ...(before?.values ?? [])].filter((v): v is number => v !== null && Number.isFinite(v));
  const ticks = niceTicks(Math.max(0, ...all));
  const top = ticks[ticks.length - 1]!;
  const left = Math.max(...ticks.map((t) => axisFormat(t).length)) * 7 + 14;
  const right = 12;
  const plotW = Math.max(40, width - left - right);
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => TOP + HEIGHT - (top ? (v / top) * HEIGHT : 0);
  // About 76px a date ("Sep 28", "Oct 2026"), whatever the screen.
  const room = Math.max(2, Math.floor(plotW / 76));
  const every = Math.max(1, Math.ceil(n / room));

  const lines = (s: ChartSeries) => runs(s.values).map((run) => smoothPath(run.map((i) => [x(i), y(s.values[i]!)])));
  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const i = n <= 1 ? 0 : Math.round(((clientX - r.left - left) / plotW) * (n - 1));
    setAt(Math.max(0, Math.min(n - 1, i)));
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setAt((cur) => Math.max(0, Math.min(n - 1, (cur ?? n - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
    } else if (e.key === "Escape") setAt(null);
  };
  const tipLeft = at === null ? 0 : x(at);
  const flip = tipLeft > width / 2;

  return (
    <div className="pc-chart" data-chart>
      <div ref={box} className="pc-chart-plot" tabIndex={0} role="img" aria-label={`${title}. Use the arrow keys to read each step.`}
        onPointerMove={(e: PointerEvent<HTMLDivElement>) => pick(e.clientX)} onPointerLeave={() => setAt(null)}
        onFocus={() => setAt((cur) => cur ?? Math.max(0, now.values.length - 1))} onBlur={() => setAt(null)} onKeyDown={keys}>
        <svg width={width} height={TOP + HEIGHT + AXIS_BAND} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11.5} fill={INK_MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>{axisFormat(t)}</text>
            </g>
          ))}
          {labels.map((label, i) => label && i % every === 0 ? (
            // The first starts at the axis and one near the right edge ends at it, so neither is cut off.
            <text key={i} x={x(i)} y={TOP + HEIGHT + 20}
              textAnchor={i === 0 && n > 1 ? "start" : x(i) > width - right - 38 ? "end" : "middle"}
              fontSize={11.5} fill={INK_MUTED}>{label}</text>
          ) : null)}
          {before && lines(before).map((d, i) => (
            <path key={`b${i}`} d={d} fill="none" stroke={BEFORE_COLOR} strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" data-line="before" />
          ))}
          {lines(now).map((d, i) => (
            <path key={`n${i}`} d={d} fill="none" stroke={NOW_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" data-line="now" />
          ))}
          {/* A step standing alone has no line to show it: a dot does. */}
          {runs(now.values).filter((r) => r.length === 1).map((r) => (
            <circle key={`s${r[0]}`} cx={x(r[0]!)} cy={y(now.values[r[0]!]!)} r={4} fill={NOW_COLOR} stroke="#fff" strokeWidth={2} />
          ))}
          {at !== null && (
            <g data-crosshair>
              <line x1={x(at)} x2={x(at)} y1={TOP} y2={TOP + HEIGHT} stroke={INK_MUTED} strokeWidth={1} />
              {before && before.values[at] != null && (
                <circle cx={x(at)} cy={y(before.values[at]!)} r={4} fill={BEFORE_COLOR} stroke="#fff" strokeWidth={2} />
              )}
              {now.values[at] != null && <circle cx={x(at)} cy={y(now.values[at]!)} r={4} fill={NOW_COLOR} stroke="#fff" strokeWidth={2} />}
            </g>
          )}
        </svg>
        {at !== null && (
          <div className="pc-chart-tip" role="status" data-tip
            style={{ left: flip ? undefined : tipLeft + 12, right: flip ? width - tipLeft + 12 : undefined }}>
            <Row color={NOW_COLOR} name={now.names[at] ?? ""} value={now.values[at]} format={format} />
            {before && <Row color={BEFORE_COLOR} dashed name={before.names[at] ?? ""} value={before.values[at]} format={format} />}
          </div>
        )}
      </div>
      <div className="pc-chart-legend" data-legend>
        <span><Key color={NOW_COLOR} />{now.legend}</span>
        {before && <span><Key color={BEFORE_COLOR} dashed />{before.legend}</span>}
      </div>
    </div>
  );
}

function Key({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width={18} height={8} aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <line x1={1} x2={17} y1={4} y2={4} stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}

function Row({ color, dashed, name, value, format }: {
  color: string; dashed?: boolean; name: string; value: number | null | undefined; format: (v: number) => string;
}) {
  return (
    <div className="pc-chart-tip-row">
      <Key color={color} dashed={dashed} />
      <b>{value === null || value === undefined ? "–" : format(value)}</b>
      <span>{name}</span>
    </div>
  );
}

/** A small line of the days chosen, for a number's tab. */
export function Sparkline({ values, on }: { values: (number | null)[]; on: boolean }) {
  const w = 64, h = 22;
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const max = Math.max(...nums), min = Math.min(0, ...nums);
  const sx = (i: number) => 1 + (i / Math.max(1, values.length - 1)) * (w - 2);
  const sy = (v: number) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  return (
    <svg width={w} height={h} aria-hidden="true" data-spark>
      {runs(values).map((run, i) => (
        <path key={i} d={smoothPath(run.map((j) => [sx(j), sy(values[j]!)]))} fill="none"
          stroke={on ? NOW_COLOR : "#A3ACB9"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
