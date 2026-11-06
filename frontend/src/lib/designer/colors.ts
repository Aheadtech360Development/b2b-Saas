/**
 * Ink colours a buyer can choose for text and graphics, and a sensible
 * default for whatever garment they are on.
 */
import { luminance } from "./mockups";

export const INK_SWATCHES = [
  "#16181D", "#FFFFFF", "#8A8F98", "#C8322B", "#E0652E", "#F2B630",
  "#2E7D4F", "#1F3E8A", "#4FA3E0", "#5B2E8C", "#E86FA4", "#7A4B2A",
];

/** Black on light garments, off-white on dark ones. */
export const inkFor = (garmentHex: string) => (luminance(garmentHex) < 0.35 ? "#F5F3EE" : "#16181D");
