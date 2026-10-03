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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ClipboardPaste, Copy, CopyPlus, Crop, Droplet, Eye, Grid3x3, Hand,
  Layers, Lightbulb, Maximize, Minus, Plus, Redo2, RotateCcw, RotateCw, Save,
  Scissors, Settings as SettingsIcon, ShoppingCart, Sparkles, Trash2, Type,
  Undo2, Upload as UploadIcon, UploadCloud, Wand2, X, Zap,
  Image as ImageIcon, FolderOpen,
} from "lucide-react";

/** Icon sizing — one place each, so every tool button and menu row matches. */
const TOOL_ICON = { size: 15, strokeWidth: 2.1 } as const;
const MENU_ICON = { size: 14, strokeWidth: 2, color: "#2A2F3A" } as const;
import {
  gangSheetsService,
  type GangSheetArtwork,
  type GangSheetLibraryDesign,
  type GangSheetOrder,
  type GangSheetSize,
} from "@/services/gangSheets.service";
import { analyzeArtwork } from "@/lib/artworkAnalysis";
import { cartService } from "@/services/cart.service";
import { addToGuestCart, gangSheetLine } from "@/lib/guestCart";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { establishSession } from "@/lib/session";
import { ImageEditorModal } from "@/components/storefront/ImageEditorModal";
import { WorkingOverlay } from "@/components/storefront/WorkingOverlay";
import { AutoBuildPanel, type AutoBuildItem, type PickableDesign } from "@/components/storefront/AutoBuildPanel";
import { packIntoSheets, type Layout } from "@/lib/sheetPacking";
import {
  freeSpotOn, spotFor as placeOnSheet,
  type Box, type Sheet, type Spot,
} from "@/lib/sheetPlacement";
import { planFill, planNest, type NestItem, type NestPlan } from "@/lib/sheetNesting";
import { NestPreview } from "@/components/storefront/NestPreview";
import { say } from "@/lib/toast";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import type { ArtworkInspection } from "@/services/gangSheets.service";
import { removeImageBackground, BackgroundRemovalError } from "@/lib/backgroundRemoval";

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
            <div style={{ position: "absolute", top: 0, left: 0, width: "1px", height: m.major ? "13px" : "7px", background: "#8B93A1" }} />
            {m.major && <span style={{ position: "absolute", top: "1px", left: "3px", fontSize: "10.5px", color: "#5A6474", fontWeight: 700, lineHeight: 1 }}>{m.inch}</span>}
          </div>
        ) : (
          <div key={m.inch} style={{ position: "absolute", top: `${at}px`, left: 0, right: 0 }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "1px", width: m.major ? "13px" : "7px", background: "#8B93A1" }} />
            {m.major && <span style={{ position: "absolute", left: "2px", top: "2px", fontSize: "10.5px", color: "#5A6474", fontWeight: 700, lineHeight: 1 }}>{m.inch}</span>}
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

// One "Active Gang Sheet" in a multi-sheet build. The active sheet's live edits
// live in the working state (placements/sizeId/qty/customLength); inactive sheets
// are held here as snapshots and swapped in when selected. Each sheet becomes its
// own reviewable order + cart line on save, so one checkout = many sheets.
interface SheetTab {
  key: string;
  name: string;
  sizeId: string;
  qty: number;
  customLength: number;
  placements: Placement[];
  orderId?: string | null; // set for the sheet that reopened an existing order
}

const uid = () => Math.random().toString(36).slice(2, 10);

interface Props {
  sizes: GangSheetSize[];
  productId: string | null;
  contactName?: string;
  contactEmail?: string;
  autoStart?: boolean;
  /** Pre-select this sheet size when the builder opens (from the product page grid). */
  initialSizeId?: string | null;
  /** How many of that sheet the product page asked for. */
  initialQty?: number | null;
  /** Reopen an existing editable order to edit it, instead of starting fresh. */
  resumeOrder?: GangSheetOrder | null;
  onClose: () => void;
  onSaved: (order: GangSheetOrder) => void;
}

/** The studio's left-hand tabs, in the order they are used. */
const RAIL = [
  { key: "uploads", label: "Uploads", Icon: UploadCloud },
  { key: "designs", label: "Designs", Icon: Sparkles },
  { key: "gallery", label: "Gallery", Icon: ImageIcon },
  { key: "text", label: "Add Text", Icon: Type },
  { key: "settings", label: "Settings", Icon: SettingsIcon },
] as const;

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

