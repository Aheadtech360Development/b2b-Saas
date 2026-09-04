"use client";

/**
 * ImageEditorModal — the per-design image editor opened from an upload thumbnail.
 *
 * Mirrors the reference builder's "Image Editor": Enhance (remove background /
 * upscale), Halftone, Crop (aspect presets + rectangle/circle), and Colors, with
 * an AFTER/BEFORE toggle and a viewing-only background-colour swatch. Everything
 * runs in the browser on <canvas>; Remove Background uses @imgly (loaded lazily).
 * Apply returns the edited image as a transparent PNG File.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  fileName: string;
  onClose: () => void;
  onApply: (file: File) => void;
}

type Tab = "enhance" | "halftone" | "crop" | "colors";
const DEFAULT_COLORS = { brightness: 100, contrast: 100, saturate: 100 };
const RATIOS: { key: string; label: string; r: number | null }[] = [
  { key: "free", label: "Free", r: null },
  { key: "1:1", label: "1:1", r: 1 },
  { key: "16:9", label: "16:9", r: 16 / 9 },
  { key: "9:16", label: "9:16", r: 9 / 16 },
  { key: "3:2", label: "3:2", r: 3 / 2 },
  { key: "2:3", label: "2:3", r: 2 / 3 },
  { key: "2:1", label: "2:1", r: 2 },
  { key: "1:2", label: "1:2", r: 1 / 2 },
];
const BG_SWATCHES = ["transparent", "#ffffff", "#111111", "#EF4444", "#3B82F6", "#22C55E"];

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ImageEditorModal({ src, fileName, onClose, onApply }: Props) {
  const [tab, setTab] = useState<Tab>("enhance");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [bgColor, setBgColor] = useState("transparent");
  const [colors, setColors] = useState({ ...DEFAULT_COLORS });
  const [halftone, setHalftone] = useState({ density: 6, angle: 45 });
  const [ratioKey, setRatioKey] = useState("free");
  const [shape, setShape] = useState<"rect" | "circle">("rect");
  const [error, setError] = useState<string | null>(null);
  const [, bump] = useState(0);

  const origRef = useRef<HTMLCanvasElement | null>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const dispRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  // Crop rectangle in *display* pixels, or null when not cropping.
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;

  const colorFilter = `brightness(${colors.brightness}%) contrast(${colors.contrast}%) saturate(${colors.saturate}%)`;

  // ── Load the source image into the original + working canvases ────────────────
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const oc = makeCanvas(img.naturalWidth, img.naturalHeight);
      oc.getContext("2d")!.drawImage(img, 0, 0);
      origRef.current = oc;
      const wc = makeCanvas(oc.width, oc.height);
      wc.getContext("2d")!.drawImage(oc, 0, 0);
      workRef.current = wc;
      setReady(true);
    };
    img.onerror = () => !cancelled && setError("Could not load this image for editing.");
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  // ── Draw the current source into the fitted display canvas ────────────────────
  const redraw = useCallback(() => {
    const disp = dispRef.current, stage = stageRef.current;
    const source = showBefore ? origRef.current : workRef.current;
    if (!disp || !stage || !source) return;
    const maxW = stage.clientWidth - 24, maxH = stage.clientHeight - 24;
    const scale = Math.min(maxW / source.width, maxH / source.height, 1);
    const dw = Math.max(1, Math.round(source.width * scale));
    const dh = Math.max(1, Math.round(source.height * scale));
    disp.width = dw; disp.height = dh;
    const ctx = disp.getContext("2d")!;
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(source, 0, 0, dw, dh);
  }, [showBefore]);

  useEffect(() => { if (ready) redraw(); }, [ready, redraw]);
  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw]);

  // Bake the live colour filter into the working canvas (before pixel ops/export).
  function bakeColors() {
    const c = colorsRef.current;
    if (c.brightness === 100 && c.contrast === 100 && c.saturate === 100) return;
    const w = workRef.current!;
    const out = makeCanvas(w.width, w.height);
    const ctx = out.getContext("2d")!;
    ctx.filter = `brightness(${c.brightness}%) contrast(${c.contrast}%) saturate(${c.saturate}%)`;
    ctx.drawImage(w, 0, 0);
    workRef.current = out;
    setColors({ ...DEFAULT_COLORS });
  }

  function commit() { redraw(); bump((n) => n + 1); }

  // ── Enhance ───────────────────────────────────────────────────────────────────
  async function removeBg() {
    setBusy("Removing background…"); setError(null);
    try {
      bakeColors();
      const blob: Blob = await new Promise((res) => workRef.current!.toBlob((b) => res(b!), "image/png"));
      const { removeBackground } = await import("@imgly/background-removal");
      const out = await removeBackground(blob);
      const img = await blobToImage(out);
      const c = makeCanvas(img.naturalWidth, img.naturalHeight);
      c.getContext("2d")!.drawImage(img, 0, 0);
      workRef.current = c;
      commit();
    } catch {
      setError("Background removal wasn't available just now.");
    } finally { setBusy(null); }
  }

  function upscale() {
    bakeColors();
    const w = workRef.current!;
    if (w.width * w.height > 20_000_000) { setError("This image is already high-resolution."); return; }
    const out = makeCanvas(w.width * 2, w.height * 2);
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(w, 0, 0, out.width, out.height);
    workRef.current = out;
    commit();
  }

  // ── Halftone ──────────────────────────────────────────────────────────────────
  function applyHalftone() {
    setError(null);
    bakeColors();
    try {
      const w = workRef.current!;
      const sctx = w.getContext("2d")!;
      const data = sctx.getImageData(0, 0, w.width, w.height).data;
      const step = Math.max(3, Math.round(halftone.density));
      const out = makeCanvas(w.width, w.height);
      const ctx = out.getContext("2d")!;
      const rad = (halftone.angle * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const cx = w.width / 2, cy = h_(w).cy;
      // Walk a grid rotated by `angle`, sampling each cell's average colour + alpha.
      const diag = Math.ceil(Math.hypot(w.width, w.height));
      for (let v = -diag; v < diag; v += step) {
        for (let u = -diag; u < diag; u += step) {
          const x = Math.round(cx + u * cos - v * sin);
          const y = Math.round(cy + u * sin + v * cos);
          if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
          const i = (y * w.width + x) * 4;
          const a = data[i + 3]!;
          if (a < 20) continue;
          const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const radius = ((1 - lum) * step) / 2;
          if (radius < 0.3) continue;
          ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      workRef.current = out;
      commit();
    } catch {
      setError("Couldn't process this image (it may be cross-origin protected).");
    }
  }
  // tiny helper so the halftone loop reads a touch cleaner
  function h_(c: HTMLCanvasElement) { return { cy: c.height / 2 }; }

  // ── Colours ───────────────────────────────────────────────────────────────────
  function applyColors() { bakeColors(); commit(); }
  function resetColors() { setColors({ ...DEFAULT_COLORS }); }

  // ── Crop ──────────────────────────────────────────────────────────────────────
  function startCrop() {
    const disp = dispRef.current; if (!disp) return;
    const ratio = RATIOS.find((r) => r.key === ratioKey)?.r ?? null;
    let w = disp.width * 0.8, h = disp.height * 0.8;
    if (ratio) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
    setCrop({ x: (disp.width - w) / 2, y: (disp.height - h) / 2, w, h });
  }
  useEffect(() => { if (tab === "crop" && ready) startCrop(); else setCrop(null); /* eslint-disable-next-line */ }, [tab, ratioKey, shape, ready]);

  function cropPointer(e: React.PointerEvent, mode: "move" | "resize") {
    e.preventDefault(); e.stopPropagation();
    const disp = dispRef.current!, start = cropRef.current!;
    const sx = e.clientX, sy = e.clientY;
    const ratio = RATIOS.find((r) => r.key === ratioKey)?.r ?? null;
    function mv(ev: PointerEvent) {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (mode === "move") {
        setCrop({ ...start, x: clamp(start.x + dx, 0, disp.width - start.w), y: clamp(start.y + dy, 0, disp.height - start.h) });
      } else {
        let nw = clamp(start.w + dx, 20, disp.width - start.x);
        let nh = ratio ? nw / ratio : clamp(start.h + dy, 20, disp.height - start.y);
        if (ratio && start.y + nh > disp.height) { nh = disp.height - start.y; nw = nh * ratio; }
        setCrop({ ...start, w: nw, h: nh });
      }
    }
    function up() { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  function applyCrop() {
    const disp = dispRef.current, c = cropRef.current, w = workRef.current;
    if (!disp || !c || !w) return;
    bakeColors();
    const sc = w.width / disp.width; // display → source pixels
    const sx = c.x * sc, sy = c.y * sc, sw = c.w * sc, sh = c.h * sc;
    const out = makeCanvas(sw, sh);
    const ctx = out.getContext("2d")!;
    if (shape === "circle") {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sw / 2, sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(w, sx, sy, sw, sh, 0, 0, sw, sh);
      ctx.restore();
    } else {
      ctx.drawImage(w, sx, sy, sw, sh, 0, 0, sw, sh);
    }
    workRef.current = out;
    setCrop(null);
    setTab("enhance");
    commit();
  }

  // ── Apply / discard ───────────────────────────────────────────────────────────
  async function apply() {
    bakeColors();
    setBusy("Saving…");
    try {
      const blob: Blob = await new Promise((res) => workRef.current!.toBlob((b) => res(b!), "image/png"));
      const base = fileName.replace(/\.[^.]+$/, "");
      onApply(new File([blob], `${base}-edited.png`, { type: "image/png" }));
    } catch {
      setError("Could not export the edited image (it may be cross-origin protected).");
      setBusy(null);
    }
  }

  const source = showBefore ? origRef.current : workRef.current;
  const outW = source?.width ?? 0, outH = source?.height ?? 0;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={S.head}>
          <span style={{ fontSize: "17px", fontWeight: 800 }}>Image Editor</span>
          <button onClick={onClose} style={S.closeX} aria-label="Close">✕</button>
        </div>

        <div style={S.body}>
          {/* Left tabs */}
          <div style={S.tabs}>
            {([["enhance", "✨", "Enhance"], ["halftone", "▦", "Halftone"], ["crop", "⛶", "Crop"], ["colors", "🎨", "Colors"]] as const).map(([k, ic, lb]) => (
              <button key={k} onClick={() => setTab(k)} style={{ ...S.tabBtn, ...(tab === k ? S.tabBtnActive : {}) }}>
                <span style={{ fontSize: "18px" }}>{ic}</span>
                <span style={{ fontSize: "10px", marginTop: "3px", textTransform: "uppercase", letterSpacing: ".04em" }}>{lb}</span>
              </button>
            ))}
          </div>

          {/* Controls */}
          <div style={S.controls}>
            {tab === "enhance" && (
              <>
                <button onClick={removeBg} disabled={!!busy} style={S.toolCard}>
                  <div style={{ fontWeight: 700, fontSize: "14px" }}>✨ Remove Background</div>
                  <div style={{ fontSize: "12px", color: "#777", marginTop: "3px" }}>Automatically make the background transparent.</div>
                </button>
                <button onClick={upscale} disabled={!!busy} style={S.toolCard}>
                  <div style={{ fontWeight: 700, fontSize: "14px" }}>⤢ Upscale Quality</div>
                  <div style={{ fontSize: "12px", color: "#777", marginTop: "3px" }}>Double the resolution for sharper prints.</div>
                </button>
              </>
            )}

            {tab === "halftone" && (
              <>
                <Slider label="Density" min={3} max={20} value={halftone.density} onChange={(v) => setHalftone((h) => ({ ...h, density: v }))} />
                <Slider label="Angle" min={0} max={90} value={halftone.angle} onChange={(v) => setHalftone((h) => ({ ...h, angle: v }))} />
                <button onClick={applyHalftone} disabled={!!busy} style={S.applyBtn}>Apply</button>
                <p style={S.hint}>Turns the design into a dot pattern (great for gradients on DTF).</p>
              </>
            )}

            {tab === "crop" && (
              <>
                <div style={S.groupLabel}>Shape</div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                  {(["rect", "circle"] as const).map((s) => (
                    <button key={s} onClick={() => setShape(s)} style={{ ...S.chip, ...(shape === s ? S.chipActive : {}) }}>{s === "rect" ? "▢ Rectangle" : "◯ Circle"}</button>
                  ))}
                </div>
                <div style={S.groupLabel}>Aspect ratio</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px", marginBottom: "14px" }}>
                  {RATIOS.map((r) => (
                    <button key={r.key} onClick={() => setRatioKey(r.key)} style={{ ...S.chip, ...(ratioKey === r.key ? S.chipActive : {}) }}>{r.label}</button>
                  ))}
                </div>
                <button onClick={applyCrop} disabled={!!busy || !crop} style={S.applyBtn}>Crop</button>
              </>
            )}

            {tab === "colors" && (
              <>
                <Slider label="Brightness" min={0} max={200} value={colors.brightness} onChange={(v) => setColors((c) => ({ ...c, brightness: v }))} />
                <Slider label="Contrast" min={0} max={200} value={colors.contrast} onChange={(v) => setColors((c) => ({ ...c, contrast: v }))} />
                <Slider label="Saturation" min={0} max={200} value={colors.saturate} onChange={(v) => setColors((c) => ({ ...c, saturate: v }))} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={applyColors} style={S.applyBtn}>Apply</button>
                  <button onClick={resetColors} style={{ ...S.chip, flex: "0 0 auto" }}>Reset</button>
                </div>
              </>
            )}
          </div>

          {/* Preview stage */}
          <div ref={stageRef} style={S.stage}>
            <div style={{ ...S.checker, background: bgColor === "transparent" ? undefined : bgColor }} className={bgColor === "transparent" ? "gs-checker" : ""}>
              <div style={{ position: "relative", lineHeight: 0 }}>
                <canvas ref={dispRef} style={{ display: "block", filter: showBefore ? "none" : colorFilter }} />
                {/* Crop overlay */}
                {tab === "crop" && crop && (
                  <div
                    onPointerDown={(e) => cropPointer(e, "move")}
                    style={{ position: "absolute", left: crop.x, top: crop.y, width: crop.w, height: crop.h, border: "2px solid #22C55E", boxShadow: "0 0 0 9999px rgba(0,0,0,.35)", borderRadius: shape === "circle" ? "50%" : 0, cursor: "move", touchAction: "none" }}
                  >
                    <div onPointerDown={(e) => cropPointer(e, "resize")} style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, background: "#fff", border: "2px solid #22C55E", borderRadius: 3, cursor: "nwse-resize" }} />
                  </div>
                )}
              </div>
            </div>

            {/* AFTER / BEFORE toggle */}
            <div style={S.beforeToggle}>
              <button onClick={() => setShowBefore(false)} style={{ ...S.baBtn, ...(showBefore ? {} : S.baBtnActive) }}>AFTER</button>
              <button onClick={() => setShowBefore(true)} style={{ ...S.baBtn, ...(showBefore ? S.baBtnActive : {}) }}>BEFORE</button>
            </div>

            {busy && <div style={S.busyOverlay}><div style={{ fontWeight: 700 }}>{busy}</div></div>}
            {!ready && !error && <div style={S.busyOverlay}><div>Loading…</div></div>}
          </div>
        </div>

        {error && <div style={S.errBar}>{error}</div>}

        {/* Footer */}
        <div style={S.foot}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: 800 }}>CHANGE BG COLOR <span style={{ color: "#DC2626", fontWeight: 600 }}>(viewing only)</span></span>
            {BG_SWATCHES.map((c) => (
              <button key={c} onClick={() => setBgColor(c)} title={c} style={{ width: 26, height: 26, borderRadius: "50%", cursor: "pointer", border: bgColor === c ? "2px solid #1C3557" : "1px solid #D0D0D0", background: c === "transparent" ? "conic-gradient(#ccc 25%, #fff 0 50%, #ccc 0 75%, #fff 0)" : c, backgroundSize: c === "transparent" ? "10px 10px" : undefined }} />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "11px", color: "#999", marginRight: "10px" }}>{outW}×{outH}px</span>
          <button onClick={onClose} style={S.discardBtn}>Discard Changes</button>
          <button onClick={apply} disabled={!!busy || !ready} style={S.applyMain}>Apply</button>
        </div>
      </div>
      <style>{".gs-checker{background-image:repeating-conic-gradient(#e0e0e0 0% 25%,#fff 0% 50%);background-size:20px 20px;}"}</style>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(n, hi)); }
