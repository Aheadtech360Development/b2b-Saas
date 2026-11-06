/**
 * The live canvas: the only code in the designer that talks to Fabric.
 *
 * Everything on it is positioned in print space (hundredths of an inch from
 * the top-centre of the print area). The viewport transform maps that onto the
 * mockup on screen, so zooming or resizing the window never moves the art, and
 * the saved objects are already in the units a print file needs.
 *
 * Each change is committed as a snapshot, which drives undo/redo per view and
 * is handed to the store as the view's objects.
 */
import {
  ActiveSelection, Canvas, FabricImage, FabricObject, IText, Path, Point, Rect,
  cache, loadSVGFromString, util,
} from "fabric";
import type { ObjectSpec } from "@/lib/designer/ai";
import { DEFAULT_FONT, ensureFont } from "@/lib/designer/fonts";
import { graphicById, recolorSvg } from "@/lib/designer/graphics";
import type { PreparedImage } from "@/lib/designer/images";
import { focusOf } from "@/lib/designer/mockups";
import type { PrintArea, ViewKey, ViewObjects } from "@/lib/designer/types";
import { newId, type SelectionInfo } from "@/stores/designer.store";
import { fontsFor } from "./render";
import { CUSTOM_PROPS, decorate } from "./fabricSetup";

export interface ControllerEvents {
  onChange: (view: ViewKey, objects: ViewObjects) => void;
  onSelection: (info: SelectionInfo | null) => void;
  onHistory: (h: { undo: boolean; redo: boolean }) => void;
  onGuides: (g: { v: boolean; h: boolean }) => void;
}

export interface TextProps {
  text: string;
  fontFamily: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  charSpacing: number;
}

type Tagged = FabricObject & {
  uid?: string;
  kind?: "text" | "image" | "graphic";
  srcW?: number;
  nn?: "name" | "number";
  curve?: number;
  graphicId?: string;
  label?: string;
};

const HISTORY_LIMIT = 60;
const SNAP_PX = 8;

const tag = (o: FabricObject, props: Partial<Tagged>) => Object.assign(o, props) as Tagged;

