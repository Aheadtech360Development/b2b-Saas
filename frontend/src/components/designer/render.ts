/**
 * A finished picture of one view: the garment with the design on it.
 *
 * Used for the view thumbnails, the review step, saved designs and Share. The
 * design is drawn on its own transparent layer, clipped to the print area, and
 * then laid over the mockup, so the clip never cuts into the garment.
 */
import { StaticCanvas, Rect } from "fabric";
import { ensureFont } from "@/lib/designer/fonts";
import { loadImage } from "@/lib/designer/images";
import { focusRect, PRINT_AREAS } from "@/lib/designer/mockups";
import { garmentUrl } from "@/lib/designer/photo";
import type { Silhouette, ViewKey, ViewObjects } from "@/lib/designer/types";
import "./fabricSetup";

const mockups = new Map<string, Promise<HTMLImageElement>>();

export function mockupImage(silhouette: Silhouette, view: ViewKey, hex: string, size = 1000) {
  const key = `${silhouette}|${view}|${hex}|${size}`;
  let p = mockups.get(key);
  if (!p) {
    p = garmentUrl(silhouette, view, hex, size).then(loadImage);
    mockups.set(key, p);
  }
  return p;
}

/** Wait for every face the objects use, so text is measured in the right font. */
export async function fontsFor(objects: ViewObjects) {
  const families = new Set(objects.map((o) => o.fontFamily).filter((f): f is string => typeof f === "string"));
  await Promise.all([...families].map(ensureFont));
}

/** The objects with a roster row in place of the name and number placeholders. */
export function withRoster(objects: ViewObjects, row: { name: string; number: string }): ViewObjects {
  return objects.map((o) =>
    o.nn === "name" ? { ...o, text: row.name || "NAME" } : o.nn === "number" ? { ...o, text: row.number || "00" } : o,
  );
}

export async function renderView(opts: {
  silhouette: Silhouette;
  view: ViewKey;
  hex: string;
  objects: ViewObjects;
  size: number;
  type?: "image/png" | "image/jpeg";
  background?: string;
  /** Frame the print area instead of the whole garment. */
  closeUp?: boolean;
  /** The shirt to show names and numbers for. */
  roster?: { name: string; number: string };
}): Promise<string> {
  const { silhouette, view, hex, size } = opts;
  const objects = opts.roster ? withRoster(opts.objects, opts.roster) : opts.objects;
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const ctx = out.getContext("2d")!;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, size, size);
  }
  const area = PRINT_AREAS[silhouette][view];
  // The part of the 1000 × 1000 drawing to show, as a square.
  let fx = 0, fy = 0, side = 1000;
  if (opts.closeUp) {
    // Frame the usual spot for art on this view.
    const r = focusRect(area);
    side = Math.min(1000, Math.max(r.width, r.height) * 1.3);
    fx = r.left + r.width / 2 - side / 2;
    fy = r.top + r.height / 2 - side / 2;
  }
  const k = size / side;
  // Coloured only as large as it is drawn here.
  const garment = await mockupImage(silhouette, view, hex, Math.ceil(1000 * k));
  ctx.drawImage(garment, -fx * k, -fy * k, 1000 * k, 1000 * k);

  if (objects.length) {
    await fontsFor(objects);
    const layer = new StaticCanvas(document.createElement("canvas"), {
      width: size, height: size, enableRetinaScaling: false, renderOnAddRemove: false,
    });
    await layer.loadFromJSON({ objects });
    const kk = k * (area.pxPerIn / 100);
    layer.setViewportTransform([kk, 0, 0, kk, (area.cx - fx) * k, (area.top - fy) * k]);
    layer.clipPath = new Rect({
      left: -area.widthIn * 50, top: 0, width: area.widthIn * 100, height: area.heightIn * 100,
      originX: "left", originY: "top",
    });
    layer.renderAll();
    // Keep the art on the fabric: cut it to the garment's outline.
    const art = document.createElement("canvas");
    art.width = art.height = size;
    const actx = art.getContext("2d")!;
    actx.drawImage(layer.getElement(), 0, 0);
    actx.globalCompositeOperation = "destination-in";
    actx.drawImage(garment, -fx * k, -fy * k, 1000 * k, 1000 * k);
    ctx.drawImage(art, 0, 0);
    layer.dispose();
  }
  return out.toDataURL(opts.type ?? "image/png", 0.9);
}

// ── Print files ───────────────────────────────────────────────────────────────

/** The longest side a print file may have (the server keeps nothing larger). */
const MAX_PRINT_PX = 12_000;

/** CRC-32, for writing a PNG chunk. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Stamp a PNG with its DPI (a pHYs chunk after the header), so a printer's
 * software opens it at its true size. Canvas PNGs carry no DPI of their own.
 */
export async function withDpi(png: Blob, dpi: number): Promise<Blob> {
  const src = new Uint8Array(await png.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  v.setUint32(8, ppm);
  v.setUint32(12, ppm);
  chunk[16] = 1; // metres
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Signature (8) + IHDR (4 length + 4 type + 13 data + 4 crc) = 33 bytes.
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(src.subarray(33), 33 + chunk.length);
  return new Blob([out], { type: "image/png" });
}

/**
 * One side's artwork alone, as the printer prints it: transparent, cropped to
 * the art, at 300 DPI (less only when the art is too large to fit the file
 * limit at 300). Positions are print space, a hundredth of an inch, so the
 * scale is exact. Null when the side has no art.
 */
export async function renderPrintArt(
  objects: ViewObjects,
  roster?: { name: string; number: string },
  wantDpi = 300,
): Promise<{ blob: Blob; width: number; height: number; dpi: number } | null> {
  const objs = roster ? withRoster(objects, roster) : objects;
  if (!objs.length) return null;
  await fontsFor(objs);
  const layer = new StaticCanvas(document.createElement("canvas"), {
    width: 10, height: 10, enableRetinaScaling: false, renderOnAddRemove: false,
  });
  await layer.loadFromJSON({ objects: objs });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of layer.getObjects()) {
    const r = o.getBoundingRect();
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.left + r.width); y1 = Math.max(y1, r.top + r.height);
  }
  if (!Number.isFinite(x0) || x1 <= x0 || y1 <= y0) { layer.dispose(); return null; }
  const pad = 5; // 0.05 in, so anti-aliased edges are not cut
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const longest = Math.max(x1 - x0, y1 - y0) / 100; // inches
  const dpi = Math.max(72, Math.min(wantDpi, Math.floor(MAX_PRINT_PX / longest)));
  const k = dpi / 100;
  const width = Math.ceil((x1 - x0) * k), height = Math.ceil((y1 - y0) * k);
  layer.setDimensions({ width, height });
  layer.setViewportTransform([k, 0, 0, k, -x0 * k, -y0 * k]);
  layer.renderAll();
  const raw = await new Promise<Blob | null>((r) => (layer.getElement() as HTMLCanvasElement).toBlob(r, "image/png"));
  layer.dispose();
  if (!raw) return null;
  return { blob: await withDpi(raw, dpi), width, height, dpi };
}
