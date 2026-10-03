/**
 * The four things somebody wants to do to a sheet before printing it.
 *
 * These work on raw pixels rather than on a canvas element, so each one can be
 * reasoned about and tested on its own — which matters, because a tool that
 * silently does nothing is worse than no tool: the buyer presses it, sees no
 * change, and sends the file anyway.
 *
 * Every function returns new pixels and leaves its input alone, so a stack of
 * edits can be replayed from the original when one of them is undone.
 */

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel, as ImageData carries it.
   *  Backed by a plain ArrayBuffer so it can be handed straight to the
   *  ImageData constructor without a copy. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

function blank(width: number, height: number): Pixels {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/**
 * A quarter turn clockwise. Width and height swap.
 *
 * Done here rather than with a CSS transform because the file that goes to the
 * printer has to be turned too — a sheet that looks right on screen and prints
 * sideways is the whole problem.
 */
export function rotate90(src: Pixels): Pixels {
  const { width: w, height: h, data } = src;
  const out = blank(h, w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = (y * w + x) * 4;
      // (x, y) → (h - 1 - y, x) in the turned image, whose width is h.
      const to = (x * h + (h - 1 - y)) * 4;
      out.data[to] = data[from]!;
      out.data[to + 1] = data[from + 1]!;
      out.data[to + 2] = data[from + 2]!;
      out.data[to + 3] = data[from + 3]!;
    }
  }
  return out;
}

/**
 * Colour out, using the weights the eye actually uses.
 *
 * A flat average of the channels makes greens too dark and blues too light;
 * these are the luminance coefficients, so a grey version of a design keeps
 * the contrast the original had.
 */
export function grayscale(src: Pixels): Pixels {
  const out = blank(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const grey = 0.2126 * src.data[i]! + 0.7152 * src.data[i + 1]! + 0.0722 * src.data[i + 2]!;
    out.data[i] = grey;
    out.data[i + 1] = grey;
    out.data[i + 2] = grey;
    out.data[i + 3] = src.data[i + 3]!;
  }
  return out;
}

/**
 * Crisper edges, by a 3x3 convolution.
 *
 * `amount` is how far to go: 0 leaves the image alone, 1 is the full kernel.
 * Transparent pixels are left transparent — sharpening the edge of a cut-out
 * design otherwise draws a halo where there was nothing.
 */
export function sharpen(src: Pixels, amount = 1): Pixels {
  const a = Math.max(0, Math.min(1, amount));
  if (a === 0) return { ...src, data: new Uint8ClampedArray(src.data) };

  const { width: w, height: h, data } = src;
  const out = blank(w, h);
  const centre = 1 + 4 * a;
  const side = -a;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // The edges of the image have no neighbours to work with; copied through
      // rather than invented, which is what a clamped kernel ends up doing.
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out.data[i] = data[i]!; out.data[i + 1] = data[i + 1]!;
        out.data[i + 2] = data[i + 2]!; out.data[i + 3] = data[i + 3]!;
        continue;
      }
      for (let c = 0; c < 3; c++) {
        const sum =
          data[i + c]! * centre +
          data[i - 4 + c]! * side +
          data[i + 4 + c]! * side +
          data[i - w * 4 + c]! * side +
          data[i + w * 4 + c]! * side;
        out.data[i + c] = sum;
      }
      out.data[i + 3] = data[i + 3]!;
    }
  }
  return out;
}

/**
 * Auto-levels: stretch what is there to fill the range that is available.
 *
 * A photographed or screen-grabbed design usually sits in a narrow band —
 * nothing truly black, nothing truly white — and prints flat. This finds the
 * band actually in use, ignoring the outermost `clip` fraction so one stray
 * bright pixel cannot decide the whole image, and stretches it.
 *
 * It returns the original when there is nothing to gain, so pressing it twice
 * does not slowly destroy the picture.
 */
export function enhance(src: Pixels, clip = 0.005): Pixels {
  const counts = new Uint32Array(256);
  let opaque = 0;
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3]! < 8) continue;          // ignore what will not print
    const lum = (0.2126 * src.data[i]! + 0.7152 * src.data[i + 1]! + 0.0722 * src.data[i + 2]!) | 0;
    counts[Math.min(255, Math.max(0, lum))]!++;
    opaque++;
  }
  if (opaque === 0) return { ...src, data: new Uint8ClampedArray(src.data) };

  const cut = Math.floor(opaque * clip);
  let lo = 0, hi = 255, seen = 0;
  for (let v = 0; v < 256; v++) { seen += counts[v]!; if (seen > cut) { lo = v; break; } }
  seen = 0;
  for (let v = 255; v >= 0; v--) { seen += counts[v]!; if (seen > cut) { hi = v; break; } }

  // Already using the range, or a flat image with no range to use.
  if (hi - lo < 8 || (lo <= 2 && hi >= 253)) {
    return { ...src, data: new Uint8ClampedArray(src.data) };
  }

  const scale = 255 / (hi - lo);
  const out = blank(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    out.data[i] = (src.data[i]! - lo) * scale;
    out.data[i + 1] = (src.data[i + 1]! - lo) * scale;
    out.data[i + 2] = (src.data[i + 2]! - lo) * scale;
    out.data[i + 3] = src.data[i + 3]!;
  }
  return out;
}

/** The tools, named once, so the buttons and the tests agree on what exists. */
export const TOOLS = ["rotate", "enhance", "grayscale", "sharpen"] as const;
export type Tool = (typeof TOOLS)[number];

export function applyTool(tool: Tool, src: Pixels): Pixels {
  switch (tool) {
    case "rotate": return rotate90(src);
    case "enhance": return enhance(src);
    case "grayscale": return grayscale(src);
    case "sharpen": return sharpen(src, 0.6);
  }
}
