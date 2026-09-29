/**
 * How the app looks.
 *
 * The same two typefaces as the website, so a shop's phone app and its site
 * are recognisably one product: Fraunces for headings, DM Sans for everything
 * else. System fonts were what made this look unfinished.
 *
 * A shop's own colour is allowed in, but only where it stays readable.
 */
export const palette = {
  ink: "#111318",
  ink70: "#4A4E57",
  muted: "#8A8F99",
  paper: "#FFFFFF",
  page: "#F7F7F5",
  line: "#E7E7E3",
  lineSoft: "#F0F0EC",
  bad: "#B3261E",
  badSoft: "#FDF3F2",
  ok: "#1F6F4A",
  okSoft: "#F0F8F3",
  warn: "#8A5A00",
  warnSoft: "#FDF7EC",
};

export const font = {
  display: "Fraunces_600SemiBold",
  displayLight: "Fraunces_400Regular",
  body: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  bold: "DMSans_700Bold",
};

/**
 * One scale, so nothing is sized by eye.
 *
 * Headings are set tighter than their size as they grow, which is what keeps
 * a large serif from looking loose on a narrow screen.
 */
export const type = {
  hero: { fontFamily: font.display, fontSize: 32, lineHeight: 37, letterSpacing: -0.6 },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.3 },
  section: { fontFamily: font.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 23 },
  bodyMedium: { fontFamily: font.medium, fontSize: 15, lineHeight: 23 },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 17 },
  /** Tabular figures matter in a list of money: the columns line up. */
  number: { fontFamily: font.medium, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums" as const] },
  big: { fontFamily: font.display, fontSize: 26, lineHeight: 30, fontVariant: ["tabular-nums" as const] },
};

export const radius = { sm: 8, md: 12, lg: 16 };

export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

/** A shop's colour, if white text can sit on it. */
export function accentFor(primaryColor: string | null | undefined): string {
  const hex = normalise(primaryColor);
  if (!hex) return palette.ink;
  return luminance(hex) < 0.55 ? hex : palette.ink;
}

function normalise(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const body = m[1];
  const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
  return `#${full.toLowerCase()}`;
}

/** Perceived brightness, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
