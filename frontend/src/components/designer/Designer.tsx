"use client";

/**
 * The t-shirt designer, on one screen: the garment on the stage with its four
 * views under it, a sheet beside it (garment, artwork, sizes, review), and an
 * order bar that always shows the price and the next step.
 *
 * The garments are the shop's own products switched on for the designer, at
 * their own prices with the shop's decoration prices (lib/designer/catalog,
 * backend services/tshirt_designer). Finishing sends the design and its
 * finished files to the shop, which answers with the order (a guest leaves a
 * name and email first); `onComplete` is where adding to the cart goes next.
 * Saved designs and the AI helper stay in the browser.
 */
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadCatalog, type ShopCatalog } from "@/lib/designer/catalog";
import { useAuthStore } from "@/stores/auth.store";
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

/** Who a guest is, for the shop's reply. */
export interface Contact {
  name: string;
  email: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A guest's name and email, asked once before their first design goes to the shop. */
function AskContact({ onSend, onClose }: { onSend: (c: Contact) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tried, setTried] = useState(false);
  const ok = name.trim().length > 0 && EMAIL.test(email.trim());
  return (
    <div className={s.modalBack} role="presentation" onClick={onClose}>
      <form className={s.modal} role="dialog" aria-modal="true" aria-labelledby="ask-title" data-ask-contact
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        onSubmit={(e) => { e.preventDefault(); setTried(true); if (ok) onSend({ name: name.trim(), email: email.trim() }); }}>
        <h2 id="ask-title">Where should the shop reply?</h2>
        <p className={s.hint}>The shop checks your design and gets back to you about the order at this email.</p>
        <label className={s.label} htmlFor="ask-name" style={{ marginTop: 14, display: "block" }}><span>Your name</span></label>
        <input id="ask-name" className={s.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus
          aria-invalid={tried && !name.trim() ? true : undefined} />
        <label className={s.label} htmlFor="ask-email" style={{ marginTop: 10, display: "block" }}><span>Email</span></label>
        <input id="ask-email" className={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
          aria-invalid={tried && !EMAIL.test(email.trim()) ? true : undefined} />
        {tried && !ok && <p className={s.hint} role="alert" style={{ color: "var(--danger, #B42318)" }}>Add your name and an email address.</p>}
        <div className={s.row} style={{ justifyContent: "flex-end", marginTop: 18, gap: 8 }}>
          <button type="button" className={s.btn} onClick={onClose}>Back to the design</button>
          <button type="submit" className={`${s.btn} ${s.btnPrimary}`}>Send to the shop</button>
        </div>
      </form>
    </div>
  );
}

type SendState =
  | { phase: "sending"; progress: SendProgress }
  | { phase: "sent"; reference: string; files: number; total?: number }
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
              <span className={s.num}>{quote.totalQty}</span> pieces, <span className={s.num}>{money(state.total ?? quote.total)}</span>,{" "}
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
  // Why the designer cannot open at this shop, when it cannot.
  const [closed, setClosed] = useState<null | "off" | "empty" | "failed">(null);
  // A guest says who they are before a design goes to the shop.
  const [asking, setAsking] = useState(false);
  const user = useAuthStore((st) => st.user);

  // Start: the shop's products, and the design in progress, unless the link
  // asks for a fresh one or for a product that design does not have.
  useEffect(() => {
    let live = true;
    void (async () => {
      let shop: ShopCatalog;
      try {
        shop = await loadCatalog();
      } catch {
        if (live) setClosed("failed");
        return;
      }
      if (!live) return;
      if (!shop.available) { setClosed("off"); return; }
      const catalog = shop.garments;
      if (!catalog.length) { setClosed("empty"); return; }
      const params = new URLSearchParams(window.location.search);
      const asked = params.get("product");
      const wanted = asked ? catalog.find((g) => g.id === asked || g.slug === asked) : undefined;
      const draft = params.get("new") ? null : await loadDraft();
      const usable = draft
        && draft.products.every((p) => catalog.some((g) => g.id === p.garmentId))
        && (!wanted || draft.products.some((p) => p.garmentId === wanted.id)) ? draft : null;
      const first = wanted ?? catalog[0];
      if (!live || !first) return;
      useDesigner.getState().init(catalog, usable ?? emptyDoc(first), shop.rates);
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

  // Send the design and its finished files to the shop, then hand it on. A
  // guest's first send asks for their name and email first: the shop answers
  // a design by email.
  const finish = async (contact?: Contact) => {
    const { doc, catalog, setRemote } = useDesigner.getState();
    if (!doc || !quote) return;
    if (!user && !doc.remote && !contact) { setAsking(true); return; }
    setAsking(false);
    void saveCurrent();
    setSending({ phase: "sending", progress: { done: 0, total: 1, label: "Sending your design" } });
    try {
      const record = await sendDesign(doc, catalog, quote.total, (progress) => setSending({ phase: "sending", progress }), contact);
      setRemote({ id: record.id, reference: record.reference });
      const files = await tshirtDesignsService.get(record.id).then((r) => r.outputs?.length ?? 0).catch(() => 0);
      setSending({ phase: "sent", reference: record.reference, files, total: record.quoted_total });
      onComplete?.(useDesigner.getState().doc!, quote);
    } catch (e) {
      const status = (e as { status?: number; response?: { status?: number } })?.response?.status ?? (e as { status?: number })?.status;
      // The shop's own words for what stops the design (its price, its products).
      const said = status === 400 && e instanceof Error && e.message ? e.message : null;
      setSending({
        phase: "failed",
        message: status === 409
          ? "The print team has already started on this design, so it can no longer be changed."
          : said ?? "The design could not be sent. Check your connection and try again.",
      });
    }
  };

  if (closed) {
    return (
      <div className={s.root}>
        <div className={s.loading} role="status" style={{ flexDirection: "column", gap: 14, textAlign: "center", padding: 24 }} data-closed={closed}>
          <strong style={{ fontSize: 18 }}>
            {closed === "empty" ? "Nothing to design here yet"
              : closed === "off" ? "The designer is not open in this shop"
              : "The designer could not be opened"}
          </strong>
          <span>
            {closed === "empty" ? "This shop has not put any shirts in the designer yet."
              : closed === "off" ? "Have a look at the shop's products instead."
              : "Check your connection and reload the page."}
          </span>
          <a className={`${s.btn} ${s.btnPrimary}`} href={closed === "failed" ? "/design" : "/products"}>
            {closed === "failed" ? "Reload" : "See the products"}
          </a>
        </div>
      </div>
    );
  }

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
        <OrderBar onSave={() => void saveCurrent()} onFinish={() => void finish()} saving={saving} />
        {notice.msg && (
          <div className={`${s.notice} ${notice.tone === "error" ? s.noticeError : ""}`} role={notice.tone === "error" ? "alert" : "status"}>
            {notice.msg}
          </div>
        )}
        {asking && <AskContact onClose={() => setAsking(false)} onSend={(c) => void finish(c)} />}
        {sending && quote && <Done state={sending} quote={quote} onClose={() => setSending(null)} onRetry={() => void finish()} />}
      </div>
    </ControllerContext.Provider>
  );
}

export default Designer;
