"use client";

/**
 * GangSheetCanvas — drag-drop sheet layout editor (gang sheet Phase 2 + 3).
 *
 * Renders the sheet to scale with its bleed margin and a snap grid. Placements
 * can be dragged, resized from the corner (proportional), rotated 90°, and
 * removed. "Auto-nest" packs every copy to use the least sheet length (a
 * first-fit-decreasing-height shelf packer that rotates pieces when it helps).
 *
 * Coordinates are inches from the sheet's top-left — the units the API stores
 * and the print file uses — converted to pixels only for display. Drag/resize
 * use window-level pointer listeners so a fast pointer never "escapes" the
 * element mid-gesture (the bug the earlier version had by capturing on the wrong
 * node). Controlled: the parent owns `value` and receives `onChange`.
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
const MIN_IN = 0.5; // smallest a piece can be scaled to

// On-sheet footprint: a 90° rotation swaps the artwork's width and height.
function footprint(p: Placement): { w: number; h: number } {
  return p.rotation % 180 === 0 ? { w: p.w_in, h: p.h_in } : { w: p.h_in, h: p.w_in };
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function GangSheetCanvas({ sheet, artworks, value, onChange, readOnly }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(10);
  const [selected, setSelected] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);

  // Latest props for the window listeners (which close over stale state otherwise).
  const stateRef = useRef({ value, ppi, snap, sheet, onChange });
  stateRef.current = { value, ppi, snap, sheet, onChange };

  const artById = useCallback((id: string) => artworks.find((a) => a.id === id), [artworks]);

  useEffect(() => {
    function fit() {
      const avail = wrapRef.current?.parentElement?.clientWidth ?? 640;
      setPpi(Math.max(3, Math.min(48, avail / sheet.width_in)));
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
    let x = Math.max(0, Math.min(xIn, sh.width_in - fw));
    let y = Math.max(0, Math.min(yIn, sh.height_in - fh));
    if (s && sh.spacing_in > 0) {
      const g = sh.spacing_in;
      x = Math.max(0, Math.min(Math.round(x / g) * g, sh.width_in - fw));
      y = Math.max(0, Math.min(Math.round(y / g) * g, sh.height_in - fh));
    }
    return { x: round3(x), y: round3(y) };
  }

  // ── Drag (move) ─────────────────────────────────────────────────────────────
  function startMove(e: React.PointerEvent, index: number) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(index);
    const startX = e.clientX, startY = e.clientY;
    const orig = stateRef.current.value[index]!;
    const ox = orig.x_in, oy = orig.y_in;

    function move(ev: PointerEvent) {
      const { ppi: p, value: v } = stateRef.current;
      const fp = footprint(v[index]!);
      const { x, y } = clampSnap(ox + (ev.clientX - startX) / p, oy + (ev.clientY - startY) / p, fp.w, fp.h);
      stateRef.current.onChange(v.map((it, i) => (i === index ? { ...it, x_in: x, y_in: y } : it)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── Resize (proportional, from bottom-right) ────────────────────────────────
  function startResize(e: React.PointerEvent, index: number) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(index);
    const startX = e.clientX;
    const orig = stateRef.current.value[index]!;
    const origFp = footprint(orig);
    const aspect = orig.h_in / orig.w_in;

    function move(ev: PointerEvent) {
      const { ppi: p, value: v, sheet: sh } = stateRef.current;
      const cur = v[index]!;
      let newFw = origFp.w + (ev.clientX - startX) / p;
      // Keep it on the sheet and above the minimum in both dimensions.
      const maxFw = sh.width_in - cur.x_in;
      const maxFhScale = (sh.height_in - cur.y_in) / origFp.h;
      newFw = Math.max(MIN_IN, Math.min(newFw, maxFw, origFp.w * maxFhScale));
      const scale = newFw / origFp.w;
      // scale applies equally to base w/h (footprint scales by the same factor)
      const w = round3(Math.max(MIN_IN, orig.w_in * scale));
      const h = round3(Math.max(MIN_IN, orig.h_in * scale));
      void aspect;
      stateRef.current.onChange(v.map((it, i) => (i === index ? { ...it, w_in: w, h_in: h } : it)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function rotate(index: number) {
    const p = value[index]!;
    const rot = p.rotation % 180 === 0 ? 90 : 0;
    const fp = footprint({ ...p, rotation: rot });
    const { x, y } = clampSnap(p.x_in, p.y_in, fp.w, fp.h);
    onChange(value.map((v, i) => (i === index ? { ...v, rotation: rot, x_in: x, y_in: y } : v)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    setSelected(null);
  }

  function place(a: GangSheetArtwork) {
    const spot = firstFreeSpot(a.width_in, a.height_in);
    onChange([...value, { artwork_id: a.id ?? "", x_in: spot.x, y_in: spot.y, rotation: 0, w_in: a.width_in, h_in: a.height_in }]);
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

  // ── Auto-nest (Phase 3) ─────────────────────────────────────────────────────
  // First-fit-decreasing-height shelf packing. Each copy is oriented to lie flat
  // (its shorter side vertical) when that still fits the sheet width, so shelves
  // stay short; pieces are then packed into the first shelf with room, or a new
  // shelf below. This minimises the sheet length used vs a fixed grid.
  function autoNest() {
    const g = sheet.spacing_in;
    const W = sheet.width_in;

    type Inst = { artwork_id: string; w: number; h: number; rot: number };
    const items: Inst[] = [];
    for (const a of artworks) {
      for (let n = 0; n < a.quantity; n++) {
        let w = a.width_in, h = a.height_in, rot = 0;
        // Lay each piece flat (wider than tall) when that still fits the sheet
        // width, so shelves stay short and less length is used.
        if (h > w && a.height_in <= W) { w = a.height_in; h = a.width_in; rot = 90; }
        // If the flat orientation overflows the width but upright fits, go upright.
        if (w > W && a.width_in <= W) { w = a.width_in; h = a.height_in; rot = 0; }
        items.push({ artwork_id: a.id ?? "", w, h, rot });
      }
    }
    // Tallest first so shelves are established by the biggest pieces.
    items.sort((p, q) => q.h - p.h);

    const shelves: { y: number; height: number; cursorX: number }[] = [];
    const out: Placement[] = [];
    for (const it of items) {
      if (it.w > W) continue; // cannot fit on this sheet width at all
      let shelf = shelves.find((s) => s.cursorX + it.w <= W + 1e-6 && it.h <= s.height + 1e-6);
      if (!shelf) {
        const y = shelves.length ? shelves[shelves.length - 1]!.y + shelves[shelves.length - 1]!.height + g : 0;
        if (y + it.h > sheet.height_in) continue; // sheet full — leave remaining unplaced
        shelf = { y, height: it.h, cursorX: 0 };
        shelves.push(shelf);
      }
      // Convert oriented footprint back to base w/h + rotation for storage.
      const base = it.rot % 180 === 0 ? { w: it.w, h: it.h } : { w: it.h, h: it.w };
      out.push({ artwork_id: it.artwork_id, x_in: round3(shelf.cursorX), y_in: round3(shelf.y), rotation: it.rot, w_in: round3(base.w), h_in: round3(base.h) });
      shelf.cursorX = round3(shelf.cursorX + it.w + g);
    }
    onChange(out);
  }

  const placedCount = (id: string) => value.filter((p) => p.artwork_id === id).length;
  const usedArea = value.reduce((s, p) => s + p.w_in * p.h_in, 0);
  const utilisation = Math.round((usedArea / (sheet.width_in * sheet.height_in)) * 100);
  const usedLength = value.reduce((mx, p) => Math.max(mx, p.y_in + footprint(p).h), 0);

  const sel = selected != null ? value[selected] : undefined;

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      {!readOnly && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={autoNest} style={{ ...btn, background: "var(--brand-primary, #1C3557)", color: "#fff", borderColor: "transparent" }}>Auto-nest</button>
          <button type="button" onClick={() => onChange([])} style={{ ...btn, color: "#B91C1C", borderColor: "#F3C7C7" }}>Clear</button>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555", marginLeft: "4px", cursor: "pointer" }}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap to {sheet.spacing_in}″
          </label>
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

      <div style={{ overflow: "auto", maxWidth: "100%" }}>
        <div
          ref={wrapRef}
          onPointerDown={() => setSelected(null)}
          style={{
            position: "relative", width: `${sheetWpx}px`, height: `${sheetHpx}px`,
            background: "#fff", border: "1px solid #C9C5BD",
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
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(i); }} style={{ ...chip, color: "#B91C1C" }} title="Remove">✕</button>
                    </div>
                    {/* Resize handle (bottom-right) */}
                    <div
                      onPointerDown={(e) => startResize(e, i)}
                      style={{ position: "absolute", right: "-7px", bottom: "-7px", width: "14px", height: "14px", background: "#fff", border: "2px solid var(--brand-primary, #1C3557)", borderRadius: "3px", cursor: "nwse-resize" }}
                      title="Drag to resize"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: "12px", color: "#888", textAlign: "center" }}>
        Sheet {sheet.width_in}″ × {sheet.height_in}″ · dashed = {sheet.bleed_in}″ bleed
        {sel ? ` · selected ${footprint(sel).w.toFixed(1)}″ × ${footprint(sel).h.toFixed(1)}″` : (readOnly ? "" : " · drag to move · corner to resize · ⟳ rotate")}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { border: "1px solid #DDD9D2", background: "#fff", color: "#333", padding: "7px 14px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const chip: React.CSSProperties = { border: "1px solid #D5D2CB", background: "#fff", borderRadius: "5px", width: "22px", height: "22px", fontSize: "12px", cursor: "pointer", lineHeight: 1, padding: 0 };
