"use client";

/**
 * The page being edited, drawn by the storefront's own renderer.
 *
 * The canvas is the real width of the device — 1280px for desktop, 820 for a
 * tablet, 390 for a phone — scaled down to fit the window when it has to be.
 * Rendering a desktop page in a 900px gap would show the tablet layout (the
 * breakpoints are container queries on the page's own width), so it is drawn
 * full size and shrunk, never squeezed.
 *
 * Outlines, labels and the drop line are drawn on a layer over the page, in
 * screen pixels, so they stay crisp and clickable at any scale. Clicks inside
 * the page select; nothing navigates, submits or adds to a cart.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import type { Breakpoint, BuilderNode, SiteDoc, SitePayload, TemplateType } from "@/lib/builder/types";
import { canContain, isContainer, parentOf, walk } from "@/lib/builder/tree";
import type { Position } from "@/lib/builder/tree";
import { labelOf } from "@/lib/builder/registry";
import { treeCss } from "@/lib/builder/style";
import { treeAt, type Target } from "@/lib/builder/doc";
import { SiteHead } from "@/components/builder/SiteParts";
import { Tree, type RenderCtx } from "@/components/builder/render";
import { InsertMenu } from "./InsertMenu";

export type DragPayload =
  | { add: string } | { preset: string } | { layout: string } | { saved: string } | { shared: string } | { move: string };

export const DEVICE_WIDTH: Record<Breakpoint, number> = { desktop: 1280, tablet: 820, mobile: 390 };

interface Box { top: number; left: number; width: number; height: number }
interface Cell { col: number; row: number; box: Box }
/** A + on the canvas: add something at this spot, relative to an element. */
interface PlusAt { key: string; targetId: string; position: Position; left: number; top: number; label: string }
const PLUS = 22;

const INLINE_TEXT = new Set(["heading", "text", "button", "link", "announcement_bar"]);

