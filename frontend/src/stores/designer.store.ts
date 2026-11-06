// frontend/src/stores/designer.store.ts
/**
 * Zustand store for the t-shirt designer: the design document and what the
 * buyer is looking at. The canvas itself lives in the Fabric controller; this
 * holds what the rest of the screen needs to draw, and the document that gets
 * saved.
 */
import { create } from "zustand";
import { garmentById } from "@/lib/designer/catalog";
import { focusOf, PRINT_AREAS } from "@/lib/designer/mockups";
import {
  lineKey, VIEW_KEYS,
  type DecorationMethod, type DesignDoc, type Garment, type RosterRow, type ShirtDesign, type SizeKey, type ViewKey,
  type ViewObjects,
} from "@/lib/designer/types";

/** The sheet beside the stage. "saved" is the buyer's saved designs, opened from the header. */
export type Tab = "garment" | "artwork" | "sizes" | "review" | "saved";
export type ToolKey = "product" | "upload" | "text" | "graphics" | "ai" | "names" | "saved";
/** The artwork tools, in the order the Artwork tab lists them. */
export const ART_TOOLS = ["upload", "text", "graphics", "ai", "names"] as const;
export type ArtTool = (typeof ART_TOOLS)[number];

const tabFor = (p: ToolKey): Tab => (p === "product" ? "garment" : p === "saved" ? "saved" : "artwork");

/** What the selected object is, for the panels that edit it. */
export interface SelectionInfo {
  id: string;
  kind: "text" | "image" | "graphic";
  text?: string;
  fontFamily?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  charSpacing?: number;
  curve?: number;
  /** Printed size, in inches. */
  widthIn: number;
  heightIn: number;
  /** Print resolution, for pictures. */
  dpi?: number;
  /** A names-and-numbers placeholder. */
  nn?: "name" | "number";
  /** Where the size badge goes, in stage pixels. */
  badge: { x: number; y: number };
  outside: boolean;
  /** Rotation, −180 … 180 degrees. */
  angle: number;
  /** Centre, in inches from the print area's centre line and top edge. */
  xIn: number;
  yIn: number;
  /** Width and height scaled by different amounts. */
  stretched: boolean;
}

export const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const firstColor = (g: Garment) => g.colors[0]?.id ?? "";

export const emptyDesign = (): ShirtDesign => ({ front: [], back: [], left: [], right: [] });

/** A copy of a design that shares nothing with it, so editing one never changes the other. */
export const cloneDesign = (d: ShirtDesign): ShirtDesign =>
  ({ front: [...d.front], back: [...d.back], left: [...d.left], right: [...d.right] }) as ShirtDesign;

/** Every shirt in the order, as `garmentId:colorId`. */
export const shirtKeys = (doc: DesignDoc) => doc.products.flatMap((p) => p.colorIds.map((c) => lineKey(p.garmentId, c)));

const NO_DESIGN: ShirtDesign = Object.freeze(emptyDesign()) as ShirtDesign;

/** A shirt's design. One shared empty design for a shirt without one, so selectors stay stable. */
export const designOf = (doc: DesignDoc, key: string): ShirtDesign => doc.designs[key] ?? NO_DESIGN;

/** The shirt on the stage. */
export const activeKey = (doc: DesignDoc, active: { product: number; colorId: string }) =>
  lineKey(doc.products[active.product]?.garmentId ?? "", active.colorId);

/**
 * Move a design from one garment to another of a different cut: from the old
 * garment's usual spot to the new one's, view by view, so a chest print stays
 * on the chest.
 */
export function moveDesign(d: ShirtDesign, from: Garment, to: Garment): ShirtDesign {
  if (from.silhouette === to.silhouette) return cloneDesign(d);
  const out = cloneDesign(d);
  for (const v of VIEW_KEYS) {
    const a = focusOf(PRINT_AREAS[from.silhouette][v]);
    const b = focusOf(PRINT_AREAS[to.silhouette][v]);
    const dx = (b.xIn - a.xIn) * 100, dy = (b.topIn - a.topIn) * 100;
    if (!dx && !dy) continue;
    out[v] = d[v].map((o) => ({
      ...o,
      left: (typeof o.left === "number" ? o.left : 0) + dx,
      top: (typeof o.top === "number" ? o.top : 0) + dy,
    }));
  }
  return out;
}

