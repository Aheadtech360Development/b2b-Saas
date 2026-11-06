/**
 * The garments the builder offers.
 *
 * A demo catalogue for now: four styles, each photographed from every side. It
 * has the same shape the shop's apparel products already have (colours ×
 * sizes, a base price), so connecting it to the real
 * catalogue is a matter of replacing `loadCatalog` with a call to the products
 * API and mapping each product to a `Garment`.
 */
import type { Garment, GarmentColor } from "./types";

const CORE_COLORS: GarmentColor[] = [
  { id: "white", name: "White", hex: "#ECECEA" }, // a soft white: pure #FFF glares on screen
  { id: "black", name: "Black", hex: "#1C1C1E" },
  { id: "heather", name: "Sport Grey", hex: "#B8BABD" },
  { id: "charcoal", name: "Charcoal", hex: "#46484C" },
  { id: "navy", name: "Navy", hex: "#1F2940" },
  { id: "royal", name: "Royal", hex: "#2A4EA6" },
  { id: "carolina", name: "Carolina Blue", hex: "#8DB8E0" },
  { id: "red", name: "Red", hex: "#BF2A30" },
  { id: "maroon", name: "Maroon", hex: "#5A1E2A" },
  { id: "orange", name: "Orange", hex: "#E0652E" },
  { id: "gold", name: "Gold", hex: "#E7A925" },
  { id: "forest", name: "Forest", hex: "#2D4A36" },
  { id: "military", name: "Military Green", hex: "#5E6648" },
  { id: "sand", name: "Sand", hex: "#D9C8A7" },
  { id: "purple", name: "Purple", hex: "#4A2F80" },
  { id: "pink", name: "Light Pink", hex: "#F2C6D2" },
];

export const DEMO_GARMENTS: Garment[] = [
  {
    id: "classic-tee",
    name: "Classic Tee",
    styleCode: "CT100",
    brand: "Essentials",
    silhouette: "tee",
    description: "A soft, mid-weight crew neck tee with a relaxed fit. The everyday shirt for events, teams and merch.",
    fabric: "5.3 oz, 100% ring-spun cotton. Sport Grey is 90/10 cotton/poly.",
    basePrice: 6.5,
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    colors: CORE_COLORS,
    embroidery: false,
  },
  {
    id: "long-sleeve-tee",
    name: "Long Sleeve Tee",
    styleCode: "LS200",
    brand: "Essentials",
    silhouette: "longsleeve",
    description: "A crew neck long sleeve tee with ribbed cuffs. Prints on the chest, back and down either sleeve.",
    fabric: "6 oz, 100% cotton with rib-knit cuffs.",
    basePrice: 11.5,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    colors: CORE_COLORS,
    embroidery: true,
  },
  {
    id: "tank-top",
    name: "Tank Top",
    styleCode: "TK300",
    brand: "Essentials",
    silhouette: "tank",
    description: "A classic sleeveless tank with a scoop neck and narrow shoulder straps. For gyms, races and summer events.",
    fabric: "4.5 oz, 100% combed cotton.",
    basePrice: 7,
    sizes: ["XS", "S", "M", "L", "XL", "2XL"],
    colors: CORE_COLORS,
    embroidery: false,
  },
  {
    id: "muscle-tee",
    name: "Muscle Tee",
    styleCode: "MT400",
    brand: "Essentials",
    silhouette: "muscle",
    description: "A sleeveless crew neck tee with dropped armholes. A wider print area than a tank.",
    fabric: "5.3 oz, 100% cotton.",
    basePrice: 8,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    colors: CORE_COLORS,
    embroidery: false,
  },
];

export async function loadCatalog(): Promise<Garment[]> {
  return DEMO_GARMENTS;
}

export const garmentById = (garments: Garment[], id: string) => garments.find((g) => g.id === id);
