"use client";

/**
 * GangSheetStudio — full-screen DTF gang sheet editor.
 *
 * A self-serve builder modelled on the industry-standard experience (EZDTFMaker /
 * Drip Apps): upload designs, drop them onto a to-scale sheet, resize/rotate/nest,
 * see live print-DPI feedback, then "Save & Add to Cart". Coordinates are inches
 * from the sheet's top-left — the units the API stores and the print file uses —
 * converted to pixels only for display.
 *
 * The heavy interaction logic (window-level pointer drag/resize, footprint-aware
 * rotation, shelf-packing auto-nest, snap) is ported from GangSheetCanvas so the
 * gestures stay battle-tested. On save it maps local placements to the server's
 * artwork rows (one artwork per unique upload) and persists the layout.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  gangSheetsService,
  type GangSheetArtwork,
  type GangSheetLibraryDesign,
  type GangSheetOrder,
  type GangSheetSize,
} from "@/services/gangSheets.service";
import { analyzeArtwork } from "@/lib/artworkAnalysis";
import { cartService } from "@/services/cart.service";

const IMAGE_TYPES = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const MIN_IN = 0.5;
const FOOT_PRESETS = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20];
const RULER_PAD = 24; // px before the sheet inside the canvas scroll — rulers start here

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/** Inch marks for a ruler: a labelled "major" step (kept ≥46px apart so labels
 *  never crowd at any zoom) with a minor tick halfway between. */
function rulerMarks(lengthIn: number, ppi: number): { inch: number; major: boolean }[] {
  if (lengthIn <= 0 || ppi <= 0) return [];
  const steps = [0.5, 1, 2, 4, 6, 12, 24];
  let major = 24;
  for (const s of steps) { major = s; if (s * ppi >= 46) break; }
  const minor = major / 2;
  const out: { inch: number; major: boolean }[] = [];
  const n = Math.floor(lengthIn / minor + 1e-6);
  for (let i = 0; i <= n; i++) {
    const inch = Math.round(i * minor * 1000) / 1000;
    out.push({ inch, major: Math.abs(inch / major - Math.round(inch / major)) < 1e-6 });
  }
  return out;
}

/** A horizontal or vertical inch ruler that lines up with the sheet (offset by
 *  `pad`) and scales with `ppi`. Rendered inside an overflow-hidden strip whose
 *  scroll is synced to the canvas. */
function Ruler({ axis, contentPx, ppi, lengthIn, pad }: { axis: "x" | "y"; contentPx: number; ppi: number; lengthIn: number; pad: number }) {
  const horiz = axis === "x";
  const marks = rulerMarks(lengthIn, ppi);
  return (
    <div style={{ position: "relative", background: "#fff", width: horiz ? `${contentPx}px` : "100%", height: horiz ? "100%" : `${contentPx}px` }}>
      {marks.map((m) => {
        const at = pad + m.inch * ppi;
        return horiz ? (
          <div key={m.inch} style={{ position: "absolute", left: `${at}px`, top: 0, bottom: 0 }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: "1px", height: m.major ? "13px" : "7px", background: "#C7CBD2" }} />
            {m.major && <span style={{ position: "absolute", top: "1px", left: "3px", fontSize: "9px", color: "#9299A3", lineHeight: 1 }}>{m.inch}</span>}
          </div>
        ) : (
          <div key={m.inch} style={{ position: "absolute", top: `${at}px`, left: 0, right: 0 }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "1px", width: m.major ? "13px" : "7px", background: "#C7CBD2" }} />
            {m.major && <span style={{ position: "absolute", left: "2px", top: "2px", fontSize: "9px", color: "#9299A3", lineHeight: 1 }}>{m.inch}</span>}
          </div>
        );
      })}
    </div>
  );
}

interface Upload {
  uid: string;
  file_url: string;
  file_name: string;
  file_type: string;
  isImage: boolean;
  pxW: number;
  pxH: number;
  hasAlpha: boolean;
  aspect: number; // pxW/pxH (or 1 for vectors)
}

interface Placement {
  id: number;
  uid: string;
  x_in: number;
  y_in: number;
  w_in: number; // own width  (before rotation)
  h_in: number; // own height (before rotation)
  rotation: number; // 0 | 90
}

interface Props {
  sizes: GangSheetSize[];
  productId: string | null;
  contactName?: string;
  contactEmail?: string;
  autoStart?: boolean;
  /** Pre-select this sheet size when the builder opens (from the product page grid). */
  initialSizeId?: string | null;
  /** Reopen an existing editable order to edit it, instead of starting fresh. */
  resumeOrder?: GangSheetOrder | null;
  onClose: () => void;
  onSaved: (order: GangSheetOrder) => void;
}

function footprint(p: Placement) {
  return p.rotation % 180 === 0 ? { w: p.w_in, h: p.h_in } : { w: p.h_in, h: p.w_in };
}

/** Effective print DPI of a placed design and its reference-style colour band. */
function dpiInfo(u: Upload | undefined, w: number, h: number) {
  if (!u || !u.isImage || !u.pxW || !u.pxH || w <= 0 || h <= 0) return null;
  const dpi = Math.floor(Math.min(u.pxW / w, u.pxH / h));
  if (dpi >= 300) return { dpi, color: "#16A34A", label: "Optimal" };
  if (dpi >= 250) return { dpi, color: "#CA8A04", label: "Good" };
  if (dpi >= 200) return { dpi, color: "#EA580C", label: "Fair" };
  return { dpi, color: "#DC2626", label: "Low" };
}

