/**
 * Garment mockups, drawn rather than photographed.
 *
 * Every view is a 1000 × 1000 drawing: the garment filled with its colour,
 * then shading laid over it (side shadow, folds, a soft overhead light) that
 * reads correctly on white and on black alike. A drawing recolours instantly
 * and stays sharp at any zoom, which a photo does not.
 *
 * Print areas are defined here too, in the same units, so the canvas and the
 * drawing can never disagree about where the art goes. A real product photo
 * can replace a drawing later: it needs the same viewBox and print areas.
 */
import type { PrintArea, Silhouette, ViewKey } from "./types";

interface Part {
  d: string;
  /** Lighten (+) or darken (−) the garment colour, −1 … 1. */
  tone: number;
}

interface Fold {
  d: string;
  w: number;
  light?: boolean;
  o: number;
}

interface Drawing {
  /** Shapes that make the garment, back to front. The first ones also clip the shading. */
  parts: Part[];
  /** How many of `parts` form the outline the shading is clipped to. */
  clipParts: number;
  /** Shapes drawn after the shading, unaffected by it (hood openings, bands). */
  trims: Part[];
  seams: string[];
  stitches: string[];
  folds: Fold[];
  /** Horizontal span that gets the side shadow. */
  body: [number, number];
  /** Centre of the overhead light. */
  light: [number, number];
  extra?: (hex: string) => string;
}

// ── Shared outlines ─────────────────────────────────────────────────────────

const TEE_BODY =
  "L770 175 C830 205 880 290 905 385 L770 440 C748 420 728 404 705 395 C712 560 715 760 720 915 " +
  "C600 937 400 937 280 915 C285 760 288 560 295 395 C272 404 252 420 230 440 L95 385 " +
  "C120 290 170 205 230 175 Z";

const LONG_BODY =
  "L770 175 C835 215 895 450 935 790 L870 812 C845 620 790 470 712 402 C715 560 718 760 720 915 " +
  "C600 937 400 937 280 915 C282 760 285 560 288 402 C210 470 155 620 130 812 L65 790 " +
  "C105 450 165 215 230 175 Z";

const HOODIE_BODY =
  "M380 168 L620 168 L760 192 C835 230 900 460 935 790 L868 812 C842 625 790 480 718 415 " +
  "C722 600 726 760 728 935 C600 948 400 948 272 935 C274 760 278 600 282 415 " +
  "C210 480 158 625 132 812 L65 790 C100 460 165 230 240 192 Z";

const FRONT_NECK = "M395 130 C420 195 580 195 605 130";
const BACK_NECK = "M395 130 C440 150 560 150 605 130";

const LONG_CUFFS: Part[] = [
  { d: "M935 790 L870 812 L860 774 L922 752 Z", tone: -0.06 },
  { d: "M65 790 L130 812 L140 774 L78 752 Z", tone: -0.06 },
];

const HOODIE_CUFFS: Part[] = [
  { d: "M935 790 L868 812 L858 774 L922 752 Z", tone: -0.06 },
  { d: "M65 790 L132 812 L142 774 L78 752 Z", tone: -0.06 },
];

const BODY_FOLDS: Fold[] = [
  { d: "M300 420 C330 470 352 520 360 580", w: 30, o: 0.14 },
  { d: "M700 420 C670 470 648 520 640 580", w: 30, o: 0.14 },
  { d: "M430 260 C470 420 470 600 450 860", w: 44, o: 0.05, light: true },
  { d: "M590 300 C610 450 600 620 585 840", w: 34, o: 0.035, light: true },
];

const SHORT_SLEEVE_FOLDS: Fold[] = [
  { d: "M760 190 C800 260 815 330 805 400", w: 22, o: 0.1 },
  { d: "M240 190 C200 260 185 330 195 400", w: 22, o: 0.1 },
];

const LONG_SLEEVE_FOLDS: Fold[] = [
  { d: "M790 260 C840 420 870 580 885 760", w: 22, o: 0.1 },
  { d: "M210 260 C160 420 130 580 115 760", w: 22, o: 0.1 },
  { d: "M800 520 C830 530 850 528 870 515", w: 14, o: 0.12 },
  { d: "M200 520 C170 530 150 528 130 515", w: 14, o: 0.12 },
];

