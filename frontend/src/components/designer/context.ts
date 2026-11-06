/**
 * What the designer's components share besides the document: the live canvas
 * controller, a short status message, and this session's uploads.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { DEMO_RATES, quote } from "@/lib/designer/pricing";
import { garmentUrl } from "@/lib/designer/photo";
import type { PreparedImage } from "@/lib/designer/images";
import type { Garment, Silhouette, ViewKey } from "@/lib/designer/types";
import { activeKey, decoratedSides, designOf, sidesByShirt, useDesigner } from "@/stores/designer.store";
import type { DesignController } from "./controller";

export const ControllerContext = createContext<{
  ctrl: DesignController | null;
  setCtrl: (c: DesignController | null) => void;
}>({ ctrl: null, setCtrl: () => {} });

export const useCtrl = () => useContext(ControllerContext).ctrl;

interface Notice {
  msg: string | null;
  tone: "info" | "error";
  show: (msg: string, tone?: "info" | "error") => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useNotice = create<Notice>((set) => ({
  msg: null,
  tone: "info",
  show: (msg, tone = "info") => {
    clearTimeout(timer);
    set({ msg, tone });
    timer = setTimeout(() => set({ msg: null }), tone === "error" ? 6000 : 3200);
  },
}));

export const useUploads = create<{ items: PreparedImage[]; add: (i: PreparedImage) => void }>((set) => ({
  items: [],
  add: (i) => set((s) => ({ items: [i, ...s.items.filter((x) => x.src !== i.src)].slice(0, 12) })),
}));

/** The garment and colour on the stage. */
export function useActiveGarment(): { garment: Garment | undefined; hex: string; colorName: string } {
  const catalog = useDesigner((s) => s.catalog);
  const doc = useDesigner((s) => s.doc);
  const active = useDesigner((s) => s.active);
  const product = doc?.products[active.product];
  const garment = catalog.find((g) => g.id === product?.garmentId);
  const color = garment?.colors.find((c) => c.id === active.colorId) ?? garment?.colors[0];
  return { garment, hex: color?.hex ?? "#FFFFFF", colorName: color?.name ?? "" };
}

/**
 * The garment's picture in a colour. Keeps showing the last picture while a
 * new colour is being made, so switching colours never flashes empty.
 */
export function useGarmentUrl(silhouette: Silhouette | undefined, view: ViewKey, hex: string, size = 256): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!silhouette) return;
    let live = true;
    void garmentUrl(silhouette, view, hex, size).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [silhouette, view, hex, size]);
  return url;
}

/** The shirt on the stage: its key and its own design. */
export function useShirt() {
  const key = useDesigner((st) => (st.doc ? activeKey(st.doc, st.active) : ""));
  const design = useDesigner((st) => (st.doc ? designOf(st.doc, activeKey(st.doc, st.active)) : undefined));
  return { key, design };
}

/** The live price of the design as it stands. */
export function useQuote() {
  const catalog = useDesigner((s) => s.catalog);
  const doc = useDesigner((s) => s.doc);
  return useMemo(() => {
    if (!doc) return null;
    return quote({
      garments: Object.fromEntries(catalog.map((g) => [g.id, g])),
      rates: DEMO_RATES,
      method: doc.method,
      sides: decoratedSides(doc),
      sidesByLine: sidesByShirt(doc),
      quantities: doc.quantities,
      roster: doc.roster,
    });
  }, [catalog, doc]);
}