/** Bring an old saved design up to date: version 1's one design goes on every shirt. */
export function normalizeDoc(doc: DesignDoc): DesignDoc {
  if (doc.version === 2 && doc.designs) return doc;
  const shared = doc.views ?? emptyDesign();
  const designs: Record<string, ShirtDesign> = {};
  for (const k of shirtKeys(doc)) designs[k] = cloneDesign(shared);
  const { views: _old, ...rest } = doc;
  void _old;
  return { ...rest, version: 2, designs };
}

export function emptyDoc(garment: Garment): DesignDoc {
  return {
    version: 2,
    id: newId(),
    name: "Untitled design",
    products: [{ garmentId: garment.id, colorIds: [firstColor(garment)] }],
    method: "print",
    designs: { [lineKey(garment.id, firstColor(garment))]: emptyDesign() },
    quantities: {},
    roster: [],
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

interface DesignerState {
  catalog: Garment[];
  doc: DesignDoc | null;
  tab: Tab;
  view: ViewKey;
  /** The product and colour on the stage. */
  active: { product: number; colorId: string };
  panel: ToolKey;
  selection: SelectionInfo | null;
  zoom: number;
  /** Rendered previews of each view, for the view rail and review. */
  previews: Partial<Record<ViewKey, string>>;
  guides: { v: boolean; h: boolean };
  history: { undo: boolean; redo: boolean };
  /** Roster row shown on the canvas, by index. */
  rosterPreview: number;
  /** Bumps when a shirt's design is replaced outside the canvas, so the stage reloads it. */
  rev: number;

  init: (catalog: Garment[], doc: DesignDoc) => void;
  setTab: (t: Tab) => void;
  setView: (v: ViewKey) => void;
  setPanel: (p: ToolKey) => void;
  setSelection: (s: SelectionInfo | null) => void;
  setZoom: (z: number) => void;
  setPreview: (v: ViewKey, url: string) => void;
  setGuides: (g: { v: boolean; h: boolean }) => void;
  setHistory: (h: { undo: boolean; redo: boolean }) => void;
  setRosterPreview: (i: number) => void;

  setViewObjects: (v: ViewKey, objects: ViewObjects) => void;
  rename: (name: string) => void;
  setMethod: (m: DecorationMethod) => void;
  setNotes: (n: string) => void;
  setActive: (product: number, colorId: string) => void;
  /** Add a garment. `copy` starts it with the design of the shirt on the stage. */
  addProduct: (garmentId: string, copy?: boolean) => void;
  changeProduct: (index: number, garmentId: string) => void;
  removeProduct: (index: number) => void;
  /** Add or remove a colour. An added one is its own shirt; `copy` starts it with the current design. */
  toggleColor: (index: number, colorId: string, copy?: boolean) => void;
  /** Replace the shirt on the stage's design with a copy of another shirt's. */
  copyDesignFrom: (key: string) => void;
  /** Remember the job the design was sent in as. */
  setRemote: (remote: { id: string; reference: string } | undefined) => void;
  setQty: (line: string, size: SizeKey, qty: number) => void;
  setRoster: (rows: RosterRow[]) => void;
  loadDoc: (doc: DesignDoc) => void;
}

const touch = (doc: DesignDoc): DesignDoc => ({ ...doc, updatedAt: new Date().toISOString() });

export const useDesigner = create<DesignerState>((set, get) => {
  /** Apply a change to the document. */
  const edit = (fn: (doc: DesignDoc) => DesignDoc) => {
    const { doc } = get();
    if (doc) set({ doc: touch(fn(doc)) });
  };

  /** Keep the stage on a product and colour that still exist. */
  const settle = () => {
    const { doc, active } = get();
    if (!doc) return;
    const index = Math.min(active.product, doc.products.length - 1);
    const p = doc.products[index];
    if (!p) return;
    const colorId = p.colorIds.includes(active.colorId) ? active.colorId : p.colorIds[0] ?? "";
    if (index !== active.product || colorId !== active.colorId) set({ active: { product: index, colorId } });
  };

  return {
    catalog: [],
    doc: null,
    tab: "garment",
    view: "front",
    active: { product: 0, colorId: "" },
    panel: "product",
    selection: null,
    zoom: 1,
    previews: {},
    guides: { v: false, h: false },
    history: { undo: false, redo: false },
    rosterPreview: 0,
    rev: 0,

    init: (catalog, raw) => {
      const doc = normalizeDoc(raw);
      set({
        catalog, doc, tab: "garment", panel: "product", view: "front", previews: {}, selection: null,
        active: { product: 0, colorId: doc.products[0]?.colorIds[0] ?? "" },
      });
    },
    // The Artwork tab reopens on the last tool used there.
    setTab: (tab) => set((st) => ({
      tab,
      panel: tab === "garment" ? "product" : tab === "saved" ? "saved"
        : tab === "artwork" ? ((ART_TOOLS as readonly string[]).includes(st.panel) ? st.panel : "upload") : st.panel,
    })),
    // Each view opens at its own zoom: a sleeve is small on the whole shirt.
    setView: (view) => {
      const { doc, catalog, active } = get();
      const g = garmentById(catalog, doc?.products[active.product]?.garmentId ?? "");
      const zoom = g ? PRINT_AREAS[g.silhouette][view].zoom ?? 1 : 1;
      set({ view, selection: null, guides: { v: false, h: false }, zoom });
    },
    setPanel: (panel) => set({ panel, tab: tabFor(panel) }),
    setSelection: (selection) => set({ selection }),
    setZoom: (zoom) => set({ zoom }),
    setPreview: (v, url) => set((s) => ({ previews: { ...s.previews, [v]: url } })),
    setGuides: (guides) => {
      const g = get().guides;
      if (g.v !== guides.v || g.h !== guides.h) set({ guides });
    },
    setHistory: (history) => set({ history }),
    setRosterPreview: (rosterPreview) => set({ rosterPreview }),

    // Edits go to the shirt on the stage only.
    setViewObjects: (v, objects) => edit((d) => {
      const key = activeKey(d, get().active);
      return { ...d, designs: { ...d.designs, [key]: { ...designOf(d, key), [v]: objects } } };
    }),
    rename: (name) => edit((d) => ({ ...d, name })),
    setMethod: (method) => edit((d) => ({ ...d, method })),
    setNotes: (notes) => edit((d) => ({ ...d, notes })),
    setActive: (product, colorId) => set({ active: { product, colorId }, selection: null, previews: {} }),

    addProduct: (garmentId, copy = true) => {
      const g = garmentById(get().catalog, garmentId);
      if (!g) return;
      edit((d) => {
        const fromKey = activeKey(d, get().active);
        const from = garmentById(get().catalog, d.products[get().active.product]?.garmentId ?? "");
        const design = copy && from ? moveDesign(designOf(d, fromKey), from, g) : emptyDesign();
        return {
          ...d,
          products: [...d.products, { garmentId, colorIds: [firstColor(g)] }],
          designs: { ...d.designs, [lineKey(garmentId, firstColor(g))]: design },
        };
      });
      const doc = get().doc!;
      set({ active: { product: doc.products.length - 1, colorId: firstColor(g) } });
    },

    changeProduct: (index, garmentId) => {
      const g = garmentById(get().catalog, garmentId);
      if (!g) return;
      edit((d) => {
        const old = d.products[index];
        if (!old) return d;
        // Keep the colours the new garment also comes in.
        const kept = old.colorIds.filter((c) => g.colors.some((x) => x.id === c));
        const colorIds = kept.length ? kept : [firstColor(g)];
        const products = d.products.map((p, i) => (i === index ? { garmentId, colorIds } : p));
        const quantities = { ...d.quantities };
        for (const c of old.colorIds) {
          const from = lineKey(old.garmentId, c);
          if (colorIds.includes(c) && quantities[from]) {
            const sizes = Object.fromEntries(Object.entries(quantities[from]).filter(([s]) => g.sizes.includes(s as SizeKey)));
            quantities[lineKey(garmentId, c)] = sizes;
          }
          delete quantities[from];
        }
        const roster = d.roster.map((r) => (r.line.startsWith(`${old.garmentId}:`) ? { ...r, line: lineKey(garmentId, colorIds[0] ?? "") } : r));
        // Each shirt keeps its design on the new garment, moved to its usual spots.
        const from = garmentById(get().catalog, old.garmentId);
        const designs = { ...d.designs };
        const carried = designOf(d, lineKey(old.garmentId, old.colorIds[0] ?? ""));
        for (const c of old.colorIds) {
          const k = lineKey(old.garmentId, c);
          const mine = designOf(d, k);
          delete designs[k];
          if (colorIds.includes(c)) designs[lineKey(garmentId, c)] = from ? moveDesign(mine, from, g) : mine;
        }
        for (const c of colorIds) {
          const k = lineKey(garmentId, c);
          if (!designs[k]) designs[k] = from ? moveDesign(carried, from, g) : cloneDesign(carried);
        }
        return { ...d, products, quantities, roster, designs, method: g.embroidery ? d.method : "print" };
      });
      set({ active: { product: index, colorId: get().doc!.products[index]?.colorIds[0] ?? "" } });
    },

    removeProduct: (index) => {
      const doc = get().doc;
      if (!doc || doc.products.length < 2) return;
      const gone = doc.products[index];
      if (!gone) return;
      edit((d) => {
        const quantities = { ...d.quantities };
        for (const c of gone.colorIds) delete quantities[lineKey(gone.garmentId, c)];
        const roster = d.roster.filter((r) => !r.line.startsWith(`${gone.garmentId}:`) || d.products.some((p, i) => i !== index && p.garmentId === gone.garmentId));
        const designs = { ...d.designs };
        for (const c of gone.colorIds) delete designs[lineKey(gone.garmentId, c)];
        return { ...d, products: d.products.filter((_, i) => i !== index), quantities, roster, designs };
      });
      set({ active: { product: 0, colorId: get().doc!.products[0]?.colorIds[0] ?? "" } });
    },

    toggleColor: (index, colorId, copy = true) => {
      edit((d) => {
        const p = d.products[index];
        if (!p) return d;
        const has = p.colorIds.includes(colorId);
        if (has && p.colorIds.length === 1) return d;
        const colorIds = has ? p.colorIds.filter((c) => c !== colorId) : [...p.colorIds, colorId];
        const quantities = { ...d.quantities };
        const designs = { ...d.designs };
        const key = lineKey(p.garmentId, colorId);
        if (has) {
          delete quantities[key];
          delete designs[key];
        } else {
          // A new colour is a new shirt: a copy of the one on the stage, or blank.
          const fromKey = activeKey(d, get().active);
          const from = garmentById(get().catalog, d.products[get().active.product]?.garmentId ?? "");
          const to = garmentById(get().catalog, p.garmentId);
          designs[key] = copy && from && to ? moveDesign(designOf(d, fromKey), from, to) : emptyDesign();
        }
        return { ...d, products: d.products.map((x, i) => (i === index ? { ...x, colorIds } : x)), quantities, designs };
      });
      const p = get().doc!.products[index];
      if (p?.colorIds.includes(colorId)) set({ active: { product: index, colorId } });
      settle();
    },

    copyDesignFrom: (key) => {
      set((st) => ({ rev: st.rev + 1 }));
      edit((d) => {
      const target = activeKey(d, get().active);
      if (key === target) return d;
      const [fromId = ""] = key.split(":");
      const from = garmentById(get().catalog, fromId);
      const to = garmentById(get().catalog, d.products[get().active.product]?.garmentId ?? "");
      const design = from && to ? moveDesign(designOf(d, key), from, to) : cloneDesign(designOf(d, key));
      return { ...d, designs: { ...d.designs, [target]: design } };
      });
      set((st) => ({ rev: st.rev + 1 }));
    },

    setRemote: (remote) => edit((d) => ({ ...d, remote })),

    setQty: (line, size, qty) => edit((d) => ({
      ...d,
      quantities: { ...d.quantities, [line]: { ...d.quantities[line], [size]: Math.max(0, Math.min(9999, Math.floor(qty) || 0)) } },
    })),

    setRoster: (roster) => edit((d) => ({ ...d, roster })),

    loadDoc: (raw) => {
      const doc = normalizeDoc(raw);
      set({
        doc: touch(doc), view: "front", tab: "garment", panel: "product", previews: {}, selection: null,
        active: { product: 0, colorId: doc.products[0]?.colorIds[0] ?? "" },
      });
    },
  };
});

/** A shirt's views with artwork on them, which is what the buyer pays to print on it. */
export const shirtSides = (doc: DesignDoc, key: string): ViewKey[] => {
  const d = designOf(doc, key);
  return VIEW_KEYS.filter((v) => d[v].length > 0);
};

/** Views with artwork on any shirt in the order. */
export const decoratedSides = (doc: DesignDoc): ViewKey[] =>
  VIEW_KEYS.filter((v) => shirtKeys(doc).some((k) => designOf(doc, k)[v].length > 0));

/** Each shirt's printed views, for pricing. */
export const sidesByShirt = (doc: DesignDoc): Record<string, ViewKey[]> =>
  Object.fromEntries(shirtKeys(doc).map((k) => [k, shirtSides(doc, k)]));