const SHOULDER_SEAMS = ["M230 175 C262 260 285 330 295 395", "M770 175 C738 260 715 330 705 395"];
const HEM_STITCH = "M285 893 C400 914 600 914 715 893";

// ── Side (sleeve) views ─────────────────────────────────────────────────────

// A garment seen from its side: the torso in profile, the sleeve hanging over it.
const SIDE_TORSO: Part = {
  d: "M380 150 C420 112 580 112 620 150 C650 190 662 240 665 300 L672 925 C590 940 410 940 328 925 L335 300 C338 240 350 190 380 150 Z",
  tone: -0.08,
};
const SIDE_COLLAR: Part = { d: "M380 150 C420 112 580 112 620 150 C580 168 420 168 380 150 Z", tone: -0.4 };
const SHORT_SLEEVE: Part = {
  d: "M338 255 C348 168 652 168 662 255 C680 340 692 430 702 520 C600 548 400 548 298 520 C308 430 320 340 338 255 Z",
  tone: 0,
};
const LONG_SLEEVE: Part = {
  d: "M345 250 C355 165 645 165 655 250 C650 450 626 700 602 862 L398 862 C374 700 350 450 345 250 Z",
  tone: 0,
};

function side(sleeve: "short" | "long", hood: boolean): Drawing {
  const sl = sleeve === "short" ? SHORT_SLEEVE : LONG_SLEEVE;
  const parts: Part[] = [];
  if (hood) parts.push({ d: "M372 180 C350 70 470 28 562 48 C642 66 676 130 646 196 Z", tone: -0.1 });
  parts.push(SIDE_TORSO, hood ? { ...SIDE_COLLAR, tone: -0.2 } : SIDE_COLLAR, sl);
  return {
    parts,
    clipParts: parts.length,
    trims: sleeve === "short"
      ? [{ d: "M298 520 C400 548 600 548 702 520 L698 488 C598 514 402 514 302 488 Z", tone: -0.05 }]
      : [{ d: "M398 862 L602 862 L596 918 L404 918 Z", tone: -0.06 }],
    seams: [sleeve === "short" ? "M338 255 C348 168 652 168 662 255" : "M345 250 C355 165 645 165 655 250"],
    stitches: sleeve === "short"
      ? ["M304 476 C404 502 596 502 696 476"]
      : ["M400 850 L600 850", "M380 925 C460 934 540 934 620 925"],
    folds: sleeve === "short"
      ? [{ d: "M660 290 C675 380 685 450 690 510", w: 26, o: 0.12 }, { d: "M430 240 C438 330 436 420 428 500", w: 30, o: 0.08, light: true }]
      : [{ d: "M640 290 C636 480 622 680 604 850", w: 24, o: 0.12 }, { d: "M440 250 C446 450 444 650 430 850", w: 30, o: 0.08, light: true }, { d: "M380 590 C440 606 560 606 626 590", w: 14, o: 0.08 }],
    body: [330, 670],
    light: [480, 330],
  };
}

// ── Front and back views ────────────────────────────────────────────────────

