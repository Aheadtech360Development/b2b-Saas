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
import { ArrowUp, Copy, GripVertical, Trash2 } from "lucide-react";
import type { Breakpoint, BuilderNode, SiteDoc, SitePayload } from "@/lib/builder/types";
import { isContainer, parentOf, walk } from "@/lib/builder/tree";
import type { Position } from "@/lib/builder/tree";
import { labelOf } from "@/lib/builder/registry";
import { treeCss } from "@/lib/builder/style";
import { treeAt, type Target } from "@/lib/builder/doc";
import { SiteHead } from "@/components/builder/SiteParts";
import { Tree, type RenderCtx } from "@/components/builder/render";

export type DragPayload =
  | { add: string } | { preset: string } | { saved: string } | { shared: string } | { move: string };

export const DEVICE_WIDTH: Record<Breakpoint, number> = { desktop: 1280, tablet: 820, mobile: 390 };

interface Box { top: number; left: number; width: number; height: number }

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

  const measure = useCallback(() => {
    const next = { sel: boxOf(elFor(selected)), hover: hover && hover !== selected ? boxOf(elFor(hover)) : null };
    // Only when something moved: this runs after every render, and a new
    // object every time would render again, forever.
    setBoxes((prev) => (sameBox(prev.sel, next.sel) && sameBox(prev.hover, next.hover) ? prev : next));
  }, [boxOf, elFor, selected, hover]);

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
  const dropTarget = (x: number, y: number): { id: string; position: Position; el: HTMLElement } | null => {
    const hit = document.elementFromPoint(x, y);
    let id = frameRef.current?.contains(hit) ? resolve(hit) : null;
    if (!id) id = body.tree?.id ?? null;
    const el = elFor(id);
    const node = id ? nodes.get(id) : null;
    if (!id || !el || !node) return null;
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
    if (!t) { setDrop(null); return; }
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
    if (t) onDrop(drag, t.id, t.position);
  };

  const selNode = selected ? nodes.get(selected) : null;
  const hoverNode = hover ? nodes.get(hover) : null;
  const chipBelow = !!boxes.sel && boxes.sel.top < 30;

  return (
    <div ref={viewRef} className="sbe-canvas"
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
             onPointerLeave={() => setHover(null)}>
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
          {boxes.hover && hoverNode && !drop && (
            <div className="sbe-hover" style={boxes.hover}>
              <span className="sbe-hchip">{labelOf(hoverNode)}</span>
            </div>
          )}
          {boxes.sel && selNode && (
            <div className="sbe-sel" style={boxes.sel}>
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
          {drop?.box && <div className="sbe-drop-box" style={drop.box}><span className="sbe-hchip" style={{ background: "#4F46E5" }}>{drop.label}</span></div>}
          {drop?.line && <div className="sbe-drop-line" style={drop.line}><span className="sbe-hchip" style={{ background: "#4F46E5", bottom: 6 }}>{drop.label}</span></div>}
        </div>
      </div>
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
