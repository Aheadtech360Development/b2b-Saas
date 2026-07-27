"use client";

/**
 * GangSheetCanvas — drag-drop sheet layout editor (gang sheet Phase 2).
 *
 * Renders the sheet to scale, draws the bleed margin, and lets the user drag,
 * rotate, snap, and remove artwork placements. Coordinates are kept in inches
 * (sheet top-left origin) — the same units the API stores and the print file
 * uses — and only converted to pixels for display, so what you arrange is what
 * gets printed. Image artwork shows a real thumbnail; formats a browser can't
 * render (AI, PSD, EPS) show a labelled box at the correct size.
 *
 * Controlled: the parent owns `value` (placements) and receives `onChange`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { GangSheetArtwork } from "@/services/gangSheets.service";

export interface Placement {
  artwork_id: string;
  x_in: number;
  y_in: number;
  rotation: number; // 0 | 90
  w_in: number;     // artwork's own width
  h_in: number;     // artwork's own height
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

// On-sheet footprint: a 90° rotation swaps the artwork's width and height.
function footprint(p: Placement): { w: number; h: number } {
  return p.rotation % 180 === 0 ? { w: p.w_in, h: p.h_in } : { w: p.h_in, h: p.w_in };
}

export function GangSheetCanvas({ sheet, artworks, value, onChange, readOnly }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(10); // pixels per inch, recomputed to fit width
  const [selected, setSelected] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  const dragRef = useRef<{ index: number; offX: number; offY: number } | null>(null);

  const artById = useCallback(
    (id: string) => artworks.find((a) => a.id === id),
    [artworks]
  );

  // Fit the sheet width into the available column; cap the scale so a small
  // sheet doesn't balloon. Recomputed on resize.
  useEffect(() => {
    function fit() {
      const avail = wrapRef.current?.clientWidth ?? 640;
      setPpi(Math.max(3, Math.min(40, avail / sheet.width_in)));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [sheet.width_in]);

  const sheetWpx = sheet.width_in * ppi;
  const sheetHpx = sheet.height_in * ppi;
  const bleedPx = sheet.bleed_in * ppi;

  function clampAndSnap(xIn: number, yIn: number, fw: number, fh: number) {
    let x = Math.max(0, Math.min(xIn, sheet.width_in - fw));
    let y = Math.max(0, Math.min(yIn, sheet.height_in - fh));
    if (snap && sheet.spacing_in > 0) {
      const g = sheet.spacing_in;
      x = Math.round(x / g) * g;
      y = Math.round(y / g) * g;
      x = Math.max(0, Math.min(x, sheet.width_in - fw));
      y = Math.max(0, Math.min(y, sheet.height_in - fh));
    }
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  }

  function onPointerDown(e: React.PointerEvent, index: number) {
    if (readOnly) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(index);
    const p = value[index]!;
    const rect = wrapRef.current!.getBoundingClientRect();
    const pointerXin = (e.clientX - rect.left) / ppi;
    const pointerYin = (e.clientY - rect.top) / ppi;
    dragRef.current = { index, offX: pointerXin - p.x_in, offY: pointerYin - p.y_in };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const p = value[d.index]!;
    const fp = footprint(p);
    const { x, y } = clampAndSnap(
      (e.clientX - rect.left) / ppi - d.offX,
      (e.clientY - rect.top) / ppi - d.offY,
      fp.w, fp.h
    );
    onChange(value.map((v, i) => (i === d.index ? { ...v, x_in: x, y_in: y } : v)));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function rotate(index: number) {
    const p = value[index]!;
    const rot = p.rotation % 180 === 0 ? 90 : 0;
    const fp = footprint({ ...p, rotation: rot });
    const { x, y } = clampAndSnap(p.x_in, p.y_in, fp.w, fp.h);
    onChange(value.map((v, i) => (i === index ? { ...v, rotation: rot, x_in: x, y_in: y } : v)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    setSelected(null);
  }

  // Place one instance of an artwork at the first roughly-free spot.
  function place(a: GangSheetArtwork) {
    const spot = firstFreeSpot(a.width_in, a.height_in);
    onChange([
      ...value,
      { artwork_id: a.id ?? "", x_in: spot.x, y_in: spot.y, rotation: 0, w_in: a.width_in, h_in: a.height_in },
    ]);
  }

  function firstFreeSpot(w: number, h: number): { x: number; y: number } {
    const g = Math.max(sheet.spacing_in, 0.25);
    for (let y = 0; y + h <= sheet.height_in; y += g) {
      for (let x = 0; x + w <= sheet.width_in; x += g) {
        if (!value.some((p) => overlaps(p, x, y, w, h, g))) return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
      }
    }
    return { x: 0, y: 0 };
  }

  function overlaps(p: Placement, x: number, y: number, w: number, h: number, gap: number): boolean {
    const fp = footprint(p);
    return !(
      x + w + gap <= p.x_in ||
      x >= p.x_in + fp.w + gap ||
      y + h + gap <= p.y_in ||
      y >= p.y_in + fp.h + gap
    );
  }

  // Simple grid auto-arrange (Phase 2 — not the waste-minimising nester of P3):
  // lay every instance left-to-right, top-to-bottom with spacing between them.
  function autoArrange() {
    const g = sheet.spacing_in;
    const next: Placement[] = [];
    let x = 0, y = 0, rowH = 0;
    for (const a of artworks) {
      for (let n = 0; n < a.quantity; n++) {
        if (x + a.width_in > sheet.width_in) { x = 0; y += rowH + g; rowH = 0; }
        if (y + a.height_in > sheet.height_in) break; // sheet full — remaining stay unplaced
        next.push({ artwork_id: a.id ?? "", x_in: Math.round(x * 1000) / 1000, y_in: Math.round(y * 1000) / 1000, rotation: 0, w_in: a.width_in, h_in: a.height_in });
        x += a.width_in + g;
        rowH = Math.max(rowH, a.height_in);
      }
    }
    onChange(next);
  }

  // How many instances of each artwork remain unplaced.
  const placedCount = (id: string) => value.filter((p) => p.artwork_id === id).length;

  const usedArea = value.reduce((s, p) => s + p.w_in * p.h_in, 0);
  const utilisation = Math.round((usedArea / (sheet.width_in * sheet.height_in)) * 100);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
      {!readOnly && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={autoArrange} style={btn}>Auto-arrange (grid)</button>
          <button type="button" onClick={() => onChange([])} style={{ ...btn, background: "#fff", color: "#B91C1C", borderColor: "#F3C7C7" }}>Clear</button>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555", marginLeft: "6px", cursor: "pointer" }}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap to {sheet.spacing_in}″ grid
          </label>
          <span style={{ marginLeft: "auto", fontSize: "12px", color: "#888" }}>
            {value.length} placed · {utilisation}% of sheet
          </span>
        </div>
      )}

      {/* Artwork tray */}
      {!readOnly && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {artworks.map((a) => {
            const remaining = a.quantity - placedCount(a.id ?? "");
            return (
              <button
                key={a.id}
                type="button"
                disabled={remaining <= 0}
                onClick={() => place(a)}
                title={remaining > 0 ? "Add to sheet" : "All copies placed"}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  border: "1px solid #E0DDD6", borderRadius: "8px", padding: "6px 10px",
                  background: remaining > 0 ? "#fff" : "#F3F2EF",
                  cursor: remaining > 0 ? "pointer" : "not-allowed", fontSize: "12px",
                }}
              >
                {IMAGE_TYPES.has((a.file_type ?? "").toLowerCase()) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.file_url} alt={a.file_name} style={{ width: "26px", height: "26px", objectFit: "contain", borderRadius: "4px" }} />
                ) : (
                  <span style={{ width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", background: "#EEF2FF", color: "#4338CA", borderRadius: "4px", fontSize: "9px", fontWeight: 700 }}>
                    {(a.file_type ?? "?").toUpperCase().slice(0, 3)}
                  </span>
                )}
                <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</span>
                <span style={{ color: remaining > 0 ? "#166534" : "#999", fontWeight: 700 }}>{remaining} left</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sheet */}
      <div style={{ overflow: "auto", maxWidth: "100%" }}>
        <div
          ref={wrapRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={() => setSelected(null)}
          style={{
            position: "relative",
            width: `${sheetWpx}px`,
            height: `${sheetHpx}px`,
            background: "#fff",
            border: "1px solid #C9C5BD",
            backgroundImage:
              "linear-gradient(#F3F2EF 1px, transparent 1px), linear-gradient(90deg, #F3F2EF 1px, transparent 1px)",
            backgroundSize: `${ppi}px ${ppi}px`,
            margin: "0 auto",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {/* Bleed margin guide */}
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
                onPointerDown={(e) => onPointerDown(e, i)}
                onClick={(e) => { e.stopPropagation(); setSelected(i); }}
                style={{
                  position: "absolute",
                  left: p.x_in * ppi,
                  top: p.y_in * ppi,
                  width: fp.w * ppi,
                  height: fp.h * ppi,
                  border: `1.5px solid ${isSel ? "var(--brand-primary, #1C3557)" : "#9AA3B2"}`,
                  boxShadow: isSel ? "0 0 0 2px rgba(28,53,87,.2)" : "none",
                  background: isImg ? "transparent" : "#EEF2FF",
                  cursor: readOnly ? "default" : "move",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", boxSizing: "border-box",
                }}
              >
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a!.file_url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                ) : (
                  <span style={{ fontSize: "9px", color: "#4338CA", textAlign: "center", padding: "2px", pointerEvents: "none", wordBreak: "break-word" }}>
                    {a?.file_name ?? "?"}
                  </span>
                )}

                {isSel && !readOnly && (
                  <div style={{ position: "absolute", top: "-26px", left: 0, display: "flex", gap: "4px" }}>
                    <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); rotate(i); }} style={chip}>⟳</button>
                    <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(i); }} style={{ ...chip, color: "#B91C1C" }}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: "12px", color: "#888", textAlign: "center" }}>
        Sheet {sheet.width_in}″ × {sheet.height_in}″ · dashed line = {sheet.bleed_in}″ bleed{readOnly ? "" : " · drag to move, select to rotate/remove"}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  border: "1px solid #DDD9D2", background: "#fff", color: "#333",
  padding: "7px 13px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
};
const chip: React.CSSProperties = {
  border: "1px solid #D5D2CB", background: "#fff", borderRadius: "5px",
  width: "22px", height: "22px", fontSize: "12px", cursor: "pointer", lineHeight: 1, padding: 0,
};