// Drawings are the fallback when a photo cannot load; styles without one borrow the tee's.
const DRAWINGS: Partial<Record<Silhouette, Record<ViewKey, Drawing>>> & { tee: Record<ViewKey, Drawing> } = {
  tee: {
    front: {
      parts: [{ d: `M395 130 C420 195 580 195 605 130 ${TEE_BODY}`, tone: 0 }],
      clipParts: 1,
      trims: [{ d: "M395 130 C440 106 560 106 605 130 C580 195 420 195 395 130 Z", tone: -0.38 }],
      seams: SHOULDER_SEAMS,
      stitches: ["M400 140 C425 206 575 206 600 140", HEM_STITCH, "M110 366 L238 420", "M890 366 L762 420"],
      folds: [...BODY_FOLDS, ...SHORT_SLEEVE_FOLDS],
      body: [280, 720],
      light: [500, 330],
      extra: (hex) => `<path d="${FRONT_NECK}" fill="none" stroke="${shade(hex, -0.07)}" stroke-width="18" stroke-linecap="butt"/>`,
    },
    back: {
      parts: [{ d: `M395 130 C440 150 560 150 605 130 ${TEE_BODY}`, tone: 0 }],
      clipParts: 1,
      trims: [],
      seams: SHOULDER_SEAMS,
      stitches: ["M402 141 C445 162 555 162 598 141", HEM_STITCH, "M110 366 L238 420", "M890 366 L762 420"],
      folds: [...BODY_FOLDS, ...SHORT_SLEEVE_FOLDS],
      body: [280, 720],
      light: [500, 300],
      extra: (hex) => `<path d="${BACK_NECK}" fill="none" stroke="${shade(hex, -0.07)}" stroke-width="12" stroke-linecap="butt"/>`,
    },
    left: side("short", false),
    right: side("short", false),
  },
  longsleeve: {
    front: {
      parts: [{ d: `M395 130 C420 195 580 195 605 130 ${LONG_BODY}`, tone: 0 }],
      clipParts: 1,
      trims: [{ d: "M395 130 C440 106 560 106 605 130 C580 195 420 195 395 130 Z", tone: -0.38 }, ...LONG_CUFFS],
      seams: ["M230 175 C262 260 280 330 288 402", "M770 175 C738 260 720 330 712 402"],
      stitches: ["M400 140 C425 206 575 206 600 140", HEM_STITCH],
      folds: [...BODY_FOLDS, ...LONG_SLEEVE_FOLDS],
      body: [280, 720],
      light: [500, 330],
      extra: (hex) => `<path d="${FRONT_NECK}" fill="none" stroke="${shade(hex, -0.07)}" stroke-width="18" stroke-linecap="butt"/>`,
    },
    back: {
      parts: [{ d: `M395 130 C440 150 560 150 605 130 ${LONG_BODY}`, tone: 0 }],
      clipParts: 1,
      trims: LONG_CUFFS,
      seams: ["M230 175 C262 260 280 330 288 402", "M770 175 C738 260 720 330 712 402"],
      stitches: ["M402 141 C445 162 555 162 598 141", HEM_STITCH],
      folds: [...BODY_FOLDS, ...LONG_SLEEVE_FOLDS],
      body: [280, 720],
      light: [500, 300],
      extra: (hex) => `<path d="${BACK_NECK}" fill="none" stroke="${shade(hex, -0.07)}" stroke-width="12" stroke-linecap="butt"/>`,
    },
    left: side("long", false),
    right: side("long", false),
  },
  hoodie: {
    front: {
      parts: [{ d: HOODIE_BODY, tone: 0 }],
      clipParts: 1,
      trims: [
        { d: "M272 885 C400 898 600 898 728 885 L728 935 C600 948 400 948 272 935 Z", tone: -0.06 },
        ...HOODIE_CUFFS,
        { d: "M318 640 L682 640 C690 700 712 760 724 812 C600 826 400 826 276 812 C288 760 310 700 318 640 Z", tone: -0.03 },
        { d: "M330 215 C300 120 370 40 500 36 C630 40 700 120 670 215 C640 250 360 250 330 215 Z", tone: -0.03 },
        { d: "M392 222 C385 130 615 130 608 222 C580 245 420 245 392 222 Z", tone: -0.42 },
      ],
      seams: ["M240 192 C268 270 278 340 282 415", "M760 192 C732 270 722 340 718 415", "M318 640 C300 700 284 760 276 812", "M682 640 C700 700 716 760 724 812"],
      stitches: ["M272 878 C400 891 600 891 728 878", "M322 652 L678 652", "M397 216 C392 140 608 140 603 216"],
      folds: [...BODY_FOLDS, ...LONG_SLEEVE_FOLDS],
      body: [272, 728],
      light: [500, 360],
      extra: (hex) => {
        const cord = shade(hex, -0.14);
        const tip = shade(hex, -0.3);
        return `<path d="M452 238 C448 300 446 350 444 400" fill="none" stroke="${cord}" stroke-width="7" stroke-linecap="round"/>` +
          `<path d="M548 238 C552 300 554 350 556 400" fill="none" stroke="${cord}" stroke-width="7" stroke-linecap="round"/>` +
          `<rect x="439" y="398" width="10" height="26" rx="3" fill="${tip}"/><rect x="551" y="398" width="10" height="26" rx="3" fill="${tip}"/>`;
      },
    },
    back: {
      parts: [{ d: HOODIE_BODY, tone: 0 }],
      clipParts: 1,
      trims: [
        { d: "M272 885 C400 898 600 898 728 885 L728 935 C600 948 400 948 272 935 Z", tone: -0.06 },
        ...HOODIE_CUFFS,
        { d: "M345 175 C330 90 410 70 500 70 C590 70 670 90 655 175 C640 270 360 270 345 175 Z", tone: -0.04 },
      ],
      seams: ["M240 192 C268 270 278 340 282 415", "M760 192 C732 270 722 340 718 415", "M500 72 L500 262"],
      stitches: ["M272 878 C400 891 600 891 728 878", "M356 180 C372 252 628 252 644 180"],
      folds: [...BODY_FOLDS, ...LONG_SLEEVE_FOLDS],
      body: [272, 728],
      light: [500, 380],
    },
    left: side("long", true),
    right: side("long", true),
  },
};

