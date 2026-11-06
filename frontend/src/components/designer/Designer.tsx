"use client";

/**
 * The t-shirt designer, on one screen: the garment on the stage with its four
 * views under it, a sheet beside it (garment, artwork, sizes, review), and an
 * order bar that always shows the price and the next step.
 *
 * Self-contained for now. The catalogue, prices, saved designs and AI are
 * local stand-ins (see lib/designer), and finishing hands the design to
 * `onComplete`, which is where adding to the shop's cart goes once the
 * designer is connected.
 */
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadCatalog } from "@/lib/designer/catalog";
import { money, type Quote } from "@/lib/designer/pricing";
import { loadDraft, saveDesign, saveDraft } from "@/lib/designer/storage";
import { VIEW_KEYS, type DesignDoc, type ViewKey, type ViewObjects } from "@/lib/designer/types";
import { activeKey, designOf, emptyDoc, shirtSides, useDesigner } from "@/stores/designer.store";
import { Header, OrderBar } from "./Chrome";
import { ControllerContext, useActiveGarment, useNotice, useQuote, useShirt } from "./context";
import type { DesignController } from "./controller";
import s from "./designer.module.css";
import { AiPanel } from "./panels/AiPanel";
import { GraphicsPanel } from "./panels/GraphicsPanel";
import { NamesPanel } from "./panels/NamesPanel";
import { ProductPanel } from "./panels/ProductPanel";
import { SavedPanel } from "./panels/SavedPanel";
import { TextPanel } from "./panels/TextPanel";
import { addImageFile, UploadPanel } from "./panels/UploadPanel";
import { ArtTools, CopyDesign, SheetTabs, Turntable } from "./Rails";
import { renderView } from "./render";
import { sendDesign, type SendProgress } from "./send";
import { tshirtDesignsService } from "@/services/tshirtDesigns.service";
import { ReviewTab, SizesTab } from "./Steps";
import { Stage } from "./Stage";

export interface DesignerProps {
  /** Called with the finished design. Without it, a confirmation is shown. */
  onComplete?: (doc: DesignDoc, quote: Quote) => void;
}

