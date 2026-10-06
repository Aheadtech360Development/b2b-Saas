"use client";

/**
 * The visual website builder.
 *
 * Everything here happens to the draft. The shop changes in two places only,
 * both behind a button that says so: Publish (the draft becomes the live
 * version) and the switch that moves the storefront from its imported theme
 * to the builder site, or back. A brand on its imported theme can open, edit,
 * publish and preview as much as it likes; shoppers see the theme they have
 * always seen until the owner flips that switch.
 *
 * The draft saves itself a moment after each change. Saves carry the revision
 * they were based on, so two windows editing the same site cannot silently
 * overwrite each other: the second is told, and nothing is lost.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bookmark, Check, ChevronDown, Eye, History, LayoutTemplate, Loader2, Monitor, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, Redo2, RotateCcw, Rocket, Smartphone, Tablet, Undo2, AlertTriangle,
} from "lucide-react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { say } from "@/lib/toast";
import type { Breakpoint, BuilderNode, SiteDoc, SitePayload, TemplateType } from "@/lib/builder/types";
import {
  duplicateNode, findNode, insertNode, moveNode, newId, nudge, parentOf, removeNode, updateNode, withFreshIds, type Position,
} from "@/lib/builder/tree";
import { createNode, labelOf, PRESETS } from "@/lib/builder/registry";
import { LAYOUT_PRESETS, placeInCell, setSpan } from "@/lib/builder/layout";
import {
  TEMPLATE_LABELS, addFooterColumn, addFooterTextColumn, isColumnsFooter, removeAndClose, collectionsUsing, detachShared, exists, locate, makeShared, nodeForIssue, previewFor, productsUsing,
  saveSection, sameTarget, setTreeAt, targetLabel, templateFor, treeAt, withSimpleFooter, type Target,
} from "@/lib/builder/doc";
import {
  builderService, type BuilderIssue, type BuilderState, type PickCollection, type PickMenu, type PickProduct, type UploadedFont,
} from "@/services/builder.service";
import { Canvas, bodyFor, type DragPayload } from "./Canvas";
import { Inspector } from "./Inspector";
import { LeftPanel, type LeftTab } from "./LeftPanel";
import type { EditorEnv } from "./fields";
import { EDITOR_CSS, Modal, Popover, confirmAction } from "./ui";
import { MenuEditor, type MenuDialog } from "./MenuEditor";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
const HOME: Target = { kind: "template", type: "home", id: "default" };

function message(err: unknown, fallback: string): string {
  return err instanceof ApiClientError && err.message ? err.message : fallback;
}

export default function SiteEditor({ backHref = "/admin/dashboard" }: { backHref?: string }) {
  const [state, setState] = useState<BuilderState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [doc, setDoc] = useState<SiteDoc | null>(null);
  const docRef = useRef<SiteDoc | null>(null);
  const savedRef = useRef<SiteDoc | null>(null);
  const revisionRef = useRef<number | null>(null);
  const history = useRef<{ past: SiteDoc[]; future: SiteDoc[] }>({ past: [], future: [] });
  const lastKey = useRef<{ at: number; key: string }>({ at: 0, key: "" });
  const [, setTick] = useState(0);
  const [save, setSave] = useState<SaveState>("saved");
  const saveTimer = useRef<number | undefined>(undefined);
  const inflight = useRef<Promise<void> | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  const [target, setTarget] = useState<Target>(HOME);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<Breakpoint>("desktop");
  const [tab, setTab] = useState<LeftTab>("add");
  const [assigning, setAssigning] = useState<string | null>(null);
  // A menu being made or having its links edited, from any menu field.
  const [menuDialog, setMenuDialog] = useState<MenuDialog | null>(null);
  const [, setNames] = useState(0);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const dragRef = useRef<DragPayload | null>(null);

  const [preview, setPreview] = useState<SitePayload | null>(null);
  const [menus, setMenus] = useState<PickMenu[]>([]);
  const [collections, setCollections] = useState<PickCollection[]>([]);
  const productCache = useRef(new Map<string, PickProduct>());
  const [sample, setSample] = useState<{ product?: string; collection?: string }>({});
  const [sampleProducts, setSampleProducts] = useState<PickProduct[]>([]);
  const [uploaded, setUploaded] = useState<UploadedFont[]>([]);
  const [dialog, setDialog] = useState<null | "publish" | "versions">(null);
  const [media, setMedia] = useState<null | ((url: string) => void)>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const targetBtn = useRef<HTMLButtonElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);

  // ── Loading ──
  const loadAll = useCallback(async () => {
    setLoadError("");
    try {
      const s = await builderService.open();
      setState(s);
      docRef.current = s.draft;
      savedRef.current = s.draft;
      revisionRef.current = s.revision;
      history.current = { past: [], future: [] };
      setDoc(s.draft);
      setSave("saved");
    } catch (err) {
      setLoadError(message(err, "The builder could not be opened. Check your connection and try again."));
      return;
    }
    builderService.menus().then(setMenus).catch(() => {});
    builderService.collections().then((c) => {
      setCollections(c);
      const first = c.find((x) => x.active) ?? c[0];
      if (first) setSample((s) => ({ ...s, collection: s.collection ?? first.slug }));
    }).catch(() => {});
    const assignedIds = Object.keys(docRef.current?.assignments?.product?.byId ?? {});
    if (assignedIds.length) {
      builderService.lookupProducts(assignedIds).then((rows) => {
        rows.forEach((r) => productCache.current.set(r.id, r));
        setNames((n) => n + 1);
      }).catch(() => {});
    }
    builderService.products("").then((rows) => {
      rows.forEach((r) => productCache.current.set(r.id, r));
      const live = rows.filter((r) => r.status === "active");
      setSampleProducts(live);
      if (live[0]) setSample((s) => ({ ...s, product: s.product ?? live[0]!.slug }));
    }).catch(() => {});
    builderService.fonts().then(setUploaded).catch(() => {});
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Saving ──
  const runSave = useCallback(async (): Promise<void> => {
    if (inflight.current) { await inflight.current; }
    const d = docRef.current;
    if (!d || d === savedRef.current) { setSave((s) => (s === "conflict" ? s : "saved")); return; }
    const job = (async () => {
      setSave("saving");
      try {
        const r = await builderService.save(d, revisionRef.current);
        revisionRef.current = r.revision;
        savedRef.current = d;
        setSave(docRef.current === d ? "saved" : "dirty");
        setSavedAt(Date.now());
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          setSave("conflict");
        } else {
          setSave("error");
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => { void runSave(); }, 6000);
        }
      }
    })();
    inflight.current = job;
    await job;
    inflight.current = null;
    if (docRef.current !== savedRef.current && docRef.current === d) return;
    if (docRef.current !== d) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => { void runSave(); }, 900);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void runSave(); }, 1100);
  }, [runSave]);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    await runSave();
    if (inflight.current) await inflight.current;
  }, [runSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (docRef.current && docRef.current !== savedRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ── Changing the document ──
  const commit = useCallback((next: SiteDoc, key = "") => {
    const prev = docRef.current;
    if (!prev || next === prev) return;
    if (save === "conflict") return;
    const now = Date.now();
    const h = history.current;
    // Typing into one field is one step to undo, not one step per letter.
    if (!(key && key === lastKey.current.key && now - lastKey.current.at < 900)) {
      h.past.push(prev);
      if (h.past.length > 120) h.past.shift();
    }
    h.future = [];
    lastKey.current = { at: now, key };
    docRef.current = next;
    setDoc(next);
    setSave("dirty");
    setTick((t) => t + 1);
    scheduleSave();
  }, [save, scheduleSave]);

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev || !docRef.current) return;
    h.future.push(docRef.current);
    lastKey.current = { at: 0, key: "" };
    docRef.current = prev;
    setDoc(prev);
    setSave("dirty");
    setTick((t) => t + 1);
    setEpoch((e) => e + 1);
    scheduleSave();
  }, [scheduleSave]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next || !docRef.current) return;
    h.past.push(docRef.current);
    lastKey.current = { at: 0, key: "" };
    docRef.current = next;
    setDoc(next);
    setSave("dirty");
    setTick((t) => t + 1);
    setEpoch((e) => e + 1);
    scheduleSave();
  }, [scheduleSave]);

  // ── What the canvas shows ──
  const open = useCallback((t: Target) => {
    setTarget(t);
    setSelected(null);
  }, []);

  useEffect(() => {
    if (doc && !exists(doc, target)) setTarget(HOME);
  }, [doc, target]);

  useEffect(() => {
    const d = docRef.current;
    if (!d || target.kind !== "template") return;
    if (target.type === "product") {
      const pool = [...productCache.current.values()].filter((r) => r.status === "active");
      const fits = (r: PickProduct) => templateFor(d, "product", r.id) === target.id;
      setSample((s) => {
        const now = pool.find((r) => r.slug === s.product);
        if (now && fits(now)) return s;
        const pick = pool.find(fits);
        return pick ? { ...s, product: pick.slug } : s;
      });
    } else if (target.type === "collection") {
      const fits = (c: PickCollection) => templateFor(d, "collection", c.id) === target.id;
      setSample((s) => {
        const now = collections.find((c) => c.slug === s.collection);
        if (now && fits(now)) return s;
        const pick = collections.find((c) => c.active && fits(c)) ?? collections.find(fits);
        return pick ? { ...s, collection: pick.slug } : s;
      });
    }
    // Also when who-uses-what changes: giving a collection this template
    // shows the template with that collection straight away.
  }, [target, collections, sampleProducts, doc?.assignments]);

  const previewKey = doc ? JSON.stringify(previewFor(doc, target, sample)) : "";
  useEffect(() => {
    if (!doc || !previewKey) return;
    let live = true;
    const params = JSON.parse(previewKey) as { route: string; slug?: string; template?: string };
    if ((params.route === "product" || params.route === "collection") && !params.slug) { setPreview(null); return; }
    builderService.preview(params).then((p) => { if (live) setPreview(p); }).catch(() => {});
    return () => { live = false; };
    // Refreshed after each save, so a grid added a moment ago fills in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, savedAt]);

  const data: SitePayload["data"] = useMemo(() => {
    const base: SitePayload["data"] = preview?.data ?? {
      product: null, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "", logo: "" },
    };
    // Menus come from the brand's own list, so one picked a moment ago shows at once.
    return { ...base, menus: { ...base.menus, ...Object.fromEntries(menus.map((m) => [m.id, m.items ?? []])) } };
  }, [preview, menus]);

  // ── Elements ──
  const where = doc && selected ? locate(doc, selected) : null;

  const changeNode = useCallback((next: BuilderNode) => {
    const d = docRef.current;
    if (!d) return;
    const loc = locate(d, next.id);
    const tree = loc ? treeAt(d, loc) : null;
    if (!loc || !tree) return;
    commit(setTreeAt(d, loc, updateNode(tree, next.id, () => next)), `n:${next.id}`);
  }, [commit]);

  const updateAt = useCallback((t: Target, id: string, change: (n: BuilderNode) => BuilderNode) => {
    const d = docRef.current;
    const tree = d ? treeAt(d, t) : null;
    if (!d || !tree) return;
    commit(setTreeAt(d, t, updateNode(tree, id, change)));
  }, [commit]);

  const remove = useCallback(() => {
    const d = docRef.current;
    if (!d || !selected) return;
    const loc = locate(d, selected);
    const tree = loc ? treeAt(d, loc) : null;
    if (!loc || !tree || tree.id === selected) return;
    const parent = parentOf(tree, selected);
    const label = labelOf(findNode(tree, selected)!);
    commit(setTreeAt(d, loc, removeAndClose(tree, selected)));
    setSelected(parent && parent.parent.id !== tree.id ? parent.parent.id : null);
    say.note(`${label} deleted. Ctrl Z brings it back.`);
  }, [selected, commit]);

  const duplicate = useCallback(() => {
    const d = docRef.current;
    if (!d || !selected) return;
    const loc = locate(d, selected);
    const tree = loc ? treeAt(d, loc) : null;
    if (!loc || !tree) return;
    const res = duplicateNode(tree, selected);
    if (!res) return;
    commit(setTreeAt(d, loc, res.tree));
    setSelected(res.id);
  }, [selected, commit]);

  const move = useCallback((delta: -1 | 1) => {
    const d = docRef.current;
    if (!d || !selected) return;
    const loc = locate(d, selected);
    const tree = loc ? treeAt(d, loc) : null;
    if (!loc || !tree) return;
    const next = nudge(tree, selected, delta);
    if (next !== tree) commit(setTreeAt(d, loc, next));
  }, [selected, commit]);

  const build = useCallback((drag: DragPayload): BuilderNode | null => {
    const d = docRef.current;
    if ("add" in drag) return createNode(drag.add);
    if ("preset" in drag) return PRESETS.find((p) => p.key === drag.preset)?.create() ?? null;
    if ("layout" in drag) return LAYOUT_PRESETS.find((p) => p.key === drag.layout)?.create() ?? null;
    if ("saved" in drag) {
      const tree = d?.saved?.[drag.saved]?.tree;
      return tree ? withFreshIds(tree) : null;
    }
    if ("shared" in drag) return { id: newId(), type: "global_ref", props: { ref: drag.shared } };
    return null;
  }, []);

  const place = useCallback((drag: DragPayload, targetId: string, position: Position) => {
    const d = docRef.current;
    if (!d) return;
    const loc = locate(d, targetId);
    const tree = loc ? treeAt(d, loc) : null;
    if (!loc || !tree) return;

    if ("move" in drag) {
      const from = locate(d, drag.move);
      const fromTree = from ? treeAt(d, from) : null;
      if (!from || !fromTree || drag.move === targetId) return;
      if (sameTarget(from, loc)) {
        const res = moveNode(tree, drag.move, targetId, position);
        if (!res) { say.warn("That cannot go there."); return; }
        commit(setTreeAt(d, loc, res.tree));
        setSelected(res.id);
        return;
      }
      const node = findNode(fromTree, drag.move);
      if (!node || fromTree.id === node.id) return;
      if (node.type === "global_ref" && loc.kind === "global") { say.warn("A shared section cannot go inside another one."); return; }
      const res = insertNode(tree, node, targetId, position);
      if (!res) { say.warn("That cannot go there."); return; }
      commit(setTreeAt(setTreeAt(d, from, removeNode(fromTree, drag.move)), loc, res.tree));
      setSelected(res.id);
      return;
    }

    const node = build(drag);
    if (!node) return;
    if (node.type === "global_ref" && loc.kind === "global") { say.warn("A shared section cannot go inside another one."); return; }
    const res = insertNode(tree, node, targetId, position);
    if (!res) { say.warn("That cannot go there."); return; }
    commit(setTreeAt(d, loc, res.tree));
    setSelected(res.id);
  }, [build, commit]);

  /**
   * Dropped on a free cell of a grid. A child of that grid moves to the cell; anything
   * else goes into the grid and is put there. On the device being edited only —
   * a phone keeps its own arrangement.
   */
  const placeCell = useCallback((drag: DragPayload, gridId: string, col: number, row: number) => {
    const d = docRef.current;
    if (!d) return;
    const loc = locate(d, gridId);
    const tree = loc ? treeAt(d, loc) : null;
    if (!loc || !tree) return;
    const gridNode = findNode(tree, gridId);
    if (!gridNode || !["section", "stack", "column", "row"].includes(gridNode.type)) {
      place(drag, gridId, "after");   // not a container: a drop next to it
      return;
    }
    let next = d;
    let childId: string;
    if ("move" in drag) {
      if (drag.move === gridId) return;
      const from = locate(d, drag.move);
      const fromTree = from ? treeAt(d, from) : null;
      if (!from || !fromTree) return;
      const node = findNode(fromTree, drag.move);
      if (!node || findNode(node, gridId)) { say.warn("That cannot go inside itself."); return; }
      const grid = findNode(tree, gridId);
      if (!grid?.children?.some((c) => c.id === drag.move)) {
        // From somewhere else: out of there, into this grid.
        next = setTreeAt(next, from, removeNode(fromTree, drag.move));
        const t2 = treeAt(next, loc)!;
        next = setTreeAt(next, loc, updateNode(t2, gridId, (g) => ({ ...g, children: [...(g.children ?? []), node] })));
      }
      childId = drag.move;
    } else {
      const node = build(drag);
      if (!node) return;
      if (node.type === "global_ref" && loc.kind === "global") { say.warn("A shared section cannot go inside another one."); return; }
      if (node.type === "section") { say.warn("A section cannot go inside a grid. Try a Stack, Columns or a Grid layout instead."); return; }
      next = setTreeAt(next, loc, updateNode(tree, gridId, (g) => ({ ...g, children: [...(g.children ?? []), node] })));
      childId = node.id;
    }
    const t3 = treeAt(next, loc)!;
    commit(setTreeAt(next, loc, updateNode(t3, gridId, (g) => placeInCell(g, childId, device, col, row))));
    setSelected(childId);
  }, [build, commit, device, place]);

  /** A grid item's corner dragged across cells. One undo step per drag. */
  const spanCells = useCallback((gridId: string, childId: string, col: number, row: number, colSpan: number, rowSpan: number) => {
    const d = docRef.current;
    if (!d) return;
    const loc = locate(d, gridId);
    const tree = loc ? treeAt(d, loc) : null;
    if (!loc || !tree) return;
    commit(setTreeAt(d, loc, updateNode(tree, gridId, (g) => setSpan(placeInCell(g, childId, device, col, row), childId, device, colSpan, rowSpan))),
           `span:${childId}`);
  }, [commit, device]);

  /** Click-to-add: after what is selected, or into it when it holds things, or at the end of the page. */
  const add = useCallback((drag: DragPayload) => {
    const d = docRef.current;
    if (!d) return;
    const body = bodyFor(d, target);
    const anchor = selected && locate(d, selected) ? selected : body.page?.tree?.id ?? body.tree?.id;
    if (!anchor) { say.warn("Open a page or template first."); return; }
    const loc = locate(d, anchor)!;
    const node = findNode(treeAt(d, loc), anchor);
    const container = node && ["section", "stack", "column", "row"].includes(node.type);
    place(drag, anchor, container ? "inside" : "after");
  }, [selected, target, place]);

  const inlineText = useCallback((id: string, text: string) => {
    const d = docRef.current;
    if (!d) return;
    const loc = locate(d, id);
    const tree = loc ? treeAt(d, loc) : null;
    if (!loc || !tree) return;
    commit(setTreeAt(d, loc, updateNode(tree, id, (n) => ({ ...n, props: { ...(n.props ?? {}), text } }))));
  }, [commit]);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // A box on the page being edited (an email signup's, a search field's) is not
      // somewhere to type: clicking it must not swallow Delete or Ctrl Z.
      const field = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") && !t.closest(".sbe-frame");
      const typing = field || !!t?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void flush(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); remove(); }
      else if (e.key === "Escape" && selected && docRef.current) {
        const loc = locate(docRef.current, selected);
        const tree = loc ? treeAt(docRef.current, loc) : null;
        const p = tree ? parentOf(tree, selected) : null;
        setSelected(p && p.parent.id !== tree?.id ? p.parent.id : null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicate, remove, selected, flush]);

  // ── Things the panels need ──
  const env: EditorEnv = useMemo(() => ({
    menus,
    collections,
    searchProducts: (q: string) => builderService.products(q),
    productName: (id: string) => productCache.current.get(id)?.name,
    rememberProducts: (rows: PickProduct[]) => rows.forEach((r) => productCache.current.set(r.id, r)),
    globals: Object.entries(doc?.globals ?? {}).map(([id, g]) => ({ id, name: g.name })),
    uploadImage: async (file: File) => (await builderService.uploadImage(file)).url,
    openMedia: (onPick: (url: string) => void) => setMedia(() => onPick),
    themeColors: Object.fromEntries(Object.entries(doc?.settings?.colors ?? {}).filter(([, v]) => /^#[0-9a-f]{3,8}$/i.test(v))),
    editMenu: (menuId: string) => setMenuDialog({ mode: "edit", id: menuId }),
    newMenu: (onMade?: (menuId: string) => void, name?: string) => setMenuDialog({ mode: "new", onMade, name }),
  }), [menus, collections, doc?.globals, doc?.settings?.colors]);

  const layerTrees = useMemo(() => {
    if (!doc) return [];
    const body = bodyFor(doc, target);
    const out: { label: string; target: Target; tree: BuilderNode | null }[] = [];
    if (target.kind === "page") out.push({ label: "This page's content", target, tree: body.page?.tree ?? null });
    const bodyTarget: Target = target.kind === "page"
      ? { kind: "template", type: "page", id: doc.pages?.[target.slug]?.template || doc.assignments?.page?.default || "default" }
      : target.kind === "part" ? HOME : target;
    out.push({ label: target.kind === "page" ? "Its template" : targetLabel(doc, bodyTarget), target: bodyTarget, tree: body.tree });
    if (body.chrome) {
      out.push({ label: "Announcement bar", target: { kind: "part", key: "announcement" }, tree: doc.parts?.announcement ?? null });
      out.push({ label: "Header", target: { kind: "part", key: "header" }, tree: doc.parts?.header ?? null });
      out.push({ label: "Footer", target: { kind: "part", key: "footer" }, tree: doc.parts?.footer ?? null });
    }
    return out;
  }, [doc, target]);

  const setMode = async (mode: "legacy" | "visual_builder") => {
    const text = mode === "visual_builder"
      ? "Switch your shop to the builder site? Shoppers will see it from now on. Your imported theme is kept exactly as it is, and you can switch back at any time."
      : "Switch your shop back to its imported theme? It comes back exactly as it was. The builder site stays here to keep working on.";
    if (!confirmAction(text)) return;
    try {
      const s = await builderService.setMode(mode);
      setState((prev) => (prev ? { ...prev, mode: s.mode, liveVersion: s.liveVersion, versions: s.versions } : prev));
      say.done(mode === "visual_builder" ? "Your shop now shows the builder site." : "Your shop shows its imported theme again.");
    } catch (err) {
      say.problem(message(err, "The switch did not go through. Your shop has not changed."));
    }
  };

  if (loadError) {
    return (
      <div className="sbe" style={{ display: "grid", placeItems: "center" }}>
        <style dangerouslySetInnerHTML={{ __html: EDITOR_CSS }} />
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <AlertTriangle size={28} style={{ color: "#B42318" }} />
          <p style={{ margin: "10px 0 16px" }}>{loadError}</p>
          <button type="button" className="sbe-btn primary" onClick={() => void loadAll()}>Try again</button>
        </div>
      </div>
    );
  }
  if (!doc || !state) {
    return (
      <div className="sbe" style={{ display: "grid", placeItems: "center" }}>
        <style dangerouslySetInnerHTML={{ __html: EDITOR_CSS }} />
        <div className="sbe-status"><Loader2 size={16} className="animate-spin" /> Opening the builder…</div>
      </div>
    );
  }

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const builderLive = state.mode === "visual_builder" && state.liveVersion !== null;

  const previewHref = (() => {
    const p = previewFor(doc, target, sample);
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
    const tenant = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tenant") : null;
    if (tenant) q.set("tenant", tenant);
    return `/site-builder/preview?${q.toString()}`;
  })();

  return (
    <div className="sbe" style={{ ["--sbe-left" as string]: showLeft ? "340px" : "0px", ["--sbe-right" as string]: showRight ? "330px" : "0px" }}>
      <style dangerouslySetInnerHTML={{ __html: EDITOR_CSS }} />

      {/* ── Top bar ── */}
      <header className="sbe-top">
        <a className="sbe-icon" href={backHref} aria-label="Back to the admin" title="Back to the admin"><ArrowLeft size={18} /></a>
        <div style={{ fontWeight: 700, whiteSpace: "nowrap" }} className="sbe-hide-sm">Website builder</div>
        <span className={`sbe-badge ${builderLive ? "live" : "legacy"}`} title={builderLive ? "Shoppers see the builder site" : "Shoppers see the imported theme; this site is a draft"}>
          {builderLive ? `Live · v${state.liveVersion}` : "Theme is live"}
        </span>
        <button type="button" className="sbe-icon" aria-label={showLeft ? "Hide the left panel" : "Show the left panel"} onClick={() => setShowLeft(!showLeft)}>
          {showLeft ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <button ref={targetBtn} type="button" className="sbe-btn" onClick={() => setTargetsOpen(!targetsOpen)} aria-haspopup="menu" aria-expanded={targetsOpen}
                style={{ maxWidth: 240, minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{targetLabel(doc, target)}</span><ChevronDown size={14} />
        </button>
        <Popover open={targetsOpen} onClose={() => setTargetsOpen(false)} anchor={targetBtn} width={300}>
          <TargetMenu doc={doc} current={target} onPick={(t) => { open(t); setTargetsOpen(false); }} />
        </Popover>
        {(target.kind === "template" && target.type === "product") && sampleProducts.length > 0 && (
          <select className="sbe-in sbe-hide-xs" style={{ width: 170, height: 34, flex: "0 0 auto" }} value={sample.product ?? ""} aria-label="Product to preview with"
                  onChange={(e) => setSample((s) => ({ ...s, product: e.target.value }))}>
            {sampleChoices(doc, target, sampleProducts, productCache.current).map((p) => <option key={p.id} value={p.slug}>Showing: {p.name}</option>)}
          </select>
        )}
        {(target.kind === "template" && target.type === "collection") && collections.length > 0 && (
          <select className="sbe-in sbe-hide-xs" style={{ width: 170, height: 34, flex: "0 0 auto" }} value={sample.collection ?? ""} aria-label="Collection to preview with"
                  onChange={(e) => setSample((s) => ({ ...s, collection: e.target.value }))}>
            {collections.map((c) => <option key={c.id} value={c.slug}>Showing: {c.name}</option>)}
          </select>
        )}
        <div className="sbe-seg" role="group" aria-label="Device">
          {([["desktop", Monitor, "Desktop"], ["tablet", Tablet, "Tablet"], ["mobile", Smartphone, "Phone"]] as const).map(([d, Icon, label]) => (
            <button key={d} type="button" aria-pressed={device === d} title={label} aria-label={label} onClick={() => setDevice(d)}><Icon size={16} /></button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" className="sbe-icon" aria-label="Undo" title="Undo (Ctrl Z)" disabled={!canUndo} onClick={undo}><Undo2 size={17} /></button>
        <button type="button" className="sbe-icon" aria-label="Redo" title="Redo (Ctrl Y)" disabled={!canRedo} onClick={redo}><Redo2 size={17} /></button>
        <SaveStatus state={save} onRetry={() => void runSave()} />
        {/* rel="opener": the preview is this app's own page, and opening it as this
            tab's child is what hands it this tab's sign-in — without it the new
            tab starts signed out wherever the API's cookie cannot reach it. */}
        <a className="sbe-btn" href={previewHref} target="_blank" rel="opener" onClick={() => void flush()}><Eye size={15} /> <span className="sbe-hide-sm">Preview</span></a>
        <button type="button" className="sbe-icon" aria-label="Versions" title="Published versions" onClick={() => setDialog("versions")}><History size={17} /></button>
        <button ref={moreBtn} type="button" className="sbe-icon" aria-label="More" onClick={() => setMoreOpen(!moreOpen)}><MoreHorizontal size={17} /></button>
        <Popover open={moreOpen} onClose={() => setMoreOpen(false)} anchor={moreBtn} align="right" width={280}>
          <button type="button" className="sbe-item" onClick={async () => {
            setMoreOpen(false);
            if (!confirmAction("Start the draft over from the starter site? Your published version and your shop are not affected.")) return;
            try {
              const s = await builderService.reset();
              setState(s); docRef.current = s.draft; savedRef.current = s.draft; revisionRef.current = s.revision;
              history.current = { past: [], future: [] }; setDoc(s.draft); setTarget(HOME); setSelected(null); setSave("saved"); setEpoch((e) => e + 1);
              say.done("The draft is back to the starter site.");
            } catch (err) { say.problem(message(err, "That did not work.")); }
          }}><RotateCcw size={15} /><span className="grow">Start the draft over</span></button>
          {builderLive && (
            <button type="button" className="sbe-item" onClick={() => { setMoreOpen(false); void setMode("legacy"); }}>
              <ArrowLeft size={15} /><span className="grow">Switch the shop back to its imported theme</span>
            </button>
          )}
        </Popover>
        <button type="button" className="sbe-btn primary" onClick={() => setDialog("publish")}><Rocket size={15} /> Publish</button>
        <button type="button" className="sbe-icon" aria-label={showRight ? "Hide the settings panel" : "Show the settings panel"} onClick={() => setShowRight(!showRight)}>
          {showRight ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </button>
      </header>

      <div className="sbe-body">
        <aside className="sbe-left" aria-label="Site" style={{ display: showLeft ? undefined : "none" }}>
          <LeftPanel tab={tab} setTab={setTab} doc={doc} commit={(d) => commit(d, "panel")} target={target} open={open}
                     assigning={assigning} setAssigning={setAssigning}
                     selected={selected} select={setSelected} dragRef={dragRef} add={add} layerTrees={layerTrees}
                     menus={menus} reloadMenus={() => builderService.menus().then(setMenus).catch(() => say.problem("Menus could not be loaded."))}
                     uploaded={uploaded} env={env} updateNode={updateAt}
                     uploadFont={async (file, family, weight, style) => {
                       const f = await builderService.uploadFont(file, family, weight, style).catch((err) => { throw new Error(message(err, "That upload did not work.")); });
                       setUploaded((u) => [...u, f]);
                       const d = docRef.current!;
                       const fonts = [...(d.settings?.fonts ?? [])];
                       const at = fonts.findIndex((x) => x.family === family && x.source === "custom");
                       if (at >= 0) fonts[at] = { ...fonts[at]!, weights: Array.from(new Set([...(fonts[at]!.weights ?? []), weight])).sort((a, b) => a - b),
                                                  styles: Array.from(new Set([...(fonts[at]!.styles ?? ["normal"]), style as "normal" | "italic"])) };
                       else fonts.push({ family, source: "custom", weights: [weight], styles: [style as "normal" | "italic"] });
                       commit({ ...d, settings: { ...d.settings, fonts } });
                       say.done(`${family} ${weight} is uploaded and added to this site's fonts.`);
                     }}
                     deleteFont={async (f) => {
                       if (!confirmAction(`Delete the uploaded font ${f.family} ${f.weight} ${f.style}?`)) return;
                       try { await builderService.deleteFont(f.id); setUploaded((u) => u.filter((x) => x.id !== f.id)); say.done("Font deleted."); }
                       catch (err) { say.problem(message(err, "That font could not be deleted.")); }
                     }} />
        </aside>

        <main className="sbe-center" aria-label="Page">
          {save === "conflict" && (
            <div className="sbe-banner bad">
              <AlertTriangle size={16} /> This site was changed in another window, so this one has stopped saving.
              <button type="button" className="sbe-btn sm" onClick={() => void loadAll()}>Load the latest</button>
            </div>
          )}
          {!builderLive && state.liveVersion === null && save !== "conflict" && (
            <div className="sbe-banner">
              <span>Your shop keeps showing its current design while you work here. Nothing changes for shoppers until you publish <b>and</b> switch the shop over.</span>
            </div>
          )}
          {target.kind === "template" && (target.type === "product" || target.type === "collection") && (
            <UsedBy doc={doc} type={target.type} id={target.id} names={(id) => target.type === "product" ? productCache.current.get(id)?.name : collections.find((c) => c.id === id)?.name}
                    onChoose={() => { setShowLeft(true); setTab("templates"); setAssigning(`${target.type}:${target.id}`); }} />
          )}
          {((target.kind === "part" && target.key === "footer") || (where?.kind === "part" && where.key === "footer")) && (
            <div className="sbe-banner info" role="note" data-footer-bar>
              <LayoutTemplate size={15} />
              <span style={{ flex: "1 1 240px", minWidth: 0 }}>
                {isColumnsFooter(doc)
                  ? "Your logo and tagline, then a column for each menu or block of text. Click a column to choose its menu or change its text. Delete one and the others take up its room; on a phone they move under each other by themselves."
                  : "Make this the usual footer in one press: your logo and tagline, three menu columns and a column of text. Your logo, colours and menus are kept."}
              </span>
              <button type="button" className="sbe-btn sm" onClick={() => {
                const d = docRef.current;
                const res = d ? addFooterColumn(d) : null;
                if (!res) return;
                commit(res.doc);
                setSelected(res.id);
                setShowRight(true);
              }}>+ Add a menu column</button>
              <button type="button" className="sbe-btn sm" onClick={() => {
                const d = docRef.current;
                const res = d ? addFooterTextColumn(d) : null;
                if (!res) return;
                commit(res.doc);
                setSelected(res.id);
                setShowRight(true);
              }}>+ Add a text column</button>
              <button type="button" className={`sbe-btn sm ${isColumnsFooter(doc) ? "ghost" : "primary"}`} data-footer-five onClick={() => {
                const d = docRef.current;
                if (!d) return;
                if (isColumnsFooter(d) && !confirmAction("Start the footer again as five columns — your logo and tagline, three menus and a column of text? Your logo, colours and menus are kept. You can undo this.")) return;
                commit(withSimpleFooter(d, preview?.data?.store?.name ?? ""));
                setSelected(null);
                say.done("The footer is five columns now. Ctrl Z brings the old one back.");
              }}>{isColumnsFooter(doc) ? "Start again with 5 columns" : "Use the 5-column footer"}</button>
            </div>
          )}
          <Canvas doc={doc} target={target} data={data} customFaces={uploaded.map((f) => ({ family: f.family, weight: f.weight, style: f.style, url: f.url, format: f.format }))}
                  device={device} selected={selected} epoch={epoch} dragRef={dragRef}
                  onSelect={setSelected} onDrop={place} onInlineText={inlineText}
                  onDropCell={placeCell} onSpan={spanCells}
                  onDuplicate={duplicate} onRemove={remove} onRemount={() => setEpoch((e) => e + 1)} />
        </main>

        <aside className="sbe-right" aria-label="Settings" style={{ display: showRight ? undefined : "none" }}>
          <Inspector doc={doc} where={where} nodeId={selected} device={device} env={env} current={target}
                     act={{
                       change: changeNode, select: setSelected, remove, duplicate, nudge: move,
                       saveSection: () => {
                         const d = docRef.current; const node = d && selected && where ? findNode(treeAt(d, where), selected) : null;
                         if (!d || !node) return;
                         const name = window.prompt("Name this section", labelOf(node));
                         if (!name) return;
                         commit(saveSection(d, node, name).doc);
                         say.done(`Saved. Find “${name}” under Sections.`);
                       },
                       makeShared: () => {
                         const d = docRef.current;
                         if (!d || !selected || !where) return;
                         const name = window.prompt("Name the shared section", "Shared section");
                         if (!name) return;
                         const res = makeShared(d, where, selected, name);
                         if (!res) { say.warn("That cannot be shared."); return; }
                         commit(res.doc);
                         setSelected(res.refId);
                         say.done(`“${name}” is now shared. Edit it once and it changes everywhere.`);
                       },
                       detach: () => {
                         const d = docRef.current;
                         if (!d || !selected || !where) return;
                         const next = detachShared(d, where, selected);
                         if (next) { commit(next); setSelected(null); say.done("Detached — this copy is now its own."); }
                       },
                       openShared: (gid) => open({ kind: "global", id: gid }),
                       openTarget: open,
                     }} />
        </aside>
      </div>

      {menuDialog && (
        <MenuEditor key={menuDialog.mode === "edit" ? menuDialog.id : "new"} dialog={menuDialog} menus={menus} doc={doc}
                    collections={collections} searchProducts={env.searchProducts}
                    onClose={() => setMenuDialog(null)}
                    onChanged={(m) => setMenus((list) => (list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m]))}
                    onDeleted={(id) => setMenus((list) => list.filter((x) => x.id !== id))} />
      )}
      {dialog === "publish" && (
        <PublishDialog state={state} flush={flush} onClose={() => setDialog(null)}
                       onPublished={(s) => setState(s)} setMode={setMode}
                       showIssue={(issue) => {
                         const d = docRef.current;
                         const hit = d ? nodeForIssue(d, issue.path) : null;
                         if (!hit) return;
                         setDialog(null);
                         const t = hit.target.kind === "part" ? HOME : hit.target;
                         if (!sameTarget(t, target)) setTarget(t);
                         setSelected(hit.id);
                       }} />
      )}
      {dialog === "versions" && (
        <VersionsDialog state={state} onClose={() => setDialog(null)} onChanged={(s) => setState(s)} />
      )}
      {media && <MediaDialog onClose={() => setMedia(null)} onPick={(url) => { media(url); setMedia(null); }} />}
      <ToastContainer />
    </div>
  );
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "saving") return <span className="sbe-status"><span className="sbe-dot busy" /> Saving…</span>;
  if (state === "dirty") return <span className="sbe-status"><span className="sbe-dot busy" /> Unsaved</span>;
  if (state === "error") return <button type="button" className="sbe-btn sm danger" onClick={onRetry}><span className="sbe-dot bad" /> Not saved — retry</button>;
  if (state === "conflict") return <span className="sbe-status" style={{ color: "#B42318" }}><span className="sbe-dot bad" /> Not saving</span>;
  return <span className="sbe-status"><Check size={14} style={{ color: "#22A35A" }} /> Draft saved</span>;
}

function TargetMenu({ doc, current, onPick }: { doc: SiteDoc; current: Target; onPick: (t: Target) => void }) {
  const item = (t: Target, label?: string) => (
    <button key={JSON.stringify(t)} type="button" className="sbe-item" aria-current={sameTarget(t, current)} onClick={() => onPick(t)}>
      <span className="grow">{label ?? targetLabel(doc, t)}</span>
    </button>
  );
  const pages = Object.keys(doc.pages ?? {});
  const types: TemplateType[] = ["product", "collection", "page", "search", "cart", "not_found"];
  return (
    <div>
      {item({ kind: "template", type: "home", id: "default" }, "Home page")}
      {pages.length > 0 && <div className="sbe-menu-h">Pages</div>}
      {pages.map((slug) => item({ kind: "page", slug }))}
      <div className="sbe-menu-h">Templates</div>
      {types.flatMap((type) => Object.entries(doc.templates?.[type] ?? {}).map(([id, tpl]) =>
        item({ kind: "template", type, id }, `${TEMPLATE_LABELS[type]}${Object.keys(doc.templates?.[type] ?? {}).length > 1 ? ` · ${tpl.name}` : ""}`)))}
      <div className="sbe-menu-h">Around every page</div>
      {item({ kind: "part", key: "announcement" })}
      {item({ kind: "part", key: "header" })}
      {item({ kind: "part", key: "footer" })}
      {Object.keys(doc.globals ?? {}).length > 0 && <div className="sbe-menu-h">Shared sections</div>}
      {Object.keys(doc.globals ?? {}).map((id) => item({ kind: "global", id }))}
    </div>
  );
}

function PublishDialog({ state, flush, onClose, onPublished, setMode, showIssue }: {
  state: BuilderState; flush: () => Promise<void>; onClose: () => void; onPublished: (s: BuilderState) => void;
  setMode: (m: "legacy" | "visual_builder") => Promise<void>; showIssue: (i: BuilderIssue) => void;
}) {
  const [issues, setIssues] = useState<BuilderIssue[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<{ unchanged: boolean; pruned: number[] }>({ unchanged: false, pruned: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await flush();
        const r = await builderService.validate();
        if (live) setIssues(r.issues);
      } catch (err) {
        if (live) { setIssues([]); setError(message(err, "The site could not be checked.")); }
      }
    })();
    return () => { live = false; };
  }, [flush]);

  const errors = (issues ?? []).filter((i) => i.severity === "error");
  const warnings = (issues ?? []).filter((i) => i.severity !== "error");

  const publish = async () => {
    setBusy(true); setError("");
    try {
      await flush();
      const r = await builderService.publish(note);
      onPublished(r);
      setDone(r.version);
      setOutcome({ unchanged: !!r.unchanged, pruned: r.pruned ?? [] });
      say.done(r.unchanged ? `Nothing had changed — version ${r.version} is still live.` : `Version ${r.version} is published.`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 422) {
        const r = await builderService.validate().catch(() => null);
        if (r) setIssues(r.issues);
        setError("Nothing was published — fix the problems below first. Your shop has not changed.");
      } else {
        setError(message(err, "Publishing did not go through. Your shop has not changed."));
      }
    } finally {
      setBusy(false);
    }
  };

  const builderLive = state.mode === "visual_builder";
  return (
    <Modal title={done ? "Published" : "Publish your site"} onClose={onClose}
           footer={done ? <button type="button" className="sbe-btn primary" onClick={onClose}>Done</button> : (
             <>
               <button type="button" className="sbe-btn" onClick={onClose}>Cancel</button>
               <button type="button" className="sbe-btn primary" disabled={busy || issues === null || errors.length > 0} onClick={publish}>
                 {busy ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />} Publish
               </button>
             </>
           )}>
      {done ? (
        <>
          <p style={{ marginTop: 0 }}>
            {outcome.unchanged
              ? <>Nothing had changed since version {done}, so no new version was made — version {done} is still the published one.</>
              : <>Version {done} is the published version of your builder site.</>}
          </p>
          {outcome.pruned.length > 0 && (
            <div className="sbe-note" style={{ marginBottom: 12 }}>
              To keep history to the last {state.keepVersions ?? 30} versions, {outcome.pruned.length === 1 ? "version" : "versions"}{" "}
              {outcome.pruned.join(", ")} {outcome.pruned.length === 1 ? "was" : "were"} removed. Mark a version Keep, under Versions, to hold on to it.
            </div>
          )}
          {builderLive ? (
            <div className="sbe-note">Your shop shows the builder site, so shoppers see this version now.</div>
          ) : (
            <div className="sbe-note warn">
              Your shop is still showing its imported theme. When you are ready, switch it to the builder site — your theme is kept
              exactly as it is, and you can switch back at any time.
              <div style={{ marginTop: 10 }}>
                <button type="button" className="sbe-btn primary sm" onClick={() => void setMode("visual_builder")}>Switch the shop to the builder site</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {issues === null ? (
            <div className="sbe-status"><Loader2 size={15} className="animate-spin" /> Saving and checking your site…</div>
          ) : (
            <>
              {error && <div className="sbe-note bad">{error}</div>}
              {errors.length === 0 && warnings.length === 0 && <div className="sbe-note">Everything checks out.</div>}
              {errors.length > 0 && <div className="sbe-h"><span>Must fix ({errors.length})</span></div>}
              {errors.map((i, n) => <IssueRow key={`e${n}`} issue={i} onShow={() => showIssue(i)} />)}
              {warnings.length > 0 && <div className="sbe-h" style={{ marginTop: 10 }}><span>Worth a look ({warnings.length})</span></div>}
              {warnings.map((i, n) => <IssueRow key={`w${n}`} issue={i} onShow={() => showIssue(i)} />)}
              <div className="sbe-field" style={{ marginTop: 12 }}>
                <label>What changed (optional)</label>
                <input className="sbe-in" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. New summer banner" />
              </div>
              <div className="sbe-help">
                {builderLive ? "Shoppers see the new version as soon as it is published." : "Publishing does not change your shop yet — it keeps its imported theme until you switch it over."}
                {" "}The last {state.keepVersions ?? 30} versions are kept, plus any you mark Keep; you can go back to any of them.
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function IssueRow({ issue, onShow }: { issue: BuilderIssue; onShow: () => void }) {
  return (
    <div className={`sbe-issue ${issue.severity}`}>
      <AlertTriangle size={15} style={{ color: issue.severity === "error" ? "#B42318" : "#B26B00", flex: "0 0 auto", marginTop: 2 }} />
      <span style={{ flex: 1 }}>{issue.message}</span>
      {issue.path && <button type="button" className="sbe-btn sm" onClick={onShow}>Show me</button>}
    </div>
  );
}

function VersionsDialog({ state, onClose, onChanged }: { state: BuilderState; onClose: () => void; onChanged: (s: BuilderState) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const keep = state.keepVersions ?? 30;
  return (
    <Modal title="Published versions" onClose={onClose}>
      <div className="sbe-note" style={{ marginBottom: 12 }}>
        Your last {keep} published versions are kept. Older ones are removed when you publish — never the live one, never the
        one that was live just before it, and never one you mark <b>Keep</b>. Each publish tells you if it removed any.
      </div>
      {!state.versions.length && <div className="sbe-empty">Nothing published yet.</div>}
      <div className="sbe-list">
        {state.versions.map((v) => (
          <div key={v.id} className="sbe-item" style={{ cursor: "default", border: "1px solid #EEF0F4", flexWrap: "wrap" }}>
            <span className="grow">
              <b>Version {v.number}</b>{v.note ? ` — ${v.note}` : ""}
              <span className="sub" style={{ display: "block" }}>{v.published_at ? new Date(v.published_at).toLocaleString() : ""}</span>
            </span>
            <button type="button" className="sbe-btn sm" aria-pressed={v.pinned} disabled={busy !== null}
                    title={v.pinned ? "Kept — never removed by the history limit" : "Keep this version for good"}
                    style={v.pinned ? { background: "#EEF2FF", borderColor: "#C7D2FE", color: "#1E2A78" } : undefined}
                    onClick={async () => {
                      setBusy(`pin:${v.id}`);
                      try { onChanged(await builderService.pin(v.id, !v.pinned)); }
                      catch (err) { say.problem(message(err, "That did not work.")); }
                      finally { setBusy(null); }
                    }}>
              <Bookmark size={13} /> {v.pinned ? "Kept" : "Keep"}
            </button>
            {v.live ? <span className="sbe-badge live">Published</span> : (
              <button type="button" className="sbe-btn sm" disabled={busy !== null} onClick={async () => {
                if (!confirmAction(`Make version ${v.number} the published version?${state.mode === "visual_builder" ? " Shoppers will see it straight away." : ""} Your draft is not changed.`)) return;
                setBusy(v.id);
                try { const s = await builderService.rollback(v.id); onChanged(s); say.done(`Version ${v.number} is the published version again.`); }
                catch (err) { say.problem(message(err, "That did not work.")); }
                finally { setBusy(null); }
              }}>{busy === v.id ? "…" : "Make this the published version"}</button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function MediaDialog({ onClose, onPick }: { onClose: () => void; onPick: (url: string) => void }) {
  const [items, setItems] = useState<{ file_id: string; url: string; thumbnail_url?: string; name?: string }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiClient.get<{ configured: boolean; items: { file_id: string; url: string; thumbnail_url?: string; name?: string }[] }>("/api/v1/admin/media")
      .then((r) => { if (!r.configured) setError("Media storage is not set up on this platform."); setItems(r.items ?? []); })
      .catch((err) => { setItems([]); setError(message(err, "The media library could not be loaded.")); });
  }, []);
  return (
    <Modal title="Media library" onClose={onClose} wide>
      {error && <div className="sbe-note bad">{error}</div>}
      {items === null && <div className="sbe-status"><Loader2 size={15} className="animate-spin" /> Loading…</div>}
      {items && !items.length && !error && <div className="sbe-empty">No pictures yet. Upload one from the panel.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        {(items ?? []).filter((i) => /^https:\/\//.test(i.url) && /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(i.url)).map((i) => (
          <button key={i.file_id} type="button" onClick={() => onPick(i.url)} title={i.name}
                  style={{ border: "1px solid #E3E6EC", borderRadius: 10, padding: 4, background: "#fff", cursor: "pointer" }}>
            <img src={i.thumbnail_url || i.url} alt={i.name ?? ""} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 7, display: "block" }} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** The products the sample picker offers: those that use this template, then the rest. */
function sampleChoices(doc: SiteDoc, target: Target, live: PickProduct[], cache: Map<string, PickProduct>): PickProduct[] {
  if (target.kind !== "template" || target.type !== "product") return live;
  const own = productsUsing(doc, target.id).map((id) => cache.get(id)).filter((r): r is PickProduct => !!r && r.status === "active");
  return [...own, ...live.filter((r) => !own.some((o) => o.id === r.id))];
}

function UsedBy({ doc, type, id, names, onChoose }: {
  doc: SiteDoc; type: "product" | "collection"; id: string; names: (id: string) => string | undefined; onChoose: () => void;
}) {
  const tpl = doc.templates?.[type]?.[id];
  if (!tpl) return null;
  const isDefault = (doc.assignments?.[type]?.default || "default") === id;
  const ids = type === "product" ? productsUsing(doc, id) : collectionsUsing(doc, id);
  const noun = type === "product" ? ["product", "products"] : ["collection", "collections"];
  const known = ids.map(names).filter((n): n is string => !!n);
  const list = known.length
    ? `${known.slice(0, 3).join(", ")}${ids.length > 3 ? ` and ${ids.length - 3} more` : known.length < ids.length ? ` and ${ids.length - known.length} more` : ""}`
    : `${ids.length} ${ids.length === 1 ? noun[0] : noun[1]}`;
  return (
    <div className="sbe-banner info" role="note">
      <LayoutTemplate size={15} />
      <span style={{ flex: "1 1 260px", minWidth: 0 }}>
        {isDefault
          ? <>“{tpl.name}” is the default: every {noun[0]} without a template of its own is shown with it.</>
          : ids.length
            ? <>“{tpl.name}” is used by {list}.</>
            : <>No {noun[1]} use “{tpl.name}” yet. Choose which ones should.</>}
      </span>
      {!isDefault && (
        <button type="button" className="sbe-btn sm" onClick={onChoose}>
          {ids.length ? `Change ${noun[1]}` : `Choose ${noun[1]}`}
        </button>
      )}
    </div>
  );
}