// ── Sleeve close-ups ────────────────────────────────────────────────────────

/**
 * Views drawn as a close-up of the front: the square of the front drawing to
 * show, in its own units. The wearer's left sleeve is on the right of the
 * drawing. A close-up of a flat sleeve reads better than a side profile.
 */
const CLOSE_UPS: Partial<Record<Silhouette, Partial<Record<ViewKey, { x: number; y: number; size: number }>>>> = {
  tee: {
    left: { x: 650, y: 140, size: 330 },
    right: { x: 20, y: 140, size: 330 },
  },
};

// ── Print areas ─────────────────────────────────────────────────────────────

// The drawn tee's sleeve close-up: 21 units per inch on the front, magnified 1000 / 330.
export const SHORT_SLEEVE_AREA: PrintArea = { cx: 500, top: 434, widthIn: 3.5, heightIn: 3.5, pxPerIn: 63.6 };
const LONG_SLEEVE_AREA: PrintArea = { cx: 500, top: 260, widthIn: 3, heightIn: 12, pxPerIn: 50 };

export const PRINT_AREAS: Record<Silhouette, Record<ViewKey, PrintArea>> = {
  // Measured on the tee photos (see photo.ts): every view is shot from the same
  // distance, about 21 units to the inch. Each view prints anywhere on the
  // shirt (the area is the garment's own box; art is cut to its outline), with
  // the usual chest, back and sleeve spots as the focus.
  tee: {
    // Front and back are the straightened shots (photo.ts): the shirt is
    // centred, so its chest and back spots sit on the centre line.
    front: { cx: 500, top: 73, widthIn: 31.6, heightIn: 40.8, pxPerIn: 21, whole: true,
      focus: { xIn: 0, topIn: 7.95, widthIn: 12, heightIn: 14 } },
    back: { cx: 500, top: 73, widthIn: 31.6, heightIn: 40.8, pxPerIn: 21, whole: true,
      focus: { xIn: 0, topIn: 5, widthIn: 12, heightIn: 15 } },
    left: { cx: 501, top: 69, widthIn: 17.2, heightIn: 41.1, pxPerIn: 21, whole: true, zoom: 2.6,
      focus: { xIn: 2.6, topIn: 10.9, widthIn: 3.5, heightIn: 3.5 } },
    right: { cx: 500, top: 54, widthIn: 17.4, heightIn: 41.7, pxPerIn: 21, whole: true, zoom: 2.6,
      focus: { xIn: -4.6, topIn: 11.8, widthIn: 3.5, heightIn: 3.5 } },
  },
  // The other styles, measured on their photos the same way. Without sleeves,
  // a side view's usual spot is the side panel under the armhole.
  longsleeve: {
    front: { cx: 497, top: 104, widthIn: 34.6, heightIn: 40.5, pxPerIn: 18.0, whole: true,
      focus: { xIn: -0.1, topIn: 7.9, widthIn: 12, heightIn: 14 } },
    back: { cx: 498, top: 100, widthIn: 34.8, heightIn: 40.7, pxPerIn: 18.0, whole: true,
      focus: { xIn: 0, topIn: 4.9, widthIn: 12, heightIn: 15 } },
    left: { cx: 504, top: 30, widthIn: 16.2, heightIn: 40.5, pxPerIn: 20.7, whole: true, zoom: 1.8,
      focus: { xIn: 1.0, topIn: 10.1, widthIn: 3.5, heightIn: 3.5 } },
    right: { cx: 495, top: 30, widthIn: 16.2, heightIn: 40.5, pxPerIn: 20.7, whole: true, zoom: 1.8,
      focus: { xIn: -1.0, topIn: 10.1, widthIn: 3.5, heightIn: 3.5 } },
  },
  tank: {
    front: { cx: 498, top: 39, widthIn: 22.8, heightIn: 40.6, pxPerIn: 20.2, whole: true,
      focus: { xIn: 0, topIn: 7.9, widthIn: 11, heightIn: 14 } },
    back: { cx: 499, top: 35, widthIn: 22.8, heightIn: 40.7, pxPerIn: 20.2, whole: true,
      focus: { xIn: 0, topIn: 4.9, widthIn: 11, heightIn: 15 } },
    left: { cx: 508, top: 21, widthIn: 16.0, heightIn: 40.6, pxPerIn: 20.5, whole: true, zoom: 1.3,
      focus: { xIn: 0, topIn: 18.3, widthIn: 3.5, heightIn: 3.5 } },
    right: { cx: 494, top: 23, widthIn: 16.0, heightIn: 40.6, pxPerIn: 20.9, whole: true, zoom: 1.3,
      focus: { xIn: 0, topIn: 18.3, widthIn: 3.5, heightIn: 3.5 } },
  },
  muscle: {
    front: { cx: 493, top: 16, widthIn: 26.1, heightIn: 40.6, pxPerIn: 22.3, whole: true,
      focus: { xIn: 0, topIn: 7.9, widthIn: 12, heightIn: 14 } },
    back: { cx: 496, top: 16, widthIn: 26.1, heightIn: 40.7, pxPerIn: 22.3, whole: true,
      focus: { xIn: 0, topIn: 4.9, widthIn: 12, heightIn: 15 } },
    left: { cx: 502, top: 18, widthIn: 16.1, heightIn: 40.7, pxPerIn: 22.3, whole: true, zoom: 1.3,
      focus: { xIn: 0, topIn: 24.8, widthIn: 3.5, heightIn: 3.5 } },
    right: { cx: 501, top: 27, widthIn: 16.1, heightIn: 40.6, pxPerIn: 21.9, whole: true, zoom: 1.3,
      focus: { xIn: 0, topIn: 24.8, widthIn: 3.5, heightIn: 3.5 } },
  },
  hoodie: {
    front: { cx: 500, top: 300, widthIn: 11, heightIn: 9, pxPerIn: 21 },
    back: { cx: 500, top: 286, widthIn: 12, heightIn: 14, pxPerIn: 21 },
    left: LONG_SLEEVE_AREA,
    right: LONG_SLEEVE_AREA,
  },
};