/** Bend text along an arc. `curve` runs −100 (smile) … 100 (arch); 0 is straight. */
export function applyCurve(t: IText, curve: number) {
  const centre = t.getCenterPoint();
  t.set({ path: undefined, textAlign: "center" });
  t.initDimensions();
  if (curve) {
    // The arc is exactly as long as the text, and the text starts where it
    // starts: once on a path, Fabric measures the path, not the words, so
    // "centre" would no longer mean the middle of the text.
    const w = t.width;
    const theta = (Math.abs(curve) / 100) * Math.PI * 1.6;
    const r = w / theta;
    const phi = theta / 2;
    const top = curve > 0;
    const a0 = top ? -Math.PI / 2 - phi : Math.PI / 2 + phi;
    const a1 = top ? -Math.PI / 2 + phi : Math.PI / 2 - phi;
    const pt = (a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    const d = `M ${pt(a0)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${theta > Math.PI ? 1 : 0} ${top ? 1 : 0} ${pt(a1)}`;
    t.set({
      path: new Path(d, { visible: false }),
      textAlign: "left",
      pathAlign: "center",
      pathSide: "left",
      pathStartOffset: 0,
    });
    t.initDimensions();
  }
  tag(t, { curve });
  t.setPositionByOrigin(centre, "center", "center");
  t.setCoords();
}

async function graphicObject(graphicId: string, fill: string) {
  const g = graphicById(graphicId);
  if (!g) return null;
  const { objects, options } = await loadSVGFromString(recolorSvg(g.svg, fill));
  const o = util.groupSVGElements(objects.filter((x): x is NonNullable<typeof x> => !!x), options);
  return tag(o, { uid: newId(), kind: "graphic", graphicId, label: g.name });
}

/**
 * Turn layout specs into canvas objects, placed in print space. Specs are laid
 * out from the top-centre of the spot they go in; `offset` (inches) is where
 * that spot sits in the print area.
 */
export async function buildSpecs(specs: ObjectSpec[], offset = { xIn: 0, yIn: 0 }): Promise<FabricObject[]> {
  const made: FabricObject[] = [];
  for (const s of specs) {
    if (s.type === "text") {
      await ensureFont(s.font);
      const t = new IText(s.text, {
        fontFamily: s.font,
        fontSize: (s.heightIn * 100) / 0.72,
        fill: s.fill,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth ?? 0,
        strokeLineJoin: "round",
        paintFirst: "stroke",
        charSpacing: s.charSpacing ?? 0,
        textAlign: "center",
      });
      if (t.width > s.maxWidthIn * 100) t.set({ fontSize: t.fontSize * ((s.maxWidthIn * 100) / t.width) });
      t.initDimensions();
      tag(t, { uid: newId(), kind: "text", curve: 0 });
      t.setPositionByOrigin(new Point((s.xIn + offset.xIn) * 100, (s.yIn + offset.yIn) * 100), "center", "center");
      if (s.curve) applyCurve(t, s.curve);
      made.push(t);
    } else {
      const o = await graphicObject(s.graphicId, s.fill);
      if (!o) continue;
      o.scaleToWidth(s.widthIn * 100);
      o.setPositionByOrigin(new Point((s.xIn + offset.xIn) * 100, (s.yIn + offset.yIn) * 100), "center", "center");
      made.push(o);
    }
  }
  return made;
}

export class DesignController {
  readonly canvas: Canvas;
  private view: ViewKey = "front";
  private area: PrintArea = { cx: 500, top: 200, widthIn: 12, heightIn: 14, pxPerIn: 21 };
  private size = 600;
  private zoom = 1;
  private stacks = new Map<ViewKey, { undo: string[]; redo: string[] }>();
  private current = "[]";
  private loading = false;
  private token = 0;
  private frame = 0;

  constructor(el: HTMLCanvasElement, private ev: ControllerEvents) {
    this.canvas = new Canvas(el, {
      preserveObjectStacking: true,
      uniformScaling: true,
      stopContextMenu: true,
      controlsAboveOverlay: true,
      selectionColor: "rgba(36,87,245,0.08)",
      selectionBorderColor: "#2457F5",
      selectionLineWidth: 1,
    });
    const c = this.canvas;
    c.on("object:moving", (e) => { this.snap(e.target); this.emitSelectionSoon(); });
    c.on("object:scaling", () => this.emitSelectionSoon());
    c.on("object:rotating", () => this.emitSelectionSoon());
    c.on("object:modified", () => { this.ev.onGuides({ v: false, h: false }); this.commit(); this.emitSelection(); });
    c.on("mouse:up", () => this.ev.onGuides({ v: false, h: false }));
    c.on("selection:created", () => this.emitSelection());
    c.on("selection:updated", () => this.emitSelection());
    c.on("selection:cleared", () => this.emitSelection());
    c.on("text:changed", (e) => {
      const t = e.target as IText & Tagged;
      if (t.curve) applyCurve(t, t.curve);
      this.emitSelection();
    });
    c.on("text:editing:exited", () => this.commit());
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    void this.canvas.dispose();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  /** Size the canvas to the stage (`size` px square) at `zoom`. */
  layout(size: number, zoom: number) {
    this.size = size;
    this.zoom = zoom;
    const s = Math.round(size * zoom);
    this.canvas.setDimensions({ width: s, height: s });
    this.applyViewport();
    this.emitSelection();
  }

  /** Stage pixels per print unit. */
  private get k() {
    return ((this.size * this.zoom) / 1000) * (this.area.pxPerIn / 100);
  }

  private applyViewport() {
    const s = this.size * this.zoom;
    this.canvas.setViewportTransform([this.k, 0, 0, this.k, (this.area.cx * s) / 1000, (this.area.top * s) / 1000]);
    this.canvas.clipPath = new Rect({
      left: -this.area.widthIn * 50, top: 0,
      width: this.area.widthIn * 100, height: this.area.heightIn * 100,
      originX: "left", originY: "top",
    });
    this.canvas.requestRenderAll();
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  /** Settles once the view last asked for is on the canvas. */
  ready: Promise<void> = Promise.resolve();

  get currentView() {
    return this.view;
  }

  /** Put a view's objects on the canvas. */
  show(view: ViewKey, area: PrintArea, objects: ViewObjects) {
    this.ready = this.load(view, area, objects);
    return this.ready;
  }

  private async load(view: ViewKey, area: PrintArea, objects: ViewObjects) {
    const token = ++this.token;
    this.view = view;
    this.area = area;
    this.loading = true;
    this.canvas.discardActiveObject();
    await fontsFor(objects);
    if (token !== this.token) return;
    await this.canvas.loadFromJSON({ objects });
    if (token !== this.token) return;
    this.canvas.getObjects().forEach(decorate);
    this.applyViewport();
    this.current = JSON.stringify(objects);
    if (!this.stacks.has(view)) this.stacks.set(view, { undo: [], redo: [] });
    this.loading = false;
    this.emitHistory();
    this.emitSelection();
  }

  /** Forget undo history, e.g. when a different design is opened. */
  resetHistory() {
    this.stacks.clear();
  }

  /** The view's objects as saved. Names and numbers keep their placeholders: a roster row on show is only a preview. */
  private serialize(): ViewObjects {
    return this.canvas.getObjects().map((o) => {
      const json = o.toObject(CUSTOM_PROPS) as Record<string, unknown>;
      if (json.nn === "name") json.text = "NAME";
      if (json.nn === "number") json.text = "00";
      return json;
    });
  }

  private commit() {
    if (this.loading) return;
    const objects = this.serialize();
    const json = JSON.stringify(objects);
    if (json === this.current) return;
    const stack = this.stacks.get(this.view) ?? { undo: [], redo: [] };
    stack.undo.push(this.current);
    if (stack.undo.length > HISTORY_LIMIT) stack.undo.shift();
    stack.redo = [];
    this.stacks.set(this.view, stack);
    this.current = json;
    this.ev.onChange(this.view, objects);
    this.emitHistory();
  }

  private async restore(json: string) {
    const objects = JSON.parse(json) as ViewObjects;
    this.loading = true;
    await fontsFor(objects);
    await this.canvas.loadFromJSON({ objects });
    this.canvas.getObjects().forEach(decorate);
    this.applyViewport();
    this.current = json;
    this.loading = false;
    this.ev.onChange(this.view, objects);
    this.emitHistory();
    this.emitSelection();
  }

  async undo() {
    const s = this.stacks.get(this.view);
    const prev = s?.undo.pop();
    if (!s || prev === undefined) return;
    s.redo.push(this.current);
    await this.restore(prev);
  }

  async redo() {
    const s = this.stacks.get(this.view);
    const next = s?.redo.pop();
    if (!s || next === undefined) return;
    s.undo.push(this.current);
    await this.restore(next);
  }

  private emitHistory() {
    const s = this.stacks.get(this.view);
    this.ev.onHistory({ undo: !!s?.undo.length, redo: !!s?.redo.length });
  }

  // ── Adding ────────────────────────────────────────────────────────────────

  private get areaW() { return this.area.widthIn * 100; }
  private get areaH() { return this.area.heightIn * 100; }

  /** The usual spot for art on this view, in print units. */
  private get spot() {
    const f = focusOf(this.area);
    return { x: f.xIn * 100, top: f.topIn * 100, w: f.widthIn * 100, h: f.heightIn * 100 };
  }

  /** Where the spot's top-centre is, in inches, for laying out specs. */
  get spotOffset() {
    const f = focusOf(this.area);
    return { xIn: f.xIn, yIn: f.topIn };
  }

  private place(o: FabricObject, y?: number) {
    decorate(o);
    const sp = this.spot;
    o.setPositionByOrigin(new Point(sp.x, y ?? sp.top + Math.min(sp.h * 0.32, sp.h / 2)), "center", "center");
    o.setCoords();
    this.canvas.add(o);
    this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  async addText(text = "Your text here", fill = "#16181D") {
    await ensureFont(DEFAULT_FONT);
    const t = new IText(text, {
      fontFamily: DEFAULT_FONT,
      fontSize: Math.min(160, this.spot.w / 4),
      fill,
      textAlign: "center",
      paintFirst: "stroke",
      strokeWidth: 0,
      strokeLineJoin: "round",
      charSpacing: 0,
    });
    // Never wider than the spot it lands in (a sleeve's is 3.5 in).
    if (t.width > this.spot.w * 0.85) t.set({ fontSize: t.fontSize * ((this.spot.w * 0.85) / t.width) });
    t.initDimensions();
    tag(t, { uid: newId(), kind: "text", curve: 0 });
    this.place(t);
  }

  async addImage(img: PreparedImage) {
    const o = await FabricImage.fromURL(img.src);
    const maxW = this.spot.w * 0.7;
    const maxH = this.spot.h * 0.6;
    const ratio = img.height / img.width;
    const w = Math.min(maxW, maxH / ratio);
    o.scale(w / (o.width || 1));
    tag(o, { uid: newId(), kind: "image", srcW: img.width, label: img.name });
    this.place(o);
  }

  /** Swap the selected picture's file, keeping its size and place on the shirt. */
  async replaceImage(img: PreparedImage) {
    const o = this.active();
    if (!o || o.kind !== "image") return;
    const width = o.getScaledWidth();
    const centre = o.getCenterPoint();
    await (o as unknown as FabricImage).setSrc(img.src);
    o.scale(width / (o.width || 1));
    o.setPositionByOrigin(centre, "center", "center");
    o.setCoords();
    tag(o, { srcW: img.width, label: img.name });
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  /** The selected picture as it is on the canvas, for the image tools. */
  activeImageSrc(): string | null {
    const o = this.active();
    return o?.kind === "image" ? (o as unknown as FabricImage).getSrc() : null;
  }

  async addGraphic(graphicId: string, fill: string) {
    const o = await graphicObject(graphicId, fill);
    if (!o) return;
    o.scaleToWidth(this.spot.w * 0.36);
    this.place(o);
  }

  /** Lay out a set of objects (from AI design), optionally replacing what is there. */
  async addSpecs(specs: ObjectSpec[], replace: boolean) {
    const made = await buildSpecs(specs, this.spotOffset);
    this.canvas.discardActiveObject();
    if (replace) this.canvas.remove(...this.canvas.getObjects().filter((o) => !(o as Tagged).nn));
    made.forEach((o) => { decorate(o); o.setCoords(); this.canvas.add(o); });
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  /** The names-and-numbers placeholders on this view. */
  hasNn(kind: "name" | "number") {
    return this.canvas.getObjects().some((o) => (o as Tagged).nn === kind);
  }

  async setNn(kind: "name" | "number", on: boolean, fill: string) {
    const existing = this.canvas.getObjects().filter((o) => (o as Tagged).nn === kind);
    if (!on) {
      this.canvas.remove(...existing);
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      this.commit();
      this.emitSelection();
      return;
    }
    if (existing.length) return;
    const font = kind === "name" ? "Graduate" : "Anton";
    await ensureFont(font);
    const t = new IText(kind === "name" ? "NAME" : "00", {
      fontFamily: font,
      fontSize: kind === "name" ? 150 : Math.min(820, this.spot.h * 0.6),
      fill,
      textAlign: "center",
      charSpacing: kind === "name" ? 120 : 0,
      editable: false,
      paintFirst: "stroke",
      strokeWidth: 0,
      strokeLineJoin: "round",
    });
    tag(t, { uid: newId(), kind: "text", nn: kind, curve: 0 });
    const top = this.spot.top;
    this.place(t, kind === "name" ? top + 130 : top + 130 + 110 + (t.height * (t.scaleY ?? 1)) / 2);
  }

  /** Show a roster row on the placeholders. Not a change to the design. */
  previewRoster(name: string, number: string) {
    for (const o of this.canvas.getObjects() as (Tagged & IText)[]) {
      if (o.nn === "name") o.set({ text: name || "NAME" });
      if (o.nn === "number") o.set({ text: number || "00" });
      if (o.nn) {
        if (o.curve) applyCurve(o, o.curve);
        else { o.initDimensions(); o.setCoords(); }
      }
    }
    this.canvas.requestRenderAll();
  }

  // ── Editing the selection ─────────────────────────────────────────────────

  private active(): Tagged | null {
    const o = this.canvas.getActiveObject();
    return o && !(o instanceof ActiveSelection) ? (o as Tagged) : null;
  }

  async updateText(props: Partial<TextProps>) {
    const t = this.active() as (Tagged & IText) | null;
    if (!t || t.kind !== "text") return;
    if (props.fontFamily) {
      await ensureFont(props.fontFamily);
      cache.clearFontCache(props.fontFamily);
    }
    t.set(props);
    if (t.curve) applyCurve(t, t.curve);
    else { t.initDimensions(); t.setCoords(); }
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  setCurve(curve: number) {
    const t = this.active() as (Tagged & IText) | null;
    if (!t || t.kind !== "text") return;
    applyCurve(t, curve);
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  recolorGraphic(hex: string) {
    const o = this.active();
    if (!o || o.kind !== "graphic") return;
    const parts = "getObjects" in o ? (o as unknown as { getObjects(): FabricObject[] }).getObjects() : [o];
    for (const p of parts) {
      const white = typeof p.fill === "string" && /^#fff(fff)?$/i.test(p.fill);
      if (typeof p.fill === "string" && p.fill !== "none" && p.fill !== "" && !white) p.set({ fill: hex });
      if (typeof p.stroke === "string" && p.stroke !== "none" && p.stroke !== "") p.set({ stroke: hex });
    }
    o.dirty = true;
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  /** Make the selection `widthIn` inches wide, keeping its proportions. */
  setWidth(widthIn: number) {
    this.setSize({ widthIn }, true);
  }

  /**
   * Size the selection in inches. With `keepRatio`, one side drives the other;
   * without, width and height change independently (stretched art).
   */
  setSize(size: { widthIn?: number; heightIn?: number }, keepRatio: boolean) {
    const o = this.active();
    if (!o) return;
    const w = o.width || 1, h = o.height || 1;
    const centre = o.getCenterPoint();
    let sx = o.scaleX, sy = o.scaleY;
    if (size.widthIn && size.widthIn > 0) sx = (size.widthIn * 100) / w;
    if (size.heightIn && size.heightIn > 0) sy = (size.heightIn * 100) / h;
    if (keepRatio) {
      const k = size.widthIn ? sx / o.scaleX : sy / o.scaleY;
      sx = o.scaleX * k;
      sy = o.scaleY * k;
    }
    o.set({ scaleX: Math.max(0.01, sx), scaleY: Math.max(0.01, sy) });
    o.setPositionByOrigin(centre, "center", "center");
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  /** Turn the selection to `deg` degrees, about its centre. */
  setAngle(deg: number) {
    const o = this.active();
    if (!o) return;
    const centre = o.getCenterPoint();
    o.rotate(((deg % 360) + 360) % 360);
    o.setPositionByOrigin(centre, "center", "center");
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  rotateBy(deg: number) {
    const o = this.active();
    if (o) this.setAngle((o.angle ?? 0) + deg);
  }

  /** Put the selection's centre at (xIn, yIn): inches from the centre line and from the top of the print area. */
  setPosition(xIn: number, yIn: number) {
    const o = this.active();
    if (!o) return;
    o.setPositionByOrigin(new Point(xIn * 100, yIn * 100), "center", "center");
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  async duplicate() {
    const o = this.active();
    if (!o || o.nn) return;
    const copy = tag(await o.clone(CUSTOM_PROPS), { uid: newId() });
    copy.set({ left: o.left + 40, top: o.top + 40 });
    decorate(copy);
    copy.setCoords();
    this.canvas.add(copy);
    this.canvas.setActiveObject(copy);
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  remove() {
    const sel = this.canvas.getActiveObjects();
    if (!sel.length) return;
    if ((this.canvas.getActiveObject() as IText | undefined)?.isEditing) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(...sel);
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  layer(dir: "up" | "down") {
    const o = this.active();
    if (!o) return;
    if (dir === "up") this.canvas.bringObjectForward(o);
    else this.canvas.sendObjectBackwards(o);
    this.canvas.requestRenderAll();
    this.commit();
  }

  centre(axis: "x" | "y") {
    const o = this.active();
    if (!o) return;
    const c = o.getCenterPoint();
    o.setPositionByOrigin(new Point(axis === "x" ? 0 : c.x, axis === "y" ? this.areaH / 2 : c.y), "center", "center");
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  flip(axis: "x" | "y" = "x") {
    const o = this.active();
    if (!o) return;
    if (axis === "x") o.set({ flipX: !o.flipX });
    else o.set({ flipY: !o.flipY });
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Move by inches, from the arrow keys. */
  nudge(dxIn: number, dyIn: number) {
    const o = this.canvas.getActiveObject();
    if (!o || (o as IText).isEditing) return;
    o.set({ left: o.left + dxIn * 100, top: o.top + dyIn * 100 });
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
    this.emitSelection();
  }

  isEditingText() {
    return !!(this.canvas.getActiveObject() as IText | undefined)?.isEditing;
  }

  deselect() {
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  /** Pull the centre onto the print area's centre lines when it is close. */
  private snap(o?: FabricObject) {
    if (!o) return;
    const th = SNAP_PX / this.k;
    const c = o.getCenterPoint();
    const v = Math.abs(c.x) < th;
    const h = Math.abs(c.y - this.areaH / 2) < th;
    if (v || h) {
      o.setPositionByOrigin(new Point(v ? 0 : c.x, h ? this.areaH / 2 : c.y), "center", "center");
      o.setCoords();
    }
    this.ev.onGuides({ v, h });
  }

  private emitSelectionSoon() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.emitSelection());
  }

  private emitSelection() {
    const o = this.active();
    if (!o) { this.ev.onSelection(null); return; }
    const vpt = this.canvas.viewportTransform;
    const pts = o.getCoords();
    const screen = pts.map((p) => util.transformPoint(p, vpt));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const tol = 1;
    const outside =
      Math.min(...xs) < -this.areaW / 2 - tol || Math.max(...xs) > this.areaW / 2 + tol ||
      Math.min(...ys) < -tol || Math.max(...ys) > this.areaH + tol;
    const widthIn = o.getScaledWidth() / 100;
    const heightIn = o.getScaledHeight() / 100;
    const centre = o.getCenterPoint();

    const info: SelectionInfo = {
      id: o.uid ?? "",
      kind: o.kind ?? "image",
      widthIn,
      heightIn,
      badge: {
        x: screen.reduce((s, p) => s + p.x, 0) / screen.length,
        y: Math.max(...screen.map((p) => p.y)),
      },
      outside,
      angle: Math.round(((o.angle ?? 0) + 540) % 360 - 180),
      xIn: centre.x / 100,
      yIn: centre.y / 100,
      stretched: Math.abs(o.scaleX - o.scaleY) / Math.max(o.scaleX, o.scaleY) > 0.01,
    };
    if (o.kind === "image" && o.srcW) info.dpi = Math.round(o.srcW / widthIn);
    if (o.kind === "text") {
      const t = o as Tagged & IText;
      Object.assign(info, {
        text: t.text,
        fontFamily: t.fontFamily,
        fill: typeof t.fill === "string" ? t.fill : "#000000",
        stroke: typeof t.stroke === "string" ? t.stroke : "",
        strokeWidth: t.strokeWidth ?? 0,
        charSpacing: t.charSpacing ?? 0,
        curve: t.curve ?? 0,
        nn: t.nn,
      });
    }
    if (o.kind === "graphic") {
      const parts = "getObjects" in o ? (o as unknown as { getObjects(): FabricObject[] }).getObjects() : [o];
      const first = parts.find((p) => typeof p.fill === "string" && p.fill !== "none" && !/^#fff(fff)?$/i.test(p.fill as string))
        ?? parts.find((p) => typeof p.stroke === "string" && p.stroke !== "none");
      info.fill = (first && typeof first.fill === "string" && first.fill !== "none" ? first.fill : first?.stroke) as string | undefined;
    }
    this.ev.onSelection(info);
  }
}