export function GangSheetStudio({ sizes, productId, contactName, contactEmail, autoStart, initialSizeId, initialQty, resumeOrder, onClose, onSaved }: Props) {
  const [sizeId, setSizeId] = useState(
    resumeOrder?.sheet_size_id ||
    (initialSizeId && sizes.some((s) => s.id === initialSizeId) ? initialSizeId : "") ||
    sizes[0]?.id ||
    ""
  );
  const [qty, setQty] = useState(Math.max(1, resumeOrder?.sheet_quantity || initialQty || 1));
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
  // How far through a batch we are. One word for twenty files is how a builder
  // starts looking stuck — the buyer cannot tell a slow upload from a dead one.
  const [uploadStep, setUploadStep] = useState<{ done: number; total: number; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customLength, setCustomLength] = useState(0);
  const signedIn = useAuthStore((st) => st.isAuthenticated());
  // Who to send this job's updates to, when there is no account behind it.
  const [guest, setGuest] = useState({ name: contactName ?? "", email: contactEmail ?? "" });
  const [askingWho, setAskingWho] = useState<null | { toCart: boolean }>(null);
  // Opening an account from inside the builder, rather than sending somebody
  // to a sign-up page and losing the sheet they just spent ten minutes on.
  const [mode, setMode] = useState<"join" | "signin">("join");
  const [join, setJoin] = useState({
    first_name: (contactName ?? "").split(" ")[0] ?? "",
    last_name: (contactName ?? "").split(" ").slice(1).join(" "),
    email: contactEmail ?? "",
    password: "",
    company_name: "",
  });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState({ text: "", color: "#111111", bold: true });
  const [copyN, setCopyN] = useState(1); // "add copies" quantity for the selected design
  const [panTool, setPanTool] = useState(false);  // ✋ hand tool: drag to pan the canvas
  const [showGrid, setShowGrid] = useState(false); // ▦ grid overlay on the sheet
  const [showOverlap, setShowOverlap] = useState(true); // highlight overlapping designs
  // Multi-sheet build: `sheets` holds every Active Gang Sheet; the one at `active`
  // is edited through the working state above and snapshotted back on switch/save.
  const [sheets, setSheets] = useState<SheetTab[]>([]);
  const [active, setActive] = useState(0);
  // Background-removal prompt: files awaiting a decision + the removal state.
  const [bgQueue, setBgQueue] = useState<File[]>([]);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgProgress, setBgProgress] = useState<number | null>(null);
  const [bgLabel, setBgLabel] = useState("Removing the background");
  const [bgDontShow, setBgDontShow] = useState(false);
  const [bgPreviewUrl, setBgPreviewUrl] = useState("");
  const bgSkipRef = useRef(false);
  const [editUpload, setEditUpload] = useState<Upload | null>(null); // upload open in the image editor
  const [editTab, setEditTab] = useState<"enhance" | "crop" | "removecolor" | "colors" | "halftone">("enhance");
  const [ctxMenu, setCtxMenu] = useState<{ id: number; x: number; y: number } | null>(null); // right-click menu
  const clipRef = useRef<Placement | null>(null); // copy/paste clipboard
  const [dupModal, setDupModal] = useState<number | null>(null); // "Add quantity" for this placement
  const [dupQty, setDupQty] = useState(5);
  const [dupApplyMargin, setDupApplyMargin] = useState(false);
  const [dupMargin, setDupMargin] = useState(0.5);
  // Auto Build: upload several designs, size them, set quantities, pack sheets.
  const [abOpen, setAbOpen] = useState(false);
  const [abItems, setAbItems] = useState<AutoBuildItem[]>([]);
  const [abBusy, setAbBusy] = useState<{ key: string; label: string } | null>(null);
  const [abChecks, setAbChecks] = useState<Record<string, ArtworkInspection | null | "loading">>({});
  const [abMessage, setAbMessage] = useState<string | null>(null);
  // "Start over" wipes a sheet in one click, so it asks first.
  const [confirmStartOver, setConfirmStartOver] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const topRulerRef = useRef<HTMLDivElement>(null);
  const leftRulerRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // Said on screen when the sheet grows to take a design, and when it cannot.
  // Growing silently is almost as confusing as stacking silently: the price
  // follows the length, so a buyer has to see it happen.
  // A rearrangement that has been worked out but not yet accepted. Both of
  // these move everything at once, so they are shown before they happen.
  const [pendingNest, setPendingNest] = useState<null | { plan: NestPlan; extraGap: number }>(null);
  const [pendingFill, setPendingFill] = useState<null | { id: number; spots: { x: number; y: number; rotated: boolean }[] }>(null);
  // The document only exists in the browser, so the first render stays in
  // place and the portal takes over once mounted.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  /**
   * The window's height, measured, not described.
   *
   * `inset: 0` and `100dvh` both ask the page how tall the window is, and the
   * page is a brand's storefront carrying a stylesheet this code has never
   * seen — one that was enough to leave the builder standing in the top part
   * of the screen with the shop showing underneath. Asking the window itself
   * cannot be overridden by any of that.
   */
  const [viewportH, setViewportH] = useState<number | null>(null);
  useEffect(() => {
    // innerHeight, not visualViewport. The visual viewport is what is on screen
    // after a pinch or a browser zoom, and it is smaller than the layout
    // viewport a fixed element actually spans — so at any browser zoom but
    // 100% this made the builder shorter than the window and let the shop's
    // own footer show underneath it. innerHeight is in CSS pixels, which is
    // the same ruler the layout is measured with.
    const measure = () => setViewportH(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  // Hold the page still underneath, on both html and body. The builder covers
  // the whole window, so a scroll that reaches past it moves a shop nobody can
  // see — and with the page unable to scroll there is nothing below the
  // builder for anything to show through.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const wasHtml = html.style.overflow;
    const wasBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => { html.style.overflow = wasHtml; body.style.overflow = wasBody; };
  }, []);
  const [grewTo, setGrewTo] = useState<number | null>(null);
  const [sheetFull, setSheetFull] = useState(false);
  // The growth note takes itself away; it is news, not a state of affairs.
  useEffect(() => {
    if (grewTo === null) return;
    say.note(`Sheet grew to ${round2(grewTo)}" to fit your design.`);
    const t = window.setTimeout(() => setGrewTo(null), 6000);
    return () => window.clearTimeout(t);
  }, [grewTo]);

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
  // Where the sheet actually landed inside the scroll area, read back from
  // layout for the rulers. The sheet is centred by CSS, not by this: working the
  // position out from the viewport's width fed back into that width — a
  // scrollbar appearing narrowed the viewport, which moved the sheet, which took
  // the scrollbar away again — and the whole builder shook. Reading the result
  // only moves the rulers, which sit outside the scroll area, so nothing loops.
  const [frame, setFrame] = useState({ x: RULER_PAD, y: RULER_PAD, w: 0, h: 0 });

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

  // ── Fit the sheet to the canvas ──────────────────────────────────────────────
  const fitSheet = useCallback(() => {
    const el = scrollRef.current;
    // A few pixels of slack: a sheet sized to exactly the space available lands a
    // fraction of a pixel over it, and the browser answers with a scrollbar for
    // a sheet that visibly fits.
    const SLACK = 8;
    const availW = (el?.clientWidth ?? 720) - RULER_PAD * 2 - SLACK;
    const availH = (el?.clientHeight ?? 560) - RULER_PAD * 2 - SLACK;
    const wFit = availW / (size?.width_in || 22);
    const hFit = sheetLen > 0 ? availH / sheetLen : wFit;
    const ppiFit = Math.max(3, Math.min(60, Math.max(Math.min(wFit, hFit), wFit * 0.3)));
    setFitPpi(Math.floor(ppiFit * 100) / 100);
  }, [size?.width_in, sheetLen]);

  useEffect(() => {
    fitSheet();
    window.addEventListener("resize", fitSheet);
    return () => window.removeEventListener("resize", fitSheet);
  }, [fitSheet]);

  function clampSnap(xIn: number, yIn: number, fw: number, fh: number) {
    const { snap: s, imageMargin: g, size: sz, sheetLen: len } = stateRef.current;
    if (!sz) return { x: round3(xIn), y: round3(yIn) };
    // Keep the piece inside the safe area — the bleed is trimmed away, so a
    // design dragged into it comes back from the printer with a slice missing.
    const b = sz.bleed_in ?? 0;
    const lo = b, hiX = Math.max(b, sz.width_in - b - fw), hiY = Math.max(b, len - b - fh);
    let x = clamp(xIn, lo, hiX);
    let y = clamp(yIn, lo, hiY);
    if (s && g > 0) {
      // Snap from the safe edge so the grid lines up with where printing starts.
      x = clamp(lo + Math.round((x - lo) / g) * g, lo, hiX);
      y = clamp(lo + Math.round((y - lo) / g) * g, lo, hiY);
    }
    return { x: round3(x), y: round3(y) };
  }

  // ── Placement helpers ────────────────────────────────────────────────────────
  function overlaps(p: Placement, x: number, y: number, w: number, h: number, gap: number) {
    const fp = footprint(p);
    return !(x + w + gap <= p.x_in || x >= p.x_in + fp.w + gap || y + h + gap <= p.y_in || y >= p.y_in + fp.h + gap);
  }
  /** This sheet as the placement rules see it: inches, edges and whether it
   *  can be cut longer. */
  function sheetSpec(len: number): Sheet {
    return {
      width: size?.width_in ?? 0,
      length: len,
      bleed: size?.bleed_in ?? 0,
      gap: imageMargin,
      canGrow: Boolean(isCustom && size),
      maxLength: size?.max_length_in ?? len,
    };
  }

  const boxesOf = (pl: Placement[]): Box[] =>
    pl.map((p) => { const fp = footprint(p); return { x: p.x_in, y: p.y_in, w: fp.w, h: fp.h }; });

  /**
   * The list as it will be, not as it was last painted.
   *
   * A multi-file upload adds designs in a burst, and each one has to see where
   * the one before it went — otherwise they are all told the same spot is free
   * and land on top of each other, which is exactly what used to happen.
   * Cleared as soon as React has caught up, so it never goes stale.
   */
  const liveRef = useRef<{ placements: Placement[]; len: number } | null>(null);
  useEffect(() => { liveRef.current = null; }, [placements, sheetLen]);
  function live(): { placements: Placement[]; len: number } {
    return liveRef.current ?? { placements: stateRef.current.placements, len: stateRef.current.sheetLen };
  }

  /**
   * Where a design of this size goes — making the sheet longer if that is what
   * it takes.
   *
   * A sheet that has run out of room used to drop every further design in the
   * top-left corner, one on top of the next, which is how twenty uploads turned
   * into one unreadable pile. A roll is sold by the inch, so the honest answer
   * is to give it another few inches and put the design below everything else,
   * the way it would be laid out by hand. Only when the sheet cannot grow any
   * further — a fixed size, or already at its longest — is there nothing to be
   * done, and then it says so rather than stacking.
   */
  function spotFor(w: number, h: number): Spot | null {
    const { placements: pl, len } = live();
    return placeOnSheet(sheetSpec(len), w, h, boxesOf(pl));
  }

  /** Take a spot: remember the sheet's new length before React has re-rendered. */
  function takeSpot(spot: { x: number; y: number; len: number }, placement: Placement) {
    const { placements: pl, len } = live();
    liveRef.current = { placements: [...pl, placement], len: Math.max(len, spot.len) };
    if (spot.len > len) {
      setCustomLength(spot.len);
      setGrewTo(spot.len);
    }
  }

  function firstFreeSpot(w: number, h: number): { x: number; y: number } {
    const len = stateRef.current.sheetLen;
    return freeSpotOn(sheetSpec(len), len, w, h, boxesOf(stateRef.current.placements))
      ?? { x: round3(size?.bleed_in ?? 0), y: round3(size?.bleed_in ?? 0) };
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
    const spot = spotFor(w, h);
    if (!spot) {
      setSheetFull(true);
      say.warn("This sheet is full — your design needs another sheet.");
      return;
    }
    const id = nextId.current++;
    const placement: Placement = { id, uid: u.uid, x_in: spot.x, y_in: spot.y, w_in: w, h_in: h, rotation: 0 };
    takeSpot(spot, placement);
    setPlacements((cur) => [...cur, placement]);
    setSelected(id);
    setSheetFull(false);
  }

  // ── Uploads ──────────────────────────────────────────────────────────────────
  // Analyse + upload one file and (optionally) drop it on the sheet.
  async function ingestFile(file: File, autoPlace = true) {
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
    return u;
  }

  async function onFiles(files: FileList | null, autoPlace = true) {
    if (!files?.length || !size) return;
    if (abOpen) { abUploadFiles(files); return; }
    setUploading(true);
    setError(null);
    const review: File[] = [];
    const list = Array.from(files);
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        if (!file) continue;
        setUploadStep({ done: i, total: list.length, name: file.name });
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        // A raster image with no transparency almost always has a background —
        // hold it for the removal prompt (unless the buyer opted out).
        if (!bgSkipRef.current && ["png", "jpg", "jpeg", "webp"].includes(ext)) {
          const analysis = await analyzeArtwork(file);
          if (analysis.isImage && !analysis.hasAlpha) { review.push(file); continue; }
        }
        await ingestFile(file, autoPlace);
      }
    } catch {
      setError("That file could not be uploaded. Allowed: PNG, JPG, PDF, SVG, AI, EPS, PSD, TIFF (max 50 MB).");
    } finally {
      setUploading(false);
      setUploadStep(null);
      if (fileRef.current) fileRef.current.value = "";
    }
    const added = list.length - review.length;
    if (added > 0) say.done(added === 1 ? "Design uploaded" : `${added} designs uploaded`);
    if (review.length) setBgQueue((q) => [...q, ...review]);
  }

  // ── Background removal ───────────────────────────────────────────────────────
  const bgFile = bgQueue[0];
  useEffect(() => {
    if (!bgFile) { setBgPreviewUrl(""); return; }
    const url = URL.createObjectURL(bgFile);
    setBgPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bgFile]);
  useEffect(() => {
    try { if (localStorage.getItem("gs_bg_skip") === "1") { bgSkipRef.current = true; setBgDontShow(true); } } catch { /* private mode */ }
  }, []);

  function shiftBg() { setBgQueue((q) => q.slice(1)); }
  function bgDiscard() { shiftBg(); }
  async function bgContinue() {
    const f = bgQueue[0]; if (!f) return;
    setUploading(true);
    try { await ingestFile(f); } catch { setError("Could not add that image."); }
    finally { setUploading(false); shiftBg(); }
  }
  async function bgRemove() {
    const f = bgQueue[0]; if (!f) return;
    setBgBusy(true); setError(null);
    try {
      const png = await removeImageBackground(f, (p) => {
        setBgLabel(p.label);
        setBgProgress(p.ratio);
      });
      await ingestFile(png);
    } catch (e) {
      // Keep the original either way — the buyer's design is never lost to this.
      try { await ingestFile(f); } catch { /* ignore */ }
      setError(e instanceof BackgroundRemovalError
        ? `${e.message} The original was kept.`
        : "Background removal wasn't available just now — kept the original image.");
    } finally {
      setBgProgress(null);
      setBgLabel("Removing the background");
      setBgBusy(false);
      shiftBg();
    }
  }
  function setDontShowBg(v: boolean) {
    setBgDontShow(v);
    bgSkipRef.current = v;
    try { localStorage.setItem("gs_bg_skip", v ? "1" : "0"); } catch { /* private mode */ }
  }

  // Image-editor result: upload the edited PNG and swap it into the upload in
  // place (same uid) so its thumbnail — and every placement using it — updates.
  async function applyEdit(file: File) {
    const target = editUpload;
    setEditUpload(null);
    if (!target) return;
    setUploading(true); setError(null);
    try {
      const analysis = await analyzeArtwork(file);
      const res = await gangSheetsService.uploadArtwork(file);
      setUploads((cur) => cur.map((u) => (u.uid === target.uid ? {
        ...u,
        file_url: res.url,
        file_name: res.file_name,
        file_type: res.type,
        isImage: analysis.isImage,
        pxW: analysis.pxW,
        pxH: analysis.pxH,
        hasAlpha: analysis.hasAlpha,
        aspect: analysis.pxW && analysis.pxH ? analysis.pxW / analysis.pxH : u.aspect,
      } : u)));
    } catch {
      setError("Could not save the edited image.");
    } finally { setUploading(false); }
  }

  const [dropActive, setDropActive] = useState(false);
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropActive(false);
    onFiles(e.dataTransfer.files);
  }

  // Ready-made designs (store library) + the buyer's own past uploads (gallery).
  // The gallery is only asked for once there is somebody to ask about: it is
  // an account's own past artwork, so calling it signed out was a guaranteed
  // 401 on every open, filling the console with a failure that was not one.
  useEffect(() => {
    gangSheetsService.listLibrary().then(setLibrary).catch(() => {});
    if (signedIn) gangSheetsService.myArtworks().then(setGallery).catch(() => {});
    else setGallery([]);
  }, [signedIn]);

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
  async function hostedUpload(file_url: string, file_name: string, file_type?: string | null): Promise<Upload> {
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
    return u;
  }

  async function addFromUrl(file_url: string, file_name: string, file_type?: string | null) {
    addPlacement(await hostedUpload(file_url, file_name, file_type));
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
    // Selecting has to take the keyboard with it. The sheet only ever took
    // focus when the empty canvas was clicked — which also clears the
    // selection — so Delete could never reach a selected design: the key went
    // to whatever was last clicked in the sidebar, and nothing happened.
    sheetRef.current?.focus({ preventScroll: true });
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
    sheetRef.current?.focus({ preventScroll: true });
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
  /**
   * Turn a design a quarter turn, and make sure it still has somewhere to be.
   *
   * Rotating swaps width for height, so a wide design becomes a tall one that
   * no longer fits where it was standing. This only pulled it back inside the
   * sheet's edges, which left it sitting on top of its neighbours — a rotation
   * that quietly broke the layout. It keeps its place when the turned shape
   * still fits there, and is given a proper spot when it does not.
   */
  function rotate(id: number) {
    const p = stateRef.current.placements.find((q) => q.id === id);
    if (!p) return;
    const rot = p.rotation % 180 === 0 ? 90 : 0;
    const fp = footprint({ ...p, rotation: rot });
    const { x, y } = clampSnap(p.x_in, p.y_in, fp.w, fp.h);

    const others = stateRef.current.placements.filter((q) => q.id !== id);
    const clear = !others.some((q) => overlaps(q, x, y, fp.w, fp.h, Math.max(imageMargin, 0)));
    if (clear) {
      setPlacements((list) => list.map((q) => (q.id === id ? { ...q, rotation: rot, x_in: x, y_in: y } : q)));
      return;
    }

    const spot = placeOnSheet(sheetSpec(stateRef.current.sheetLen), fp.w, fp.h, boxesOf(others));
    if (!spot) { setSheetFull(true); return; }
    const moved: Placement = { ...p, rotation: rot, x_in: spot.x, y_in: spot.y };
    liveRef.current = { placements: [...others, moved], len: Math.max(stateRef.current.sheetLen, spot.len) };
    if (spot.len > stateRef.current.sheetLen) { setCustomLength(spot.len); setGrewTo(spot.len); }
    setPlacements((list) => list.map((q) => (q.id === id ? moved : q)));
  }
  function remove(id: number) {
    setPlacements((list) => list.filter((p) => p.id !== id));
    if (selected === id) setSelected(null);
    setSheetFull(false);
  }

  /**
   * Throw an upload away, and everything placed from it.
   *
   * There was no way to do this at all: the uploads list only ever grew, and
   * clicking a thumbnail added *another* copy to the sheet — so somebody
   * trying to get rid of a design by clicking it made more of it. Removing the
   * file has to take its copies with it, or the sheet still prints them.
   */
  function removeUpload(u: Upload) {
    const copies = stateRef.current.placements.filter((p) => p.uid === u.uid).length;
    if (copies > 0 && !confirm(
      `Remove "${u.file_name}"? It is on the sheet ${copies} time${copies === 1 ? "" : "s"}, and those will go too.`
    )) return;
    setPlacements((list) => {
      const kept = list.filter((p) => p.uid !== u.uid);
      if (selected != null && !kept.some((p) => p.id === selected)) setSelected(null);
      return kept;
    });
    setUploads((cur) => cur.filter((x) => x.uid !== u.uid));
    setSheetFull(false);
    say.done(copies > 0 ? "Design deleted, and its copies" : "Design deleted");
  }
  function duplicate(id: number) {
    const p = stateRef.current.placements.find((q) => q.id === id);
    if (!p) return;
    const fp = footprint(p);
    const spot = spotFor(fp.w, fp.h);
    if (!spot) { setSheetFull(true); return; }
    const nid = nextId.current++;
    const copy: Placement = { ...p, id: nid, x_in: spot.x, y_in: spot.y };
    takeSpot(spot, copy);
    setPlacements((list) => [...list, copy]);
    setSelected(nid);
    setSheetFull(false);
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
  function addCopies(n: number, gapOverride?: number) {
    if (selected == null || n < 1 || !size) return;
    const src = stateRef.current.placements.find((q) => q.id === selected);
    if (!src) return;
    const g = gapOverride != null ? Math.max(gapOverride, 0.02) : Math.max(imageMargin, 0.25);
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
  /**
   * Fill what is left of this sheet with copies of one design.
   *
   * It used to lay a full grid across the sheet without looking at what was on
   * it, which buried every other design under a row of copies. Now it only
   * uses space that is genuinely free, and it asks first — this can add dozens
   * of copies, and that is not something to discover afterwards.
   */
  function autoFill(id: number) {
    const p = stateRef.current.placements.find((q) => q.id === id);
    if (!p || !size) return;
    const fp = footprint(p);
    const spots = planFill(sheetSpec(sheetLen), boxesOf(stateRef.current.placements),
      { key: String(id), w: fp.w, h: fp.h });
    if (!spots.length) {
      say.note("No room left on this sheet for another copy.");
      return;
    }
    setPendingFill({ id, spots });
  }

  /** Put the copies down, once somebody has seen how many there will be. */
  function applyFill() {
    const job = pendingFill;
    if (!job) return;
    const p = stateRef.current.placements.find((q) => q.id === job.id);
    if (!p) { setPendingFill(null); return; }
    const copies: Placement[] = job.spots.map((spot) => ({
      ...p,
      id: nextId.current++,
      x_in: spot.x,
      y_in: spot.y,
      rotation: spot.rotated ? (p.rotation % 180 === 0 ? 90 : 0) : p.rotation,
    }));
    setPlacements((list) => [...list, ...copies]);
    setSelected(null);
    setPendingFill(null);
    say.done(`Auto Fill completed — ${copies.length} more added.`);
  }

  /**
   * Tidy the whole job, across as many sheets as it takes.
   *
   * The old one packed this canvas with shelves and, when a design did not
   * fit, left it exactly where it was — on top of whatever was already there.
   * So the button whose only job is to tidy a sheet was itself a way to make
   * an overlapping one, which is what a buyer found.
   *
   * It plans first and shows the plan: how many sheets, what goes on each, and
   * anything too big for the roll at all. Nothing moves until that is
   * accepted. `extraGap` is the cut-around spacing for the "for cutting"
   * variant, where a plotter needs room around each piece.
   */
  function autoNest(extraGap = 0) {
    if (!size) return;
    const all = snapshotAll();
    const everything = all.flatMap((sh) => sh.placements);
    if (!everything.length) { say.note("Nothing to arrange yet."); return; }

    const spec = { ...sheetSpec(sheetLen), gap: imageMargin + extraGap };
    // Everything may be turned. Text is added here as an image like anything
    // else, so there is nothing to tell apart — and a design the buyer did not
    // want turned can be turned back, which is cheaper than a wasted sheet.
    const items: NestItem[] = everything.map((q) => ({ key: String(q.id), w: q.w_in, h: q.h_in }));
    setPendingNest({ plan: planNest(spec, items), extraGap });
  }

  /**
   * Lay the planned job out: this sheet first, then as many more as it needs.
   *
   * Sheets the plan does not need are kept rather than deleted — a sheet can
   * carry a name, a quantity and an order of its own, and throwing those away
   * because a rearrangement came out shorter is not this button's decision.
   * They are left empty, and emptying a sheet is already undoable.
   */
  function applyNest() {
    const job = pendingNest;
    if (!job || !size) return;
    const { plan } = job;

    const all = snapshotAll();
    const byId = new Map<number, Placement>();
    for (const sh of all) for (const q of sh.placements) byId.set(q.id, q);

    const laidOut: Placement[][] = plan.sheets.map((placed) =>
      placed.flatMap((item) => {
        const original = byId.get(Number(item.key));
        if (!original) return [];
        // `rotated` is the plan's own idea of the turn, so the stored rotation
        // is set from it rather than toggled — nesting twice must not spin a
        // design through 180 degrees.
        return [{ ...original, x_in: item.x, y_in: item.y, rotation: item.rotated ? 90 : 0 }];
      }),
    );

    // Anything the plan could not place keeps its spot on the first sheet, so
    // it is still there to be made smaller rather than silently dropped.
    const stranded = plan.unplaceable
      .map((item) => byId.get(Number(item.key)))
      .filter((q): q is Placement => Boolean(q));
    if (stranded.length) laidOut[0] = [...(laidOut[0] ?? []), ...stranded];

    const next: SheetTab[] = all.map((sh, i) => ({ ...sh, placements: laidOut[i] ?? [] }));
    for (let i = all.length; i < laidOut.length; i++) {
      next.push({
        key: uid(),
        name: `Gang Sheet ${i + 1}`,
        sizeId, qty: 1, customLength,
        placements: laidOut[i] ?? [],
      });
    }

    const added = Math.max(0, laidOut.length - all.length);
    goTo(next, 0);
    setSelected(null);
    setPendingNest(null);

    if (stranded.length) {
      say.warn(`${stranded.length} design${stranded.length === 1 ? "" : "s"} too big for this roll — left where they were.`);
    } else if (added > 0) {
      say.done(`Auto Nest applied — ${added} more sheet${added === 1 ? "" : "s"} added.`);
    } else {
      say.done("Auto Nest applied.");
    }
  }

  // ── Auto Build ───────────────────────────────────────────────────────────────
  function abItemFor(u: Upload): AutoBuildItem {
    const d = defaultSize(u);
    return { key: uid(), uid: u.uid, w: d.w, h: d.h, lock: true, qty: 1, originalUid: null };
  }

  function openAutoBuild() {
    // Start from what the buyer has already uploaded — they came here to use it.
    setAbItems((cur) => (cur.length ? cur : uploads.map(abItemFor)));
    setAbMessage(null);
    setAbOpen(true);
  }

  async function abUploadFiles(files: FileList) {
    setUploading(true);
    setAbMessage(null);
    try {
      for (const file of Array.from(files)) {
        const u = await ingestFile(file, false);
        setAbItems((cur) => [...cur, abItemFor(u)]);
      }
    } catch {
      setAbMessage("A file could not be uploaded. Allowed: PNG, JPG, PDF, SVG, AI, EPS, PSD, TIFF (max 50 MB).");
    } finally {
      setUploading(false);
    }
  }

  async function abPick(d: PickableDesign) {
    try {
      const u = await hostedUpload(d.file_url, d.name, d.file_type);
      setAbItems((cur) => [...cur, abItemFor(u)]);
    } catch {
      setAbMessage("That design could not be added.");
    }
  }

  async function abRemoveBackground(item: AutoBuildItem) {
    const u = uploads.find((x) => x.uid === item.uid);
    if (!u) return;
    setAbBusy({ key: item.key, label: "Removing background" });
    setAbMessage(null);
    try {
      const blob = await (await fetch(u.file_url)).blob();
      const file = new File([blob], u.file_name, { type: blob.type || "image/png" });
      const png = await removeImageBackground(file, (pr) => setAbBusy({ key: item.key, label: pr.label }));
      const cut = await ingestFile(png, false);
      // Keep the original: the toggle can put it back.
      setAbItems((cur) => cur.map((x) => (x.key === item.key ? { ...x, uid: cut.uid, originalUid: item.uid } : x)));
    } catch (e) {
      setAbMessage(e instanceof BackgroundRemovalError
        ? `${e.message} The original was kept.`
        : "Background removal didn't finish — the original was kept.");
    } finally {
      setAbBusy(null);
    }
  }

  function abRestoreBackground(item: AutoBuildItem) {
    if (!item.originalUid) return;
    setAbItems((cur) => cur.map((x) => (x.key === item.key ? { ...x, uid: item.originalUid!, originalUid: null } : x)));
  }

  function abUpscale(uidToEdit: string) {
    const u = uploads.find((x) => x.uid === uidToEdit);
    if (!u) return;
    setEditTab("enhance");
    setEditUpload(u);
  }

  async function abPressCheck(item: AutoBuildItem) {
    const u = uploads.find((x) => x.uid === item.uid);
    if (!u) return;
    setAbChecks((c) => ({ ...c, [item.key]: "loading" }));
    try {
      const result = await gangSheetsService.inspectArtwork({
        file_url: u.file_url, width_in: item.w, height_in: item.h, file_type: u.file_type,
      });
      setAbChecks((c) => ({ ...c, [item.key]: result }));
    } catch {
      setAbChecks((c) => ({ ...c, [item.key]: null }));
      setAbMessage("The print check couldn't run just now.");
    }
  }

  /** Pack every piece onto this sheet, and onto new sheets for whatever is left. */
  function abApply({ layout, inset, gap }: { layout: Layout; inset: number; gap: number }) {
    if (!size) return;
    const W = size.width_in - inset * 2;
    const H = sheetLen - inset * 2;
    if (W <= 0 || H <= 0) { setAbMessage("The margins leave no room on this sheet."); return; }

    const byKey = new Map<string, AutoBuildItem>();
    const pieces = abItems.flatMap((it) => Array.from({ length: Math.max(0, it.qty) }, (_, i) => {
      const key = `${it.key}#${i}`;
      byKey.set(key, it);
      return { key, w: it.w, h: it.h };
    }));
    const { sheets: pages, tooBig } = packIntoSheets(pieces, W, H, gap, layout);
    if (!pages.length) {
      setAbMessage("None of these fit on this sheet size. Make the designs smaller, or pick a bigger sheet.");
      return;
    }

    const toPlacements = (page: typeof pages[number]): Placement[] => page.map((pc) => {
      const it = byKey.get(pc.key)!;
      return {
        id: nextId.current++, uid: it.uid,
        x_in: round3(inset + pc.x), y_in: round3(inset + pc.y),
        w_in: it.w, h_in: it.h, rotation: pc.rotated ? 90 : 0,
      };
    });

    const first = toPlacements(pages[0]!);
    const list = snapshotAll().map((sh, i) => (i === active ? { ...sh, placements: first } : sh));
    const extra: SheetTab[] = pages.slice(1).map((page, i) => ({
      key: uid(), name: `Gang Sheet ${list.length + i + 1}`, sizeId, qty: 1, customLength,
      placements: toPlacements(page),
    }));
    setSheets([...list, ...extra]);
    setPlacements(first);
    setSelected(null);
    setImageMargin(gap);

    const built = pages.length === 1 ? "Built 1 sheet." : `Built ${pages.length} sheets.`;
    if (tooBig.length) {
      // Stay here so the buyer sees what was left out and can resize it.
      setAbMessage(`${built} ${tooBig.length} piece${tooBig.length === 1 ? " is" : "s are"} bigger than the sheet's printable area and ${tooBig.length === 1 ? "was" : "were"} left out — make ${tooBig.length === 1 ? "it" : "them"} smaller and apply again.`);
      return;
    }
    // The new sheets appear in the list on the right, so the canvas is the answer —
    // shown whole, at the fit zoom, rather than wherever the view was left.
    setAbOpen(false);
    setZoom(1);
    requestAnimationFrame(() => {
      fitSheet();
      if (scrollRef.current) { scrollRef.current.scrollTop = 0; scrollRef.current.scrollLeft = 0; }
    });
  }

  function startOver() {
    setPlacements([]);
    setSelected(null);
  }

  // Launched from the welcome screen's "Auto Build": open straight onto it.
  useEffect(() => {
    if (autoStart) setAbOpen(true);
  }, [autoStart]);

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
      // A two-finger swipe on a trackpad is a wheel event, and so is a pinch —
      // the difference is that the browser sets ctrlKey on the pinch. Treating
      // every wheel as a zoom is why scrolling the sheet changed its size
      // instead of moving it. Plain wheel is left alone so the canvas scrolls
      // natively, which the rulers already follow.
      if (!e.ctrlKey && !e.metaKey) return;
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

  useLayoutEffect(() => {
    const wrap = frameRef.current, sheet = sheetRef.current;
    if (!wrap || !sheet) return;
    const measure = () => {
      const next = { x: sheet.offsetLeft, y: sheet.offsetTop, w: wrap.offsetWidth, h: wrap.offsetHeight };
      // Only a real change re-renders; an identical reading must not.
      setFrame((f) => (f.x === next.x && f.y === next.y && f.w === next.w && f.h === next.h ? f : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [sheetWpx, sheetHpx]);

  // Keep rulers aligned after zoom/size changes made without a scroll event
  // (zoom buttons, fit-to-screen, size switch).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (topRulerRef.current) topRulerRef.current.scrollLeft = el.scrollLeft;
    if (leftRulerRef.current) leftRulerRef.current.scrollTop = el.scrollTop;
  }, [zoom, sheetWpx, sheetHpx, frame.x, frame.y]);

  // Seed the first Active Gang Sheet once sizes (or a resumed order) are known.
  useEffect(() => {
    if (sheets.length > 0) return;
    if (!sizes.length && !resumeOrder) return;
    setSheets([{
      key: uid(),
      name: resumeOrder?.sheet_name || "Gang Sheet 1",
      sizeId: sizeId || sizes[0]?.id || "",
      qty, customLength, placements: [],
      orderId: resumeOrder?.id ?? null,
    }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes.length, resumeOrder]);

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

  // ── Multi-sheet management ───────────────────────────────────────────────────
  // Reset undo history to a placement set (so undo stays within the active sheet).
  function resetHistory(pls: Placement[]) {
    historyRef.current = [pls.map((p) => ({ ...p }))];
    ptrRef.current = 0;
    suppressHistory.current = true; // the load's placements-change is the reset itself
    forceHud((n) => n + 1);
  }

  // Snapshot the active sheet's live edits back into the sheets list.
  function snapshotAll(): SheetTab[] {
    return sheets.map((s, i) => (i === active ? { ...s, sizeId, qty, customLength, placements } : s));
  }

  // Load a sheet (from an already-snapshotted list) into the working state.
  function goTo(list: SheetTab[], idx: number) {
    const target = list[idx];
    if (!target) return;
    setSheets(list);
    setActive(idx);
    setSizeId(target.sizeId || sizes[0]?.id || "");
    setQty(target.qty || 1);
    setCustomLength(target.customLength || 0);
    setPlacements(target.placements.map((p) => ({ ...p })));
    setSelected(null);
    resetHistory(target.placements);
  }

  function switchTo(idx: number) { if (idx !== active) goTo(snapshotAll(), idx); }

  function addSheet() {
    const fresh: SheetTab = { key: uid(), name: `Gang Sheet ${sheets.length + 1}`, sizeId: sizes[0]?.id || sizeId, qty: 1, customLength: 0, placements: [] };
    const next = [...snapshotAll(), fresh];
    goTo(next, next.length - 1);
    setPanel("uploads");
    say.done("New gang sheet created");
  }

  function duplicateSheet(idx: number) {
    const snap = snapshotAll();
    const src = snap[idx];
    if (!src) return;
    const copy: SheetTab = { ...src, key: uid(), name: `${src.name} copy`, orderId: null, placements: src.placements.map((p) => ({ ...p, id: nextId.current++ })) };
    const next = [...snap.slice(0, idx + 1), copy, ...snap.slice(idx + 1)];
    goTo(next, idx + 1);
  }

  function deleteSheet(idx: number) {
    if (sheets.length <= 1) return;
    const next = snapshotAll().filter((_, i) => i !== idx);
    let landing = active;
    if (idx === active) landing = Math.min(idx, next.length - 1);
    else if (idx < active) landing = active - 1;
    goTo(next, landing);
  }

  function renameSheet(idx: number, name: string) {
    setSheets((list) => list.map((s, i) => (i === idx ? { ...s, name } : s)));
  }

  function setSheetQty(idx: number, q: number) {
    const nq = Math.max(1, Math.floor(q) || 1);
    if (idx === active) { setQty(nq); return; }
    setSheets((list) => list.map((s, i) => (i === idx ? { ...s, qty: nq } : s)));
  }

  /** Per-sheet unit price (per-sheet flat, or custom length × per-inch). */
  function sheetUnitPrice(s: { sizeId: string; customLength: number }): number {
    const sz = sizes.find((z) => z.id === s.sizeId);
    if (!sz) return 0;
    return sz.pricing_mode === "custom_length"
      ? s.customLength * Number(sz.price_per_inch || 0)
      : Number(sz.price_per_sheet || 0);
  }

  // ── Right-click menu actions ─────────────────────────────────────────────────
  function openEditorFor(id: number, t: "enhance" | "crop" | "removecolor") {
    const p = stateRef.current.placements.find((q) => q.id === id);
    const u = p ? upById(p.uid) : undefined;
    if (u && IMAGE_TYPES.has(u.file_type.toLowerCase())) { setEditUpload(u); setEditTab(t); }
    setCtxMenu(null);
  }
  function copyPlacement(id: number) {
    const p = stateRef.current.placements.find((q) => q.id === id);
    if (p) clipRef.current = { ...p };
    setCtxMenu(null);
  }
  function pastePlacement() {
    const c = clipRef.current;
    setCtxMenu(null);
    if (!c) return;
    const fp = footprint(c);
    const spot = firstFreeSpot(fp.w, fp.h);
    const nid = nextId.current++;
    setPlacements((list) => [...list, { ...c, id: nid, x_in: spot.x, y_in: spot.y }]);
    setSelected(nid);
  }
  function openDupModal(id: number) { setSelected(id); setDupQty(5); setDupApplyMargin(false); setDupModal(id); setCtxMenu(null); }
  function confirmDup() {
    if (dupModal == null) return;
    addCopies(dupQty, dupApplyMargin ? dupMargin : undefined);
    setDupModal(null);
  }
  // Close the context menu on any outside click / scroll.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [ctxMenu]);

  // ── Preview ──────────────────────────────────────────────────────────────────
  // Open a print-resolution preview of the active sheet in a new tab — the exact
  // layout on a to-scale transparent sheet, with the true print pixel size shown.
  function preview() {
    if (!size) return;
    if (placements.length === 0) { setError("Add at least one design to preview."); return; }
    const DPI = 300;
    const wPx = Math.round(size.width_in * DPI);
    const hPx = Math.round(sheetLen * DPI);
    const scale = clamp(1100 / (size.width_in || 22), 24, 60); // on-screen px per inch
    const cw = size.width_in * scale;
    const ch = sheetLen * scale;
    const items = placements.map((p) => {
      const u = upById(p.uid);
      if (!u || !IMAGE_TYPES.has(u.file_type.toLowerCase())) return "";
      const fp = footprint(p);
      const cx = (p.x_in + fp.w / 2) * scale;
      const cy = (p.y_in + fp.h / 2) * scale;
      const iw = p.w_in * scale, ih = p.h_in * scale;
      return `<img src="${u.file_url}" style="position:absolute;left:${cx - iw / 2}px;top:${cy - ih / 2}px;width:${iw}px;height:${ih}px;transform:rotate(${p.rotation}deg);transform-origin:center center;" />`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Full Resolution Preview</title>
      <style>
        body{margin:0;background:#EDEDF0;font-family:system-ui,-apple-system,sans-serif;padding:26px;text-align:center;}
        h1{font-size:20px;font-weight:800;margin:0 0 4px;}
        .sub{color:#666;font-size:13px;margin:0 0 22px;}
        .sheet{position:relative;margin:0 auto;width:${cw}px;height:${ch}px;
          background-image:repeating-conic-gradient(#e6e6e6 0% 25%,#fff 0% 50%);background-size:20px 20px;
          box-shadow:0 3px 16px rgba(0,0,0,.18);}
        img{display:block;}
      </style></head><body>
      <h1>Full Resolution Preview</h1>
      <div class="sub">${wPx} × ${hPx} pixels (${size.width_in}″ × ${round2(sheetLen)}″ @ ${DPI} DPI)</div>
      <div class="sheet">${items}</div>
      </body></html>`;
    const win = window.open("", "_blank");
    if (!win) { setError("Please allow pop-ups to open the preview."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  // Submit one sheet as its own order and persist its layout; returns the order.
  async function submitSheet(s: SheetTab): Promise<GangSheetOrder> {
    const sz = sizes.find((z) => z.id === s.sizeId);
    if (!sz) throw new Error("Choose a sheet size for every sheet.");
    const sCustom = sz.pricing_mode === "custom_length";
    const usedUids = Array.from(new Set(s.placements.map((p) => p.uid)));
    const artPayload = usedUids.map((u) => {
      const up = upById(u)!;
      const first = s.placements.find((p) => p.uid === u)!;
      const count = s.placements.filter((p) => p.uid === u).length;
      return { file_url: up.file_url, file_name: up.file_name, file_type: up.file_type, width_in: round2(first.w_in), height_in: round2(first.h_in), quantity: count };
    });
    // Reopened sheet → replace its order's contents; otherwise submit a new one.
    const order = s.orderId
      ? await gangSheetsService.rebuild(s.orderId, { sheet_size_id: sz.id, sheet_quantity: s.qty, custom_length_in: sCustom ? s.customLength : undefined, artworks: artPayload })
      : await gangSheetsService.submit({ sheet_size_id: sz.id, sheet_quantity: s.qty, custom_length_in: sCustom ? s.customLength : undefined, artworks: artPayload, product_id: productId || undefined, contact_name: guest.name.trim() || undefined, contact_email: guest.email.trim() || undefined });
    // Artwork rows come back in the order they were sent, so the id for a design
    // is matched by position. Matching on file_url instead would collapse to one
    // id whenever the same file was uploaded twice, quietly stacking those
    // designs on top of each other in production.
    const savedArts = order.artworks ?? [];
    const idByUid = new Map<string, string>();
    usedUids.forEach((u, i) => {
      const id = savedArts[i]?.id;
      if (id) idByUid.set(u, id);
    });

    const layout = s.placements
      .map((p) => {
        const artId = idByUid.get(p.uid);
        if (!artId) return null;
        return { artwork_id: artId, x_in: p.x_in, y_in: p.y_in, rotation: p.rotation, w_in: p.w_in, h_in: p.h_in };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    // The layout IS the print job — without it production has files but no idea
    // where they go. Losing it quietly used to produce an order that looked fine
    // to the buyer and was unprintable for the brand, so a failure here stops the
    // save instead of being swallowed.
    if (layout.length !== s.placements.length) {
      throw new Error("Your sheet couldn't be saved correctly. Please try again — if it keeps happening, re-upload the designs.");
    }
    return await gangSheetsService.saveLayout(order.id, layout);
  }

  /**
   * Make the account (or sign in), then carry straight on with the save.
   *
   * The sheet is never thrown away by this: a failure leaves the modal open
   * with the reason, and the designs are exactly where they were.
   */
  async function completeJoin() {
    if (joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const tokens = mode === "join"
        ? await authService.registerCustomer({
            first_name: join.first_name.trim(),
            last_name: join.last_name.trim(),
            email: join.email.trim(),
            password: join.password,
            company_name: join.company_name.trim() || undefined,
          })
        : await authService.login({ email: join.email.trim(), password: join.password });

      if (tokens.requires_2fa) {
        setJoinError("This account uses a second factor. Please sign in from the sign-in page, then come back.");
        return;
      }
      await establishSession(tokens.access_token);
      setGuest({ name: `${join.first_name} ${join.last_name}`.trim(), email: join.email.trim() });

      const next = askingWho;
      setAskingWho(null);
      if (next) await save(next.toCart);
    } catch (e) {
      const err = e as { message?: string; status?: number };
      setJoinError(
        err?.status === 429
          ? "Too many tries just now. Wait a minute and try again."
          : err?.message || (mode === "join"
              ? "Could not open your account. Please check the details and try again."
              : "Could not sign you in. Check your email and password."),
      );
    } finally {
      setJoining(false);
    }
  }

  async function save(toCart: boolean) {
    setError(null);
    setSavedOk(false);
    const toSubmit = snapshotAll().filter((s) => s.placements.length > 0);
    if (!toSubmit.length) { setError("Add at least one design to a sheet before saving."); return; }
    // A sheet gets reviewed, queried and reordered, so it has to belong to
    // somebody the shop can reach and the buyer can log back in as. A name and
    // an email typed once was neither.
    if (!signedIn) { setAskingWho({ toCart }); return; }
    setSaving(true);
    try {
      // Each sheet is its own order (its own review + print job); adding them all
      // to the cart means one checkout can contain many sheets.
      const orders: GangSheetOrder[] = [];
      // Remember which sheet produced which order, so pressing Save again
      // rebuilds that same order instead of filing a second one.
      const savedIds = new Map<string, string>();
      for (const s of toSubmit) {
        const o = await submitSheet(s);
        orders.push(o);
        savedIds.set(s.key, o.id);
      }
      setSheets((prev) => prev.map((s) => savedIds.has(s.key) ? { ...s, orderId: savedIds.get(s.key)! } : s));
      if (toCart) {
        try {
          for (const o of orders) {
            // Signed in, the sheet joins the company's cart; otherwise the
            // same cart every other guest line goes into.
            if (signedIn) await cartService.addGangSheet(o.id);
            else addToGuestCart(gangSheetLine(o));
          }
          window.location.href = "/cart";
          return;
        } catch { /* cart unavailable — fall through to the saved state */ }
      }
      setSavedOk(true);
      onSaved(orders[0]!);
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      setError(msg || "Could not save your gang sheets. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Total across every sheet: the active one live, the rest from their snapshots.
  const cartTotal = sheets.reduce((sum, s, i) => {
    if (i === active) return sum + unitPrice * qty;
    return sum + sheetUnitPrice(s) * s.qty;
  }, 0);
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
  // Counted by design, not by finding: a design overlapping two others is one
  // design to move, not two, and a pair shouldn't count twice.
  const warnCounts = useMemo(() => {
    const byKind: Record<string, Set<number>> = {};
    for (const w of warnings) (byKind[w.kind] ??= new Set()).add(w.id);
    return Object.fromEntries(Object.entries(byKind).map(([k, ids]) => [k, ids.size])) as Record<string, number>;
  }, [warnings]);
  // Everything except overlaps, which get their own banner.
  const otherIssueIds = useMemo(
    () => new Set(warnings.filter((w) => w.kind !== "overlap").map((w) => w.id)),
    [warnings],
  );

  // Put up against the document, not inside the shop's page. A brand's theme
  // brings its own stylesheet, and the builder is a full-screen application —
  // it should not be at the mercy of whatever that stylesheet does to the
  // element it happens to be nested in. Rendered on the client only, since
  // there is no document to portal into on the server.
  const tree = (
    <div data-gs-root style={viewportH ? { ...S.root, height: `${viewportH}px` } : S.root}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
          <span style={S.logoMark} aria-hidden><Layers size={18} strokeWidth={2.3} /></span>
          <span>
            <div style={S.logo}>DTF Studio</div>
            <div style={S.logoSub}>Gang Sheet Builder</div>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
          <label style={{ fontSize: "13px", color: C.inkSoft, display: "flex", alignItems: "center", gap: "7px", fontWeight: 500 }}>
            Sheets
            {/* A short list rather than a free number: this is how many copies
                of the same sheet get printed, and it is a choice, not a sum.
                A value set elsewhere still shows, so nothing is ever lost. */}
            <select value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} style={S.sheetsSelect}>
              {Array.from(new Set([...Array.from({ length: 25 }, (_, i) => i + 1), qty]))
                .sort((a, b) => a - b)
                .map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button onClick={preview} style={S.ghostBtn} title="Open a full-resolution preview in a new tab"><Eye size={15} strokeWidth={2.1} /> Preview</button>
          <button onClick={() => save(true)} disabled={saving} style={{ ...S.primaryBtn, opacity: saving ? 0.6 : 1 }}>
            <ShoppingCart size={15} strokeWidth={2.2} /> {saving ? "Saving…" : "Save & Add to Cart"}
          </button>
          <button onClick={() => save(false)} disabled={saving} style={S.ghostBtn} title="Save without adding to cart"><Save size={15} strokeWidth={2.1} /> Save</button>
          <button onClick={onClose} style={S.closeBtn}><X size={15} strokeWidth={2.3} /> Close</button>
        </div>

        <div style={{ textAlign: "right", minWidth: "118px" }}>
          <div style={S.priceLabel}>
            {sheets.length > 1 ? `Est. total · ${sheets.length} sheets` : "Est. price"}
          </div>
          <div style={S.priceValue}>${cartTotal.toFixed(2)}</div>
        </div>
      </div>

      {confirmStartOver && (
        <div style={S.confirmBackdrop} onClick={() => setConfirmStartOver(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setConfirmStartOver(false); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="gs-startover-title"
            style={S.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={S.confirmIcon} aria-hidden>!</div>
            <div id="gs-startover-title" style={{ fontSize: "17px", fontWeight: 800, color: "#1A1A1A" }}>
              Start over this sheet?
            </div>
            <p style={{ fontSize: "13.5px", color: "#555", lineHeight: 1.6, margin: "8px 0 0" }}>
              This removes all <strong>{placements.length}</strong> design{placements.length === 1 ? "" : "s"} from
              {" "}<strong>{sheets[active]?.name ?? "this sheet"}</strong>. Your uploaded images stay in Your Uploads,
              and you can bring the layout back with Undo (Ctrl+Z).
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
              {/* Cancel takes the focus, so a stray Enter keeps the sheet. */}
              <button autoFocus onClick={() => setConfirmStartOver(false)} style={S.confirmCancel}>Cancel</button>
              <button onClick={() => { startOver(); setConfirmStartOver(false); }} style={S.confirmDanger}>Yes, start over</button>
            </div>
          </div>
        </div>
      )}

      {error && <div style={S.errorBar}>{error}{savedOk ? "" : " "}<button onClick={() => setError(null)} aria-label="Dismiss" style={{ background: "none", border: "none", color: "#991B1B", cursor: "pointer", padding: "2px", display: "inline-flex", alignItems: "center" }}><X size={14} strokeWidth={2.4} /></button></div>}
      {savedOk && !error && <div style={S.okBar}>Saved. It&apos;s in your gang sheets and ready for checkout.</div>}

      {/* Where this job's updates go. A sheet is reviewed and sometimes sent
          back for a change, so there has to be a way to reach whoever made it —
          an account is one way, an email is the other. */}
      {/* An account, before the sheet is filed.
          A sheet used to be saved against a name and an email typed at the
          end, which left the shop an order it could not do anything with: no
          login for the buyer to come back to, nobody in the customer list, and
          nowhere to send a proof or a reprint. Printing is a conversation —
          artwork gets queried, jobs get reordered — so the person on the other
          end has to be a customer, not a line of text. */}
      {askingWho && (
        <div onClick={() => !joining && setAskingWho(null)} style={S.joinBackdrop}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); void completeJoin(); }}
            style={S.joinBox}
          >
            <div style={{ fontSize: "18px", fontWeight: 800, color: C.ink }}>
              {mode === "join" ? "Create your account" : "Sign in"}
            </div>
            <p style={{ fontSize: "13px", color: C.inkSoft, lineHeight: 1.6, margin: "7px 0 18px" }}>
              {mode === "join"
                ? "Your sheet is saved to your account, so you can track the print job, reorder it later, and we can reach you if the artwork needs a word."
                : "Welcome back. Your sheet is waiting."}
            </p>

            {mode === "join" && (
              <div style={{ display: "flex", gap: "9px" }}>
                <label style={{ flex: 1 }}>
                  <span style={S.joinLabel}>First name</span>
                  <input required autoFocus value={join.first_name}
                    onChange={(e) => setJoin((j) => ({ ...j, first_name: e.target.value }))}
                    style={S.joinInput} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={S.joinLabel}>Last name</span>
                  <input value={join.last_name}
                    onChange={(e) => setJoin((j) => ({ ...j, last_name: e.target.value }))}
                    style={S.joinInput} />
                </label>
              </div>
            )}

            <label style={{ display: "block" }}>
              <span style={S.joinLabel}>Email</span>
              <input type="email" required autoFocus={mode === "signin"} value={join.email}
                onChange={(e) => setJoin((j) => ({ ...j, email: e.target.value }))}
                style={S.joinInput} />
            </label>

            <label style={{ display: "block" }}>
              <span style={S.joinLabel}>Password</span>
              <input type="password" required minLength={mode === "join" ? 8 : undefined} value={join.password}
                onChange={(e) => setJoin((j) => ({ ...j, password: e.target.value }))}
                style={S.joinInput} />
              {mode === "join" && (
                <span style={{ display: "block", fontSize: "11px", color: C.inkFaint, marginTop: "4px" }}>
                  At least 8 characters.
                </span>
              )}
            </label>

            {mode === "join" && (
              <label style={{ display: "block" }}>
                <span style={S.joinLabel}>Business name <span style={{ color: C.inkFaint, fontWeight: 500 }}>(optional)</span></span>
                <input value={join.company_name}
                  onChange={(e) => setJoin((j) => ({ ...j, company_name: e.target.value }))}
                  style={S.joinInput} />
              </label>
            )}

            {joinError && (
              <div role="alert" style={{ background: C.stopTint, border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: "9px", padding: "9px 11px", fontSize: "12.5px", lineHeight: 1.5, marginTop: "4px" }}>
                {joinError}
              </div>
            )}

            <button type="submit" disabled={joining} style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", padding: "12px", marginTop: "16px", opacity: joining ? 0.65 : 1 }}>
              {joining
                ? "Just a moment…"
                : askingWho.toCart ? "Create account & add to cart" : "Create account & save"}
            </button>

            {/* Somebody who already has an account should not have to leave
                the builder — and leaving it is how the sheet gets lost. */}
            <button type="button" onClick={() => { setMode(mode === "join" ? "signin" : "join"); setJoinError(null); }}
              style={S.joinSwitch}>
              {mode === "join" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
            <button type="button" onClick={() => setAskingWho(null)} disabled={joining} style={{ ...S.joinSwitch, color: C.inkFaint }}>
              Back to my sheet
            </button>
          </form>
        </div>
      )}

      {editUpload && (
        <ImageEditorModal
          src={editUpload.file_url}
          fileName={editUpload.file_name}
          initialTab={editTab}
          onClose={() => setEditUpload(null)}
          onApply={applyEdit}
        />
      )}

      {/* ── Right-click context menu on a placed design ───────────────────────── */}
      {ctxMenu && (
        <div style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 450, background: "#fff", borderRadius: "10px", boxShadow: "0 8px 30px rgba(0,0,0,.22)", padding: "6px", minWidth: "190px" }} onClick={(e) => e.stopPropagation()}>
          {([
            ["Copy", <Copy key="i" {...MENU_ICON} />, () => copyPlacement(ctxMenu.id), true],
            ["Paste", <ClipboardPaste key="i" {...MENU_ICON} />, () => pastePlacement(), !!clipRef.current],
            ["Delete", <Trash2 key="i" {...MENU_ICON} />, () => { remove(ctxMenu.id); setCtxMenu(null); }, true],
            ["Duplicate", <CopyPlus key="i" {...MENU_ICON} />, () => { duplicate(ctxMenu.id); setCtxMenu(null); }, true],
            ["Add Quantity", <Layers key="i" {...MENU_ICON} />, () => openDupModal(ctxMenu.id), true],
            ["Remove Color", <Droplet key="i" {...MENU_ICON} />, () => openEditorFor(ctxMenu.id, "removecolor"), true],
            ["Crop", <Crop key="i" {...MENU_ICON} />, () => openEditorFor(ctxMenu.id, "crop"), true],
            ["Edit image", <Wand2 key="i" {...MENU_ICON} />, () => openEditorFor(ctxMenu.id, "enhance"), true],
          ] as const).map(([label, icon, fn, enabled]) => (
            <button key={label} onClick={enabled ? fn : undefined} disabled={!enabled}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 12px", fontSize: "13px", fontWeight: 600, color: enabled ? "#222" : "#BBB", cursor: enabled ? "pointer" : "default", borderRadius: "6px" }}
              onMouseEnter={(e) => { if (enabled) e.currentTarget.style.background = "#F2F4F8"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "9px" }}>{icon}{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Auto Duplicate (Add Quantity) ─────────────────────────────────────── */}
      {dupModal != null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 460, background: "rgba(20,24,31,.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDupModal(null)}>
          <div style={{ width: "min(420px,92vw)", background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <span style={{ fontSize: "16px", fontWeight: 800 }}>Auto Duplicate</span>
              <button onClick={() => setDupModal(null)} aria-label="Close" style={S.modalClose}><X size={17} strokeWidth={2.2} /></button>
            </div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#444" }}>Quantity you want to add</label>
            <input type="number" min={1} value={dupQty} onChange={(e) => setDupQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #DDD9D2", borderRadius: "8px", fontSize: "14px", margin: "6px 0 14px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#444", cursor: "pointer" }}>
                <input type="checkbox" checked={dupApplyMargin} onChange={(e) => setDupApplyMargin(e.target.checked)} /> Apply margin
              </label>
              {dupApplyMargin && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input type="number" min={0} step="0.05" value={dupMargin} onChange={(e) => setDupMargin(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: "80px", padding: "8px", border: "1px solid #DDD9D2", borderRadius: "8px", fontSize: "13px" }} />
                  <span style={{ fontSize: "12px", color: "#5A5E66" }}>in</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button onClick={() => setDupModal(null)} style={S.ghostBtn}>Cancel</button>
              <button onClick={confirmDup} style={S.primaryBtn}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Background-removal prompt ──────────────────────────────────────────── */}
      {bgFile && (
        <div style={S.bgOverlay}>
          <div style={S.bgModal}>
            <div style={S.bgHead}>
              <span style={{ fontSize: "17px", fontWeight: 800 }}>Background Warning</span>
              <button onClick={bgDiscard} aria-label="Close" style={S.modalClose}><X size={18} strokeWidth={2.2} /></button>
            </div>
            <div style={S.bgWarnBar}>
              ⚠ We detected a background in this image. We recommend removing it with the background-removal tool, or replacing it with transparent artwork.
            </div>
            <div style={S.bgPreviewBox}>
              {bgPreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bgPreviewUrl} alt="Uploaded design" style={{ maxWidth: "100%", maxHeight: "46vh", objectFit: "contain", display: "block", margin: "0 auto" }} />
              )}
              {bgBusy && (
                <WorkingOverlay
                  label={`${bgLabel}…`}
                  progress={bgProgress}
                  note={bgLabel.startsWith("Downloading")
                    ? "Only the first time — after this it's quick."
                    : undefined}
                />
              )}
            </div>
            <div style={S.bgFoot}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#555", cursor: "pointer" }}>
                <input type="checkbox" checked={bgDontShow} onChange={(e) => setDontShowBg(e.target.checked)} /> Don&apos;t show again
              </label>
              <div style={{ flex: 1 }} />
              <button onClick={bgDiscard} disabled={bgBusy} style={S.ghostBtn}>Discard</button>
              <button onClick={bgContinue} disabled={bgBusy} style={S.ghostBtn}>Continue</button>
              <button onClick={bgRemove} disabled={bgBusy} style={{ ...S.primaryBtn, background: "#1A1A1A", opacity: bgBusy ? 0.65 : 1 }}>
                {bgBusy ? "Removing…" : <><Sparkles size={14} strokeWidth={2.2} /> Remove background</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={S.body}>
        {/* ── Left rail ─────────────────────────────────────────────────────── */}
        <div style={S.rail}>
          {RAIL.map(({ key, label, Icon }) => {
            const on = panel === key;
            return (
              <button key={key} onClick={() => setPanel(key)} title={label} aria-current={on ? "page" : undefined}
                style={{ ...S.railBtn, ...(on ? S.railBtnActive : {}) }}>
                <Icon size={19} strokeWidth={on ? 2.3 : 2} />
                <span style={{ fontSize: "10.5px", marginTop: "5px", fontWeight: on ? 700 : 600 }}>{label}</span>
              </button>
            );
          })}
          <div style={{ marginTop: "auto", fontSize: "9.5px", fontWeight: 700, color: C.inkFaint, textAlign: "center", padding: "10px 2px 4px", letterSpacing: ".06em" }}>AT360<br/>APPS</div>
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
                style={{ ...S.dropzone, borderColor: dropActive ? C.go : "#D4D8DE", background: dropActive ? C.goTint : "#FBFCFD" }}
              >
                <UploadCloud size={30} strokeWidth={1.9} color={C.go} />
                <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "8px", color: C.ink }}>
                  {uploadStep
                    ? `Uploading ${uploadStep.done + 1} of ${uploadStep.total}…`
                    : uploading ? "Uploading…" : "Drag & drop, or click to upload"}
                </div>
                <div style={{ fontSize: "11.5px", color: C.inkFaint, marginTop: "5px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {uploadStep ? uploadStep.name : "PNG, JPG, PDF, SVG · larger than 300×300px"}
                </div>
                {uploadStep && uploadStep.total > 1 ? (
                  <span style={{ display: "block", width: "100%", height: "5px", borderRadius: "3px", background: C.lineSoft, marginTop: "10px", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", background: C.go, borderRadius: "3px", width: `${Math.round((uploadStep.done / uploadStep.total) * 100)}%`, transition: "width .2s ease" }} />
                  </span>
                ) : (
                  <span style={S.chooseBtn}><FolderOpen size={14} strokeWidth={2.2} /> Choose Files</span>
                )}
              </div>
              <input ref={fileRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.svg,.ai,.eps,.psd,.tif,.tiff" onChange={(e) => onFiles(e.target.files)} style={{ display: "none" }} />

              <div style={S.listHead}>
                <span>Your uploads</span>
                {uploads.length > 0 && <span style={{ color: C.inkFaint, fontWeight: 600 }}>{uploads.length}</span>}
              </div>

              {/* A list, not a grid of squares. The file's name and its pixel
                  size are what tell a buyer which design is which and whether
                  it will print — and neither fits under a 64px thumbnail. */}
              <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "8px" }}>
                {uploads.map((u) => {
                  const count = placements.filter((p) => p.uid === u.uid).length;
                  const isImg = IMAGE_TYPES.has(u.file_type.toLowerCase());
                  return (
                    <div key={u.uid} style={S.uploadRow}>
                      <button onClick={() => addPlacement(u)} title="Add to the sheet" style={S.uploadRowMain}>
                        <span style={S.uploadThumbBox}>
                          {isImg
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={u.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            : <span style={{ fontSize: "10.5px", color: "#4338CA", fontWeight: 800 }}>{u.file_type.toUpperCase().slice(0, 4)}</span>}
                          {count > 0 && <span style={S.thumbBadge}>{count}</span>}
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={S.uploadName}>{u.file_name}</span>
                          <span style={S.uploadMeta}>
                            {u.pxW && u.pxH ? `${u.pxW} × ${u.pxH} px` : u.file_type.toUpperCase()}
                          </span>
                        </span>
                      </button>
                      <span style={{ display: "flex", gap: "2px", paddingRight: "6px" }}>
                        {isImg && (
                          <button onClick={() => setEditUpload(u)} title="Edit image (background, halftone, crop…)" aria-label={`Edit ${u.file_name}`}
                            style={S.rowTool}><Wand2 size={15} strokeWidth={2} /></button>
                        )}
                        {/* Removing a file was simply missing, so the only thing
                            clicking here could do was add more copies of it. */}
                        <button onClick={() => removeUpload(u)} title={`Remove ${u.file_name}`} aria-label={`Remove ${u.file_name}`}
                          style={{ ...S.rowTool, color: C.stop }}><Trash2 size={15} strokeWidth={2} /></button>
                      </span>
                    </div>
                  );
                })}
                {uploads.length === 0 && <div style={{ fontSize: "12.5px", color: C.inkFaint, padding: "10px 0" }}>No uploads yet.</div>}
              </div>
            </>
          )}

          {panel === "designs" && (
            <>
              <div style={S.panelTitle}>Ready-made designs</div>
              <p style={{ fontSize: "12px", color: "#656971", marginBottom: "10px" }}>Tap any design to drop it on your sheet.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {library.map((d) => (
                  <button key={d.id} onClick={() => addFromUrl(d.file_url, d.name, d.file_type)} title={d.name} style={S.uploadThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.file_url} alt="" style={{ width: "100%", height: "72px", objectFit: "contain", background: "#F7F7F5" }} />
                    <div style={{ fontSize: "11.5px", color: "#666", padding: "3px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  </button>
                ))}
                {library.length === 0 && <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "#6B6F76", padding: "10px 0" }}>No ready-made designs yet.</div>}
              </div>
            </>
          )}

          {panel === "gallery" && (
            <>
              <div style={S.panelTitle}>Your gallery</div>
              <p style={{ fontSize: "12px", color: "#656971", marginBottom: "10px" }}>Designs you&apos;ve used before — reuse without re-uploading.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {gallery.map((a, i) => (
                  <button key={`${a.file_url}-${i}`} onClick={() => addFromUrl(a.file_url, a.file_name, a.file_type)} title={a.file_name} style={S.uploadThumb}>
                    {IMAGE_TYPES.has((a.file_type ?? "").toLowerCase())
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.file_url} alt="" style={{ width: "100%", height: "72px", objectFit: "contain", background: "#F7F7F5" }} />
                      : <div style={{ height: "72px", display: "flex", alignItems: "center", justifyContent: "center", color: "#4338CA", fontWeight: 700 }}>{(a.file_type ?? "?").toUpperCase().slice(0, 4)}</div>}
                    <div style={{ fontSize: "11.5px", color: "#666", padding: "3px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</div>
                  </button>
                ))}
                {gallery.length === 0 && <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "#6B6F76", padding: "10px 0" }}>Your used designs will appear here.</div>}
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
              <p style={{ fontSize: "12px", color: "#656971", marginTop: "10px" }}>Text is added as a high-resolution graphic you can move and resize like any design.</p>
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
                <button onClick={() => remove(sel.id)} style={S.deleteBtn} title="Delete this design">
                  <Trash2 size={14} strokeWidth={2.2} /> Delete
                </button>
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
                    <div key={m} style={{ fontSize: "12px", color: "#9A3412", fontWeight: 600 }}>⚠ {m}</div>
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
                  <button onClick={() => addCopies(copyN)} style={S.smallBtn}><CopyPlus size={13} strokeWidth={2.2} /> Add copies</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px", marginTop: "12px", flexWrap: "wrap" }}>
                <button onClick={() => rotate(sel.id)} style={S.smallBtn}><RotateCw size={13} strokeWidth={2.2} /> Rotate</button>
                <button onClick={() => duplicate(sel.id)} style={S.smallBtn}><CopyPlus size={13} strokeWidth={2.2} /> Duplicate</button>
                <button onClick={() => autoFill(sel.id)} style={{ ...S.smallBtn, width: "100%" }}><Grid3x3 size={13} strokeWidth={2.2} /> Auto fill sheet</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Canvas area ───────────────────────────────────────────────────── */}
        <div style={S.canvasArea}>
          {abOpen && (
            <div style={S.abOverlay}>
            <AutoBuildPanel
              uploads={uploads}
              items={abItems}
              setItems={setAbItems}
              myImages={[
                ...uploads.map((u) => ({ file_url: u.file_url, name: u.file_name, file_type: u.file_type })),
                ...gallery.map((g) => ({ file_url: g.file_url, name: g.file_name, file_type: g.file_type ?? null })),
              ].filter((d, i, all) => all.findIndex((x) => x.file_url === d.file_url) === i)}
              galleryDesigns={library.map((d) => ({ file_url: d.file_url, name: d.name, file_type: d.file_type ?? null }))}
              imageMargin={imageMargin}
              bleed={bleed}
              maxW={printW}
              maxH={printH}
              uploading={uploading}
              busyKey={abBusy?.key ?? null}
              busyLabel={abBusy?.label ?? ""}
              checks={abChecks}
              message={abMessage}
              onUploadFiles={abUploadFiles}
              onPick={abPick}
              onRemoveBackground={abRemoveBackground}
              onRestoreBackground={abRestoreBackground}
              onUpscale={abUpscale}
              onPressCheck={abPressCheck}
              onApply={abApply}
              onClose={() => setAbOpen(false)}
            />
            </div>
          )}
          <>
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
                <span style={{ fontSize: "12px", color: "#5A5E66" }}>in</span>
                <select onChange={(e) => setCustomLength(clamp(Number(e.target.value) * 12, size.min_length_in, size.max_length_in))} value="" style={{ ...S.sizeSelect, minWidth: "auto" }}>
                  <option value="">ft…</option>
                  {FOOT_PRESETS.filter((f) => f * 12 >= size.min_length_in && f * 12 <= size.max_length_in).map((f) => <option key={f} value={f}>{f} feet</option>)}
                </select>
              </div>
            )}
            <div style={S.toolDivider} />
            <button onClick={() => setPanTool((v) => !v)} title="Pan / hand tool" style={{ ...S.iconBtn, ...(panTool ? S.iconBtnOn : null) }}><Hand {...TOOL_ICON} /></button>
            <button onClick={() => setShowGrid((v) => !v)} title="Toggle grid" style={{ ...S.iconBtn, ...(showGrid ? S.iconBtnOn : null) }}><Grid3x3 {...TOOL_ICON} /></button>
            <div style={S.toolDivider} />
            <label style={{ fontSize: "12.5px", color: C.inkSoft, display: "flex", alignItems: "center", gap: "7px", fontWeight: 500 }}>
              Margin
              <input type="number" min={0} step="0.25" value={imageMargin} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setImageMargin(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: "58px", padding: "8px 9px", border: `1px solid ${C.line}`, borderRadius: "9px", fontSize: "12.5px", fontFamily: "inherit", color: C.ink }} /> in
            </label>
            <button onClick={() => autoNest()} style={S.nestBtn}><Zap size={14} strokeWidth={2.4} /> Auto Nest</button>
            <button onClick={() => autoNest(0.5)} style={S.nestBtn} title="Nest with extra spacing so each design can be cut out"><Scissors size={14} strokeWidth={2.4} /> Auto Nest for Cutting</button>
            <div style={S.toolDivider} />
            <button onClick={undo} disabled={!canUndo} style={{ ...S.iconBtn, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? "pointer" : "default" }} title="Undo (Ctrl+Z)"><Undo2 {...TOOL_ICON} /></button>
            <button onClick={redo} disabled={!canRedo} style={{ ...S.iconBtn, opacity: canRedo ? 1 : 0.4, cursor: canRedo ? "pointer" : "default" }} title="Redo (Ctrl+Shift+Z)"><Redo2 {...TOOL_ICON} /></button>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}>
              <button onClick={() => zoomBy(1 / 1.2)} style={S.iconBtn} title="Zoom out"><Minus {...TOOL_ICON} /></button>
              <span style={{ fontSize: "12px", color: "#666", width: "44px", textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => zoomBy(1.2)} style={S.iconBtn} title="Zoom in"><Plus {...TOOL_ICON} /></button>
              <button onClick={fitScreen} style={S.iconBtn} title="Fit to screen"><Maximize {...TOOL_ICON} /></button>
            </div>
          </div>

          {/* Rulers + canvas. The top/left inch rulers scroll in sync with the sheet. */}
          <div style={S.rulerGrid}>
            <div style={S.rulerCorner} />
            <div ref={topRulerRef} style={S.rulerTopWrap}>
              <Ruler axis="x" contentPx={frame.w || sheetWpx + RULER_PAD * 2} ppi={ppi} lengthIn={size?.width_in ?? 0} pad={frame.x} />
            </div>
            <div ref={leftRulerRef} style={S.rulerLeftWrap}>
              <Ruler axis="y" contentPx={frame.h || sheetHpx + RULER_PAD * 2} ppi={ppi} lengthIn={sheetLen} pad={frame.y} />
            </div>

            <div style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
              {/* Scrollable sheet — wheel-zoom bound natively; scroll syncs the rulers. */}
              <div ref={scrollRef} onScroll={syncRulers} className="gs-canvas-scroll" style={S.canvasScroll}>
                <div ref={frameRef} style={S.sheetFrame}>
                <div
                  ref={sheetRef}
                  tabIndex={0}
                  onKeyDown={onKeyDown}
                  onPointerDown={(e) => { if (panTool) { startPan(e); return; } setSelected(null); sheetRef.current?.focus(); }}
                  style={{
                    position: "relative", width: `${sheetWpx}px`, height: `${sheetHpx}px`, margin: "auto", flexShrink: 0,
                    background: "#fff", outline: "none", touchAction: "none", userSelect: "none",
                    cursor: panTool ? "grab" : "default",
                    // A checker the eye can actually see, and a hard edge: the sheet
                    // is what gets printed, so where it ends has to be obvious.
                    backgroundImage: "repeating-conic-gradient(#D6D6D6 0% 25%, #fff 0% 50%)",
                    backgroundSize: "16px 16px",
                    boxShadow: "0 0 0 1px #1F2937, 0 8px 28px rgba(0,0,0,.18)",
                  }}
                >
                  {bleed > 0 && (
                    <div title="Safe area — keep designs inside this line"
                      style={{ position: "absolute", left: bleed * ppi, top: bleed * ppi, right: bleed * ppi, bottom: bleed * ppi, border: "1.5px dashed rgba(220,38,38,.85)", pointerEvents: "none" }} />
                  )}
                  {/* A line at every foot, so a long sheet shows where each foot
                      ends — the unit it is priced and cut by. */}
                  {Array.from({ length: Math.floor(sheetLen / 12) }, (_, i) => (i + 1) * 12)
                    .filter((inch) => inch < sheetLen)
                    .map((inch) => (
                      <div key={inch} style={{ position: "absolute", left: 0, right: 0, top: inch * ppi, borderTop: "1px dashed rgba(31,41,55,.45)", pointerEvents: "none" }}>
                        <span style={{ position: "absolute", right: "4px", top: "2px", fontSize: "11.5px", fontWeight: 700, color: "#1F2937", background: "rgba(255,255,255,.9)", padding: "0 5px", borderRadius: "3px" }}>
                          {inch / 12} ft
                        </span>
                      </div>
                    ))}
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
                    onContextMenu={(e) => { e.preventDefault(); setSelected(p.id); setCtxMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
                    style={{
                      position: "absolute", left: p.x_in * ppi, top: p.y_in * ppi, width: fp.w * ppi, height: fp.h * ppi,
                      border: `2px solid ${ring}`, boxShadow: isSel ? "0 0 0 2px rgba(28,53,87,.2)" : isOverlap ? "0 0 0 2px rgba(37,99,235,.18)" : warned ? "0 0 0 2px rgba(234,88,12,.18)" : "none",
                      background: isImg ? "transparent" : "#EEF2FF", cursor: panTool ? "grab" : "move",
                      display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", zIndex: isSel ? 5 : 1,
                    }}>
                    {isImg
                      // The design is drawn at its own size and then turned,
                      // rather than squeezed into a box whose sides have been
                      // swapped. Doing the latter is why rotating looked like
                      // nothing happened: the frame changed shape and the
                      // artwork inside it just got smaller and stayed upright
                      // — while the preview and the print file turned it. What
                      // was on screen was not what came off the printer.
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={u!.file_url} alt="" draggable={false} style={{
                          position: "absolute",
                          left: "50%", top: "50%",
                          width: `${p.w_in * ppi}px`, height: `${p.h_in * ppi}px`,
                          marginLeft: `${-p.w_in * ppi / 2}px`, marginTop: `${-p.h_in * ppi / 2}px`,
                          transform: `rotate(${p.rotation}deg)`, transformOrigin: "center center",
                          objectFit: "contain", pointerEvents: "none",
                        }} />
                      : <span style={{ fontSize: "10.5px", color: "#4338CA", textAlign: "center", padding: "2px", pointerEvents: "none", wordBreak: "break-word" }}>{u?.file_name ?? "?"}</span>}
                    {warned && !isSel && (
                      <span style={{ position: "absolute", top: "-8px", right: "-8px", width: "18px", height: "18px", background: "#EA580C", color: "#fff", borderRadius: "50%", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, pointerEvents: "none" }}>!</span>
                    )}
                    {isSel && (
                      <>
                        {/* The design's own buttons. They used to sit above it
                            in a fixed place, which put them off the top of the
                            sheet for anything near the edge — so the one tool
                            everybody reaches for first, delete, could not be
                            clicked at all on exactly the designs that needed
                            it. They flip below when there is no room above. */}
                        <div style={{ position: "absolute", left: 0, ...S.selBar, ...(p.y_in * ppi < 44 ? { top: "100%", marginTop: "9px" } : { bottom: "100%", marginBottom: "9px" }) }}>
                          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); rotate(p.id); }} style={S.chip} title="Rotate 90°" aria-label="Rotate 90 degrees"><RotateCw size={15} strokeWidth={2} /></button>
                          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); duplicate(p.id); }} style={S.chip} title="Duplicate" aria-label="Duplicate"><Copy size={15} strokeWidth={2} /></button>
                          <span style={S.selBarSplit} aria-hidden />
                          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(p.id); }} style={S.chipDanger} title="Delete this design" aria-label="Delete this design"><Trash2 size={15} strokeWidth={2} /></button>
                        </div>
                        <div onPointerDown={(e) => startResize(e, p.id)} style={{ position: "absolute", right: "-7px", bottom: "-7px", width: "14px", height: "14px", background: "#fff", border: "2px solid var(--brand-primary,#1C3557)", borderRadius: "3px", cursor: "nwse-resize" }} title="Drag to resize" />
                      </>
                    )}
                  </div>
                );
              })}
                </div>
                </div>
              </div>

              {/* Overlapping designs print on top of each other and ruin both,
                  so they get a banner of their own across the top of the canvas
                  rather than a word in a list. */}
              {/* The sheet just got longer to take a design. Said out loud
                  because the roll is priced by the inch — a length that
                  changes on its own and silently is a bill that changes on
                  its own and silently. */}
              {grewTo !== null && (
                <div role="status" style={S.grewBanner}>
                  <span>
                    <strong>Sheet grew to {round2(grewTo)}″</strong>
                    {" ("}{(grewTo / 12).toFixed(1)} ft{") "}
                    to fit your design.
                  </span>
                  <button onClick={() => setGrewTo(null)} aria-label="Dismiss" style={S.bannerClose}>
                    <X size={14} strokeWidth={2.4} />
                  </button>
                </div>
              )}

              {/* And when it cannot grow any further, which is the one case
                  where there is genuinely nowhere to put the design. */}
              {sheetFull && (
                <div role="alert" style={{ ...S.overlapBanner, background: "#FEF3C7", borderColor: "#FCD34D", color: "#7C2D12" }}>
                  <span aria-hidden style={{ ...S.overlapIcon, background: "#B45309" }}>!</span>
                  <span>
                    <strong>This sheet is full.</strong>{" "}
                    {isCustom
                      ? `It is already at its longest (${round2(size?.max_length_in ?? 0)}″).`
                      : "This size has a fixed length."}
                    {" "}Add another sheet, or make the designs smaller.
                  </span>
                  <button onClick={() => { addSheet(); setSheetFull(false); }} style={S.bannerAction}>Add a sheet</button>
                  <button onClick={() => setSheetFull(false)} aria-label="Dismiss" style={S.bannerClose}>
                    <X size={14} strokeWidth={2.4} />
                  </button>
                </div>
              )}

              {overlapIds.size > 0 && (
                <div role="alert" style={S.overlapBanner}>
                  <span aria-hidden style={S.overlapIcon}>!</span>
                  <span>
                    <strong>Images are overlapping</strong>
                    {" — "}{overlapIds.size} design{overlapIds.size === 1 ? "" : "s"} on top of each other.
                    {" "}Move them apart or use Auto Nest.
                  </span>
                </div>
              )}

              {/* Other issues (top-right) — advisory, never blocks saving. */}
              {otherIssueIds.size > 0 && (
                <div style={{ ...S.canvasWarn, top: overlapIds.size > 0 ? "64px" : "10px" }}>
                  <span style={{ fontWeight: 800 }}>⚠ {otherIssueIds.size} design{otherIssueIds.size === 1 ? "" : "s"} to check</span>
                  {warnCounts.outside ? <span> · {warnCounts.outside} past safe area</span> : null}
                  {warnCounts.dpi ? <span> · {warnCounts.dpi} low res</span> : null}
                  {warnCounts.small ? <span> · {warnCounts.small} too small</span> : null}
                </div>
              )}
            </div>
          </div>

          {/* What the colours and lines mean, always on screen. It used to sit
              in a View menu, where nobody found it — and a red outline nobody
              can decode is just decoration. It lives under the canvas, not on
              it, so it never covers the artwork being placed. */}
          <div style={S.viewStrip}>
            <label style={S.canvasCheck}>
              <input type="checkbox" checked={showRes} onChange={(e) => setShowRes(e.target.checked)} /> Resolution colours
            </label>
            <label style={S.canvasCheck}>
              <input type="checkbox" checked={showOverlap} onChange={(e) => setShowOverlap(e.target.checked)} /> Overlaps
            </label>
            <span style={S.stripDivider} />
            {showRes && ([["#16A34A", "300+ dpi"], ["#CA8A04", "250+"], ["#EA580C", "200+"], ["#DC2626", "under 200"]] as const).map(([c, t]) => (
              <span key={t} style={S.legendItem}><span style={{ ...S.legendSwatch, background: c }} /> {t}</span>
            ))}
            {showOverlap && <span style={S.legendItem}><span style={{ ...S.legendSwatch, background: "#2563EB" }} /> overlapping</span>}
            <span style={{ ...S.legendItem, marginLeft: "auto" }}>
              <span style={{ width: "18px", borderTop: "1.5px dashed rgba(220,38,38,.85)" }} /> safe area
              <span style={{ width: "18px", borderTop: "1px dashed rgba(31,41,55,.45)", marginLeft: "10px" }} /> each foot
            </span>
          </div>
          <style>{`
            .gs-canvas-scroll { scrollbar-width: auto; scrollbar-color: var(--brand-primary,#1C3557) #DCD9D3; }
            .gs-canvas-scroll::-webkit-scrollbar { width: 13px; height: 13px; }
            .gs-canvas-scroll::-webkit-scrollbar-track { background: #DCD9D3; }
            .gs-canvas-scroll::-webkit-scrollbar-thumb { background: var(--brand-primary,#1C3557); border-radius: 999px; border: 3px solid #DCD9D3; }
            .gs-canvas-scroll::-webkit-scrollbar-thumb:hover { background: #0F2340; }
            .gs-canvas-scroll::-webkit-scrollbar-corner { background: #DCD9D3; }
          `}</style>
          </>
        </div>

        {/* ── Right panel: Active Gang Sheets ───────────────────────────────── */}
        <div style={S.rightPanel}>
          <div style={{ fontSize: "13.5px", fontWeight: 700, color: C.ink }}>({sheets.length}) Active Gang Sheet{sheets.length === 1 ? "" : "s"}</div>
          {/* The list takes what is left and scrolls; the buttons under it keep
              their place. It used to be capped at 44vh with everything else
              stacked below, so in a short window the actions fell off the
              bottom of the panel and Start over could not be reached. */}
          <div style={S.sheetList}>
            {sheets.map((s, i) => {
              const isA = i === active;
              const sz = sizes.find((z) => z.id === (isA ? sizeId : s.sizeId));
              const imgs = isA ? placements.length : s.placements.length;
              const q = isA ? qty : s.qty;
              const len = sz ? (sz.pricing_mode === "custom_length" ? (isA ? sheetLen : s.customLength) : Number(sz.height_in)) : 0;
              return (
                <div key={s.key} onClick={() => switchTo(i)} style={{ ...S.sheetCard, ...(isA ? S.sheetCardActive : {}) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: C.inkSoft, fontWeight: 600 }}><Layers size={12} strokeWidth={2.1} /> {sz?.name ?? "—"}</span>
                    {sheets.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); deleteSheet(i); }} title="Delete this sheet" aria-label="Delete this sheet" style={{ marginLeft: "auto", background: "none", border: "none", color: "#B91C1C", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}><Trash2 size={14} strokeWidth={2.2} /></button>
                    )}
                  </div>
                  <input
                    value={s.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => renameSheet(i, e.target.value)}
                    style={S.sheetNameInput}
                  />
                  <div style={{ fontSize: "12px", color: "#656971" }}>
                    {imgs} image{imgs === 1 ? "" : "s"}{len ? ` · ${sz?.width_in ?? 0}×${Math.round(len)}″` : ""}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#4F535B" }}>
                      Qty
                      <input type="number" min={1} value={q} onClick={(e) => e.stopPropagation()} onChange={(e) => setSheetQty(i, Number(e.target.value))} style={{ width: "48px", padding: "3px 6px", border: "1px solid #DDD9D2", borderRadius: "5px", fontSize: "12px" }} />
                    </label>
                    <button onClick={(e) => { e.stopPropagation(); duplicateSheet(i); }} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "none", border: `1px solid ${C.line}`, borderRadius: "7px", padding: "5px 9px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", color: C.inkSoft, fontFamily: "inherit" }}><Copy size={12} strokeWidth={2.1} /> Duplicate</button>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={addSheet} style={{ ...S.rightAction, borderStyle: "dashed", color: C.goDark, fontWeight: 700 }}>
            <Plus size={15} strokeWidth={2.4} /> Add new sheet
          </button>

          <div style={{ borderTop: `1px solid ${C.lineSoft}`, margin: "4px 0" }} />
          <button onClick={() => { setPanel("uploads"); fileRef.current?.click(); }} style={S.rightAction}>
            <UploadIcon size={15} strokeWidth={2.1} /> Add new design
          </button>
          <button onClick={openAutoBuild} style={S.rightAction} title="Upload several designs, set their sizes and quantities, and pack them onto sheets">
            <Grid3x3 size={15} strokeWidth={2.1} /> Auto Build
          </button>
          <button onClick={() => autoNest()} style={{ ...S.rightAction, ...S.rightActionGo }} title="Arrange this sheet's designs compactly">
            <Zap size={15} strokeWidth={2.3} /> Auto nest (tidy up)
          </button>
          <button onClick={() => autoNest(0.5)} style={S.rightAction} title="Nest with extra spacing for cutting">
            <Scissors size={15} strokeWidth={2.1} /> Auto nest for cutting
          </button>
          <button
            onClick={() => { if (placements.length) setConfirmStartOver(true); }}
            disabled={!placements.length}
            title={placements.length ? "Remove every design from this sheet" : "This sheet is already empty"}
            style={{ ...S.rightAction, color: C.stop, opacity: placements.length ? 1 : 0.45, cursor: placements.length ? "pointer" : "not-allowed" }}>
            <RotateCcw size={15} strokeWidth={2.1} /> Start over (this sheet)
          </button>

          <div style={S.tipBox}>
            <Lightbulb size={15} strokeWidth={2} color={C.goDark} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>Tip: build multiple sheets, then <strong>Save &amp; Add to Cart</strong> — each sheet is its own print job.</span>
          </div>
          <div style={{ fontSize: "11px", color: C.inkFaint, textAlign: "center", paddingTop: "12px", borderTop: `1px solid ${C.lineSoft}` }}>
            Powered by <strong style={{ color: C.inkSoft }}>AT360 APPS</strong>
          </div>
        </div>
      </div>

      {pendingNest && size && (
        <NestPreview
          plan={pendingNest.plan}
          sheet={{ ...sheetSpec(sheetLen), gap: imageMargin + pendingNest.extraGap }}
          title={pendingNest.extraGap > 0 ? "Auto Nest for cutting" : "Auto Nest"}
          note={
            pendingNest.plan.sheets.length > snapshotAll().length
              ? `This will not all fit on the sheets you have. Here is the arrangement — ${pendingNest.plan.sheets.length - snapshotAll().length} more sheet${pendingNest.plan.sheets.length - snapshotAll().length === 1 ? "" : "s"} would be added. Nothing moves until you apply it.`
              : "Here is how your designs would be arranged. Nothing moves until you apply it."
          }
          applyLabel="Apply arrangement"
          onApply={applyNest}
          onCancel={() => setPendingNest(null)}
        />
      )}

      {pendingFill && size && (
        <NestPreview
          plan={{
            sheets: [[
              ...stateRef.current.placements.map((q) => {
                const fp = footprint(q);
                return { key: `k${q.id}`, w: fp.w, h: fp.h, sheet: 0, x: q.x_in, y: q.y_in, rotated: false };
              }),
              ...pendingFill.spots.map((spot, i) => {
                const src = stateRef.current.placements.find((q) => q.id === pendingFill.id);
                const fp = src ? footprint(src) : { w: 1, h: 1 };
                return {
                  key: `new${i}`,
                  w: spot.rotated ? fp.h : fp.w,
                  h: spot.rotated ? fp.w : fp.h,
                  sheet: 0, x: spot.x, y: spot.y, rotated: false,
                };
              }),
            ]],
            unplaceable: [],
            fill: [0],
          }}
          sheet={sheetSpec(sheetLen)}
          title="Auto Fill this sheet"
          note={`This adds ${pendingFill.spots.length} more cop${pendingFill.spots.length === 1 ? "y" : "ies"} in the space that is still free. Your existing designs do not move.`}
          applyLabel={`Add ${pendingFill.spots.length}`}
          onApply={applyFill}
          onCancel={() => setPendingFill(null)}
        />
      )}

      <ToastContainer />
    </div>
  );

  return portalReady ? createPortal(tree, document.body) : tree;
}

// ── The builder's look ────────────────────────────────────────────────────────
// One place for the handful of values the whole studio is drawn from, so a
// panel, a button and a banner cannot drift apart from each other.
const C = {
  page: "#F6F7F9",
  card: "#FFFFFF",
  line: "#E6E8EC",
  lineSoft: "#EFF1F4",
  ink: "#1F2430",
  inkSoft: "#5B6170",
  inkFaint: "#848A96",
  go: "#16A34A",
  goDark: "#15803D",
  goTint: "#E9F7EF",
  stop: "#DC2626",
  stopTint: "#FEF2F2",
  radius: "10px",
} as const;

const S: Record<string, React.CSSProperties> = {
  // Height is stated rather than inferred from `inset`. A brand's theme styles
  // the page this opens over, and one of them sets `overflow-x: hidden` on
  // html and body — enough to leave the builder standing in the top part of
  // the window with the shop showing underneath. `dvh` also keeps it right on
  // a phone, where the browser's own bars come and go.
  root: { position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 200, background: C.page, color: C.ink, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif" },
  topbar: { height: "62px", flexShrink: 0, minWidth: 0, overflowX: "auto", background: C.card, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", gap: "16px" },
  logoMark: { width: "32px", height: "32px", borderRadius: "9px", background: C.go, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  logo: { fontSize: "18px", fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1, color: C.ink },
  logoSub: { fontSize: "9.5px", fontWeight: 700, letterSpacing: ".13em", color: C.inkFaint, textTransform: "uppercase", marginTop: "2px" },
  primaryBtn: { background: C.go, color: "#fff", border: "none", padding: "10px 16px", borderRadius: "9px", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "inherit" },
  ghostBtn: { background: C.card, color: C.ink, border: `1px solid ${C.line}`, padding: "10px 15px", borderRadius: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "inherit" },
  closeBtn: { background: C.card, color: C.stop, border: `1px solid ${C.line}`, padding: "10px 15px", borderRadius: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "inherit" },
  priceLabel: { fontSize: "9.5px", fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: ".11em" },
  priceValue: { fontSize: "21px", fontWeight: 800, color: C.ink, lineHeight: 1.15 },
  sheetsSelect: { padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: "9px", fontSize: "13px", fontWeight: 600, color: C.ink, background: C.card, cursor: "pointer", fontFamily: "inherit" },
  errorBar: { background: "#FEF2F2", color: "#991B1B", borderBottom: "1px solid #FCA5A5", padding: "8px 18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "10px" },
  okBar: { background: "#F0FDF4", color: "#166534", borderBottom: "1px solid #BBF7D0", padding: "8px 18px", fontSize: "13px" },
  bgOverlay: { position: "fixed", inset: 0, zIndex: 400, background: "rgba(20,24,31,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  bgModal: { width: "min(560px, 94vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.35)" },
  bgHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid #EFEDE8" },
  bgWarnBar: { margin: "14px 18px 0", background: "#FEF3E2", border: "1px solid #FBD9A5", color: "#92400E", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", lineHeight: 1.5 },
  bgPreviewBox: { position: "relative", flex: 1, overflow: "auto", padding: "16px 18px", background: "#F7F7F5", margin: "14px 18px 0", borderRadius: "8px", border: "1px solid #EFEDE8" },
  bgFoot: { display: "flex", alignItems: "center", gap: "8px", padding: "14px 18px", borderTop: "1px solid #EFEDE8", flexWrap: "wrap" },
  body: { flex: 1, display: "flex", minHeight: 0, minWidth: 0, overflow: "hidden" },
  rail: { width: "76px", flexShrink: 0, background: C.card, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", padding: "12px 8px", gap: "6px", overflowY: "auto", minHeight: 0 },
  railBtn: { background: "none", border: "none", color: C.inkSoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "11px 2px", cursor: "pointer", borderRadius: C.radius, fontFamily: "inherit", lineHeight: 1.2 },
  railBtnActive: { color: C.goDark, background: C.goTint },
  leftPanel: { width: "282px", flexShrink: 0, background: C.card, borderRight: `1px solid ${C.line}`, padding: "16px", overflowY: "auto", minHeight: 0 },
  dropzone: { border: "2px dashed #D4D8DE", borderRadius: "12px", padding: "22px 14px", textAlign: "center", cursor: "pointer" },
  chooseBtn: { display: "inline-flex", alignItems: "center", gap: "7px", marginTop: "12px", background: C.go, color: "#fff", borderRadius: "9px", padding: "9px 16px", fontSize: "12.5px", fontWeight: 700 },
  listHead: { marginTop: "18px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "10.5px", fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: ".09em" },
  uploadRow: { display: "flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.card, overflow: "hidden" },
  uploadRowMain: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "10px", padding: "8px 4px 8px 8px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" },
  uploadThumbBox: { position: "relative", width: "44px", height: "44px", flexShrink: 0, borderRadius: "8px", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  uploadName: { display: "block", fontSize: "12.5px", fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  uploadMeta: { display: "block", fontSize: "11px", color: C.inkFaint, marginTop: "2px" },
  rowTool: { width: "30px", height: "30px", borderRadius: "8px", border: "none", background: "none", color: C.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  panelTitle: { fontSize: "14px", fontWeight: 800, marginBottom: "12px" },
  uploadThumb: { position: "relative", border: "1px solid #E5E3DE", borderRadius: "8px", background: "#fff", padding: 0, cursor: "pointer", overflow: "hidden" },
  thumbBadge: { position: "absolute", top: "4px", right: "4px", background: "var(--brand-primary,#1C3557)", color: "#fff", fontSize: "11.5px", fontWeight: 700, borderRadius: "10px", padding: "1px 6px" },
  toggleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0EEE9" },
  selCard: { marginTop: "18px", border: "1px solid #E5E3DE", borderRadius: "10px", padding: "14px", background: "#FBFBF9" },
  miniLabel: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", fontWeight: 700, color: "#4F535B" },
  miniInput: { width: "100%", boxSizing: "border-box", minWidth: 0, padding: "7px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "13px" },
  smallBtn: { flex: 1, background: "#fff", border: "1px solid #DDD9D2", borderRadius: "7px", padding: "9px 8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", color: "#2A2F3A", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" },
  canvasArea: { position: "relative", flex: "1 1 0", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" },
  confirmBackdrop: { position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  confirmBox: { width: "min(420px, 100%)", background: "#fff", borderRadius: "14px", padding: "24px", boxShadow: "0 20px 60px rgba(0,0,0,.3)" },
  confirmIcon: { width: "40px", height: "40px", borderRadius: "50%", background: "#FEE2E2", color: "#B91C1C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 800, marginBottom: "14px" },
  confirmCancel: { padding: "10px 18px", background: "#fff", color: "#1A1A1A", border: "1px solid #D8D5CF", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  confirmDanger: { padding: "10px 18px", background: "#B91C1C", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  abOverlay: { position: "absolute", inset: 0, zIndex: 30, display: "flex", background: "#fff" },
  // One row, always. Wrapping cost a second 54px band of a window that may
  // only be 600 tall, and it took it from the canvas — the one part of this
  // screen somebody is actually looking at.
  toolbar: { height: "54px", flexShrink: 0, background: C.card, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: "9px", padding: "0 14px", flexWrap: "nowrap", overflowX: "auto", overflowY: "hidden" },
  sizeSelect: { padding: "8px 11px", border: `1px solid ${C.line}`, borderRadius: "9px", fontSize: "13px", fontWeight: 600, minWidth: "160px", background: C.card, color: C.ink, cursor: "pointer", fontFamily: "inherit" },
  toolDivider: { width: "1px", height: "22px", background: C.line },
  nestBtn: { background: C.go, color: "#fff", border: "none", padding: "9px 15px", borderRadius: "9px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "inherit", whiteSpace: "nowrap" },
  iconBtn: { width: "34px", height: "34px", border: `1px solid ${C.line}`, background: C.card, color: C.inkSoft, borderRadius: "9px", cursor: "pointer", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  // Pressed state for a toggle tool — dark, so it reads as "on" at a glance.
  iconBtnOn: { background: C.goTint, borderColor: "#BFE6CE", color: C.goDark },
  canvasScroll: { position: "absolute", inset: 0, overflow: "auto" },
  sheetFrame: { position: "relative", display: "flex", minWidth: "100%", minHeight: "100%", width: "max-content", boxSizing: "border-box", padding: `${RULER_PAD}px` },
  // A darker table than the sheet, so the sheet stands off it.
  rulerGrid: { flex: "1 1 0", minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "26px 1fr", gridTemplateRows: "22px 1fr", background: "#E6E3DE", overflow: "hidden" },
  viewStrip: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "nowrap", overflowX: "auto", flexShrink: 0, padding: "6px 14px", borderTop: `1px solid ${C.line}`, background: C.card, fontSize: "11px", color: C.inkSoft, whiteSpace: "nowrap" },
  stripDivider: { width: "1px", height: "16px", background: "#E0DCD5" },
  legendItem: { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#444", whiteSpace: "nowrap" },
  legendSwatch: { width: "10px", height: "10px", borderRadius: "2px", display: "inline-block" },
  rulerCorner: { borderRight: "1px solid #ECEAE5", borderBottom: "1px solid #ECEAE5", background: "#FAFAF8" },
  rulerTopWrap: { overflow: "hidden", borderBottom: "1px solid #ECEAE5", background: "#fff", position: "relative" },
  rulerLeftWrap: { overflow: "hidden", borderRight: "1px solid #ECEAE5", background: "#fff", position: "relative" },
  canvasCheck: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#444", cursor: "pointer" },
  overlapBanner: { position: "absolute", top: "12px", left: "50%", transform: "translateX(-50%)", zIndex: 6, display: "flex", alignItems: "center", gap: "10px", maxWidth: "min(560px, 80%)", background: "#FFEDD5", border: "1px solid #FDBA74", color: "#9A3412", borderRadius: "8px", padding: "9px 14px", fontSize: "13px", lineHeight: 1.45, boxShadow: "0 4px 14px rgba(154,52,18,.15)" },
  overlapIcon: { width: "20px", height: "20px", flexShrink: 0, borderRadius: "50%", border: "2px solid #C2410C", color: "#C2410C", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800 },
  canvasWarn: { position: "absolute", top: "10px", right: "10px", zIndex: 4, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", maxWidth: "55%", justifyContent: "flex-end", boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  rightPanel: { width: "252px", flexShrink: 0, background: C.card, borderLeft: `1px solid ${C.line}`, padding: "14px", display: "flex", flexDirection: "column", gap: "8px", minHeight: 0, overflow: "hidden" },
  sheetList: { display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: "1 1 0", minHeight: "64px", paddingRight: "2px" },
  activeCard: { border: "1px solid #E5E3DE", borderRadius: "10px", padding: "12px" },
  sheetCard: { border: "1px solid #E5E3DE", borderRadius: "10px", padding: "10px 12px", cursor: "pointer", background: "#fff" },
  sheetCardActive: { borderColor: "var(--brand-primary,#1C3557)", boxShadow: "0 0 0 1px var(--brand-primary,#1C3557)", background: "#F7F9FD" },
  sheetNameInput: { width: "100%", boxSizing: "border-box", border: "1px solid transparent", background: "transparent", fontSize: "13px", fontWeight: 700, padding: "2px 4px", borderRadius: "5px", margin: "3px 0", color: "#222" },
  rightAction: { display: "flex", alignItems: "center", gap: "9px", textAlign: "left", background: C.card, border: `1px solid ${C.line}`, borderRadius: C.radius, padding: "11px 13px", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: C.ink, fontFamily: "inherit", width: "100%" },
  rightActionGo: { background: C.goTint, borderColor: "#BFE6CE", color: C.goDark, fontWeight: 700 },
  tipBox: { display: "flex", gap: "9px", alignItems: "flex-start", background: "#F7F8FA", border: `1px solid ${C.lineSoft}`, borderRadius: C.radius, padding: "11px 12px", fontSize: "11.5px", color: C.inkSoft, lineHeight: 1.6 },
  // One floating bar rather than three loose squares, so the buttons read as
  // belonging to the design they are attached to. 30px targets: at 24 they
  // were a hard target with a mouse and a miss on a trackpad.
  joinBackdrop: { position: "fixed", inset: 0, zIndex: 600, background: "rgba(16,24,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" },
  joinBox: { background: "#fff", borderRadius: "14px", padding: "26px", width: "100%", maxWidth: "400px", boxShadow: "0 24px 64px rgba(16,24,40,.28)", fontFamily: "inherit" },
  joinLabel: { display: "block", fontSize: "12px", fontWeight: 600, color: C.inkSoft, marginBottom: "5px", marginTop: "12px" },
  joinInput: { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: "9px", fontSize: "14px", fontFamily: "inherit", color: C.ink },
  joinSwitch: { display: "block", width: "100%", marginTop: "10px", background: "none", border: "none", color: C.inkSoft, fontSize: "12.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: "4px" },
  selBar: {
    display: "flex", alignItems: "center", gap: "2px",
    background: "#fff", border: `1px solid ${C.line}`, borderRadius: "10px",
    padding: "3px", boxShadow: "0 3px 12px rgba(16,24,40,.16)",
  },
  selBarSplit: { width: "1px", alignSelf: "stretch", margin: "4px 2px", background: C.line },
  chip: {
    border: "none", background: "none", borderRadius: "7px",
    width: "30px", height: "30px", cursor: "pointer", lineHeight: 1, padding: 0,
    color: C.inkSoft, display: "flex", alignItems: "center", justifyContent: "center",
  },
  deleteBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C",
    cursor: "pointer", fontSize: "12.5px", fontWeight: 700,
    borderRadius: "7px", padding: "6px 11px", fontFamily: "inherit",
  },
  modalClose: {
    background: "none", border: "none", cursor: "pointer", color: "#4F535B",
    padding: "6px", display: "flex", alignItems: "center", borderRadius: "6px",
  },
  grewBanner: {
    position: "absolute", left: "10px", right: "10px", top: "10px", zIndex: 6,
    display: "flex", alignItems: "center", gap: "10px",
    background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46",
    borderRadius: "10px", padding: "10px 12px", fontSize: "13px",
    boxShadow: "0 4px 14px rgba(0,0,0,.08)",
  },
  bannerAction: {
    marginLeft: "auto", background: "#B45309", color: "#fff", border: "none",
    borderRadius: "7px", padding: "6px 12px", fontSize: "12.5px",
    fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  },
  bannerClose: {
    background: "none", border: "none", cursor: "pointer", color: "inherit",
    padding: "4px", display: "flex", alignItems: "center", marginLeft: "4px",
  },
  thumbTool: {
    position: "absolute", top: "4px", left: "4px", width: "26px", height: "26px",
    borderRadius: "7px", border: "none", background: "rgba(28,53,87,.92)",
    color: "#fff", cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", padding: 0,
  },
  chipDanger: {
    border: "none", background: "none", borderRadius: "7px",
    width: "30px", height: "30px", cursor: "pointer", lineHeight: 1, padding: 0,
    color: C.stop, display: "flex", alignItems: "center", justifyContent: "center",
  },
};