export interface CanvasProps {
  doc: SiteDoc;
  target: Target;
  data: SitePayload["data"];
  customFaces: SitePayload["fonts"]["custom"];
  device: Breakpoint;
  selected: string | null;
  epoch: number;
  dragRef: React.MutableRefObject<DragPayload | null>;
  onSelect: (id: string | null) => void;
  onDrop: (drag: DragPayload, targetId: string, position: Position) => void;
  /** Dropped on a free cell of a grid: put it there. */
  onDropCell: (drag: DragPayload, gridId: string, col: number, row: number) => void;
  /** A grid item's corner dragged: it now starts at col/row and spans this many cells. */
  onSpan: (gridId: string, childId: string, col: number, row: number, colSpan: number, rowSpan: number) => void;
  onInlineText: (id: string, text: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRemount: () => void;
}

/** What the canvas shows for a target: the body tree, and the page it is a template for. */
export function bodyFor(doc: SiteDoc, target: Target): { tree: BuilderNode | null; page: RenderCtx["page"]; chrome: boolean } {
  if (target.kind === "page") {
    const page = doc.pages?.[target.slug];
    const tid = page?.template || doc.assignments?.page?.default || "default";
    const tpl = doc.templates?.page?.[tid] ?? doc.templates?.page?.default;
    return { tree: tpl?.tree ?? null, page: page ? { title: page.title, tree: page.tree } : null, chrome: true };
  }
  if (target.kind === "template") {
    const first = Object.values(doc.pages ?? {})[0];
    return {
      tree: treeAt(doc, target),
      page: target.type === "page" ? (first ? { title: first.title, tree: first.tree } : { title: "Page title", tree: null }) : null,
      chrome: true,
    };
  }
  if (target.kind === "part") {
    return { tree: doc.templates?.home?.default?.tree ?? null, page: null, chrome: true };
  }
  return { tree: treeAt(doc, target), page: null, chrome: false };
}

export function Canvas(props: CanvasProps) {
  const { doc, target, data, customFaces, device, selected, epoch, dragRef, onSelect, onDrop, onInlineText } = props;
  const viewRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(1200);
  const [frameH, setFrameH] = useState(800);
  const [hover, setHover] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<{ sel: Box | null; hover: Box | null }>({ sel: null, hover: null });
  const [drop, setDrop] = useState<{ line?: Box; box?: Box; label: string } | null>(null);
  // The grid whose cells are drawn: the one being dragged over, else the
  // selected grid, else the grid the selected item sits in.
  const [dragGrid, setDragGrid] = useState<string | null>(null);
  const [cells, setCells] = useState<{ id: string; cells: Cell[] } | null>(null);
  // The + buttons around what is selected and what the pointer is over, and
  // the one whose menu is open.
  const [plus, setPlus] = useState<PlusAt[]>([]);
  const [insert, setInsert] = useState<(PlusAt & { x: number; y: number }) | null>(null);
  const editing = useRef(false);

  const width = DEVICE_WIDTH[device];
  const scale = Math.min(1, avail / width);

  const body = bodyFor(doc, target);
  const parts = body.chrome
    ? { announcement: doc.parts?.announcement ?? null, header: doc.parts?.header ?? null, footer: doc.parts?.footer ?? null }
    : { announcement: null, header: null, footer: null };
  const globals = useMemo(
    () => Object.fromEntries(Object.entries(doc.globals ?? {}).map(([k, v]) => [k, v.tree])),
    [doc.globals],
  );

  // Every element the merchant can select on this canvas, and what it is.
  const nodes = useMemo(() => {
    const map = new Map<string, BuilderNode>();
    for (const t of [parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer]) walk(t, (n) => { map.set(n.id, n); });
    return map;
  }, [parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer]);
  const roots = useMemo(() => new Set([parts.announcement?.id, parts.header?.id, body.tree?.id, parts.footer?.id].filter(Boolean) as string[]),
    [parts.announcement, parts.header, body.tree, parts.footer]);

  const ctx: RenderCtx = {
    data, globals, page: body.page, query: "", route: target.kind === "template" ? target.type : target.kind === "page" ? "page" : "home",
    edit: true, trusted: false,
  };

  const fonts = useMemo(() => ({
    google: (doc.settings?.fonts ?? []).filter((f) => f.source === "google")
      .map((f) => ({ family: f.family, weights: f.weights ?? [400], italic: (f.styles ?? []).includes("italic") })),
    custom: customFaces.filter((c) => (doc.settings?.fonts ?? []).some((f) => f.source === "custom" && f.family === c.family)),
  }), [doc.settings?.fonts, customFaces]);

  const css = useMemo(
    () => treeCss(parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer, ...Object.values(globals)),
    [parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer, globals],
  );

  // ── Measuring ──
  useEffect(() => {
    const view = viewRef.current;
    const frame = frameRef.current;
    if (!view || !frame) return;
    const ro = new ResizeObserver(() => {
      setAvail(Math.max(280, view.clientWidth - 56));
      setFrameH(frame.offsetHeight);
    });
    ro.observe(view);
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  const elFor = useCallback((id: string | null): HTMLElement | null => {
    if (!id || !frameRef.current) return null;
    return frameRef.current.querySelector<HTMLElement>(`[data-b="${CSS.escape(id)}"]`);
  }, []);

  const boxOf = useCallback((el: HTMLElement | null): Box | null => {
    const wrap = wrapRef.current;
    if (!el || !wrap) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const w = wrap.getBoundingClientRect();
    return { top: r.top - w.top, left: r.left - w.left, width: r.width, height: r.height };
  }, []);

  /** The element that lays a grid container's children out, when it is a grid right now. */
  const gridEl = useCallback((id: string | null): HTMLElement | null => {
    const el = elFor(id);
    const node = id ? nodes.get(id) : null;
    // Only containers lay children out in cells. A product grid or a gallery is
    // drawn with CSS grid too, but holds no children: dropping "into" it means
    // before or after it, as it always has.
    if (!el || !node || !isContainer(node.type)) return null;
    const inner = node.type === "section" ? el.querySelector<HTMLElement>(":scope > .b-in") : el;
    return inner && getComputedStyle(inner).display === "grid" ? inner : null;
  }, [elFor, nodes]);

  /** Where each cell of a grid is on screen, from the tracks the browser laid out. */
  const cellsOf = useCallback((el: HTMLElement): Cell[] => {
    const wrap = wrapRef.current;
    if (!wrap) return [];
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const k = r.width / Math.max(1, el.offsetWidth);
    const tracks = (v: string) => (v && v !== "none" ? v.split(/\s+/).map(parseFloat).filter((n) => Number.isFinite(n)) : []);
    const cols = tracks(cs.gridTemplateColumns);
    let rows = tracks(cs.gridTemplateRows);
    if (!cols.length) return [];
    if (!rows.length) rows = [Math.max(56, el.clientHeight)];
    const cg = parseFloat(cs.columnGap) || 0;
    const rg = parseFloat(cs.rowGap) || 0;
    const left0 = r.left - w.left + (parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)) * k;
    const top0 = r.top - w.top + (parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop)) * k;
    const out: Cell[] = [];
    let y = 0;
    rows.forEach((rh, ri) => {
      const h = Math.max(rh, 40);
      let x = 0;
      cols.forEach((cw, ci) => {
        out.push({ col: ci + 1, row: ri + 1, box: { left: left0 + x * k, top: top0 + y * k, width: cw * k, height: h * k } });
        x += cw + cg;
      });
      y += h + rg;
    });
    return out;
  }, []);

  const parentNode = useCallback((id: string): BuilderNode | null => {
    const tree = [parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer].find((t) => t && findIn(t, id));
    return tree ? parentOf(tree, id)?.parent ?? null : null;
  }, [parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer]);

  /**
   * The + buttons for one element. Between things, the + sits on the edge they
   * share: above and below in a column of elements, left and right where they
   * run across. Inside an empty box it sits in the middle. A column of a row
   * takes things into itself — a row holds only columns — and so does the
   * page, whose + adds to its end.
   */
  const plusFor = useCallback((id: string | null): PlusAt[] => {
    const node = id ? nodes.get(id) : null;
    const el = elFor(id);
    const box = boxOf(el);
    const wrap = wrapRef.current;
    if (!id || !node || !el || !box || !wrap) return [];
    const maxLeft = wrap.clientWidth - PLUS - 2;
    const maxTop = wrap.clientHeight - PLUS - 2;
    const at = (position: Position, left: number, top: number, label: string): PlusAt => ({
      key: `${id}:${position}`, targetId: id, position, label,
      left: Math.round(Math.max(2, Math.min(left, maxLeft))), top: Math.round(Math.max(2, Math.min(top, maxTop))),
    });
    const cx = box.left + box.width / 2 - PLUS / 2;
    const cy = box.top + box.height / 2 - PLUS / 2;
    const empty = isContainer(node.type) && node.type !== "row" && !(node.children ?? []).length;
    if (roots.has(id)) return [at("inside", cx, empty ? cy : box.top + box.height - PLUS - 6, "Add at the end")];
    if (node.type === "column") return [at("inside", cx, empty ? cy : box.top + box.height - PLUS / 2, "Add to this column")];
    const ps = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const across = !!ps && ((ps.display.includes("flex") && ps.flexDirection.startsWith("row"))
      || (ps.display.includes("grid") && ps.gridTemplateColumns.trim().split(/\s+/).length > 1));
    const out: PlusAt[] = [];
    if (across) {
      out.push(at("before", box.left - PLUS / 2, cy, "Add before"));
      out.push(at("after", box.left + box.width - PLUS / 2, cy, "Add after"));
    } else {
      // Clear of the name tag, which sits at the top left of a narrow element.
      out.push(at("before", box.width < 420 ? box.left + box.width - PLUS - 4 : cx, box.top - PLUS / 2, "Add above"));
      out.push(at("after", cx, box.top + box.height - PLUS / 2, "Add below"));
    }
    if (empty) out.push(at("inside", cx, cy, "Add inside"));
    return out;
  }, [nodes, elFor, boxOf, roots]);

  const measure = useCallback(() => {
    const next = { sel: boxOf(elFor(selected)), hover: hover && hover !== selected ? boxOf(elFor(hover)) : null };
    // Only when something moved: this runs after every render, and a new
    // object every time would render again, forever.
    setBoxes((prev) => (sameBox(prev.sel, next.sel) && sameBox(prev.hover, next.hover) ? prev : next));
    let gid: string | null = dragGrid;
    if (!gid && selected) {
      if (gridEl(selected)) gid = selected;
      else {
        const p = parentNode(selected);
        if (p && gridEl(p.id)) gid = p.id;
      }
    }
    const g = gid ? gridEl(gid) : null;
    const nextCells = g && gid ? { id: gid, cells: cellsOf(g) } : null;
    setCells((prev) => (JSON.stringify(prev) === JSON.stringify(nextCells) ? prev : nextCells));
    const seen = new Set<string>();
    const nextPlus = editing.current ? [] : [...plusFor(selected), ...(hover && hover !== selected ? plusFor(hover) : [])]
      .filter((b) => (seen.has(b.key) ? false : (seen.add(b.key), true)));
    setPlus((prev) => (JSON.stringify(prev) === JSON.stringify(nextPlus) ? prev : nextPlus));
  }, [boxOf, elFor, selected, hover, dragGrid, gridEl, parentNode, cellsOf, plusFor]);

  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const later = () => requestAnimationFrame(measure);
    frame.addEventListener("load", later, true);
    window.addEventListener("resize", later);
    return () => { frame.removeEventListener("load", later, true); window.removeEventListener("resize", later); };
  }, [measure]);

  // A newly selected element is brought into view.
  useEffect(() => {
    const el = elFor(selected);
    const view = viewRef.current;
    if (!el || !view) return;
    const r = el.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    if (r.top < v.top + 40 || r.top > v.bottom - 80) view.scrollBy({ top: r.top - v.top - 120, behavior: "smooth" });
  }, [selected, elFor]);

  /** The selectable element a DOM node belongs to. */
  const resolve = useCallback((start: EventTarget | null): string | null => {
    let el = start instanceof Element ? start.closest<HTMLElement>("[data-b]") : null;
    while (el && frameRef.current?.contains(el)) {
      const id = el.dataset.b ?? "";
      if (nodes.has(id)) return id;
      el = el.parentElement?.closest<HTMLElement>("[data-b]") ?? null;
    }
    return null;
  }, [nodes]);

  // ── Selecting ──
  const onClickCapture = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editing.current) return;
    onSelect(resolve(e.target));
  };

  const onDoubleClickCapture = (e: React.MouseEvent) => {
    const id = resolve(e.target);
    const node = id ? nodes.get(id) : null;
    const el = elFor(id);
    if (!node || !el || !INLINE_TEXT.has(node.type)) return;
    e.preventDefault();
    e.stopPropagation();
    editing.current = true;
    const field = node.type === "announcement_bar" && el.querySelector("a") ? el.querySelector("a")! : el;
    const original = field.textContent ?? "";
    try { field.contentEditable = "plaintext-only"; } catch { field.contentEditable = "true"; }
    if (field.contentEditable !== "plaintext-only") field.contentEditable = "true";
    field.style.outline = "none";
    field.style.cursor = "text";
    field.focus();
    const range = document.createRange();
    range.selectNodeContents(field);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const finish = (save: boolean) => {
      field.removeEventListener("blur", onBlur);
      field.removeEventListener("keydown", onKey);
      const text = (field.innerText ?? "").replace(/ /g, " ").replace(/\n$/, "");
      field.contentEditable = "false";
      field.textContent = original;
      editing.current = false;
      if (save && text !== original) onInlineText(node.id, node.type === "text" ? text : text.replace(/\s*\n\s*/g, " "));
      props.onRemount();
    };
    const onBlur = () => finish(true);
    const onKey = (k: KeyboardEvent) => {
      k.stopPropagation();
      if (k.key === "Escape") { k.preventDefault(); finish(false); }
      if (k.key === "Enter" && !(node.type === "text" && k.shiftKey)) { k.preventDefault(); field.blur(); }
    };
    field.addEventListener("blur", onBlur);
    field.addEventListener("keydown", onKey);
  };

  // ── Dropping ──
  const dropTarget = (x: number, y: number): { id: string; position: Position; el: HTMLElement; cell?: Cell } | null => {
    const hit = document.elementFromPoint(x, y);
    let id = frameRef.current?.contains(hit) ? resolve(hit) : null;
    if (!id) id = body.tree?.id ?? null;
    const el = elFor(id);
    const node = id ? nodes.get(id) : null;
    if (!id || !el || !node) return null;
    // Over a grid itself — a free cell or the gap between cells, not one of its
    // children: the drop goes into the cell under the pointer.
    const g = gridEl(id);
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (g && wrap) {
      const px = x - wrap.left;
      const py = y - wrap.top;
      const cell = cellsOf(g).find((c) => px >= c.box.left && px <= c.box.left + c.box.width && py >= c.box.top && py <= c.box.top + c.box.height);
      if (cell) return { id, position: "inside", el, cell };
    }
    const r = el.getBoundingClientRect();
    // Columns of a row, and things in an across-stack, sit side by side: there
    // "before" is to the left.
    const tree = [parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer].find((t) => t && findIn(t, id!));
    const parent = tree ? parentOf(tree, id) : null;
    const across = parent?.parent.type === "row" || (parent?.parent.type === "stack" && (parent.parent.props as Record<string, unknown> | undefined)?.direction === "row");
    const ratio = across ? (x - r.left) / Math.max(1, r.width) : (y - r.top) / Math.max(1, r.height);
    let position: Position;
    if (roots.has(id)) position = "inside";
    else if (isContainer(node.type)) position = ratio < 0.22 ? "before" : ratio > 0.78 ? "after" : "inside";
    else position = ratio < 0.5 ? "before" : "after";
    return { id, position, el };
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move" in dragRef.current ? "move" : "copy";
    const view = viewRef.current;
    if (view) {
      const v = view.getBoundingClientRect();
      if (e.clientY < v.top + 56) view.scrollBy({ top: -18 });
      else if (e.clientY > v.bottom - 56) view.scrollBy({ top: 18 });
    }
    const t = dropTarget(e.clientX, e.clientY);
    if (!t) { setDrop(null); setDragGrid(null); return; }
    if (t.cell) {
      setDragGrid(t.id);
      setDrop({ box: t.cell.box, label: `Row ${t.cell.row}, column ${t.cell.col}` });
      return;
    }
    if (dragGrid) setDragGrid(null);
    const b = boxOf(t.el);
    if (!b) { setDrop(null); return; }
    const node = nodes.get(t.id)!;
    const tree = [parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer].find((tr) => tr && findIn(tr, t.id));
    const parent = tree ? parentOf(tree, t.id) : null;
    const across = parent?.parent.type === "row" || (parent?.parent.type === "stack" && (parent.parent.props as Record<string, unknown> | undefined)?.direction === "row");
    if (t.position === "inside") {
      setDrop({ box: b, label: `Into ${labelOf(node)}` });
    } else if (across) {
      setDrop({ line: { top: b.top, left: t.position === "before" ? b.left - 2 : b.left + b.width - 2, width: 4, height: b.height },
                label: `${t.position === "before" ? "Before" : "After"} ${labelOf(node)}` });
    } else {
      setDrop({ line: { top: t.position === "before" ? b.top - 2 : b.top + b.height - 2, left: b.left, width: b.width, height: 4 },
                label: `${t.position === "before" ? "Above" : "Below"} ${labelOf(node)}` });
    }
  };

  const onDropEvent = (e: React.DragEvent) => {
    const drag = dragRef.current;
    setDrop(null);
    if (!drag) return;
    e.preventDefault();
    const t = dropTarget(e.clientX, e.clientY);
    dragRef.current = null;
    setDragGrid(null);
    if (t?.cell) props.onDropCell(drag, t.id, t.cell.col, t.cell.row);
    else if (t) onDrop(drag, t.id, t.position);
  };

  // ── Spanning: drag the corner of an item in a grid across the cells ──
  const spanning = useRef<{ gridId: string; childId: string; col: number; row: number; last: string } | null>(null);
  const startSpan = (e: React.PointerEvent) => {
    if (!selected) return;
    const p = parentNode(selected);
    const g = p ? gridEl(p.id) : null;
    const el = elFor(selected);
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!p || !g || !el || !wrap) return;
    e.preventDefault();
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    const all = cellsOf(g);
    const at = (x: number, y: number) => all.find((c) => x >= c.box.left && x <= c.box.left + c.box.width + 4 && y >= c.box.top && y <= c.box.top + c.box.height + 4);
    const start = at(r.left - wrap.left + 2, r.top - wrap.top + 2) ?? all[0];
    if (!start) return;
    spanning.current = { gridId: p.id, childId: selected, col: start.col, row: start.row, last: "" };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveSpan = (e: React.PointerEvent) => {
    const sp = spanning.current;
    const wrap = wrapRef.current?.getBoundingClientRect();
    const g = sp ? gridEl(sp.gridId) : null;
    if (!sp || !wrap || !g) return;
    const x = e.clientX - wrap.left;
    const y = e.clientY - wrap.top;
    const all = cellsOf(g);
    const cell = all.find((c) => x >= c.box.left && x <= c.box.left + c.box.width && y >= c.box.top && y <= c.box.top + c.box.height);
    if (!cell) return;
    const colSpan = Math.max(1, cell.col - sp.col + 1);
    const rowSpan = Math.max(1, cell.row - sp.row + 1);
    const key = `${colSpan}x${rowSpan}`;
    if (key === sp.last) return;
    sp.last = key;
    props.onSpan(sp.gridId, sp.childId, sp.col, sp.row, colSpan, rowSpan);
  };
  const endSpan = () => { spanning.current = null; };

  const hereFor = (id: string): TemplateType | null => {
    // The header, footer and announcement bar are on every kind of page.
    for (const t of [parts.announcement, parts.header, parts.footer]) if (t && findIn(t, id)) return null;
    if (target.kind === "template") return target.type;
    if (target.kind === "page") return "page";
    return target.kind === "part" ? "home" : null;
  };
  const sectionFits = (b: PlusAt): boolean => {
    const node = nodes.get(b.targetId);
    const holder = b.position === "inside" ? node : parentNode(b.targetId) ?? node;
    return !!holder && canContain(holder.type, "section");
  };
  const openInsert = (b: PlusAt, e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setInsert({ ...b, x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const selNode = selected ? nodes.get(selected) : null;
  const hoverNode = hover ? nodes.get(hover) : null;
  const chipBelow = !!boxes.sel && boxes.sel.top < 30;

  return (
    <div ref={viewRef} className="sbe-canvas"
         onScroll={() => { if (insert) setInsert(null); }}
         onDragOver={onDragOver} onDrop={onDropEvent}
         onDragLeave={(e) => { if (!viewRef.current?.contains(e.relatedTarget as Node)) setDrop(null); }}
         onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
      <div ref={wrapRef} className="sbe-frame-wrap" style={{ width: width * scale, height: frameH * scale }}
           onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
        <div ref={frameRef} className="sbe-frame" data-device={device}
             style={{ width, transform: scale < 1 ? `scale(${scale})` : undefined }}
             onClickCapture={onClickCapture} onDoubleClickCapture={onDoubleClickCapture}
             onSubmitCapture={(e) => e.preventDefault()}
             onPointerMove={(e) => { if (editing.current) return; const id = resolve(e.target); if (id !== hover) setHover(id); }}
             onPointerLeave={(e) => {
               const to = e.relatedTarget;
               if (to instanceof Element && to.closest(".sbe-plus")) return;
               setHover(null);
             }}>
          <SiteHead settings={doc.settings ?? {}} fonts={fonts} />
          <style dangerouslySetInnerHTML={{ __html: css.replace(/<\/?style/gi, "") }} />
          <div key={epoch} style={{ minHeight: 480 }}>
            {parts.announcement && <div className="bsite" data-part="announcement"><div className="bsite-in"><Tree tree={parts.announcement} ctx={ctx} /></div></div>}
            {parts.header && <div className="bsite" data-part="header"><div className="bsite-in"><Tree tree={parts.header} ctx={ctx} /></div></div>}
            <div className="bsite" data-route={ctx.route} style={{ minHeight: 360 }}>
              <div className="bsite-in">
                {body.tree ? <Tree tree={body.tree} ctx={ctx} /> : <div className="b-note" style={{ margin: 24 }}>This template is empty.</div>}
              </div>
            </div>
            {parts.footer && <div className="bsite" data-part="footer"><div className="bsite-in"><Tree tree={parts.footer} ctx={ctx} /></div></div>}
          </div>
        </div>

        <div className="sbe-overlay">
          {cells && cells.cells.map((c) => (
            <div key={`${c.row}-${c.col}`} className="sbe-cell" style={c.box}>
              <span>{(c.row - 1) * Math.max(...cells.cells.map((x) => x.col)) + c.col}</span>
            </div>
          ))}
          {boxes.hover && hoverNode && !drop && (
            <div className="sbe-hover" style={boxes.hover}>
              <span className="sbe-hchip">{labelOf(hoverNode)}</span>
            </div>
          )}
          {boxes.sel && selNode && (
            <div className="sbe-sel" style={boxes.sel}>
              {cells && selNode && cells.id !== selNode.id && (
                <div className="sbe-span-handle" role="slider" aria-label="Drag to span cells" title="Drag to span more cells"
                     onPointerDown={startSpan} onPointerMove={moveSpan} onPointerUp={endSpan} onPointerCancel={endSpan} />
              )}
              <div className={`sbe-chip${chipBelow ? " below" : ""}`}>
                <span style={{ marginRight: 4, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{labelOf(selNode)}</span>
                {!roots.has(selNode.id) && (
                  <button type="button" className="drag" draggable title="Drag to move" aria-label="Drag to move"
                          onDragStart={(e) => { dragRef.current = { move: selNode.id }; e.dataTransfer.setData("text/plain", selNode.id); e.dataTransfer.effectAllowed = "move"; }}
                          onDragEnd={() => { dragRef.current = null; setDrop(null); }}>
                    <GripVertical size={14} />
                  </button>
                )}
                <button type="button" title="Select the parent" aria-label="Select the parent"
                        onClick={() => {
                          const tree = [parts.announcement, parts.header, body.tree, body.page?.tree, parts.footer].find((t) => t && findIn(t, selNode.id));
                          const p = tree ? parentOf(tree, selNode.id) : null;
                          if (p) onSelect(p.parent.id);
                        }}><ArrowUp size={14} /></button>
                {!roots.has(selNode.id) && <button type="button" title="Duplicate" aria-label="Duplicate" onClick={props.onDuplicate}><Copy size={14} /></button>}
                {!roots.has(selNode.id) && <button type="button" title="Delete" aria-label="Delete" onClick={props.onRemove}><Trash2 size={14} /></button>}
              </div>
            </div>
          )}
          {!drop && (insert ? [insert, ...plus.filter((b) => b.key !== insert.key)] : plus).map((b) => (
            <button key={b.key} type="button" className={`sbe-plus${insert?.key === b.key ? " on" : ""}`} style={{ left: b.left, top: b.top }}
                    title={b.label} aria-label={b.label} data-plus={b.position}
                    onClick={(e) => openInsert(b, e)}
                    onPointerLeave={(e) => {
                      const to = e.relatedTarget;
                      if (to instanceof Node && (frameRef.current?.contains(to) || (to instanceof Element && to.closest(".sbe-plus")))) return;
                      setHover(null);
                    }}>
              <Plus size={14} strokeWidth={3} />
            </button>
          ))}
          {drop?.box && <div className="sbe-drop-box" style={drop.box}><span className="sbe-hchip" style={{ background: "#4F46E5" }}>{drop.label}</span></div>}
          {drop?.line && <div className="sbe-drop-line" style={drop.line}><span className="sbe-hchip" style={{ background: "#4F46E5", bottom: 6 }}>{drop.label}</span></div>}
        </div>
      </div>
      {insert && (
        <InsertMenu at={{ x: insert.x, y: insert.y }} here={hereFor(insert.targetId)} doc={doc} sections={sectionFits(insert)}
                    onClose={() => setInsert(null)}
                    onPick={(payload) => { const b = insert; setInsert(null); onDrop(payload, b.targetId, b.position); }} />
      )}
    </div>
  );
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

function findIn(tree: BuilderNode, id: string): boolean {
  let found = false;
  walk(tree, (n) => { if (n.id === id) found = true; });
  return found;
}
