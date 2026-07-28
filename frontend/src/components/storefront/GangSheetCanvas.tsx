"use client";

/**
 * GangSheetCanvas — drag-drop sheet layout editor (gang sheet Phase 2 + 3).
 *
 * Renders the sheet to scale with its bleed margin and a snap grid. Placements
 * can be dragged, resized from the corner, rotated 90°, and removed. "Auto-nest"
 * packs every copy to use the least sheet length. Batch-1 power features layered
 * on top without changing the component's contract: undo/redo history, zoom
 * (buttons + wheel), keyboard shortcuts, aspect-ratio lock (Shift = free resize),
 * and copy/paste.
 *
 * Coordinates are inches from the sheet's top-left — the units the API stores and
 * the print file uses — converted to pixels only for display. Drag/resize use
 * window-level pointer listeners so a fast pointer never escapes the element.
 *
 * Controlled: the parent owns `value` and receives `onChange`. History lives
 * inside the canvas; discrete edits `commit` (record + emit) while a continuous
 * gesture emits live frames and records a single history entry on release, so
 * undo steps by gesture and 100+ pieces stay responsive.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { GangSheetArtwork } from "@/services/gangSheets.service";

export interface Placement {
  artwork_id: string;
  x_in: number;
  y_in: number;
  rotation: number; // 0 | 90
  w_in: number;     // artwork's own width  (before rotation)
  h_in: number;     // artwork's own height (before rotation)
}

interface Sheet {
  width_in: number;
  height_in: number;
  bleed_in: number;
  spacing_in: number;
}

interface Props {
  sheet: Sheet;
  artworks: GangSheetArtwork[];
  value: Placement[];
  onChange: (next: Placement[]) => void;
  readOnly?: boolean;
}

const IMAGE_TYPES = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const MIN_IN = 0.5;
const HISTORY_LIMIT = 120; // ≥ 100 actions as specified

function footprint(p: Placement): { w: number; h: number } {
  return p.rotation % 180 === 0 ? { w: p.w_in, h: p.h_in } : { w: p.h_in, h: p.w_in };
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

export function GangSheetCanvas({ sheet, artworks, value, onChange, readOnly }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitPpi, setFitPpi] = useState(10);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);

  const ppi = fitPpi * zoom;

  // ── History (undo/redo) ─────────────────────────────────────────────────────
  const historyRef = useRef<Placement[][]>([value]);
  const ptrRef = useRef(0);
  const clipboardRef = useRef<Placement | null>(null);
  const [, forceHud] = useState(0); // re-render undo/redo button enabled state

  // If the parent swaps `value` from outside our flow (e.g. loading a saved
  // layout), reseed history so undo doesn't reach into another order's state.
  const lastEmittedRef = useRef<Placement[]>(value);
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      historyRef.current = [value];
      ptrRef.current = 0;
      lastEmittedRef.current = value;
      forceHud((n) => n + 1);
    }
  }, [value]);

  const emit = useCallback((next: Placement[]) => {
    lastEmittedRef.current = next;
    onChange(next);
  }, [onChange]);

  const recordHistory = useCallback((next: Placement[]) => {
    const h = historyRef.current.slice(0, ptrRef.current + 1);
    h.push(next);
    if (h.length > HISTORY_LIMIT) h.shift();
    historyRef.current = h;
    ptrRef.current = h.length - 1;
    forceHud((n) => n + 1);
  }, []);

  const commit = useCallback((next: Placement[]) => {
    recordHistory(next);
    emit(next);
  }, [recordHistory, emit]);

  const undo = useCallback(() => {
    if (ptrRef.current <= 0) return;
    ptrRef.current -= 1;
    emit(historyRef.current[ptrRef.current]!);
    setSelected(null);
    forceHud((n) => n + 1);
  }, [emit]);

  const redo = useCallback(() => {
    if (ptrRef.current >= historyRef.current.length - 1) return;
    ptrRef.current += 1;
    emit(historyRef.current[ptrRef.current]!);
    setSelected(null);
    forceHud((n) => n + 1);
  }, [emit]);

  const canUndo = ptrRef.current > 0;
  const canRedo = ptrRef.current < historyRef.current.length - 1;

  // Latest props/state for the window + wheel + key listeners.
  const stateRef = useRef({ value, ppi, snap, sheet, selected });
  stateRef.current = { value, ppi, snap, sheet, selected };

  const artById = useCallback((id: string) => artworks.find((a) => a.id === id), [artworks]);
  const remainingFor = useCallback(
    (id: string) => (artworks.find((a) => a.id === id)?.quantity ?? 0) - value.filter((p) => p.artwork_id === id).length,
    [artworks, value]
  );

  useEffect(() => {
    function fit() {
      const avail = scrollRef.current?.clientWidth ?? 640;
      setFitPpi(Math.max(3, Math.min(48, avail / sheet.width_in)));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [sheet.width_in]);

  const sheetWpx = sheet.width_in * ppi;
  const sheetHpx = sheet.height_in * ppi;
  const bleedPx = sheet.bleed_in * ppi;

  function clampSnap(xIn: number, yIn: number, fw: number, fh: number) {
    const { snap: s, sheet: sh } = stateRef.current;
    let x = clamp(xIn, 0, sh.width_in - fw);
    let y = clamp(yIn, 0, sh.height_in - fh);
    if (s && sh.spacing_in > 0) {
      const g = sh.spacing_in;
      x = clamp(Math.round(x / g) * g, 0, sh.width_in - fw);
      y = clamp(Math.round(y / g) * g, 0, sh.height_in - fh);
    }
    return { x: round3(x), y: round3(y) };
  }

  // ── Drag (move) ─────────────────────────────────────────────────────────────
  function startMove(e: React.PointerEvent, index: number) {
    if (readOnly) return;
    e.preventDefault(); e.stopPropagation();
    setSelected(index);
    wrapRef.current?.focus();
    const startX = e.clientX, startY = e.clientY;
    const orig = stateRef.current.value[index]!;
    const ox = orig.x_in, oy = orig.y_in;
    let moved = false;

    function move(ev: PointerEvent) {
      moved = true;
      const { ppi: p, value: v } = stateRef.current;
      const fp = footprint(v[index]!);
      const { x, y } = clampSnap(ox + (ev.clientX - startX) / p, oy + (ev.clientY - startY) / p, fp.w, fp.h);
      emit(v.map((it, i) => (i === index ? { ...it, x_in: x, y_in: y } : it)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) recordHistory(stateRef.current.value); // one undo entry per drag
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── Resize (corner) — proportional by default, free while Shift held ────────
  function startResize(e: React.PointerEvent, index: number) {
    if (readOnly) return;
    e.preventDefault(); e.stopPropagation();
    setSelected(index);
    const startX = e.clientX, startY = e.clientY;
    const orig = stateRef.current.value[index]!;
    const origFp = footprint(orig);
    const rotated = orig.rotation % 180 !== 0;
    let changed = false;

    function move(ev: PointerEvent) {
      changed = true;
      const { ppi: p, value: v, sheet: sh } = stateRef.current;
      const cur = v[index]!;
      const dxIn = (ev.clientX - startX) / p;
      const dyIn = (ev.clientY - startY) / p;
      let baseW: number, baseH: number;
      if (ev.shiftKey) {
        // Free: width and height move independently, clamped to the sheet.
        const newFw = clamp(origFp.w + dxIn, MIN_IN, sh.width_in - cur.x_in);
        const newFh = clamp(origFp.h + dyIn, MIN_IN, sh.height_in - cur.y_in);
        // footprint → base (undo rotation)
        baseW = rotated ? newFh : newFw;
        baseH = rotated ? newFw : newFh;
      } else {
        // Proportional: scale from the horizontal drag, capped by both axes.
        const maxScale = Math.min((sh.width_in - cur.x_in) / origFp.w, (sh.height_in - cur.y_in) / origFp.h);
        const scale = clamp((origFp.w + dxIn) / origFp.w, MIN_IN / origFp.w, maxScale);
        baseW = orig.w_in * scale;
        baseH = orig.h_in * scale;
      }
      const w = round3(Math.max(MIN_IN, baseW));
      const h = round3(Math.max(MIN_IN, baseH));
      emit(v.map((it, i) => (i === index ? { ...it, w_in: w, h_in: h } : it)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (changed) recordHistory(stateRef.current.value);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── Discrete edits ──────────────────────────────────────────────────────────
  function rotate(index: number) {
    const p = value[index]!;
    const rot = p.rotation % 180 === 0 ? 90 : 0;
    const fp = footprint({ ...p, rotation: rot });
    const { x, y } = clampSnap(p.x_in, p.y_in, fp.w, fp.h);
    commit(value.map((v, i) => (i === index ? { ...v, rotation: rot, x_in: x, y_in: y } : v)));
  }
  function remove(index: number) {
    commit(value.filter((_, i) => i !== index));
    setSelected(null);
  }
  function place(a: GangSheetArtwork) {
    const spot = firstFreeSpot(a.width_in, a.height_in);
    commit([...value, { artwork_id: a.id ?? "", x_in: spot.x, y_in: spot.y, rotation: 0, w_in: a.width_in, h_in: a.height_in }]);
  }
  function firstFreeSpot(w: number, h: number): { x: number; y: number } {
    const g = Math.max(sheet.spacing_in, 0.25);
    for (let y = 0; y + h <= sheet.height_in; y += g) {
      for (let x = 0; x + w <= sheet.width_in; x += g) {
        if (!value.some((p) => overlaps(p, x, y, w, h, g))) return { x: round3(x), y: round3(y) };
      }
    }
    return { x: 0, y: 0 };
  }
  function overlaps(p: Placement, x: number, y: number, w: number, h: number, gap: number): boolean {
    const fp = footprint(p);
    return !(x + w + gap <= p.x_in || x >= p.x_in + fp.w + gap || y + h + gap <= p.y_in || y >= p.y_in + fp.h + gap);
  }

  // Auto-nest (Phase 3): first-fit-decreasing-height shelf packing with rotation.
  function autoNest() {
    const g = sheet.spacing_in, W = sheet.width_in;
    type Inst = { artwork_id: string; w: number; h: number; rot: number };
    const items: Inst[] = [];
    for (const a of artworks) {
      for (let n = 0; n < a.quantity; n++) {
        let w = a.width_in, h = a.height_in, rot = 0;
        if (h > w && a.height_in <= W) { w = a.height_in; h = a.width_in; rot = 90; }
        if (w > W && a.width_in <= W) { w = a.width_in; h = a.height_in; rot = 0; }
        items.push({ artwork_id: a.id ?? "", w, h, rot });
      }
    }
    items.sort((p, q) => q.h - p.h);
    const shelves: { y: number; height: number; cursorX: number }[] = [];
    const out: Placement[] = [];
    for (const it of items) {
      if (it.w > W) continue;
      let shelf = shelves.find((s) => s.cursorX + it.w <= W + 1e-6 && it.h <= s.height + 1e-6);
      if (!shelf) {
        const prev = shelves[shelves.length - 1];
        const y = prev ? prev.y + prev.height + g : 0;
        if (y + it.h > sheet.height_in) continue;
        shelf = { y, height: it.h, cursorX: 0 };
        shelves.push(shelf);
      }
      const base = it.rot % 180 === 0 ? { w: it.w, h: it.h } : { w: it.h, h: it.w };
      out.push({ artwork_id: it.artwork_id, x_in: round3(shelf.cursorX), y_in: round3(shelf.y), rotation: it.rot, w_in: round3(base.w), h_in: round3(base.h) });
      shelf.cursorX = round3(shelf.cursorX + it.w + g);
    }
    commit(out);
  }

  function nudge(index: number, dxIn: number, dyIn: number) {
    const p = value[index]!;
    const fp = footprint(p);
    const { x, y } = clampSnap(p.x_in + dxIn, p.y_in + dyIn, fp.w, fp.h);
    commit(value.map((v, i) => (i === index ? { ...v, x_in: x, y_in: y } : v)));
  }
  function copySelected() {
    if (selected == null) return;
    clipboardRef.current = { ...value[selected]! };
  }
  function paste() {
    const c = clipboardRef.current;
    if (!c || remainingFor(c.artwork_id) <= 0) return;
    const off = Math.max(sheet.spacing_in, 0.25);
    const fp = footprint(c);
    const { x, y } = clampSnap(c.x_in + off, c.y_in + off, fp.w, fp.h);
    commit([...value, { ...c, x_in: x, y_in: y }]);
    setSelected(value.length);
  }

  // ── Keyboard shortcuts (only while the canvas is focused) ────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    if (readOnly) return;
    const meta = e.ctrlKey || e.metaKey;
    const sel = stateRef.current.selected;
    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (meta && e.key.toLowerCase() === "c") { e.preventDefault(); copySelected(); return; }
    if (meta && e.key.toLowerCase() === "v") { e.preventDefault(); paste(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && sel != null) { e.preventDefault(); remove(sel); return; }
    if (sel != null && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : Math.max(sheet.spacing_in, 0.1);
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      nudge(sel, dx, dy);
    }
  }

  // ── Zoom ────────────────────────────────────────────────────────────────────
  const zoomBy = (f: number) => setZoom((z) => clamp(round3(z * f), 0.25, 6));
  const fitScreen = () => {
    const el = scrollRef.current;
    if (!el) return;
    const zx = el.clientWidth / (sheet.width_in * fitPpi);
    const zy = (el.clientHeight || 520) / (sheet.height_in * fitPpi);
    setZoom(clamp(round3(Math.min(zx, zy)), 0.25, 6));
  };
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return; // ctrl/⌘ + wheel = zoom; plain wheel scrolls
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  const placedCount = (id: string) => value.filter((p) => p.artwork_id === id).length;
  const usedArea = value.reduce((s, p) => s + p.w_in * p.h_in, 0);
  const utilisation = Math.round((usedArea / (sheet.width_in * sheet.height_in)) * 100);
  const usedLength = value.reduce((mx, p) => Math.max(mx, p.y_in + footprint(p).h), 0);
  const sel = selected != null ? value[selected] : undefined;

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {!readOnly && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={autoNest} style={{ ...btn, background: "var(--brand-primary, #1C3557)", color: "#fff", borderColor: "transparent" }}>Auto-nest</button>
          <button type="button" onClick={() => commit([])} style={{ ...btn, color: "#B91C1C", borderColor: "#F3C7C7" }}>Clear</button>
          <span style={{ display: "inline-flex", gap: "4px" }}>
            <button type="button" onClick={undo} disabled={!canUndo} style={{ ...btn, opacity: canUndo ? 1 : 0.4 }} title="Undo (Ctrl+Z)">↶</button>
            <button type="button" onClick={redo} disabled={!canRedo} style={{ ...btn, opacity: canRedo ? 1 : 0.4 }} title="Redo (Ctrl+Shift+Z)">↷</button>
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555", cursor: "pointer" }}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap
          </label>
          <span style={{ display: "inline-flex", gap: "4px", alignItems: "center", marginLeft: "4px" }}>
            <button type="button" onClick={() => zoomBy(1 / 1.2)} style={btn} title="Zoom out">−</button>
            <span style={{ fontSize: "12px", color: "#666", width: "42px", textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1.2)} style={btn} title="Zoom in">+</button>
            <button type="button" onClick={() => setZoom(1)} style={btn} title="Fit width (100%)">100%</button>
            <button type="button" onClick={fitScreen} style={btn} title="Fit to screen">Fit</button>
          </span>
          <span style={{ marginLeft: "auto", fontSize: "12px", color: "#888" }}>
            {value.length} placed · {utilisation}% · {usedLength.toFixed(1)}″ used
          </span>
        </div>
      )}

      {!readOnly && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {artworks.map((a) => {
            const remaining = a.quantity - placedCount(a.id ?? "");
            return (
              <button key={a.id} type="button" disabled={remaining <= 0} onClick={() => place(a)}
                title={remaining > 0 ? "Add to sheet" : "All copies placed"}
                style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid #E0DDD6", borderRadius: "8px", padding: "6px 10px", background: remaining > 0 ? "#fff" : "#F3F2EF", cursor: remaining > 0 ? "pointer" : "not-allowed", fontSize: "12px" }}>
                {IMAGE_TYPES.has((a.file_type ?? "").toLowerCase()) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.file_url} alt="" style={{ width: "26px", height: "26px", objectFit: "contain", borderRadius: "4px" }} />
                ) : (
                  <span style={{ width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", background: "#EEF2FF", color: "#4338CA", borderRadius: "4px", fontSize: "9px", fontWeight: 700 }}>{(a.file_type ?? "?").toUpperCase().slice(0, 3)}</span>
                )}
                <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</span>
                <span style={{ color: remaining > 0 ? "#166534" : "#999", fontWeight: 700 }}>{remaining} left</span>
              </button>
            );
          })}
        </div>
      )}

      <div ref={scrollRef} onWheel={onWheel} style={{ overflow: "auto", maxWidth: "100%", maxHeight: "560px", background: "#FAFAF8", borderRadius: "8px", padding: "10px" }}>
        <div
          ref={wrapRef}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={onKeyDown}
          onPointerDown={() => { setSelected(null); wrapRef.current?.focus(); }}
          style={{
            position: "relative", width: `${sheetWpx}px`, height: `${sheetHpx}px`,
            background: "#fff", border: "1px solid #C9C5BD", outline: "none",
            backgroundImage: "linear-gradient(#F3F2EF 1px, transparent 1px), linear-gradient(90deg, #F3F2EF 1px, transparent 1px)",
            backgroundSize: `${ppi}px ${ppi}px`, margin: "0 auto", touchAction: "none", userSelect: "none",
          }}
        >
          {bleedPx > 0 && (
            <div style={{ position: "absolute", left: bleedPx, top: bleedPx, right: bleedPx, bottom: bleedPx, border: "1px dashed #D08C8C", pointerEvents: "none" }} />
          )}

          {value.map((p, i) => {
            const a = artById(p.artwork_id);
            const fp = footprint(p);
            const isImg = a && IMAGE_TYPES.has((a.file_type ?? "").toLowerCase());
            const isSel = selected === i;
            return (
              <div
                key={i}
                onPointerDown={(e) => startMove(e, i)}
                style={{
                  position: "absolute", left: p.x_in * ppi, top: p.y_in * ppi, width: fp.w * ppi, height: fp.h * ppi,
                  border: `1.5px solid ${isSel ? "var(--brand-primary, #1C3557)" : "#9AA3B2"}`,
                  boxShadow: isSel ? "0 0 0 2px rgba(28,53,87,.2)" : "none",
                  background: isImg ? "rgba(255,255,255,.4)" : "#EEF2FF",
                  cursor: readOnly ? "default" : "move", display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "visible", boxSizing: "border-box", zIndex: isSel ? 5 : 1,
                }}
              >
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a!.file_url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                ) : (
                  <span style={{ fontSize: "9px", color: "#4338CA", textAlign: "center", padding: "2px", pointerEvents: "none", wordBreak: "break-word" }}>{a?.file_name ?? "?"}</span>
                )}
                {isSel && !readOnly && (
                  <>
                    <div style={{ position: "absolute", top: "-26px", left: 0, display: "flex", gap: "4px" }}>
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); rotate(i); }} style={chip} title="Rotate 90°">⟳</button>
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(i); }} style={{ ...chip, color: "#B91C1C" }} title="Remove (Del)">✕</button>
                    </div>
                    <div onPointerDown={(e) => startResize(e, i)} style={{ position: "absolute", right: "-7px", bottom: "-7px", width: "14px", height: "14px", background: "#fff", border: "2px solid var(--brand-primary, #1C3557)", borderRadius: "3px", cursor: "nwse-resize" }} title="Drag to resize · hold Shift for free resize" />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: "12px", color: "#888", textAlign: "center" }}>
        Sheet {sheet.width_in}″ × {sheet.height_in}″ · dashed = {sheet.bleed_in}″ bleed
        {sel ? ` · selected ${footprint(sel).w.toFixed(1)}″ × ${footprint(sel).h.toFixed(1)}″` : (readOnly ? "" : " · drag · corner resize (Shift = free) · ⟳ rotate · Ctrl+Z undo · ⌘/Ctrl+wheel zoom")}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { border: "1px solid #DDD9D2", background: "#fff", color: "#333", padding: "7px 12px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const chip: React.CSSProperties = { border: "1px solid #D5D2CB", background: "#fff", borderRadius: "5px", width: "22px", height: "22px", fontSize: "12px", cursor: "pointer", lineHeight: 1, padding: 0 };
