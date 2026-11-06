/**
 * Typefaces a buyer can set text in.
 *
 * One stylesheet request covers them all; a font file itself is fetched only
 * when its face is first drawn. The canvas measures text the moment it is
 * drawn, so `ensureFont` waits for the file before any text uses it.
 */

export interface DesignFont {
  family: string;
  kind: "Block" | "Varsity" | "Script" | "Serif" | "Display";
  weight: number;
}

export const DESIGN_FONTS: DesignFont[] = [
  { family: "Anton", kind: "Block", weight: 400 },
  { family: "Bebas Neue", kind: "Block", weight: 400 },
  { family: "Oswald", kind: "Block", weight: 600 },
  { family: "Archivo Black", kind: "Block", weight: 400 },
  { family: "Montserrat", kind: "Block", weight: 800 },
  { family: "Graduate", kind: "Varsity", weight: 400 },
  { family: "Alfa Slab One", kind: "Varsity", weight: 400 },
  { family: "Black Ops One", kind: "Varsity", weight: 400 },
  { family: "Bungee", kind: "Display", weight: 400 },
  { family: "Righteous", kind: "Display", weight: 400 },
  { family: "Monoton", kind: "Display", weight: 400 },
  { family: "Permanent Marker", kind: "Script", weight: 400 },
  { family: "Pacifico", kind: "Script", weight: 400 },
  { family: "Lobster", kind: "Script", weight: 400 },
  { family: "Caveat", kind: "Script", weight: 700 },
  { family: "Playfair Display", kind: "Serif", weight: 800 },
  { family: "Roboto Slab", kind: "Serif", weight: 700 },
];

export const DEFAULT_FONT = "Anton";

export const fontWeight = (family: string) => DESIGN_FONTS.find((f) => f.family === family)?.weight ?? 400;

const LINK_ID = "designer-fonts";

/** Add the stylesheet once. Cheap: it lists the faces, it does not download them. */
export function installFontSheet() {
  if (typeof document === "undefined" || document.getElementById(LINK_ID)) return;
  const families = DESIGN_FONTS
    .map((f) => `family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@${f.weight}`)
    .join("&");
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

const loaded = new Map<string, Promise<void>>();

/** Resolve once `family` can be measured. Never rejects: a missing font falls back. */
export function ensureFont(family: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  let p = loaded.get(family);
  if (!p) {
    installFontSheet();
    p = document.fonts
      .load(`${fontWeight(family)} 48px "${family}"`)
      .then(() => undefined)
      .catch(() => undefined);
    loaded.set(family, p);
  }
  return p;
}
