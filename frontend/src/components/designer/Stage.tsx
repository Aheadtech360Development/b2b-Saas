"use client";

import {
  AlertTriangle, AlignCenterHorizontal, AlignCenterVertical, ArrowDownToLine, ArrowUpToLine, Copy,
  FlipHorizontal2, Pencil, Redo2, Sparkles, Trash2, Type, Undo2, Upload,
} from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { inkFor } from "@/lib/designer/colors";
import { ACCEPTED, printQuality } from "@/lib/designer/images";
import { areaRect, focusRect, mockupSvg, PRINT_AREAS, svgDataUrl } from "@/lib/designer/mockups";
import { hardLight, photoFor } from "@/lib/designer/photo";
import { VIEW_LABEL } from "@/lib/designer/types";
import { designOf, useDesigner } from "@/stores/designer.store";
import { ControllerContext, useActiveGarment, useShirt } from "./context";
import { DesignController } from "./controller";
import s from "./designer.module.css";
import { addImageFile } from "./panels/UploadPanel";

const QUALITY_DOT = { good: "#3DD68C", ok: "#F5B83D", low: "#FF6B5A" };

export function Stage() {
  const { ctrl, setCtrl } = useContext(ControllerContext);
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const notesBtn = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);

  const view = useDesigner((st) => st.view);
  const zoom = useDesigner((st) => st.zoom);
  const sel = useDesigner((st) => st.selection);
  const guides = useDesigner((st) => st.guides);
  const history = useDesigner((st) => st.history);
  const docId = useDesigner((st) => st.doc?.id);
  const rev = useDesigner((st) => st.rev);
  const notes = useDesigner((st) => st.doc?.notes ?? "");
  const { key: shirtKey, design } = useShirt();
  const hasArt = (design?.[view].length ?? 0) > 0;
  const { setPanel, setNotes } = useDesigner.getState();
  const { garment, hex } = useActiveGarment();
  const silhouette = garment?.silhouette ?? "tee";
  const area = PRINT_AREAS[silhouette][view];

  // Selecting art opens the panel that edits it. A name or number stays in
  // Names & numbers if that is where the buyer is working.
  const selId = sel?.id;
  useEffect(() => {
    const cur = useDesigner.getState();
    const picked = cur.selection;
    if (!selId || !picked) return;
    if (picked.nn && cur.panel === "names") return;
    cur.setPanel(picked.kind === "image" ? "upload" : picked.kind === "graphic" ? "graphics" : "text");
  }, [selId]);

  // One canvas for the life of the designer. Fabric wraps the element in its
  // own container, so the element is made here rather than rendered by React.
  useEffect(() => {
    const el = document.createElement("canvas");
    host.current?.appendChild(el);
    const st = useDesigner.getState();
    const c = new DesignController(el, {
      onChange: (v, objects) => st.setViewObjects(v, objects),
      onSelection: (info) => useDesigner.getState().setSelection(info),
      onHistory: (h) => useDesigner.getState().setHistory(h),
      onGuides: (g) => useDesigner.getState().setGuides(g),
    });
    setCtrl(c);
    const box = host.current;
    return () => {
      c.dispose();
      setCtrl(null);
      if (box) box.innerHTML = "";
    };
  }, [setCtrl]);

  // The stage is a square that fits the space it has.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize(Math.max(240, Math.floor(Math.min(width, height) - 24)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ctrl || !size) return;
    ctrl.layout(size, zoom);
    // Zoomed in, keep the usual spot for art (the chest, a sleeve) in view.
    const sc = scroller.current;
    if (sc && zoom > 1) {
      const S = size * zoom;
      const r = focusRect(area);
      sc.scrollLeft = (r.left + r.width / 2) * (S / 1000) - sc.clientWidth / 2;
      sc.scrollTop = (r.top + r.height / 2) * (S / 1000) - sc.clientHeight / 2;
    }
  }, [ctrl, size, zoom, area]);

  // A different view, garment or design: put its art on the canvas.
  useEffect(() => {
    if (!ctrl) return;
    const doc = useDesigner.getState().doc;
    if (!doc) return;
    void ctrl.show(view, area, designOf(doc, shirtKey)[view]);
  }, [ctrl, view, area, docId, shirtKey, rev]);

  // Undo is per shirt: switching shirts starts its own history.
  useEffect(() => { ctrl?.resetHistory(); }, [ctrl, docId, shirtKey]);

  const photo = photoFor(silhouette, view);
  const drawing = useMemo(() => (photo ? null : svgDataUrl(mockupSvg(silhouette, view, hex))), [photo, silhouette, view, hex]);
  // What the art is masked by: the garment's outline, which does not change with colour.
  const outline = photo ?? drawing;

  const S = size * zoom;
  const unit = S / 1000;
  const r = areaRect(area);
  const quality = sel?.dpi ? printQuality(sel.dpi) : null;

  return (
    <div className={s.stageWrap} ref={wrap}>
      <div
        className={s.stageScroll}
        ref={scroller}
        onPointerDown={(e) => { if (e.target === e.currentTarget) ctrl?.deselect(); }}
      >
        <div className={s.stageInner} style={{ width: S, height: S, visibility: size ? "visible" : "hidden" }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) ctrl?.deselect(); }}>
          {photo ? (
            // The colour, cut to the garment's outline, with the photo's folds blended over it.
            <div className={s.photoGarment} role="img" aria-label={`${garment?.name ?? "Garment"}, ${VIEW_LABEL[view].toLowerCase()}`}
              style={{ background: hex, ["--photo" as string]: `url("${photo}")` }}>
              <img src={photo} alt="" draggable={false} style={{ mixBlendMode: "soft-light" }} />
              <img src={photo} alt="" draggable={false} style={{ mixBlendMode: "soft-light" }} />
              <img src={photo} alt="" draggable={false} style={{ mixBlendMode: "hard-light", opacity: hardLight(hex) }} />
            </div>
          ) : (
            drawing && <img className={s.mockup} src={drawing} alt={`${garment?.name ?? "Garment"}, ${VIEW_LABEL[view].toLowerCase()}`} draggable={false} />
          )}
          <div
            className={s.printArea}
            // The whole shirt prints: its outline is the edge, so no box is drawn around it.
            style={{ left: r.left * unit, top: r.top * unit, width: r.width * unit, height: r.height * unit, ...(area.whole ? { borderColor: "transparent" } : null) }}
          >
            {(sel || !hasArt) && (
              <span className={s.printAreaLabel}>
                {area.whole ? "Print anywhere on the shirt" : <>Print area <span className={s.num}>{area.widthIn} × {area.heightIn} in</span></>}
              </span>
            )}
            {guides.v && <span className={s.guideV} />}
            {guides.h && <span className={s.guideH} />}
          </div>
          {/* The garment's own outline masks the art, so nothing shows off the shirt. */}
          <div className={s.canvasHost} ref={host}
            style={{ ["--garment" as string]: outline ? `url("${outline}")` : "none" }} />
          {sel && (
            <div className={`${s.sizeBadge} ${s.num}`} style={{ left: sel.badge.x, top: sel.badge.y }}>
              {quality && <span className={s.dot} style={{ background: QUALITY_DOT[quality.tone] }} />}
              {sel.widthIn.toFixed(1)} × {sel.heightIn.toFixed(1)} in
            </div>
          )}
        </div>
      </div>

      <div className={s.stageTop}>
        <div className={s.toolbar}>
          <button type="button" className={s.iconBtn} aria-label="Undo" data-tip="Undo (Ctrl+Z)" disabled={!history.undo} onClick={() => void ctrl?.undo()}>
            <Undo2 size={17} />
          </button>
          <button type="button" className={s.iconBtn} aria-label="Redo" data-tip="Redo (Ctrl+Y)" disabled={!history.redo} onClick={() => void ctrl?.redo()}>
            <Redo2 size={17} />
          </button>
        </div>
        {sel && (
          <div className={s.toolbar} role="toolbar" aria-label="Selected art">
            {sel.kind === "text" && (
              <button type="button" className={s.iconBtn} aria-label="Edit text" data-tip="Edit text" onClick={() => setPanel("text")}>
                <Pencil size={16} />
              </button>
            )}
            <button type="button" className={s.iconBtn} aria-label="Centre horizontally" data-tip="Centre horizontally" onClick={() => ctrl?.centre("x")}>
              <AlignCenterVertical size={17} />
            </button>
            <button type="button" className={s.iconBtn} aria-label="Centre vertically" data-tip="Centre vertically" onClick={() => ctrl?.centre("y")}>
              <AlignCenterHorizontal size={17} />
            </button>
            <button type="button" className={s.iconBtn} aria-label="Bring forward" data-tip="Bring forward" onClick={() => ctrl?.layer("up")}>
              <ArrowUpToLine size={17} />
            </button>
            <button type="button" className={s.iconBtn} aria-label="Send backward" data-tip="Send backward" onClick={() => ctrl?.layer("down")}>
              <ArrowDownToLine size={17} />
            </button>
            <button type="button" className={s.iconBtn} aria-label="Flip horizontally" data-tip="Flip horizontally" onClick={() => ctrl?.flip()}>
              <FlipHorizontal2 size={17} />
            </button>
            {!sel.nn && (
              <button type="button" className={s.iconBtn} aria-label="Duplicate" data-tip="Duplicate (Ctrl+D)" onClick={() => void ctrl?.duplicate()}>
                <Copy size={16} />
              </button>
            )}
            <span className={s.toolbarSep} />
            <button type="button" className={`${s.iconBtn} ${s.btnDanger}`} aria-label="Delete" data-tip="Delete (Del)" onClick={() => ctrl?.remove()}>
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {!hasArt && !sel && size > 0 && (
        <div className={s.startCard}>
          <input ref={file} type="file" accept={ACCEPTED.join(",")} className={s.srOnly} tabIndex={-1}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImageFile(f, ctrl); e.target.value = ""; }} />
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setPanel("upload"); file.current?.click(); }}>
            <Upload size={16} /> Upload image
          </button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setPanel("text"); void ctrl?.addText("Your text here", inkFor(hex)); }}>
            <Type size={16} /> Add text
          </button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setPanel("ai")}>
            <Sparkles size={16} /> Create AI design
          </button>
        </div>
      )}

      {sel?.outside && (
        <div className={s.warn} role="status">
          <AlertTriangle size={15} /> Part of this is outside the print area and won&apos;t print
        </div>
      )}

      <button ref={notesBtn} type="button" className={`${s.btn} ${s.notesBtn}`} aria-expanded={notesOpen} onClick={() => setNotesOpen(!notesOpen)}>
        <Pencil size={15} /> {notes ? "Edit notes" : "Add notes"}
      </button>
      {notesOpen && (
        <div className={s.notesPop} role="dialog" aria-label="Notes for the print team"
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setNotesOpen(false); notesBtn.current?.focus(); } }}>
          <label className={s.label} htmlFor="design-notes"><span>Notes for the print team</span></label>
          <textarea id="design-notes" className={s.textarea} autoFocus value={notes} maxLength={600}
            placeholder="e.g. Match the logo colour to Pantone 286 C"
            onChange={(e) => setNotes(e.target.value)} />
          <div className={s.row} style={{ justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setNotesOpen(false); notesBtn.current?.focus(); }}>Close notes</button>
          </div>
        </div>
      )}
    </div>
  );
}