function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { res(img); };
    img.onerror = rej;
    img.src = url;
  });
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#444", marginBottom: "4px" }}>
        <span>{label}</span><span style={{ color: "#888" }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} />
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, zIndex: 500, background: "rgba(20,24,31,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
  modal: { width: "min(1040px, 96vw)", height: "min(660px, 94vh)", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "14px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.35)", fontFamily: "system-ui, sans-serif" },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #EFEDE8" },
  closeX: { width: 34, height: 34, borderRadius: "50%", border: "1px solid #E0E0E0", background: "#fff", cursor: "pointer", fontSize: "14px", color: "#666" },
  body: { flex: 1, display: "flex", minHeight: 0 },
  tabs: { width: "78px", flexShrink: 0, borderRight: "1px solid #EFEDE8", display: "flex", flexDirection: "column", padding: "10px 0", gap: "4px" },
  tabBtn: { background: "none", border: "none", color: "#666", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 4px", cursor: "pointer", borderLeft: "3px solid transparent" },
  tabBtnActive: { color: "#1C3557", borderLeftColor: "#1C3557", background: "#F4F6FB" },
  controls: { width: "260px", flexShrink: 0, borderRight: "1px solid #EFEDE8", padding: "16px", overflowY: "auto" },
  toolCard: { display: "block", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #E5E3DE", borderRadius: "10px", padding: "12px 14px", cursor: "pointer", marginBottom: "10px" },
  applyBtn: { width: "100%", background: "#22C55E", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", marginTop: "4px" },
  groupLabel: { fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" },
  chip: { flex: 1, background: "#fff", border: "1px solid #DDD9D2", borderRadius: "8px", padding: "8px 6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#333" },
  chipActive: { borderColor: "#1C3557", background: "#EEF2FB", color: "#1C3557" },
  hint: { fontSize: "11px", color: "#999", marginTop: "10px" },
  stage: { flex: 1, minWidth: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F4F6", padding: "12px" },
  checker: { display: "inline-flex", alignItems: "center", justifyContent: "center", maxWidth: "100%", maxHeight: "100%", boxShadow: "0 1px 8px rgba(0,0,0,.12)" },
  beforeToggle: { position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", display: "flex", background: "rgba(0,0,0,.75)", borderRadius: "8px", overflow: "hidden" },
  baBtn: { background: "none", border: "none", color: "#bbb", padding: "6px 16px", fontSize: "12px", fontWeight: 800, cursor: "pointer", letterSpacing: ".05em" },
  baBtnActive: { background: "#fff", color: "#111" },
  busyOverlay: { position: "absolute", inset: 0, background: "rgba(255,255,255,.7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#333" },
  errBar: { background: "#FEF2F2", color: "#991B1B", borderTop: "1px solid #FCA5A5", padding: "8px 18px", fontSize: "13px" },
  foot: { display: "flex", alignItems: "center", gap: "8px", padding: "12px 18px", borderTop: "1px solid #EFEDE8", flexWrap: "wrap" },
  discardBtn: { background: "#fff", color: "#B91C1C", border: "1px solid #F0C9C9", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  applyMain: { background: "#1C3557", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 22px", fontSize: "14px", fontWeight: 800, cursor: "pointer" },
};
