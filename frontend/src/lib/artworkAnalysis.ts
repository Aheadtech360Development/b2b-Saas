/**
 * Client-side artwork checks for the gang sheet builder — advisory only, never
 * blocking. Runs entirely in the browser on the picked File, so no bytes are
 * uploaded just to inspect them.
 */

export interface ImageAnalysis {
  isImage: boolean;
  pxW: number;
  pxH: number;
  hasAlpha: boolean;      // any pixel with alpha < 255 (PNG/WebP/GIF)
  transparencyChecked: boolean;
}

const RASTER = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function ext(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Read a raster file's pixel dimensions and whether it carries transparency.
 * Vector/print formats (AI, PDF, SVG, PSD, EPS, TIFF) can't be decoded by the
 * browser — reported as not-an-image so callers skip DPI/transparency badges.
 */
export async function analyzeArtwork(file: File): Promise<ImageAnalysis> {
  const e = ext(file.name);
  const blank: ImageAnalysis = { isImage: false, pxW: 0, pxH: 0, hasAlpha: false, transparencyChecked: false };
  if (!RASTER.has(e)) return blank;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const pxW = img.naturalWidth;
    const pxH = img.naturalHeight;

    // Only PNG/WebP/GIF can be transparent; JPEG never is. Scan a downscaled
    // copy so a huge upload doesn't stall the main thread.
    let hasAlpha = false;
    let checked = false;
    if (e === "png" || e === "webp" || e === "gif") {
      const res = scanAlpha(img);
      hasAlpha = res.hasAlpha;
      checked = res.checked;
    }
    return { isImage: true, pxW, pxH, hasAlpha, transparencyChecked: checked };
  } catch {
    return blank;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function scanAlpha(img: HTMLImageElement): { hasAlpha: boolean; checked: boolean } {
  try {
    const max = 400; // sample at ≤400px on the long edge — enough to spot alpha
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { hasAlpha: false, checked: false };
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < 250) return { hasAlpha: true, checked: true };
    }
    return { hasAlpha: false, checked: true };
  } catch {
    // Cross-origin taint or no canvas — can't tell.
    return { hasAlpha: false, checked: false };
  }
}

export type DpiRating = "good" | "fair" | "poor";

/** Effective print DPI = pixels ÷ requested print inches (min of both axes). */
export function dpiFor(pxW: number, pxH: number, wIn: number, hIn: number): { dpi: number; rating: DpiRating } | null {
  if (!pxW || !pxH || !(wIn > 0) || !(hIn > 0)) return null;
  const dpi = Math.floor(Math.min(pxW / wIn, pxH / hIn));
  const rating: DpiRating = dpi >= 300 ? "good" : dpi >= 150 ? "fair" : "poor";
  return { dpi, rating };
}

export const DPI_STYLE: Record<DpiRating, { label: string; bg: string; fg: string }> = {
  good: { label: "Good", bg: "#DCFCE7", fg: "#166534" },
  fair: { label: "Fair", bg: "#FEF3C7", fg: "#92400E" },
  poor: { label: "Poor", bg: "#FEE2E2", fg: "#991B1B" },
};
