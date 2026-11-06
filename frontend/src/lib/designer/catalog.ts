/**
 * The garments the designer offers: the shop's own products switched on for
 * it (loadCatalog), each drawn on one of four garment shapes photographed from
 * every side, in its own colours, sizes and prices.
 *
 * DEMO_GARMENTS are the designer's first stand-ins, kept for its tests.
 */
import { apiClient } from "@/lib/api-client";
import { colorHex } from "@/lib/colors";
import { DEMO_RATES, ratesFrom, type PriceRates } from "./pricing";
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

/** What the designer opens with at a shop. */
export interface ShopCatalog {
  /** The designer is in the shop's plan (Products → T-shirt designer). */
  available: boolean;
  /** The shop's products switched on for the designer, in their own colours, sizes and prices. */
  garments: Garment[];
  rates: PriceRates;
}

type RawGarment = Omit<Garment, "colors"> & { colors: { id: string; name: string; hex: string | null }[] };

/** The shop's catalogue (backend services/tshirt_designer.catalog). A colour
 *  without a swatch of its own is drawn from its name, as on the product page. */
export async function loadCatalog(): Promise<ShopCatalog> {
  try {
    const r = await apiClient.get<{ available: boolean; garments: RawGarment[]; rates: Parameters<typeof ratesFrom>[0] | null }>(
      "/api/v1/tshirt-designs/catalog");
    return {
      available: !!r.available,
      garments: (r.garments ?? []).map((g) => ({ ...g, colors: g.colors.map((c) => ({ ...c, hex: colorHex(c.name, c.hex) })) })),
      rates: r.rates ? ratesFrom(r.rates) : DEMO_RATES,
    };
  } catch (e) {
    // The designer switched off for the shop (403) reads the same as none offered.
    const status = (e as { status?: number })?.status;
    if (status === 403 || status === 404) return { available: false, garments: [], rates: DEMO_RATES };
    throw e;
  }
}

export const garmentById = (garments: Garment[], id: string) => garments.find((g) => g.id === id);
