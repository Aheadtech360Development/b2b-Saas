/**
 * Getting a buyer's picture onto the canvas quickly.
 *
 * The canvas edits a copy no larger than 1600 px, which keeps dragging smooth
 * however large the file is. The original's pixel size is kept with it, so
 * print quality is judged on the file that would actually be printed.
 */

export const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];
export const MAX_BYTES = 25 * 1024 * 1024;
const EDIT_EDGE = 1600;

export interface PreparedImage {
  src: string;
  width: number;
  height: number;
  name: string;
}

export class ImageError extends Error {}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageError("This file couldn't be opened as an image. Try a PNG or JPG."));
    img.src = url;
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImageError("Use a PNG, JPG, WEBP, GIF or SVG file.");
  }
  if (file.size > MAX_BYTES) {
    throw new ImageError("This file is over 25 MB. Export a smaller version and try again.");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // An SVG has no pixels of its own: treat it as print-ready at any size.
    const isVector = file.type === "image/svg+xml";
    const width = isVector ? 6000 : img.naturalWidth;
    const height = isVector ? Math.round(6000 * (img.naturalHeight / img.naturalWidth || 1)) : img.naturalHeight;
    const scale = Math.min(1, EDIT_EDGE / Math.max(img.naturalWidth || EDIT_EDGE, img.naturalHeight || EDIT_EDGE));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round((img.naturalWidth || EDIT_EDGE) * scale));
    c.height = Math.max(1, Math.round((img.naturalHeight || EDIT_EDGE) * scale));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let src = c.toDataURL("image/webp", 0.92);
    if (!src.startsWith("data:image/webp")) src = c.toDataURL("image/png");
    return { src, width, height, name: file.name };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type Quality = { label: string; tone: "good" | "ok" | "low" };

/** How a picture will print at this size. */
export function printQuality(dpi: number): Quality {
  if (dpi >= 200) return { label: "Great print quality", tone: "good" };
  if (dpi >= 140) return { label: "Good print quality", tone: "good" };
  if (dpi >= 100) return { label: "Fair print quality", tone: "ok" };
  return { label: "May print blurry. Make it smaller or use a larger file", tone: "low" };
}

export { loadImage };