const typingInField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** Keep the view thumbnails in step with the design, redrawing only what changed. */
function usePreviews() {
  const { design: views } = useShirt();
  const row = useDesigner((st) => st.doc?.roster[st.rosterPreview] ?? st.doc?.roster[0]);
  const setPreview = useDesigner((st) => st.setPreview);
  const { garment, hex } = useActiveGarment();
  const drawn = useRef<{ key: string; objects: Partial<Record<ViewKey, ViewObjects>> }>({ key: "", objects: {} });

  useEffect(() => {
    if (!views || !garment) return;
    const key = `${garment.silhouette}|${hex}|${row?.name}|${row?.number}`;
    if (drawn.current.key !== key) drawn.current = { key, objects: {} };
    const t = setTimeout(() => {
      for (const v of VIEW_KEYS) {
        if (drawn.current.objects[v] === views[v]) continue;
        drawn.current.objects[v] = views[v];
        void renderView({ silhouette: garment.silhouette, view: v, hex, objects: views[v], size: 200, roster: row })
          .then((url) => setPreview(v, url));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [views, garment, hex, row, setPreview]);
}

function Sheet({ saveCurrent, savedVersion }: { saveCurrent: () => Promise<void>; savedVersion: number }) {
  const tab = useDesigner((st) => st.tab);
  const panel = useDesigner((st) => st.panel);
  const setTab = useDesigner((st) => st.setTab);
  return (
    <section className={s.sheet} aria-label="Your order">
      {tab === "saved" ? (
        <div className={s.sheetHead}>
          <button type="button" className={s.iconBtn} aria-label="Back to your design" data-tip="Back" onClick={() => setTab("garment")}>
            <ArrowLeft size={18} />
          </button>
          <h2 className={s.sheetTitle}>My designs</h2>
        </div>
      ) : (
        <SheetTabs />
      )}
      {tab === "artwork" && <ArtTools />}
      {tab === "artwork" && <CopyDesign />}
      <div className={s.sheetBody} role="tabpanel" aria-labelledby={tab === "saved" ? undefined : `tab-${tab}`}>
        {tab === "garment" && <ProductPanel />}
        {tab === "artwork" && panel === "upload" && <UploadPanel />}
        {tab === "artwork" && panel === "text" && <TextPanel />}
        {tab === "artwork" && panel === "graphics" && <GraphicsPanel />}
        {tab === "artwork" && panel === "ai" && <AiPanel />}
        {tab === "artwork" && panel === "names" && <NamesPanel />}
        {tab === "sizes" && <SizesTab />}
        {tab === "review" && <ReviewTab />}
        {tab === "saved" && <SavedPanel saveCurrent={saveCurrent} version={savedVersion} />}
      </div>
    </section>
  );
}

type SendState =
  | { phase: "sending"; progress: SendProgress }
  | { phase: "sent"; reference: string; files: number }
  | { phase: "failed"; message: string };

function Done({ state, quote, onClose, onRetry }: { state: SendState; quote: Quote; onClose: () => void; onRetry: () => void }) {
  const name = useDesigner((st) => st.doc?.name);
  const opener = useRef<Element | null>(typeof document !== "undefined" ? document.activeElement : null);
  const close = () => { if (state.phase === "sending") return; onClose(); (opener.current as HTMLElement | null)?.focus?.(); };
  const pct = state.phase === "sending" ? Math.round((state.progress.done / Math.max(1, state.progress.total)) * 100) : 100;
  return (
    <div className={s.modalBack} role="presentation" onClick={close}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="done-title" aria-busy={state.phase === "sending"}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Tab") e.preventDefault();
        }}>
        {state.phase === "sending" && (
          <>
            <h2 id="done-title">Sending your design</h2>
            <p className={s.hint}>{state.progress.label}</p>
            <div className={s.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className={`${s.hint} ${s.num}`}>{state.progress.done} of {state.progress.total}</p>
          </>
        )}
        {state.phase === "sent" && (
          <>
            <CheckCircle2 size={34} color="var(--success)" />
            <h2 id="done-title" style={{ marginTop: 10 }}>Your design is with the print team</h2>
            <p className={s.hint}>
              “{name}”, reference <strong className={s.num}>{state.reference}</strong>.{" "}
              <span className={s.num}>{quote.totalQty}</span> pieces, <span className={s.num}>{money(quote.total)}</span>,{" "}
              <span className={s.num}>{state.files}</span> finished files.
            </p>
            <div className={s.row} style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <button type="button" className={`${s.btn} ${s.btnPrimary}`} autoFocus onClick={close}>Keep editing</button>
            </div>
          </>
        )}
        {state.phase === "failed" && (
          <>
            <h2 id="done-title">The design was not sent</h2>
            <p className={s.hint}>{state.message} Your design is still saved in this browser.</p>
            <div className={s.row} style={{ justifyContent: "flex-end", marginTop: 18, gap: 8 }}>
              <button type="button" className={s.btn} onClick={close}>Keep editing</button>
              <button type="button" className={`${s.btn} ${s.btnPrimary}`} autoFocus onClick={onRetry}>Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Designer({ onComplete }: DesignerProps) {
  const [ctrl, setCtrl] = useState<DesignController | null>(null);
  const ready = useDesigner((st) => !!st.doc);
  const notice = useNotice();
  const quote = useQuote();
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const [sending, setSending] = useState<SendState | null>(null);

  // Start: the design in progress, unless the link asks for a fresh one.
  useEffect(() => {
    let live = true;
    void (async () => {
      const catalog = await loadCatalog();
      const params = new URLSearchParams(window.location.search);
      const wanted = catalog.find((g) => g.id === params.get("product"));
      const draft = params.get("new") || wanted ? null : await loadDraft();
      const usable = draft && draft.products.every((p) => catalog.some((g) => g.id === p.garmentId)) ? draft : null;
      const first = wanted ?? catalog[0];
      if (!live || !first) return;
      useDesigner.getState().init(catalog, usable ?? emptyDoc(first));
    })();
    return () => { live = false; };
  }, []);

  usePreviews();

  // Brand type (brand book page 22): Outfit for headings and numbers, Inter for the rest.
  useEffect(() => {
    if (document.getElementById("pcp-brand-fonts")) return;
    const link = document.createElement("link");
    link.id = "pcp-brand-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);

  // Autosave the work in progress.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useDesigner.subscribe((st, prev) => {
      if (!st.doc || st.doc === prev.doc) return;
      clearTimeout(t);
      const doc = st.doc;
      t = setTimeout(() => { void saveDraft(doc).catch(() => undefined); }, 800);
    });
    return () => { clearTimeout(t); unsub(); };
  }, []);

  const saveCurrent = useCallback(async () => {
    const { doc, catalog } = useDesigner.getState();
    if (!doc) return;
    setSaving(true);
    try {
      const p = doc.products[0];
      const g = catalog.find((x) => x.id === p?.garmentId);
      const hex = g?.colors.find((c) => c.id === p?.colorIds[0])?.hex ?? "#FFFFFF";
      const key = `${p?.garmentId}:${p?.colorIds[0]}`;
      const side = shirtSides(doc, key)[0] ?? "front";
      const thumb = g
        ? await renderView({ silhouette: g.silhouette, view: side, hex, objects: designOf(doc, key)[side], size: 240, type: "image/jpeg", background: "#F4F6F9" })
        : "";
      await saveDesign({ id: doc.id, name: doc.name, thumb, updatedAt: new Date().toISOString(), doc });
      setSavedVersion((n) => n + 1);
      useNotice.getState().show(`Saved “${doc.name}”`);
    } catch {
      useNotice.getState().show("The design couldn't be saved in this browser. Check that storage isn't full or blocked.", "error");
    } finally {
      setSaving(false);
    }
  }, []);

  const share = useCallback(async () => {
    const { doc, view, catalog, active } = useDesigner.getState();
    const p = doc?.products[active.product];
    const g = catalog.find((x) => x.id === p?.garmentId);
    if (!doc || !g) return;
    const hex = g.colors.find((c) => c.id === active.colorId)?.hex ?? "#FFFFFF";
    const url = await renderView({ silhouette: g.silhouette, view, hex, objects: designOf(doc, activeKey(doc, active))[view], size: 1200, background: "#FFFFFF" });
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `${doc.name || "design"}-${view}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: doc.name }); return; } catch { /* closed */ }
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    useNotice.getState().show("Image downloaded");
  }, []);

  // Keyboard shortcuts for the canvas.
  useEffect(() => {
    if (!ctrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (typingInField(e.target) || ctrl.isEditingText()) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const step = e.shiftKey ? 1 : 0.1;
      if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); void ctrl.undo(); }
      else if (mod && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); void ctrl.redo(); }
      else if (mod && k === "d") { e.preventDefault(); void ctrl.duplicate(); }
      else if (k === "delete" || k === "backspace") { e.preventDefault(); ctrl.remove(); }
      else if (k === "escape") ctrl.deselect();
      else if (k === "arrowleft") { e.preventDefault(); ctrl.nudge(-step, 0); }
      else if (k === "arrowright") { e.preventDefault(); ctrl.nudge(step, 0); }
      else if (k === "arrowup") { e.preventDefault(); ctrl.nudge(0, -step); }
      else if (k === "arrowdown") { e.preventDefault(); ctrl.nudge(0, step); }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (typingInField(e.target)) return;
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); useDesigner.getState().setPanel("upload"); void addImageFile(f, ctrl); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("paste", onPaste); };
  }, [ctrl]);

  // Send the design and its finished files to the shop, then hand it on.
  const finish = async () => {
    const { doc, catalog, setRemote } = useDesigner.getState();
    if (!doc || !quote) return;
    void saveCurrent();
    setSending({ phase: "sending", progress: { done: 0, total: 1, label: "Sending your design" } });
    try {
      const record = await sendDesign(doc, catalog, quote.total, (progress) => setSending({ phase: "sending", progress }));
      setRemote({ id: record.id, reference: record.reference });
      const files = await tshirtDesignsService.get(record.id).then((r) => r.outputs?.length ?? 0).catch(() => 0);
      setSending({ phase: "sent", reference: record.reference, files });
      onComplete?.(useDesigner.getState().doc!, quote);
    } catch (e) {
      const status = (e as { status?: number; response?: { status?: number } })?.response?.status ?? (e as { status?: number })?.status;
      setSending({
        phase: "failed",
        message: status === 409
          ? "The print team has already started on this design, so it can no longer be changed."
          : "The design could not be sent. Check your connection and try again.",
      });
    }
  };

  return (
    <ControllerContext.Provider value={{ ctrl, setCtrl }}>
      <div
        className={s.root}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
        onDrop={(e) => {
          const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
          if (!f) return;
          e.preventDefault();
          useDesigner.getState().setPanel("upload");
          void addImageFile(f, ctrl);
        }}
      >
        <Header />
        {!ready ? (
          <div className={s.loading} role="status">Opening the designer</div>
        ) : (
          <main className={s.studio}>
            <div className={s.stageCol}>
              <Stage />
              <Turntable onShare={() => void share()} />
            </div>
            <Sheet saveCurrent={saveCurrent} savedVersion={savedVersion} />
          </main>
        )}
        <OrderBar onSave={() => void saveCurrent()} onFinish={finish} saving={saving} />
        {notice.msg && (
          <div className={`${s.notice} ${notice.tone === "error" ? s.noticeError : ""}`} role={notice.tone === "error" ? "alert" : "status"}>
            {notice.msg}
          </div>
        )}
        {sending && quote && <Done state={sending} quote={quote} onClose={() => setSending(null)} onRetry={() => void finish()} />}
      </div>
    </ControllerContext.Provider>
  );
}

export default Designer;
