/**
 * The shape of a design, independent of how it is drawn.
 *
 * Artwork is kept in print space: hundredths of an inch, measured from the
 * top-centre of a view's print area, which is how a printer places art
 * ("3 in below the collar, centred"). The same design therefore sits right on
 * every garment, whatever its mockup looks like, and a server can render the
 * print file at 300 DPI from it without knowing anything about the screen.
 *
 * `objects` are Fabric's own serialised objects. They are stored as they come
 * so nothing is lost between a save and a reload; nothing outside the canvas
 * layer reads inside them.
 */

export type ViewKey = "front" | "back" | "left" | "right";
export const VIEW_KEYS: ViewKey[] = ["front", "back", "left", "right"];

export const VIEW_LABEL: Record<ViewKey, string> = {
  front: "Front",
  back: "Back",
  left: "Left side",
  right: "Right side",
};

/** Print space units per inch. */
export const UNITS_PER_INCH = 100;

export type DecorationMethod = "print" | "embroidery";

/** A size as the product names it: "M", "2XL", "Youth S", "One size". The
 *  shop's own products bring their own, in size order. */
export type SizeKey = string;

export interface GarmentColor {
  id: string;
  name: string;
  hex: string;
}

/** Where art can go on one view, in the mockup's own 1000 × 1000 drawing. */
export interface PrintArea {
  /** Centre of the print area, horizontally, in mockup units. */
  cx: number;
  /** Top edge of the print area, in mockup units. */
  top: number;
  widthIn: number;
  heightIn: number;
  /** Mockup units per inch on this view. */
  pxPerIn: number;
  /** Covers the whole garment: art can go anywhere on it. */
  whole?: boolean;
  /**
   * Where art usually goes on this view (the chest, the upper back, the middle
   * of a sleeve), in inches inside the print area: x from its centre line, top
   * from its top edge. New art starts here, and a close-up frames it.
   */
  focus?: { xIn: number; topIn: number; widthIn: number; heightIn: number };
  /** How far the view opens zoomed in on its focus (1 = the whole garment). */
  zoom?: number;
}

export type Silhouette = "tee" | "longsleeve" | "tank" | "muscle" | "hoodie";

export interface Garment {
  id: string;
  name: string;
  styleCode: string;
  brand: string;
  silhouette: Silhouette;
  description: string;
  fabric: string;
  /** Price of the blank garment, before any decoration. */
  basePrice: number;
  sizes: SizeKey[];
  colors: GarmentColor[];
  embroidery: boolean;
  /** The product's page, for a shop's own product. */
  slug?: string;
  /**
   * A shop's own product: each colour and size's own price and variant, keyed
   * `colorId|size` (backend services/tshirt_designer.garment_of). Without
   * them, a piece is basePrice plus the size's upcharge (the demo garments).
   */
  prices?: Record<string, number>;
  variants?: Record<string, string>;
}

/** One garment in the design, in the colours the buyer picked. */
export interface DesignProduct {
  garmentId: string;
  colorIds: string[];
}

/** Serialised canvas objects for one view. */
export type ViewObjects = Record<string, unknown>[];

export interface RosterRow {
  id: string;
  name: string;
  number: string;
  size: SizeKey;
  /** Which product and colour the shirt is, as `garmentId:colorId`. */
  line: string;
}

/** Quantities keyed by `garmentId:colorId`, then size. */
export type Quantities = Record<string, Partial<Record<SizeKey, number>>>;

/** One shirt's artwork, view by view. */
export type ShirtDesign = Record<ViewKey, ViewObjects>;

export interface DesignDoc {
  /** 2: each shirt has its own design. 1 had one design for every shirt. */
  version: 1 | 2;
  id: string;
  name: string;
  products: DesignProduct[];
  method: DecorationMethod;
  /** Each shirt's design, by `garmentId:colorId`. */
  designs: Record<string, ShirtDesign>;
  /** Version 1's single design, read only to convert an old saved design. */
  views?: ShirtDesign;
  /** The job this design was sent in as, once sent: later sends update it. */
  remote?: { id: string; reference: string };
  quantities: Quantities;
  roster: RosterRow[];
  notes: string;
  updatedAt: string;
}

export const lineKey = (garmentId: string, colorId: string) => `${garmentId}:${colorId}`;