/** The print area as a rectangle in mockup units. */
export function areaRect(a: PrintArea) {
  const w = a.widthIn * a.pxPerIn;
  const h = a.heightIn * a.pxPerIn;
  return { left: a.cx - w / 2, top: a.top, width: w, height: h };
}

/** Where art usually goes on this view, in inches inside the print area. */
export function focusOf(a: PrintArea) {
  return a.focus ?? { xIn: 0, topIn: 0, widthIn: a.widthIn, heightIn: a.heightIn };
}

/** That spot as a rectangle in mockup units. */
export function focusRect(a: PrintArea) {
  const f = focusOf(a);
  return {
    left: a.cx + (f.xIn - f.widthIn / 2) * a.pxPerIn,
    top: a.top + f.topIn * a.pxPerIn,
    width: f.widthIn * a.pxPerIn,
    height: f.heightIn * a.pxPerIn,
  };
}

// ── Colour ──────────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? "888888";
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance, 0 (black) … 1 (white). */
export function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mix towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amount));
  const out = parseHex(hex).map((v) => Math.round(v + (target - v) * k));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ── Drawing ─────────────────────────────────────────────────────────────────

/** The mockup as an SVG document, ready for an <img> or a canvas background. */
export function mockupSvg(silhouette: Silhouette, view: ViewKey, colorHex: string): string {
  const close = CLOSE_UPS[silhouette]?.[view];
  const set = DRAWINGS[silhouette] ?? DRAWINGS.tee;
  const d = close ? set.front : set[view];
  const box = close ? `${close.x} ${close.y} ${close.size} ${close.size}` : "0 0 1000 1000";
  const hex = shade(colorHex, 0);
  const lum = luminance(hex);
  // Shadows barely show on near-black, light barely shows on white: lean on whichever reads.
  const shadowK = lum > 0.8 ? 0.55 : lum < 0.04 ? 1.3 : 1;
  const lightK = lum < 0.1 ? 0.7 : lum > 0.8 ? 0.4 : 0.8;
  const outline = shade(hex, lum > 0.5 ? -0.22 : -0.35);
  const seam = shade(hex, lum > 0.5 ? -0.14 : -0.3);
  const stitch = lum > 0.5 ? shade(hex, -0.3) : shade(hex, 0.18);
  const flip = view === "right" && !close ? ` transform="translate(1000 0) scale(-1 1)"` : "";

  const fill = (p: Part) => `<path d="${p.d}" fill="${shade(hex, p.tone)}"/>`;
  const clip = d.parts.slice(0, d.clipParts).map((p) => `<path d="${p.d}"/>`).join("");
  const folds = d.folds.map((f) =>
    `<path d="${f.d}" fill="none" stroke="${f.light ? "#fff" : "#000"}" stroke-opacity="${(f.o * (f.light ? lightK : shadowK)).toFixed(3)}" stroke-width="${f.w}" stroke-linecap="round" filter="url(#b)"/>`,
  ).join("");
  const [bx0, bx1] = d.body;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="1000" height="1000">` +
    `<defs>` +
    `<clipPath id="c">${clip}</clipPath>` +
    `<filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>` +
    `<filter id="g" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="18"/></filter>` +
    `<linearGradient id="s" x1="${bx0}" x2="${bx1}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#000" stop-opacity="${(0.26 * shadowK).toFixed(3)}"/>` +
    `<stop offset=".16" stop-color="#000" stop-opacity="0"/>` +
    `<stop offset=".84" stop-color="#000" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#000" stop-opacity="${(0.26 * shadowK).toFixed(3)}"/></linearGradient>` +
    `<linearGradient id="v" x1="0" y1="0" x2="0" y2="1000" gradientUnits="userSpaceOnUse">` +
    `<stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${(0.14 * shadowK).toFixed(3)}"/></linearGradient>` +
    `<radialGradient id="l" cx="${d.light[0]}" cy="${d.light[1]}" r="420" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="${(0.2 * lightK).toFixed(3)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    // Edges turn away from the light: a wide, blurred line along the outline, kept inside it.
    `<filter id="e" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="22"/></filter>` +
    // Cotton: fine grain, generated, so it stays sharp at any zoom.
    `<filter id="t" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `</defs>` +
    `<ellipse cx="500" cy="955" rx="270" ry="16" fill="#000" fill-opacity=".16" filter="url(#g)"/>` +
    `<g${flip}>` +
    d.parts.map(fill).join("") +
    `<g clip-path="url(#c)">` +
    `<rect x="0" y="0" width="1000" height="1000" fill="url(#s)"/>` +
    `<rect x="0" y="0" width="1000" height="1000" fill="url(#v)"/>` +
    folds +
    clip.replace(/<path /g, `<path fill="none" stroke="#000" stroke-opacity="${(0.2 * shadowK).toFixed(3)}" stroke-width="70" filter="url(#e)" `) +
    `<rect x="0" y="0" width="1000" height="1000" fill="url(#l)"/>` +
    `<rect x="0" y="0" width="1000" height="1000" filter="url(#t)" opacity="${lum < 0.15 ? 0.09 : 0.06}" style="mix-blend-mode:overlay"/>` +
    `</g>` +
    d.trims.map(fill).join("") +
    (d.extra?.(hex) ?? "") +
    // A seam is a fold in the fabric: a dark line with a lit edge beside it.
    d.seams.map((s) =>
      `<path d="${s}" fill="none" stroke="${seam}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="${s}" transform="translate(2 0)" fill="none" stroke="#fff" stroke-opacity="${(0.22 * lightK).toFixed(3)}" stroke-width="1.6" stroke-linecap="round"/>`,
    ).join("") +
    // Hems and the collar are sewn with two needles: two rows of stitches.
    d.stitches.map((s) =>
      `<path d="${s}" fill="none" stroke="${stitch}" stroke-opacity=".7" stroke-width="1.6" stroke-dasharray="6 5" stroke-linecap="round"/>` +
      `<path d="${s}" transform="translate(0 8)" fill="none" stroke="${stitch}" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="6 5" stroke-linecap="round"/>`,
    ).join("") +
    d.parts.slice(0, d.clipParts).map((p) => `<path d="${p.d}" fill="none" stroke="${outline}" stroke-width="2" stroke-linejoin="round"/>`).join("") +
    `</g></svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
