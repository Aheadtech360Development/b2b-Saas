/**
 * Garment photos, recoloured in the browser.
 *
 * Each photo view is a single greyscale "detail" image: mid-grey where the
 * fabric is flat, darker in folds and shadows, lighter on highlights, with the
 * garment's outline as its transparency. Laying it over a solid colour keeps
 * the real fabric in any colour, from white to black, so one photo serves the
 * whole colour range. Every view is the shop owner's own studio shot (front,
 * back, and each side with the garment turned 90°): the tee at 2200 px a view,
 * the long sleeve, tank and muscle tee at 1024 px, their side views at 1448 px.
 *
 * The tee's front and back were shot turned a little to one side, so the
 * shirt stood crooked on the stage. Their "-straight" files are made from
 * those shots: the half facing the camera widened back to its un-turned width,
 * mirrored about the centre line, the middle levelled so it hangs flat, and
 * centred (2026-11-10). Same size and scale as before, so print areas hold.
 *
 * A garment listed here uses its photo for that view, and needs print areas
 * measured on it in mockups.ts. The others are drawn.
 */
import { loadImage } from "./images";
import { luminance, mockupSvg, svgDataUrl } from "./mockups";
import type { Silhouette, ViewKey } from "./types";

export const PHOTOS: Partial<Record<Silhouette, Record<ViewKey, string>>> = {
  tee: {
    front: "/designer/tee-front-straight.webp",
    back: "/designer/tee-back-straight.webp",
    left: "/designer/tee-left.webp",
    right: "/designer/tee-right.webp",
  },
  longsleeve: {
    front: "/designer/long-front.webp",
    back: "/designer/long-back.webp",
    left: "/designer/long-left.webp",
    right: "/designer/long-right.webp",
  },
  tank: {
    front: "/designer/tank-front.webp",
    back: "/designer/tank-back.webp",
    left: "/designer/tank-left.webp",
    right: "/designer/tank-right.webp",
  },
  muscle: {
    front: "/designer/muscle-front.webp",
    back: "/designer/muscle-back.webp",
    left: "/designer/muscle-left.webp",
    right: "/designer/muscle-right.webp",
  },
};

const details = new Map<string, Promise<HTMLImageElement>>();
const garments = new Map<string, Promise<string>>();

/** How strongly the hard-light pass shades this colour (see `recolour`). */
export const hardLight = (hex: string) => 0.15 + 0.22 * luminance(hex);

async function recolour(src: string, hex: string, size: number): Promise<string> {
  let detail = details.get(src);
  if (!detail) {
    detail = loadImage(src);
    details.set(src, detail);
  }
  const img = await detail;
  const c = document.createElement("canvas");
  c.width = c.height = Math.min(img.naturalWidth, Math.max(64, Math.round(size)));
  const x = c.getContext("2d")!;
  const draw = () => x.drawImage(img, 0, 0, c.width, c.height);
  x.fillStyle = hex;
  x.fillRect(0, 0, c.width, c.height);
  // Soft light carries the folds into any colour; a little hard light gives
  // pale colours, which soft light cannot darken, their shadows.
  x.globalCompositeOperation = "soft-light";
  draw();
  draw();
  x.globalCompositeOperation = "hard-light";
  x.globalAlpha = hardLight(hex);
  draw();
  x.globalAlpha = 1;
  x.globalCompositeOperation = "destination-in";
  draw();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  return blob ? URL.createObjectURL(blob) : c.toDataURL("image/png");
}

/**
 * An image of this garment view in this colour, `size` pixels square: the
 * photo where there is one. For previews and thumbnails; the stage colours the
 * photo live with CSS instead (see Stage), which is instant at full size.
 */
export function garmentUrl(silhouette: Silhouette, view: ViewKey, hex: string, size = 1000): Promise<string> {
  const src = PHOTOS[silhouette]?.[view];
  if (!src || typeof document === "undefined") return Promise.resolve(svgDataUrl(mockupSvg(silhouette, view, hex)));
  // Sizes in steps, so nearby sizes share one image.
  const step = size <= 256 ? 256 : size <= 512 ? 512 : size <= 1024 ? 1024 : size <= 2048 ? 2048 : 3000;
  const key = `${src}|${hex.toLowerCase()}|${step}`;
  let p = garments.get(key);
  if (!p) {
    p = recolour(src, hex, step).catch(() => svgDataUrl(mockupSvg(silhouette, view, hex)));
    garments.set(key, p);
  }
  return p;
}

/** The photo behind a view, if it has one. */
export const photoFor = (silhouette: Silhouette, view: ViewKey) => PHOTOS[silhouette]?.[view] ?? null;

/** Whether this view is a photo (and so takes a moment to colour). */
export const isPhoto = (silhouette: Silhouette, view: ViewKey) => !!PHOTOS[silhouette]?.[view];
