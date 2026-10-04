/**
 * Fonts for builder sites: which exist, how they are loaded, what stands in
 * when one fails.
 *
 * A storefront loads only the families its published site uses, at only the
 * weights it uses, in one stylesheet request — not the platform's whole list
 * on every page view. Every family carries a fallback stack chosen by its
 * category, so a font that fails to load leaves a page that still reads as
 * intended: a serif falls back to a serif, not to whatever the browser likes.
 */
import type { FontEntry } from "./types";

export type FontCategory = "sans-serif" | "serif" | "display" | "handwriting" | "monospace";

export interface CatalogFont { family: string; category: FontCategory; weights: number[]; italic?: boolean }

/**
 * A curated Google Fonts list — the families print shops actually use. Kept
 * here rather than fetched, so the picker needs no API key and works offline
 * in the editor. Adding one is adding a line.
 */
export const GOOGLE_FONTS: CatalogFont[] = [
  { family: "Inter", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Roboto", category: "sans-serif", weights: [300, 400, 500, 700, 900], italic: true },
  { family: "Open Sans", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Lato", category: "sans-serif", weights: [300, 400, 700, 900], italic: true },
  { family: "Montserrat", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Poppins", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "DM Sans", category: "sans-serif", weights: [400, 500, 700], italic: true },
  { family: "Nunito", category: "sans-serif", weights: [300, 400, 600, 700, 800], italic: true },
  { family: "Nunito Sans", category: "sans-serif", weights: [300, 400, 600, 700, 800], italic: true },
  { family: "Work Sans", category: "sans-serif", weights: [300, 400, 500, 600, 700], italic: true },
  { family: "Manrope", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Plus Jakarta Sans", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Outfit", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Raleway", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Rubik", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Source Sans 3", category: "sans-serif", weights: [300, 400, 600, 700], italic: true },
  { family: "Mulish", category: "sans-serif", weights: [300, 400, 600, 700, 800], italic: true },
  { family: "Barlow", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Archivo", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Figtree", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Space Grotesk", category: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { family: "Sora", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Urbanist", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Lexend", category: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { family: "Kanit", category: "sans-serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Oswald", category: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { family: "Bebas Neue", category: "display", weights: [400] },
  { family: "Anton", category: "display", weights: [400] },
  { family: "Archivo Black", category: "display", weights: [400] },
  { family: "Righteous", category: "display", weights: [400] },
  { family: "Bungee", category: "display", weights: [400] },
  { family: "Russo One", category: "display", weights: [400] },
  { family: "Black Ops One", category: "display", weights: [400] },
  { family: "Alfa Slab One", category: "display", weights: [400] },
  { family: "Abril Fatface", category: "display", weights: [400] },
  { family: "Playfair Display", category: "serif", weights: [400, 500, 600, 700, 800, 900], italic: true },
  { family: "Merriweather", category: "serif", weights: [300, 400, 700, 900], italic: true },
  { family: "Lora", category: "serif", weights: [400, 500, 600, 700], italic: true },
  { family: "Libre Baskerville", category: "serif", weights: [400, 700], italic: true },
  { family: "Cormorant Garamond", category: "serif", weights: [300, 400, 500, 600, 700], italic: true },
  { family: "EB Garamond", category: "serif", weights: [400, 500, 600, 700, 800], italic: true },
  { family: "Fraunces", category: "serif", weights: [300, 400, 600, 700, 900], italic: true },
  { family: "DM Serif Display", category: "serif", weights: [400], italic: true },
  { family: "Crimson Text", category: "serif", weights: [400, 600, 700], italic: true },
  { family: "PT Serif", category: "serif", weights: [400, 700], italic: true },
  { family: "Roboto Slab", category: "serif", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Bitter", category: "serif", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Zilla Slab", category: "serif", weights: [300, 400, 500, 600, 700], italic: true },
  { family: "Pacifico", category: "handwriting", weights: [400] },
  { family: "Dancing Script", category: "handwriting", weights: [400, 500, 600, 700] },
  { family: "Caveat", category: "handwriting", weights: [400, 500, 600, 700] },
  { family: "Permanent Marker", category: "handwriting", weights: [400] },
  { family: "Satisfy", category: "handwriting", weights: [400] },
  { family: "Great Vibes", category: "handwriting", weights: [400] },
  { family: "Kalam", category: "handwriting", weights: [300, 400, 700] },
  { family: "Shadows Into Light", category: "handwriting", weights: [400] },
  { family: "JetBrains Mono", category: "monospace", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "IBM Plex Mono", category: "monospace", weights: [300, 400, 500, 600, 700], italic: true },
  { family: "Space Mono", category: "monospace", weights: [400, 700], italic: true },
];

/** Fonts every visitor already has, and the stack each one is written with. */
export const SYSTEM_FONTS: { family: string; stack: string; category: FontCategory }[] = [
  { family: "system-ui", stack: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", category: "sans-serif" },
  { family: "Arial", stack: "Arial, Helvetica, sans-serif", category: "sans-serif" },
  { family: "Helvetica", stack: "Helvetica, Arial, sans-serif", category: "sans-serif" },
  { family: "Verdana", stack: "Verdana, Geneva, sans-serif", category: "sans-serif" },
  { family: "Tahoma", stack: "Tahoma, Verdana, sans-serif", category: "sans-serif" },
  { family: "Trebuchet MS", stack: "'Trebuchet MS', Helvetica, sans-serif", category: "sans-serif" },
  { family: "Georgia", stack: "Georgia, 'Times New Roman', serif", category: "serif" },
  { family: "Times New Roman", stack: "'Times New Roman', Times, serif", category: "serif" },
  { family: "Courier New", stack: "'Courier New', Courier, monospace", category: "monospace" },
  { family: "sans-serif", stack: "sans-serif", category: "sans-serif" },
  { family: "serif", stack: "serif", category: "serif" },
  { family: "monospace", stack: "monospace", category: "monospace" },
];

const FALLBACK: Record<FontCategory, string> = {
  "sans-serif": "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  display: "Impact, 'Arial Black', system-ui, sans-serif",
  handwriting: "'Brush Script MT', cursive",
  monospace: "'Courier New', monospace",
};

const FAMILY_OK = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,59}$/;

function quote(family: string): string {
  // Names are validated to letters, digits, spaces and hyphens before they
  // get here; the quote is for the spaces.
  return `"${family.replace(/["\\]/g, "")}"`;
}

export function categoryOf(family: string): FontCategory {
  return GOOGLE_FONTS.find((f) => f.family === family)?.category
    ?? SYSTEM_FONTS.find((f) => f.family === family)?.category
    ?? "sans-serif";
}

/** The CSS font-family value for a family, fallbacks included. */
export function fontStack(family: string | undefined | null): string {
  if (!family) return FALLBACK["sans-serif"];
  const system = SYSTEM_FONTS.find((f) => f.family === family);
  if (system) return system.stack;
  if (!FAMILY_OK.test(family)) return FALLBACK["sans-serif"];
  return `${quote(family)}, ${FALLBACK[categoryOf(family)]}`;
}

/**
 * One stylesheet request for every Google family the site uses, at only the
 * weights it uses. Null when there are none — a site on system fonts fetches
 * nothing at all.
 */
export function googleCssUrl(fonts: { family: string; weights: number[]; italic?: boolean }[]): string | null {
  const parts: string[] = [];
  for (const font of fonts) {
    if (!font.family || !FAMILY_OK.test(font.family)) continue;
    const weights = Array.from(new Set((font.weights?.length ? font.weights : [400])
      .filter((w) => Number.isInteger(w) && w >= 100 && w <= 900 && w % 100 === 0))).sort((a, b) => a - b);
    if (!weights.length) continue;
    const name = font.family.trim().replace(/ /g, "+");
    if (font.italic) {
      const axis = [...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)].join(";");
      parts.push(`family=${name}:ital,wght@${axis}`);
    } else {
      parts.push(`family=${name}:wght@${weights.join(";")}`);
    }
  }
  if (!parts.length) return null;
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

/**
 * @font-face rules for the faces a brand uploaded. https only, a known format
 * only, and font-display: swap so text is never invisible while a file loads.
 */
export function fontFaceCss(faces: { family: string; weight: number; style: string; url: string; format: string }[]): string {
  const FORMATS: Record<string, string> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
  return faces
    .filter((f) => FAMILY_OK.test(f.family) && /^https:\/\/[^\s"'()<>]+$/.test(f.url) && FORMATS[f.format])
    .map((f) => [
      "@font-face{",
      `font-family:${quote(f.family)};`,
      `src:url("${f.url}") format("${FORMATS[f.format]}");`,
      `font-weight:${Math.min(900, Math.max(100, Math.round(f.weight / 100) * 100))};`,
      `font-style:${f.style === "italic" ? "italic" : "normal"};`,
      "font-display:swap}",
    ].join(""))
    .join("\n");
}

/** The families a site may choose from: its own list, then the system ones. */
export function availableFamilies(fonts: FontEntry[] | undefined): string[] {
  const own = (fonts ?? []).map((f) => f.family);
  return Array.from(new Set([...own, ...SYSTEM_FONTS.map((f) => f.family)]));
}

/** The URL for previewing one family in the picker, before it is added. */
export function previewUrl(family: string): string | null {
  const font = GOOGLE_FONTS.find((f) => f.family === family);
  if (!font) return null;
  const weights = font.weights.includes(400) ? [400, font.weights.includes(700) ? 700 : font.weights[font.weights.length - 1]!] : [font.weights[0]!];
  return googleCssUrl([{ family, weights }]);
}
