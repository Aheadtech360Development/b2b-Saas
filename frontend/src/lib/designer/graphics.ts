/**
 * Ready-made graphics. Each is a single-colour drawing on a 100 × 100 grid,
 * so it recolours with one swatch and prints cleanly at any size.
 */

export interface Graphic {
  id: string;
  name: string;
  group: "Shapes" | "Sports" | "Icons";
  svg: string;
}

const INK = "#1C1C1E";

const filled = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="${INK}" fill-rule="evenodd">${body}</g></svg>`;

const outlined = (body: string, w = 6) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

/** A regular star or burst as polygon points. */
function star(points: number, outer: number, inner: number, cx = 50, cy = 50, turn = -90) {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = ((turn + (i * 180) / points) * Math.PI) / 180;
    out.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return out.join(" ");
}

function rays(n: number, r1: number, r2: number, width: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n;
    out.push(`<rect x="${50 - width / 2}" y="${50 - r2}" width="${width}" height="${r2 - r1}" rx="${width / 2}" transform="rotate(${a} 50 50)"/>`);
  }
  return out.join("");
}

export const GRAPHICS: Graphic[] = [
  { id: "star", name: "Star", group: "Shapes", svg: filled(`<polygon points="${star(5, 47, 19)}"/>`) },
  { id: "burst", name: "Burst", group: "Shapes", svg: filled(`<polygon points="${star(16, 48, 38)}"/>`) },
  { id: "circle", name: "Circle", group: "Shapes", svg: filled(`<circle cx="50" cy="50" r="46"/>`) },
  { id: "ring", name: "Ring", group: "Shapes", svg: filled(`<path d="M50 4a46 46 0 1 0 0.01 0ZM50 14a36 36 0 1 1-0.01 0Z"/>`) },
  { id: "heart", name: "Heart", group: "Shapes", svg: filled(`<path d="M50 90C20 68 5 50 5 31 5 16 16 6 30 6c9 0 16 5 20 13 4-8 11-13 20-13 14 0 25 10 25 25 0 19-15 37-45 59Z"/>`) },
  { id: "shield", name: "Shield", group: "Shapes", svg: filled(`<path d="M50 4 90 17v29c0 25-17 42-40 50C27 88 10 71 10 46V17Z"/>`) },
  { id: "banner", name: "Banner", group: "Shapes", svg: filled(`<path d="M2 34h18v-8h60v8h18L88 50l10 16H80v8H20v-8H2l10-16Z"/>`) },
  { id: "diamond", name: "Diamond", group: "Shapes", svg: filled(`<path d="M50 3 97 50 50 97 3 50Z"/>`) },
  { id: "basketball", name: "Basketball", group: "Sports", svg: outlined(`<circle cx="50" cy="50" r="44"/><path d="M6 50h88M50 6v88"/><path d="M19 19c14 14 14 48 0 62M81 19c-14 14-14 48 0 62"/>`) },
  { id: "baseball", name: "Baseball", group: "Sports", svg: outlined(`<circle cx="50" cy="50" r="44"/><path d="M22 16c12 20 12 48 0 68M78 16c-12 20-12 48 0 68"/><path d="M18 30l8-2M20 44h8M18 58l8 2M82 30l-8-2M80 44h-8M82 58l-8 2" stroke-width="4"/>`) },
  { id: "football", name: "Football", group: "Sports", svg: filled(`<path d="M50 14c30 0 46 20 46 36S80 86 50 86 4 66 4 50 20 14 50 14ZM34 46h32v8H34Zm6-7h4v22h-4Zm8 0h4v22h-4Zm8 0h4v22h-4Z"/>`) },
  { id: "trophy", name: "Trophy", group: "Sports", svg: filled(`<path d="M28 6h44v6h18v10c0 14-10 24-22 25-4 8-10 12-14 13v14h14v14H32V74h14V60c-4-1-10-5-14-13C20 46 10 36 10 22V12h18Zm0 14h-8v2c0 7 4 12 9 14-1-4-1-9-1-16Zm44 0v0c0 7 0 12-1 16 5-2 9-7 9-14v-2Z"/>`) },
  { id: "medal", name: "Medal", group: "Sports", svg: filled(`<path d="M30 4h14l10 24H40ZM56 4h14L60 28H46Z"/><circle cx="50" cy="62" r="30"/><polygon fill="#fff" points="${star(5, 16, 7, 50, 62)}"/>`) },
  { id: "bolt", name: "Lightning", group: "Icons", svg: filled(`<path d="M60 2 16 58h30l-8 40 46-58H54Z"/>`) },
  { id: "flame", name: "Flame", group: "Icons", svg: filled(`<path d="M50 3c7 20 30 30 30 58 0 21-14 36-30 36S20 82 20 62c0-14 8-23 14-31 0 12 6 21 13 23-4-18-3-33 3-51Z"/>`) },
  { id: "crown", name: "Crown", group: "Icons", svg: filled(`<path d="M6 26l22 24L50 14l22 36 22-24-8 52H14ZM14 84h72v10H14Z"/>`) },
  { id: "mountain", name: "Mountain", group: "Icons", svg: filled(`<path d="M2 90 36 28l14 24 12-18 36 56ZM36 28l-9 16 9-5 9 5Z"/>`) },
  { id: "sun", name: "Sun", group: "Icons", svg: filled(`<circle cx="50" cy="50" r="22"/>${rays(12, 30, 47, 7)}`) },
  { id: "paw", name: "Paw", group: "Icons", svg: filled(`<ellipse cx="24" cy="40" rx="9" ry="12"/><ellipse cx="40" cy="22" rx="9" ry="13"/><ellipse cx="60" cy="22" rx="9" ry="13"/><ellipse cx="76" cy="40" rx="9" ry="12"/><path d="M50 46c14 0 28 18 28 32 0 9-6 14-14 14-6 0-9-3-14-3s-8 3-14 3c-8 0-14-5-14-14 0-14 14-32 28-32Z"/>`) },
  { id: "note", name: "Music note", group: "Icons", svg: filled(`<path d="M36 14 86 4v64c0 10-8 16-18 16s-16-6-16-13 8-14 18-14c3 0 5 0 6 1V24L46 30v48c0 10-8 16-18 16s-16-6-16-13 8-14 18-14c3 0 5 0 6 1Z"/>`) },
  { id: "leaf", name: "Leaf", group: "Icons", svg: filled(`<path d="M88 8C40 8 12 30 12 64c0 9 3 17 8 22 4-20 18-38 40-48-18 13-30 30-34 52 6 3 12 4 18 4 34 0 44-38 44-86Z"/>`) },
  { id: "anchor", name: "Anchor", group: "Icons", svg: outlined(`<circle cx="50" cy="16" r="9"/><path d="M50 25v67M30 42h40M12 58c2 20 18 34 38 34s36-14 38-34M12 58l-6 8M12 58l10 4M88 58l6 8M88 58l-10 4"/>`, 7) },
  { id: "check", name: "Check", group: "Icons", svg: outlined(`<path d="M10 54l26 26 54-60"/>`, 12) },
  { id: "arrow", name: "Arrow", group: "Icons", svg: filled(`<path d="M6 42h56V20l34 30-34 30V58H6Z"/>`) },
];

export const graphicById = (id: string) => GRAPHICS.find((g) => g.id === id);

/** The same drawing in another colour. */
export const recolorSvg = (svg: string, hex: string) => svg.split(INK).join(hex);