export function GangSheetStudio({ sizes, productId, contactName, contactEmail, autoStart, initialSizeId, resumeOrder, onClose, onSaved }: Props) {
  const [sizeId, setSizeId] = useState(
    resumeOrder?.sheet_size_id ||
    (initialSizeId && sizes.some((s) => s.id === initialSizeId) ? initialSizeId : "") ||
    sizes[0]?.id ||
    ""
  );
  const resumeId = resumeOrder?.id ?? null;
  const [qty, setQty] = useState(1);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<number | null>(null); // placement id
  const [zoom, setZoom] = useState(1);
  const [fitPpi, setFitPpi] = useState(10);
  const [snap, setSnap] = useState(true);
  const [showRes, setShowRes] = useState(true);
  const [imageMargin, setImageMargin] = useState(0.5);
  const [aspectLock, setAspectLock] = useState(true);
  const [panel, setPanel] = useState<"uploads" | "designs" | "gallery" | "text" | "settings">("uploads");
  const [library, setLibrary] = useState<GangSheetLibraryDesign[]>([]);
  const [gallery, setGallery] = useState<GangSheetArtwork[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customLength, setCustomLength] = useState(0);
  const [textDraft, setTextDraft] = useState({ text: "", color: "#111111", bold: true });
  const [copyN, setCopyN] = useState(1); // "add copies" quantity for the selected design
  const [panTool, setPanTool] = useState(false);  // ✋ hand tool: drag to pan the canvas
  const [showGrid, setShowGrid] = useState(false); // ▦ grid overlay on the sheet
  const [showOverlap, setShowOverlap] = useState(true); // highlight overlapping designs

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const topRulerRef = useRef<HTMLDivElement>(null);
  const leftRulerRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const autoRan = useRef(false);

  const size = useMemo(() => sizes.find((s) => s.id === sizeId), [sizes, sizeId]);
  const isCustom = size?.pricing_mode === "custom_length";

  useEffect(() => {
    if (isCustom && size) {
      setCustomLength((cur) => (cur >= size.min_length_in && cur <= size.max_length_in ? cur : size.min_length_in));
    }
  }, [sizeId, isCustom, size]);

  const sheetLen = size ? (isCustom ? customLength : size.height_in) : 0;
  const unitPrice = size ? (isCustom ? customLength * size.price_per_inch : size.price_per_sheet) : 0;
  const bleed = size?.bleed_in ?? 0;
  const printW = size ? size.width_in - bleed * 2 : 0;
  const printH = sheetLen - bleed * 2;

  const ppi = fitPpi * zoom;
  const sheetWpx = (size?.width_in ?? 0) * ppi;
  const sheetHpx = sheetLen * ppi;

  // Keep latest values available to the window pointer listeners.
  const stateRef = useRef({ placements, ppi, snap, imageMargin, size, sheetLen });
  stateRef.current = { placements, ppi, snap, imageMargin, size, sheetLen };

  const upById = useCallback((uid: string) => uploads.find((u) => u.uid === uid), [uploads]);

  // ── Undo / redo ──────────────────────────────────────────────────────────────
  // History records committed placement states. Continuous gestures (drag/resize)
  // record a single entry on release; discrete edits record on change. Undo/redo
  // set placements without re-recording (suppressHistory) and one entry per step.
  const historyRef = useRef<Placement[][]>([[]]);
  const ptrRef = useRef(0);
  const gesturing = useRef(false);
  const suppressHistory = useRef(false);
  const [, forceHud] = useState(0);

  const recordHistory = useCallback((snapshot: Placement[]) => {
    const snap = snapshot.map((p) => ({ ...p }));
    const top = historyRef.current[ptrRef.current];
    if (top && JSON.stringify(top) === JSON.stringify(snap)) return; // no-op change
    const h = historyRef.current.slice(0, ptrRef.current + 1);
    h.push(snap);
    if (h.length > 120) h.shift();
    historyRef.current = h;
    ptrRef.current = h.length - 1;
    forceHud((n) => n + 1);
  }, []);

  // Record every committed change except those made mid-gesture or by undo/redo.
  useEffect(() => {
    if (suppressHistory.current) { suppressHistory.current = false; return; }
    if (gesturing.current) return;
    recordHistory(placements);
  }, [placements, recordHistory]);

  const undo = useCallback(() => {
    if (ptrRef.current <= 0) return;
    ptrRef.current -= 1;
    suppressHistory.current = true;
    setPlacements(historyRef.current[ptrRef.current]!.map((p) => ({ ...p })));
    setSelected(null);
    forceHud((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    if (ptrRef.current >= historyRef.current.length - 1) return;
    ptrRef.current += 1;
    suppressHistory.current = true;
    setPlacements(historyRef.current[ptrRef.current]!.map((p) => ({ ...p })));
    setSelected(null);
    forceHud((n) => n + 1);
  }, []);

  const canUndo = ptrRef.current > 0;
  const canRedo = ptrRef.current < historyRef.current.length - 1;

  // ── Fit-to-width sizing ──────────────────────────────────────────────────────
  useEffect(() => {
    function fit() {
      const avail = (scrollRef.current?.clientWidth ?? 720) - 32;
      setFitPpi(Math.max(3, Math.min(60, avail / (size?.width_in || 22))));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [size?.width_in]);

  function clampSnap(xIn: number, yIn: number, fw: number, fh: number) {
    const { snap: s, imageMargin: g, size: sz, sheetLen: len } = stateRef.current;
    if (!sz) return { x: round3(xIn), y: round3(yIn) };
    let x = clamp(xIn, 0, sz.width_in - fw);
    let y = clamp(yIn, 0, len - fh);
    if (s && g > 0) {
      x = clamp(Math.round(x / g) * g, 0, sz.width_in - fw);
      y = clamp(Math.round(y / g) * g, 0, len - fh);
    }
    return { x: round3(x), y: round3(y) };
  }

  // ── Placement helpers ────────────────────────────────────────────────────────
  function overlaps(p: Placement, x: number, y: number, w: number, h: number, gap: number) {
    const fp = footprint(p);
    return !(x + w + gap <= p.x_in || x >= p.x_in + fp.w + gap || y + h + gap <= p.y_in || y >= p.y_in + fp.h + gap);
  }
  function firstFreeSpot(w: number, h: number): { x: number; y: number } {
    const g = Math.max(imageMargin, 0.25);
    const { placements: pl } = stateRef.current;
    for (let y = 0; y + h <= sheetLen; y += g) {
      for (let x = 0; x + w <= (size?.width_in ?? 0); x += g) {
        if (!pl.some((p) => overlaps(p, x, y, w, h, g))) return { x: round3(x), y: round3(y) };
      }
    }
    return { x: 0, y: 0 };
  }

  /** Default print size for a fresh upload: aim near 300 DPI, capped to the sheet. */
  function defaultSize(u: Upload): { w: number; h: number } {
    if (u.isImage && u.pxW && u.pxH) {
      let w = u.pxW / 300;
      let h = u.pxH / 300;
      const scale = Math.min(1, printW / w, printH / h);
      if (scale < 1) { w *= scale; h *= scale; }
      return { w: round2(Math.max(MIN_IN, w)), h: round2(Math.max(MIN_IN, h)) };
    }
    const w = Math.min(4, printW || 4);
    return { w: round2(w), h: round2(w) };
  }

  function addPlacement(u: Upload) {
    const { w, h } = defaultSize(u);
    const spot = firstFreeSpot(w, h);
    const id = nextId.current++;
    setPlacements((cur) => [...cur, { id, uid: u.uid, x_in: spot.x, y_in: spot.y, w_in: w, h_in: h, rotation: 0 }]);
    setSelected(id);
  }

  // ── Uploads ──────────────────────────────────────────────────────────────────
  async function onFiles(files: FileList | null, autoPlace = true) {
    if (!files?.length || !size) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const analysis = await analyzeArtwork(file);
        const res = await gangSheetsService.uploadArtwork(file);
        const u: Upload = {
          uid: `${res.url}#${nextId.current++}`,
          file_url: res.url,
          file_name: res.file_name,
          file_type: res.type,
          isImage: analysis.isImage,
          pxW: analysis.pxW,
          pxH: analysis.pxH,
          hasAlpha: analysis.hasAlpha,
          aspect: analysis.pxW && analysis.pxH ? analysis.pxW / analysis.pxH : 1,
        };
        setUploads((cur) => [...cur, u]);
        if (autoPlace) addPlacement(u);
      }
    } catch {
      setError("That file could not be uploaded. Allowed: PNG, JPG, PDF, SVG, AI, EPS, PSD, TIFF (max 50 MB).");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const [dropActive, setDropActive] = useState(false);
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropActive(false);
    onFiles(e.dataTransfer.files);
  }

  // Ready-made designs (store library) + the buyer's own past uploads (gallery).
  useEffect(() => {
    gangSheetsService.listLibrary().then(setLibrary).catch(() => {});
    gangSheetsService.myArtworks().then(setGallery).catch(() => {});
  }, []);

  // Reopen an existing editable order — rebuild uploads + placements from it so
  // the buyer can continue where they left off.
  useEffect(() => {
    if (!resumeOrder) return;
    const arts = resumeOrder.artworks ?? [];
    const ups: Upload[] = arts.map((a) => {
      const type = (a.file_type ?? a.file_url.split(".").pop() ?? "").toLowerCase();
      return {
        uid: a.id ?? `${a.file_url}#${nextId.current++}`,
        file_url: a.file_url, file_name: a.file_name, file_type: type,
        isImage: IMAGE_TYPES.has(type), pxW: 0, pxH: 0, hasAlpha: false,
        aspect: a.width_in && a.height_in ? a.width_in / a.height_in : 1,
      };
    });
    setUploads(ups);
    const pls: Placement[] = (resumeOrder.layout ?? [])
      .map((p) => ({ id: nextId.current++, uid: p.artwork_id, x_in: p.x_in, y_in: p.y_in, w_in: p.w_in, h_in: p.h_in, rotation: p.rotation }))
      .filter((p) => ups.some((u) => u.uid === p.uid));
    setPlacements(pls);
    setQty(resumeOrder.sheet_quantity || 1);
    setCustomLength(resumeOrder.sheet_height_in || 0);
    // Fill pixel dims for DPI (async, best-effort).
    ups.forEach((u) => {
      if (!u.isImage) return;
      loadDims(u.file_url)
        .then((d) => setUploads((cur) => cur.map((x) => (x.uid === u.uid ? { ...x, pxW: d.w, pxH: d.h, aspect: d.w && d.h ? d.w / d.h : x.aspect } : x))))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Read an image's natural pixel size (for DPI) without needing CORS/canvas. */
  function loadDims(src: string): Promise<{ w: number; h: number }> {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = rej;
      img.src = src;
    });
  }

  /** Add an already-hosted design (from Gallery or the store's Designs library)
   *  straight onto the sheet — no re-upload, just reference its URL. */
  async function addFromUrl(file_url: string, file_name: string, file_type?: string | null) {
    const type = (file_type || file_url.split(".").pop() || "").toLowerCase();
    const isImg = IMAGE_TYPES.has(type);
    let pxW = 0, pxH = 0;
    if (isImg) { try { const d = await loadDims(file_url); pxW = d.w; pxH = d.h; } catch { /* dims unknown */ } }
    const u: Upload = {
      uid: `${file_url}#${nextId.current++}`,
      file_url, file_name, file_type: type,
      isImage: isImg, pxW, pxH, hasAlpha: false,
      aspect: pxW && pxH ? pxW / pxH : 1,
    };
    setUploads((cur) => [...cur, u]);
    addPlacement(u);
  }

  // ── Add Text (rasterised to PNG so it flows through the same pipeline) ─────────
  async function addText() {
    const text = textDraft.text.trim();
    if (!text || !size) return;
    setUploading(true);
    try {
      const pad = 40;
      const fontPx = 220;
      const measure = document.createElement("canvas").getContext("2d")!;
      measure.font = `${textDraft.bold ? "700" : "400"} ${fontPx}px Arial, sans-serif`;
      const w = Math.ceil(measure.measureText(text).width) + pad * 2;
      const h = fontPx + pad * 2;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d")!;
      ctx.font = `${textDraft.bold ? "700" : "400"} ${fontPx}px Arial, sans-serif`;
      ctx.fillStyle = textDraft.color;
      ctx.textBaseline = "middle";
      ctx.fillText(text, pad, h / 2);
      const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), "image/png"));
      const file = new File([blob], `text-${Date.now()}.png`, { type: "image/png" });
      const res = await gangSheetsService.uploadArtwork(file);
      const u: Upload = {
        uid: `${res.url}#${nextId.current++}`,
        file_url: res.url, file_name: `Text: ${text.slice(0, 18)}`, file_type: "png",
        isImage: true, pxW: w, pxH: h, hasAlpha: true, aspect: w / h,
      };
      setUploads((cur) => [...cur, u]);
      addPlacement(u);
      setTextDraft({ text: "", color: "#111111", bold: true });
      setPanel("uploads");
    } catch {
      setError("Could not add that text.");
    } finally {
      setUploading(false);
    }
  }

  // ── Pan (hand tool) ────────────────────────────────────────────────────────
  // Drag anywhere on the canvas to scroll it — the sheet and everything on it move
  // together; nothing is edited while the hand tool is active.
  function startPan(e: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
    function move(ev: PointerEvent) { el!.scrollLeft = sl - (ev.clientX - sx); el!.scrollTop = st - (ev.clientY - sy); }
    function up() { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Keep the top/left rulers aligned with the canvas as it scrolls (programmatic
  // scrolls from wheel-zoom fire this too, so the rulers track zoom as well).
  function syncRulers() {
    const el = scrollRef.current;
    if (!el) return;
    if (topRulerRef.current) topRulerRef.current.scrollLeft = el.scrollLeft;
    if (leftRulerRef.current) leftRulerRef.current.scrollTop = el.scrollTop;
  }

  // ── Drag (move) ──────────────────────────────────────────────────────────────
  function startMove(e: React.PointerEvent, id: number) {
    if (panTool) { startPan(e); return; }
    e.preventDefault(); e.stopPropagation();
    setSelected(id);
    gesturing.current = true;
    const startX = e.clientX, startY = e.clientY;
    const orig = stateRef.current.placements.find((p) => p.id === id)!;
    const ox = orig.x_in, oy = orig.y_in;

    function move(ev: PointerEvent) {
      const { ppi: p, placements: pl } = stateRef.current;
      const cur = pl.find((q) => q.id === id);
      if (!cur) return;
      const fp = footprint(cur);
      const { x, y } = clampSnap(ox + (ev.clientX - startX) / p, oy + (ev.clientY - startY) / p, fp.w, fp.h);
      setPlacements((list) => list.map((q) => (q.id === id ? { ...q, x_in: x, y_in: y } : q)));
    }
    function upFn() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", upFn);
      gesturing.current = false;
      recordHistory(stateRef.current.placements); // one undo entry per drag
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", upFn);
  }

  // ── Resize (corner) — proportional by default, free while Shift or lock off ────
  function startResize(e: React.PointerEvent, id: number) {
    e.preventDefault(); e.stopPropagation();
    setSelected(id);
    gesturing.current = true;
    const startX = e.clientX, startY = e.clientY;
    const orig = stateRef.current.placements.find((p) => p.id === id)!;
    const origFp = footprint(orig);
    const rotated = orig.rotation % 180 !== 0;

    function move(ev: PointerEvent) {
      const { ppi: p, placements: pl, size: sz, sheetLen: len } = stateRef.current;
      if (!sz) return;
      const cur = pl.find((q) => q.id === id);
      if (!cur) return;
      const dxIn = (ev.clientX - startX) / p;
      const dyIn = (ev.clientY - startY) / p;
      const free = ev.shiftKey || !aspectLock;
      let baseW: number, baseH: number;
      if (free) {
        const newFw = clamp(origFp.w + dxIn, MIN_IN, sz.width_in - cur.x_in);
        const newFh = clamp(origFp.h + dyIn, MIN_IN, len - cur.y_in);
        baseW = rotated ? newFh : newFw;
        baseH = rotated ? newFw : newFh;
      } else {
        const maxScale = Math.min((sz.width_in - cur.x_in) / origFp.w, (len - cur.y_in) / origFp.h);
        const scale = clamp((origFp.w + dxIn) / origFp.w, MIN_IN / origFp.w, maxScale);
        baseW = orig.w_in * scale;
        baseH = orig.h_in * scale;
      }
      const w = round3(Math.max(MIN_IN, baseW));
      const h = round3(Math.max(MIN_IN, baseH));
      setPlacements((list) => list.map((q) => (q.id === id ? { ...q, w_in: w, h_in: h } : q)));
    }
    function upFn() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", upFn);
      gesturing.current = false;
      recordHistory(stateRef.current.placements); // one undo entry per resize
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", upFn);
  }

  // ── Discrete edits ───────────────────────────────────────────────────────────
  function rotate(id: number) {
    setPlacements((list) => list.map((p) => {
      if (p.id !== id) return p;
      const rot = p.rotation % 180 === 0 ? 90 : 0;
      const fp = footprint({ ...p, rotation: rot });
      const { x, y } = clampSnap(p.x_in, p.y_in, fp.w, fp.h);
      return { ...p, rotation: rot, x_in: x, y_in: y };
    }));
  }
  function remove(id: number) {
    setPlacements((list) => list.filter((p) => p.id !== id));
    if (selected === id) setSelected(null);
  }
  function duplicate(id: number) {
    const p = stateRef.current.placements.find((q) => q.id === id);
    if (!p) return;
    const fp = footprint(p);
    const spot = firstFreeSpot(fp.w, fp.h);
    const nid = nextId.current++;
    setPlacements((list) => [...list, { ...p, id: nid, x_in: spot.x, y_in: spot.y }]);
    setSelected(nid);
  }
  function setDim(id: number, dim: "w" | "h", val: number) {
    setPlacements((list) => list.map((p) => {
      if (p.id !== id) return p;
      const u = upById(p.uid);
      const asp = u?.aspect || p.w_in / p.h_in || 1;
      let w = p.w_in, h = p.h_in;
      if (dim === "w") { w = Math.max(MIN_IN, val); if (aspectLock) h = round2(w / asp); }
      else { h = Math.max(MIN_IN, val); if (aspectLock) w = round2(h * asp); }
      return { ...p, w_in: round2(w), h_in: round2(h) };
    }));
  }

  /** Set the exact Left/Top of a design (clamped + snapped inside the sheet). */
  function setPos(id: number, axis: "x" | "y", val: number) {
    setPlacements((list) => list.map((p) => {
      if (p.id !== id) return p;
      const fp = footprint(p);
      const { x, y } = clampSnap(axis === "x" ? val : p.x_in, axis === "y" ? val : p.y_in, fp.w, fp.h);
      return { ...p, x_in: x, y_in: y };
    }));
  }

  /** Align the selected design to an edge or centre of the sheet's print area. */
  function align(kind: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
    if (!size || selected == null) return;
    setPlacements((list) => list.map((q) => {
      if (q.id !== selected) return q;
      const fp = footprint(q);
      let x = q.x_in, y = q.y_in;
      if (kind === "left") x = bleed;
      else if (kind === "hcenter") x = (size.width_in - fp.w) / 2;
      else if (kind === "right") x = size.width_in - bleed - fp.w;
      else if (kind === "top") y = bleed;
      else if (kind === "vcenter") y = (sheetLen - fp.h) / 2;
      else if (kind === "bottom") y = sheetLen - bleed - fp.h;
      return { ...q, x_in: round3(Math.max(0, x)), y_in: round3(Math.max(0, y)) };
    }));
  }

  /** Space every design evenly across the sheet along one axis (needs 3+). */
  function distribute(axis: "h" | "v") {
    setPlacements((list) => {
      if (list.length < 3) return list;
      const items = list.map((p) => ({
        id: p.id,
        pos: axis === "h" ? p.x_in : p.y_in,
        ext: axis === "h" ? footprint(p).w : footprint(p).h,
      })).sort((a, b) => a.pos - b.pos);
      const first = items[0]!, last = items[items.length - 1]!;
      const span = (last.pos + last.ext) - first.pos;
      const totalExt = items.reduce((s, it) => s + it.ext, 0);
      const gap = (span - totalExt) / (items.length - 1);
      const posById = new Map<number, number>();
      let cursor = first.pos;
      for (const it of items) { posById.set(it.id, round3(cursor)); cursor += it.ext + gap; }
      return list.map((p) => {
        const np = posById.get(p.id);
        if (np == null) return p;
        return axis === "h" ? { ...p, x_in: np } : { ...p, y_in: np };
      });
    });
  }

  /** Add N more copies of the selected design, packed into the free space. */
  function addCopies(n: number) {
    if (selected == null || n < 1 || !size) return;
    const src = stateRef.current.placements.find((q) => q.id === selected);
    if (!src) return;
    const g = Math.max(imageMargin, 0.25);
    const fp = footprint(src);
    // Track occupied boxes locally so copies added in this batch don't stack.
    const taken = stateRef.current.placements.map((p) => ({ x: p.x_in, y: p.y_in, w: footprint(p).w, h: footprint(p).h }));
    const freeSpot = () => {
      for (let y = 0; y + fp.h <= sheetLen + 1e-6; y += g) {
        for (let x = 0; x + fp.w <= size.width_in + 1e-6; x += g) {
          const clash = taken.some((q) => !(x + fp.w + g <= q.x || x >= q.x + q.w + g || y + fp.h + g <= q.y || y >= q.y + q.h + g));
          if (!clash) return { x: round3(x), y: round3(y) };
        }
      }
      return { x: 0, y: 0 };
    };
    const out: Placement[] = [];
    for (let i = 0; i < n; i++) {
      const spot = freeSpot();
      out.push({ ...src, id: nextId.current++, x_in: spot.x, y_in: spot.y });
      taken.push({ x: spot.x, y: spot.y, w: fp.w, h: fp.h });
    }
    setPlacements((list) => [...list, ...out]);
  }

  /** Fill the whole sheet with copies of one design (shelf pack). */
  function autoFill(id: number) {
    const p = stateRef.current.placements.find((q) => q.id === id);
    if (!p || !size) return;
    const g = Math.max(imageMargin, 0.1);
    const fp = footprint(p);
    const cols = Math.max(1, Math.floor((size.width_in + g) / (fp.w + g)));
    const rows = Math.max(1, Math.floor((sheetLen + g) / (fp.h + g)));
    const out: Placement[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({ ...p, id: nextId.current++, x_in: round3(c * (fp.w + g)), y_in: round3(r * (fp.h + g)) });
      }
    }
    setPlacements((list) => [...list.filter((q) => q.id !== id), ...out]);
    setSelected(null);
  }

  // Auto-nest every placement: first-fit-decreasing-height shelf packing.
  // extraGap adds cut-around spacing for the "Auto Nest for Cutting" variant so a
  // plotter has room to cut each piece out.
  function autoNest(extraGap = 0) {
    if (!size) return;
    const g = imageMargin + extraGap, W = size.width_in;
    const items = stateRef.current.placements.map((p) => {
      let w = p.w_in, h = p.h_in, rot = 0;
      if (h > w && p.h_in <= W) { w = p.h_in; h = p.w_in; rot = 90; }
      return { p, w, h, rot };
    }).sort((a, b) => b.h - a.h);
    const shelves: { y: number; height: number; cursorX: number }[] = [];
    const out: Placement[] = [];
    for (const it of items) {
      if (it.w > W) { out.push(it.p); continue; }
      let shelf = shelves.find((s) => s.cursorX + it.w <= W + 1e-6 && it.h <= s.height + 1e-6);
      if (!shelf) {
        const prev = shelves[shelves.length - 1];
        const y = prev ? prev.y + prev.height + g : 0;
        if (y + it.h > sheetLen) { out.push(it.p); continue; }
        shelf = { y, height: it.h, cursorX: 0 };
        shelves.push(shelf);
      }
      out.push({ ...it.p, x_in: round3(shelf.cursorX), y_in: round3(shelf.y), rotation: it.rot });
      shelf.cursorX = round3(shelf.cursorX + it.w + g);
    }
    setPlacements(out);
    setSelected(null);
  }

  // Auto-build: fill the sheet with copies of your designs (round-robin), packed
  // top-to-bottom. Great starting point — then delete any copies you don't want.
  function autoBuild() {
    if (!size) return;
    const g = Math.min(Math.max(imageMargin, 0.1), 3); // sane cap so a huge margin can't break the fill
    const W = size.width_in;
    // Base set: each unique design currently on the sheet at its size; if nothing
    // is placed yet, every upload at its default print size.
    const base: { uid: string; w: number; h: number }[] = [];
    const seen = new Set<string>();
    for (const p of stateRef.current.placements) {
      if (seen.has(p.uid)) continue;
      seen.add(p.uid);
      base.push({ uid: p.uid, w: p.w_in, h: p.h_in });
    }
    if (base.length === 0) {
      for (const u of uploads) { const d = defaultSize(u); base.push({ uid: u.uid, w: d.w, h: d.h }); }
    }
    if (base.length === 0) return;

    const shelves: { y: number; height: number; cursorX: number }[] = [];
    const out: Placement[] = [];
    const CAP = 300;
    let fails = 0;
    for (let attempt = 0; attempt < 5000 && out.length < CAP; attempt++) {
      const b = base[attempt % base.length]!;
      let w = b.w, h = b.h, rot = 0;
      if (h > w && b.h <= W) { w = b.h; h = b.w; rot = 90; } // rotate tall to fit width
      if (w > W) { fails++; if (fails >= base.length) break; continue; }
      let shelf = shelves.find((s) => s.cursorX + w <= W + 1e-6 && h <= s.height + 1e-6);
      if (!shelf) {
        const prev = shelves[shelves.length - 1];
        const y = prev ? prev.y + prev.height + g : 0;
        if (y + h > sheetLen) { fails++; if (fails >= base.length) break; continue; }
        shelf = { y, height: h, cursorX: 0 };
        shelves.push(shelf);
      }
      out.push({ id: nextId.current++, uid: b.uid, x_in: round3(shelf.cursorX), y_in: round3(shelf.y), w_in: b.w, h_in: b.h, rotation: rot });
      shelf.cursorX = round3(shelf.cursorX + w + g);
      fails = 0;
    }
    if (out.length) { setPlacements(out); setSelected(null); }
  }

  function startOver() {
    setPlacements([]);
    setSelected(null);
  }

  // Auto-build once when launched from the welcome screen's "Auto Build" — fill
  // the sheet as soon as the first design is uploaded.
  useEffect(() => {
    if (autoStart && !autoRan.current && placements.length > 0) {
      autoRan.current = true;
      autoBuild();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, placements.length]);

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  const zoomBy = (f: number) => setZoom((z) => clamp(round3(z * f), 0.15, 6));
  const fitScreen = () => {
    const el = scrollRef.current;
    if (!el || !size) return;
    const zx = (el.clientWidth - 40) / (size.width_in * fitPpi);
    const zy = ((el.clientHeight || 560) - 40) / (sheetLen * fitPpi);
    setZoom(clamp(round3(Math.min(zx, zy)), 0.15, 6));
  };
  // Mouse-wheel zooms the sheet toward the cursor — the rest of the canvas (rails,
  // toolbar, panels) stay put; only the sheet scales, like the reference builder.
  // React makes onWheel passive (so preventDefault is ignored + warns), so we bind
  // a native non-passive listener. Re-bound on zoom change to read the latest scale;
  // the point under the cursor is anchored by adjusting scroll after the re-render.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handle(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const next = clamp(round3(zoom * factor), 0.15, 6);
      if (next === zoom) return;
      const rect = el!.getBoundingClientRect();
      const px = e.clientX - rect.left; // cursor within the viewport
      const py = e.clientY - rect.top;
      const cx = el!.scrollLeft + px;   // cursor within the scrolled content
      const cy = el!.scrollTop + py;
      const ratio = next / zoom;
      setZoom(next);
      requestAnimationFrame(() => {
        el!.scrollLeft = cx * ratio - px;
        el!.scrollTop = cy * ratio - py;
      });
    }
    el.addEventListener("wheel", handle, { passive: false });
    return () => el.removeEventListener("wheel", handle);
  }, [zoom]);

  // Keep rulers aligned after zoom/size changes made without a scroll event
  // (zoom buttons, fit-to-screen, size switch).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (topRulerRef.current) topRulerRef.current.scrollLeft = el.scrollLeft;
    if (leftRulerRef.current) leftRulerRef.current.scrollTop = el.scrollTop;
  }, [zoom, sheetWpx, sheetHpx]);

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    const meta = e.ctrlKey || e.metaKey;
    // Undo/redo work with or without a selection.
    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (selected == null) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected); return; }
    if (e.key === "d" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); duplicate(selected); return; }
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : Math.max(imageMargin, 0.1);
      const p = placements.find((q) => q.id === selected);
      if (!p) return;
      const fp = footprint(p);
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      const { x, y } = clampSnap(p.x_in + dx, p.y_in + dy, fp.w, fp.h);
      setPlacements((list) => list.map((q) => (q.id === selected ? { ...q, x_in: x, y_in: y } : q)));
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function save(toCart: boolean) {
    setError(null);
    setSavedOk(false);
    if (!size) { setError("Choose a sheet size."); return; }
    if (placements.length === 0) { setError("Add at least one design to the sheet."); return; }
    setSaving(true);
    try {
      // One artwork per unique upload that's actually on the sheet; its stored
      // size is the first placement's footprint, quantity = number of copies.
      const usedUids = Array.from(new Set(placements.map((p) => p.uid)));
      const artPayload = usedUids.map((uid) => {
        const u = upById(uid)!;
        const first = placements.find((p) => p.uid === uid)!;
        const count = placements.filter((p) => p.uid === uid).length;
        return {
          file_url: u.file_url, file_name: u.file_name, file_type: u.file_type,
          width_in: round2(first.w_in), height_in: round2(first.h_in), quantity: count,
        };
      });

      // Reopened order → replace its contents in place; otherwise submit a new one.
      const order = resumeId
        ? await gangSheetsService.rebuild(resumeId, {
            sheet_size_id: size.id,
            sheet_quantity: qty,
            custom_length_in: isCustom ? customLength : undefined,
            artworks: artPayload,
          })
        : await gangSheetsService.submit({
            sheet_size_id: size.id,
            sheet_quantity: qty,
            custom_length_in: isCustom ? customLength : undefined,
            artworks: artPayload,
            product_id: productId || undefined,
            contact_name: contactName || undefined,
            contact_email: contactEmail || undefined,
          });

      // Map local uploads → server artwork ids (matched by file_url) and persist
      // the exact layout the buyer arranged.
      const idByUrl = new Map((order.artworks ?? []).map((a) => [a.file_url, a.id ?? ""]));
      const layout = placements
        .map((p) => {
          const u = upById(p.uid);
          const artId = u ? idByUrl.get(u.file_url) : undefined;
          if (!artId) return null;
          return { artwork_id: artId, x_in: p.x_in, y_in: p.y_in, rotation: p.rotation, w_in: p.w_in, h_in: p.h_in };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
      let finalOrder = order;
      if (layout.length) {
        try { finalOrder = await gangSheetsService.saveLayout(order.id, layout); } catch { /* layout best-effort */ }
      }

      // "Save & Add to Cart" — put it in the cart and head to checkout. Company
      // buyers reach the cart; if the cart isn't available (individual buyer),
      // fall back to the saved-to-gang-sheets flow so nothing is lost.
      if (toCart) {
        try {
          await cartService.addGangSheet(finalOrder.id);
          window.location.href = "/cart";
          return;
        } catch { /* cart unavailable — fall through */ }
      }
      setSavedOk(true);
      onSaved(finalOrder);
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      setError(msg || "Could not save this gang sheet. Please make sure you're signed in.");
    } finally {
      setSaving(false);
    }
  }

  const usedLength = placements.reduce((mx, p) => Math.max(mx, p.y_in + footprint(p).h), 0);
  const sel = selected != null ? placements.find((p) => p.id === selected) : undefined;
  const selUp = sel ? upById(sel.uid) : undefined;
  const selFp = sel ? footprint(sel) : null;
  const selDpi = sel && selFp ? dpiInfo(selUp, selFp.w, selFp.h) : null;

  // ── Production warnings ──────────────────────────────────────────────────────
  // Advisory only — never blocks saving. Flags low DPI, designs past the safe
  // area, overlaps, and very small artwork, both in a summary and per-design.
  const warnings = useMemo(() => {
    const out: { id: number; kind: "dpi" | "outside" | "overlap" | "small"; msg: string }[] = [];
    if (!size) return out;
    const x1 = size.width_in - bleed, y1 = sheetLen - bleed;
    for (const p of placements) {
      const fp = footprint(p);
      if (p.x_in < bleed - 1e-6 || p.y_in < bleed - 1e-6 || p.x_in + fp.w > x1 + 1e-6 || p.y_in + fp.h > y1 + 1e-6)
        out.push({ id: p.id, kind: "outside", msg: "extends past the safe print area" });
      if (Math.min(fp.w, fp.h) < 0.75)
        out.push({ id: p.id, kind: "small", msg: "very small — may not print cleanly" });
      const d = dpiInfo(upById(p.uid), fp.w, fp.h);
      if (d && d.dpi < 200) out.push({ id: p.id, kind: "dpi", msg: `low resolution (${d.dpi} DPI)` });
    }
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i]!, b = placements[j]!;
        const fa = footprint(a), fb = footprint(b);
        const ov = !(a.x_in + fa.w <= b.x_in || b.x_in + fb.w <= a.x_in || a.y_in + fa.h <= b.y_in || b.y_in + fb.h <= a.y_in);
        if (ov) { out.push({ id: a.id, kind: "overlap", msg: "overlaps another design" }); out.push({ id: b.id, kind: "overlap", msg: "overlaps another design" }); }
      }
    }
    return out;
  }, [placements, size, bleed, sheetLen, upById]);

  const warnIds = useMemo(() => new Set(warnings.map((w) => w.id)), [warnings]);
  const overlapIds = useMemo(() => new Set(warnings.filter((w) => w.kind === "overlap").map((w) => w.id)), [warnings]);
  const warnCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const w of warnings) c[w.kind] = (c[w.kind] || 0) + 1;
    return c;
  }, [warnings]);

  return (
    <div style={S.root}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={S.logo}>DTF<span style={{ color: "var(--brand-primary,#1C3557)" }}> Studio</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <label style={{ fontSize: "13px", color: "#555", display: "flex", alignItems: "center", gap: "6px" }}>
            Sheets
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: "58px", padding: "6px 8px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "13px" }} />
          </label>
          <button onClick={() => save(true)} disabled={saving} style={{ ...S.primaryBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save & Add to Cart"}
          </button>
          <button onClick={() => save(false)} disabled={saving} style={S.ghostBtn} title="Save without adding to cart">Save</button>
          <button onClick={onClose} style={S.closeBtn}>Close</button>
        </div>
        <div style={{ textAlign: "right", minWidth: "120px" }}>
          <div style={{ fontSize: "11px", color: "#999", textTransform: "uppercase", letterSpacing: ".05em" }}>Price</div>
          <div style={{ fontSize: "20px", fontWeight: 800 }}>${(unitPrice * qty).toFixed(2)}</div>
        </div>
      </div>

      {error && <div style={S.errorBar}>{error}{savedOk ? "" : " "}<button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#991B1B", cursor: "pointer", fontWeight: 700 }}>✕</button></div>}
      {savedOk && !error && <div style={S.okBar}>✓ Saved. It&apos;s in your gang sheets and ready for checkout.</div>}

      <div style={S.body}>
        {/* ── Left rail ─────────────────────────────────────────────────────── */}
        <div style={S.rail}>
          {([["uploads", "⬆", "Uploads"], ["designs", "✦", "Designs"], ["gallery", "🖼", "Gallery"], ["text", "T", "Add Text"], ["settings", "⚙", "Settings"]] as const).map(([key, icon, label]) => (
            <button key={key} onClick={() => setPanel(key)} title={label}
              style={{ ...S.railBtn, ...(panel === key ? S.railBtnActive : {}) }}>
              <span style={{ fontSize: "18px", lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: "9px", marginTop: "3px" }}>{label}</span>
            </button>
          ))}
        </div>

        {/* ── Left panel ────────────────────────────────────────────────────── */}
        <div style={S.leftPanel}>
          {panel === "uploads" && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
                onDragLeave={() => setDropActive(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{ ...S.dropzone, borderColor: dropActive ? "var(--brand-primary,#1C3557)" : "#C9C5BD", background: dropActive ? "#EEF2FF" : "#FAFAF8" }}
              >
                <div style={{ fontSize: "26px" }}>⬆</div>
                <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "6px" }}>{uploading ? "Uploading…" : "Drag & drop, or click to upload"}</div>
                <div style={{ fontSize: "11px", color: "#999", marginTop: "4px" }}>PNG, JPG, PDF, SVG · larger than 300×300px</div>
              </div>
              <input ref={fileRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.svg,.ai,.eps,.psd,.tif,.tiff" onChange={(e) => onFiles(e.target.files)} style={{ display: "none" }} />

              <div style={{ marginTop: "16px", fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".05em" }}>Your uploads</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
                {uploads.map((u) => {
                  const count = placements.filter((p) => p.uid === u.uid).length;
                  return (
                    <button key={u.uid} onClick={() => addPlacement(u)} title="Add to sheet" style={S.uploadThumb}>
                      {IMAGE_TYPES.has(u.file_type.toLowerCase())
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={u.file_url} alt="" style={{ width: "100%", height: "64px", objectFit: "contain" }} />
                        : <div style={{ height: "64px", display: "flex", alignItems: "center", justifyContent: "center", color: "#4338CA", fontWeight: 700 }}>{u.file_type.toUpperCase().slice(0, 4)}</div>}
                      <div style={{ fontSize: "10px", color: "#666", padding: "3px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.file_name}</div>
                      {count > 0 && <span style={S.thumbBadge}>{count}</span>}
                    </button>
                  );
                })}
                {uploads.length === 0 && <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "#aaa", padding: "10px 0" }}>No uploads yet.</div>}
              </div>
            </>
          )}

          {panel === "designs" && (
            <>
              <div style={S.panelTitle}>Ready-made designs</div>
              <p style={{ fontSize: "11px", color: "#999", marginBottom: "10px" }}>Tap any design to drop it on your sheet.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {library.map((d) => (
                  <button key={d.id} onClick={() => addFromUrl(d.file_url, d.name, d.file_type)} title={d.name} style={S.uploadThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.file_url} alt="" style={{ width: "100%", height: "72px", objectFit: "contain", background: "#F7F7F5" }} />
                    <div style={{ fontSize: "10px", color: "#666", padding: "3px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  </button>
                ))}
                {library.length === 0 && <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "#aaa", padding: "10px 0" }}>No ready-made designs yet.</div>}
              </div>
            </>
          )}

          {panel === "gallery" && (
            <>
              <div style={S.panelTitle}>Your gallery</div>
              <p style={{ fontSize: "11px", color: "#999", marginBottom: "10px" }}>Designs you&apos;ve used before — reuse without re-uploading.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {gallery.map((a, i) => (
                  <button key={`${a.file_url}-${i}`} onClick={() => addFromUrl(a.file_url, a.file_name, a.file_type)} title={a.file_name} style={S.uploadThumb}>
                    {IMAGE_TYPES.has((a.file_type ?? "").toLowerCase())
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.file_url} alt="" style={{ width: "100%", height: "72px", objectFit: "contain", background: "#F7F7F5" }} />
                      : <div style={{ height: "72px", display: "flex", alignItems: "center", justifyContent: "center", color: "#4338CA", fontWeight: 700 }}>{(a.file_type ?? "?").toUpperCase().slice(0, 4)}</div>}
                    <div style={{ fontSize: "10px", color: "#666", padding: "3px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</div>
                  </button>
                ))}
                {gallery.length === 0 && <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "#aaa", padding: "10px 0" }}>Your used designs will appear here.</div>}
              </div>
            </>
          )}

          {panel === "text" && (
            <>
              <div style={S.panelTitle}>Add text</div>
              <textarea value={textDraft.text} onChange={(e) => setTextDraft((t) => ({ ...t, text: e.target.value }))}
                placeholder="Type your text…" rows={3}
                style={{ width: "100%", boxSizing: "border-box", padding: "9px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "14px", resize: "vertical" }} />
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px" }}>
                <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  Colour <input type="color" value={textDraft.color} onChange={(e) => setTextDraft((t) => ({ ...t, color: e.target.value }))} style={{ width: "34px", height: "28px", border: "none", background: "none" }} />
                </label>
                <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <input type="checkbox" checked={textDraft.bold} onChange={(e) => setTextDraft((t) => ({ ...t, bold: e.target.checked }))} /> Bold
                </label>
              </div>
              <button onClick={addText} disabled={!textDraft.text.trim() || uploading} style={{ ...S.primaryBtn, width: "100%", marginTop: "14px", opacity: textDraft.text.trim() ? 1 : 0.5 }}>
                Add text to sheet
              </button>
              <p style={{ fontSize: "11px", color: "#999", marginTop: "10px" }}>Text is added as a high-resolution graphic you can move and resize like any design.</p>
            </>
          )}

          {panel === "settings" && (
            <>
              <div style={S.panelTitle}>Settings</div>
              {[["Snap when moving", snap, setSnap], ["Show resolution colours", showRes, setShowRes], ["Lock aspect ratio", aspectLock, setAspectLock]].map(([label, val, set]) => (
                <label key={label as string} style={S.toggleRow}>
                  <span style={{ fontSize: "13px" }}>{label as string}</span>
                  <input type="checkbox" checked={val as boolean} onChange={(e) => (set as (v: boolean) => void)(e.target.checked)} />
                </label>
              ))}
              <div style={{ marginTop: "14px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#666" }}>Image margin (in)</label>
                <input type="number" min={0} step="0.25" value={imageMargin} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setImageMargin(Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "13px", marginTop: "4px" }} />
              </div>
            </>
          )}

          {/* Selected-design controls (always available under the panel) */}
          {sel && selFp && (
            <div style={S.selCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "#555" }}>Selected design</span>
                <button onClick={() => remove(sel.id)} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>Remove</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={S.miniLabel}>Width (in)
                  <input type="number" step="0.25" min={MIN_IN} value={sel.w_in} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setDim(sel.id, "w", Number(e.target.value))} style={S.miniInput} />
                </label>
                <label style={S.miniLabel}>Height (in)
                  <input type="number" step="0.25" min={MIN_IN} value={sel.h_in} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setDim(sel.id, "h", Number(e.target.value))} style={S.miniInput} />
                </label>
                <label style={S.miniLabel}>Left (in)
                  <input type="number" step="0.25" min={0} value={sel.x_in} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setPos(sel.id, "x", Number(e.target.value))} style={S.miniInput} />
                </label>
                <label style={S.miniLabel}>Top (in)
                  <input type="number" step="0.25" min={0} value={sel.y_in} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setPos(sel.id, "y", Number(e.target.value))} style={S.miniInput} />
                </label>
              </div>
              {selDpi && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "12px" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: selDpi.color }} />
                  <span style={{ fontWeight: 700, color: selDpi.color }}>{selDpi.label} · {selDpi.dpi} DPI</span>
                  {selUp?.hasAlpha ? <span style={{ color: "#166534", marginLeft: "auto" }}>✔ transparent</span> : selUp?.isImage ? <span style={{ color: "#92400E", marginLeft: "auto" }}>⚠ background</span> : null}
                </div>
              )}
              {warnings.filter((w) => w.id === sel.id).length > 0 && (
                <div style={{ marginTop: "8px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "6px", padding: "7px 9px" }}>
                  {Array.from(new Set(warnings.filter((w) => w.id === sel.id).map((w) => w.msg))).map((m) => (
                    <div key={m} style={{ fontSize: "11px", color: "#9A3412", fontWeight: 600 }}>⚠ {m}</div>
                  ))}
                </div>
              )}
              {/* Align the selected design to the sheet */}
              <div style={{ marginTop: "12px" }}>
                <div style={{ ...S.miniLabel, marginBottom: "5px" }}>Align to sheet</div>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  <button onClick={() => align("left")} style={S.smallBtn} title="Align left">⇤ L</button>
                  <button onClick={() => align("hcenter")} style={S.smallBtn} title="Center across">⇔ C</button>
                  <button onClick={() => align("right")} style={S.smallBtn} title="Align right">⇥ R</button>
                  <button onClick={() => align("top")} style={S.smallBtn} title="Align top">⤒ T</button>
                  <button onClick={() => align("vcenter")} style={S.smallBtn} title="Center down">⥮ M</button>
                  <button onClick={() => align("bottom")} style={S.smallBtn} title="Align bottom">⤓ B</button>
                </div>
              </div>

              {/* Distribute all designs evenly (needs 3+) */}
              {placements.length >= 3 && (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ ...S.miniLabel, marginBottom: "5px" }}>Distribute all designs</div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button onClick={() => distribute("h")} style={S.smallBtn} title="Even spacing across">↔ Across</button>
                    <button onClick={() => distribute("v")} style={S.smallBtn} title="Even spacing down">↕ Down</button>
                  </div>
                </div>
              )}

              {/* Add copies of the selected design */}
              <div style={{ marginTop: "10px" }}>
                <div style={{ ...S.miniLabel, marginBottom: "5px" }}>Add copies of this design</div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input type="number" min={1} value={copyN} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setCopyN(Math.max(1, Math.floor(Number(e.target.value)) || 1))} style={{ ...S.miniInput, width: "70px" }} />
                  <button onClick={() => addCopies(copyN)} style={S.smallBtn}>＋ Add copies</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px", marginTop: "12px", flexWrap: "wrap" }}>
                <button onClick={() => rotate(sel.id)} style={S.smallBtn}>⟳ Rotate</button>
                <button onClick={() => duplicate(sel.id)} style={S.smallBtn}>⧉ Duplicate</button>
                <button onClick={() => autoFill(sel.id)} style={{ ...S.smallBtn, width: "100%" }}>▦ Auto fill sheet</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Canvas area ───────────────────────────────────────────────────── */}
        <div style={S.canvasArea}>
          {/* Toolbar */}
          <div style={S.toolbar}>
            <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} style={S.sizeSelect}>
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.pricing_mode === "custom_length" ? `${s.name} — ${s.width_in}″ × custom` : `${s.name} — ${s.width_in}×${s.height_in}″`}
                </option>
              ))}
            </select>
            {isCustom && size && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input type="number" min={size.min_length_in} max={size.max_length_in} value={customLength}
                  onChange={(e) => setCustomLength(clamp(Number(e.target.value) || size.min_length_in, size.min_length_in, size.max_length_in))}
                  style={{ width: "70px", padding: "7px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "13px" }} />
                <span style={{ fontSize: "12px", color: "#888" }}>in</span>
                <select onChange={(e) => setCustomLength(clamp(Number(e.target.value) * 12, size.min_length_in, size.max_length_in))} value="" style={{ ...S.sizeSelect, minWidth: "auto" }}>
                  <option value="">ft…</option>
                  {FOOT_PRESETS.filter((f) => f * 12 >= size.min_length_in && f * 12 <= size.max_length_in).map((f) => <option key={f} value={f}>{f} feet</option>)}
                </select>
              </div>
            )}
            <div style={S.toolDivider} />
            <button onClick={() => setPanTool((v) => !v)} title="Pan / hand tool" style={{ ...S.iconBtn, background: panTool ? "#E8EEF9" : "#fff", borderColor: panTool ? "var(--brand-primary,#1C3557)" : "#DDD9D2" }}>✋</button>
            <button onClick={() => setShowGrid((v) => !v)} title="Toggle grid" style={{ ...S.iconBtn, background: showGrid ? "#E8EEF9" : "#fff", borderColor: showGrid ? "var(--brand-primary,#1C3557)" : "#DDD9D2" }}>▦</button>
            <div style={S.toolDivider} />
            <label style={{ fontSize: "12px", color: "#555", display: "flex", alignItems: "center", gap: "5px" }}>
              Margin
              <input type="number" min={0} step="0.25" value={imageMargin} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setImageMargin(Math.max(0, Number(e.target.value) || 0))} style={{ width: "52px", padding: "6px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "12px" }} /> in
            </label>
            <button onClick={() => autoNest()} style={S.nestBtn}>⚡ Auto Nest</button>
            <button onClick={() => autoNest(0.5)} style={S.nestBtn} title="Nest with extra spacing so each design can be cut out">✂ Auto Nest for Cutting</button>
            <div style={S.toolDivider} />
            <button onClick={undo} disabled={!canUndo} style={{ ...S.iconBtn, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? "pointer" : "default" }} title="Undo (Ctrl+Z)">↶</button>
            <button onClick={redo} disabled={!canRedo} style={{ ...S.iconBtn, opacity: canRedo ? 1 : 0.4, cursor: canRedo ? "pointer" : "default" }} title="Redo (Ctrl+Shift+Z)">↷</button>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}>
              <button onClick={() => zoomBy(1 / 1.2)} style={S.iconBtn} title="Zoom out">−</button>
              <span style={{ fontSize: "12px", color: "#666", width: "44px", textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => zoomBy(1.2)} style={S.iconBtn} title="Zoom in">+</button>
              <button onClick={fitScreen} style={S.iconBtn} title="Fit to screen">⊡</button>
            </div>
          </div>

          {/* Rulers + canvas. The top/left inch rulers scroll in sync with the sheet. */}
          <div style={S.rulerGrid}>
            <div style={S.rulerCorner} />
            <div ref={topRulerRef} style={S.rulerTopWrap}>
              <Ruler axis="x" contentPx={sheetWpx + RULER_PAD * 2} ppi={ppi} lengthIn={size?.width_in ?? 0} pad={RULER_PAD} />
            </div>
            <div ref={leftRulerRef} style={S.rulerLeftWrap}>
              <Ruler axis="y" contentPx={sheetHpx + RULER_PAD * 2} ppi={ppi} lengthIn={sheetLen} pad={RULER_PAD} />
            </div>

            <div style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
              {/* Scrollable sheet — wheel-zoom bound natively; scroll syncs the rulers. */}
              <div ref={scrollRef} onScroll={syncRulers} style={S.canvasScroll}>
                <div
                  ref={sheetRef}
                  tabIndex={0}
                  onKeyDown={onKeyDown}
                  onPointerDown={(e) => { if (panTool) { startPan(e); return; } setSelected(null); sheetRef.current?.focus(); }}
                  style={{
                    position: "relative", width: `${sheetWpx}px`, height: `${sheetHpx}px`, margin: 0,
                    background: "#fff", outline: "none", touchAction: "none", userSelect: "none",
                    cursor: panTool ? "grab" : "default",
                    backgroundImage: "repeating-conic-gradient(#EFEFEF 0% 25%, #fff 0% 50%)",
                    backgroundSize: "18px 18px",
                    boxShadow: "0 1px 6px rgba(0,0,0,.12)",
                  }}
                >
                  {bleed > 0 && (
                    <div style={{ position: "absolute", left: bleed * ppi, top: bleed * ppi, right: bleed * ppi, bottom: bleed * ppi, border: "1px dashed #D08C8C", pointerEvents: "none" }} />
                  )}
                  {showGrid && (
                    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(to right, rgba(28,53,87,.13) 1px, transparent 1px), linear-gradient(to bottom, rgba(28,53,87,.13) 1px, transparent 1px)", backgroundSize: `${ppi}px ${ppi}px` }} />
                  )}
              {placements.map((p) => {
                const u = upById(p.uid);
                const fp = footprint(p);
                const isImg = u && IMAGE_TYPES.has(u.file_type.toLowerCase());
                const isSel = selected === p.id;
                const d = showRes ? dpiInfo(u, fp.w, fp.h) : null;
                const warned = warnIds.has(p.id);
                const isOverlap = showOverlap && overlapIds.has(p.id);
                const ring = isSel ? "var(--brand-primary,#1C3557)" : isOverlap ? "#2563EB" : warned ? "#EA580C" : d ? d.color : "#9AA3B2";
                return (
                  <div key={p.id} onPointerDown={(e) => startMove(e, p.id)}
                    style={{
                      position: "absolute", left: p.x_in * ppi, top: p.y_in * ppi, width: fp.w * ppi, height: fp.h * ppi,
                      border: `2px solid ${ring}`, boxShadow: isSel ? "0 0 0 2px rgba(28,53,87,.2)" : isOverlap ? "0 0 0 2px rgba(37,99,235,.18)" : warned ? "0 0 0 2px rgba(234,88,12,.18)" : "none",
                      background: isImg ? "transparent" : "#EEF2FF", cursor: panTool ? "grab" : "move",
                      display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", zIndex: isSel ? 5 : 1,
                    }}>
                    {isImg
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={u!.file_url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                      : <span style={{ fontSize: "9px", color: "#4338CA", textAlign: "center", padding: "2px", pointerEvents: "none", wordBreak: "break-word" }}>{u?.file_name ?? "?"}</span>}
                    {warned && !isSel && (
                      <span style={{ position: "absolute", top: "-8px", right: "-8px", width: "18px", height: "18px", background: "#EA580C", color: "#fff", borderRadius: "50%", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, pointerEvents: "none" }}>!</span>
                    )}
                    {isSel && (
                      <>
                        <div style={{ position: "absolute", top: "-26px", left: 0, display: "flex", gap: "4px" }}>
                          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); rotate(p.id); }} style={S.chip} title="Rotate 90°">⟳</button>
                          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); duplicate(p.id); }} style={S.chip} title="Duplicate">⧉</button>
                          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(p.id); }} style={{ ...S.chip, color: "#B91C1C" }} title="Remove">✕</button>
                        </div>
                        <div onPointerDown={(e) => startResize(e, p.id)} style={{ position: "absolute", right: "-7px", bottom: "-7px", width: "14px", height: "14px", background: "#fff", border: "2px solid var(--brand-primary,#1C3557)", borderRadius: "3px", cursor: "nwse-resize" }} title="Drag to resize" />
                      </>
                    )}
                  </div>
                );
              })}
                </div>
              </div>

              {/* Floating canvas controls (top-left) — like the reference builder. */}
              <div style={S.canvasControls}>
                <label style={S.canvasCheck}>
                  <input type="checkbox" checked={showOverlap} onChange={(e) => setShowOverlap(e.target.checked)} /> Show Overlapping Lines
                </label>
                <label style={S.canvasCheck}>
                  <input type="checkbox" checked={showRes} onChange={(e) => setShowRes(e.target.checked)} /> Show Resolution Lines
                </label>
                {showRes && (
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    {[["#16A34A", "Optimal ≥ 300 dpi"], ["#CA8A04", "Good ≥ 250 dpi"], ["#EA580C", "Fair ≥ 200 dpi"], ["#DC2626", "Low < 200 dpi"], ["#2563EB", "Overlapping images"]].map(([c, t]) => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "#777" }}>
                        <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: c as string }} /> {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Floating warnings (top-right) — advisory, never blocks saving. */}
              {warnings.length > 0 && (
                <div style={S.canvasWarn}>
                  <span style={{ fontWeight: 800 }}>⚠ {warnings.length} issue{warnings.length === 1 ? "" : "s"}</span>
                  {warnCounts.overlap ? <span> · {warnCounts.overlap} overlapping</span> : null}
                  {warnCounts.outside ? <span> · {warnCounts.outside} past safe area</span> : null}
                  {warnCounts.dpi ? <span> · {warnCounts.dpi} low res</span> : null}
                  {warnCounts.small ? <span> · {warnCounts.small} too small</span> : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right panel ───────────────────────────────────────────────────── */}
        <div style={S.rightPanel}>
          <div style={{ fontSize: "13px", fontWeight: 800 }}>Active gang sheet</div>
          <div style={S.activeCard}>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>{size?.name ?? "—"}</div>
            <div style={{ fontSize: "12px", color: "#777", marginTop: "2px" }}>{size?.width_in ?? 0}″ × {sheetLen.toFixed(0)}″</div>
            <div style={{ fontSize: "12px", color: "#777", marginTop: "6px" }}>{placements.length} image{placements.length === 1 ? "" : "s"} · {usedLength.toFixed(1)}″ used</div>
            <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#777" }}>Qty</span>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} style={{ width: "56px", padding: "5px 7px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "13px" }} />
            </div>
          </div>
          <button onClick={() => { setPanel("uploads"); fileRef.current?.click(); }} style={S.rightAction}>⊕ Add new design</button>
          <button onClick={autoBuild} style={S.rightAction} title="Fill the sheet with copies of your designs">▦ Auto build (fill sheet)</button>
          <button onClick={() => autoNest()} style={S.rightAction} title="Arrange current designs compactly">⚡ Auto nest (tidy up)</button>
          <button onClick={() => autoNest(0.5)} style={S.rightAction} title="Nest with extra spacing for cutting">✂ Auto nest for cutting</button>
          <button onClick={startOver} style={{ ...S.rightAction, color: "#B91C1C" }}>↺ Start over</button>
          <div style={{ marginTop: "auto", fontSize: "11px", color: "#aaa", paddingTop: "16px" }}>
            Tip: drop designs on the sheet, drag to arrange, then <strong>Save &amp; Add to Cart</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { position: "fixed", inset: 0, zIndex: 200, background: "#F4F3F1", display: "flex", flexDirection: "column", fontFamily: "'Open Sans', system-ui, sans-serif" },
  topbar: { height: "58px", flexShrink: 0, background: "#fff", borderBottom: "1px solid #E5E3DE", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", gap: "16px" },
  logo: { fontSize: "18px", fontWeight: 900, letterSpacing: "-.02em" },
  primaryBtn: { background: "var(--brand-primary,#1C3557)", color: "#fff", border: "none", padding: "9px 16px", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  ghostBtn: { background: "#fff", color: "#333", border: "1px solid #DDD9D2", padding: "9px 16px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  closeBtn: { background: "#fff", color: "#B91C1C", border: "1px solid #F0C9C9", padding: "9px 16px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  errorBar: { background: "#FEF2F2", color: "#991B1B", borderBottom: "1px solid #FCA5A5", padding: "8px 18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "10px" },
  okBar: { background: "#F0FDF4", color: "#166534", borderBottom: "1px solid #BBF7D0", padding: "8px 18px", fontSize: "13px" },
  body: { flex: 1, display: "flex", minHeight: 0 },
  rail: { width: "62px", flexShrink: 0, background: "#fff", borderRight: "1px solid #E5E3DE", display: "flex", flexDirection: "column", padding: "10px 0", gap: "4px" },
  railBtn: { background: "none", border: "none", color: "#666", display: "flex", flexDirection: "column", alignItems: "center", padding: "9px 4px", cursor: "pointer", borderLeft: "3px solid transparent" },
  railBtnActive: { color: "var(--brand-primary,#1C3557)", borderLeftColor: "var(--brand-primary,#1C3557)", background: "#F4F6FB" },
  leftPanel: { width: "270px", flexShrink: 0, background: "#fff", borderRight: "1px solid #E5E3DE", padding: "16px", overflowY: "auto" },
  dropzone: { border: "2px dashed #C9C5BD", borderRadius: "10px", padding: "22px 12px", textAlign: "center", cursor: "pointer" },
  panelTitle: { fontSize: "14px", fontWeight: 800, marginBottom: "12px" },
  uploadThumb: { position: "relative", border: "1px solid #E5E3DE", borderRadius: "8px", background: "#fff", padding: 0, cursor: "pointer", overflow: "hidden" },
  thumbBadge: { position: "absolute", top: "4px", right: "4px", background: "var(--brand-primary,#1C3557)", color: "#fff", fontSize: "10px", fontWeight: 700, borderRadius: "10px", padding: "1px 6px" },
  toggleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0EEE9" },
  selCard: { marginTop: "18px", border: "1px solid #E5E3DE", borderRadius: "10px", padding: "14px", background: "#FBFBF9" },
  miniLabel: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px", fontWeight: 700, color: "#777" },
  miniInput: { width: "100%", boxSizing: "border-box", minWidth: 0, padding: "7px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "13px" },
  smallBtn: { flex: 1, background: "#fff", border: "1px solid #DDD9D2", borderRadius: "7px", padding: "8px 6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  canvasArea: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  toolbar: { height: "50px", flexShrink: 0, background: "#fff", borderBottom: "1px solid #E5E3DE", display: "flex", alignItems: "center", gap: "10px", padding: "0 14px", flexWrap: "wrap" },
  sizeSelect: { padding: "7px 10px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "13px", minWidth: "150px", background: "#fff" },
  toolDivider: { width: "1px", height: "24px", background: "#E5E3DE" },
  nestBtn: { background: "#B91C1C", color: "#fff", border: "none", padding: "7px 14px", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  iconBtn: { width: "30px", height: "30px", border: "1px solid #DDD9D2", background: "#fff", borderRadius: "6px", fontSize: "15px", cursor: "pointer", lineHeight: 1 },
  canvasScroll: { position: "absolute", inset: 0, overflow: "auto", padding: "24px" },
  legend: { position: "sticky", top: 0, display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "11px", color: "#777", marginBottom: "14px", background: "rgba(244,243,241,.9)", padding: "4px 0", zIndex: 2 },
  rulerGrid: { flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "26px 1fr", gridTemplateRows: "22px 1fr", background: "#F4F3F1" },
  rulerCorner: { borderRight: "1px solid #ECEAE5", borderBottom: "1px solid #ECEAE5", background: "#FAFAF8" },
  rulerTopWrap: { overflow: "hidden", borderBottom: "1px solid #ECEAE5", background: "#fff", position: "relative" },
  rulerLeftWrap: { overflow: "hidden", borderRight: "1px solid #ECEAE5", background: "#fff", position: "relative" },
  canvasControls: { position: "absolute", top: "10px", left: "10px", zIndex: 4, background: "rgba(255,255,255,.96)", border: "1px solid #E5E3DE", borderRadius: "8px", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "5px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  canvasCheck: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#444", cursor: "pointer" },
  canvasWarn: { position: "absolute", top: "10px", right: "10px", zIndex: 4, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", maxWidth: "55%", justifyContent: "flex-end", boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  rightPanel: { width: "230px", flexShrink: 0, background: "#fff", borderLeft: "1px solid #E5E3DE", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" },
  activeCard: { border: "1px solid #E5E3DE", borderRadius: "10px", padding: "12px" },
  rightAction: { textAlign: "left", background: "#fff", border: "1px solid #E5E3DE", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#333" },
  chip: { border: "1px solid #D5D2CB", background: "#fff", borderRadius: "5px", width: "24px", height: "24px", fontSize: "12px", cursor: "pointer", lineHeight: 1, padding: 0 },
};
