/**
 * How the app looks, and how it takes on a shop's colour.
 *
 * The palette is the platform's until a shop is known; then its primary
 * colour replaces the accent. Only the accent — a shop that picked a pale
 * yellow should not end up with pale yellow text on white, so the colours
 * that have to stay readable are fixed here.
 */
export const palette = {
  ink: "#111318",
  muted: "#6B7280",
  paper: "#FFFFFF",
  page: "#FAFAFA",
  line: "#E4E4E7",
  bad: "#B91C1C",
  badSoft: "#FEF2F2",
  ok: "#047857",
  okSoft: "#ECFDF5",
  warn: "#B45309",
  warnSoft: "#FFFBEB",
};

export const radius = 10;

/** A shop's colour, if it is dark enough to put white text on. */
export function accentFor(primaryColor: string | null | undefined): string {
  const hex = normalise(primaryColor);
  if (!hex) return palette.ink;
  return luminance(hex) < 0.55 ? hex : palette.ink;
}

function normalise(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
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
