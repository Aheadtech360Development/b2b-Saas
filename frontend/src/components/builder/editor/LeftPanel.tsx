"use client";

import { tell } from "@/lib/dialog";
/**
 * The left-hand panel: what can go on a page, what is on it, and the site
 * around it — pages, templates, the theme, saved and shared sections, menus.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown, ChevronRight, Copy, ExternalLink, Eye, EyeOff, FileText, Layers, LayoutTemplate, Menu as MenuIcon, ScrollText,
  MoreHorizontal, Palette, Pencil, Plus, RefreshCw, Search, Star, Trash2, Upload, Bookmark,
} from "lucide-react";
import { FALLBACK_ICON, REGISTRY_ICONS } from "./icons";
import { LAYOUT_PRESETS } from "@/lib/builder/layout";
import type { BuilderNode, SiteDoc, TemplateType } from "@/lib/builder/types";
import { CATEGORIES, PRESETS, REGISTRY, fitsTemplate, labelOf } from "@/lib/builder/registry";
import { GOOGLE_FONTS, SYSTEM_FONTS, availableFamilies, previewUrl } from "@/lib/builder/fonts";
import {
  TEMPLATE_LABELS, addPage, addTemplate, assignCollections, assignProducts, collectionsUsing, productsUsing, removePage, removeTemplate,
  renameSlug, renameTemplate, sameTarget, sharedUses, targetLabel, templateTypeOf, usedFamilies, type Target,
} from "@/lib/builder/doc";
import type { PickMenu, UploadedFont } from "@/services/builder.service";
import type { DragPayload } from "./Canvas";
import { ImageField, ProductsPicker, type EditorEnv } from "./fields";
import { POLICIES, policyHtml, removePolicy, savePolicy, type Policy } from "@/lib/builder/policies";
import { PolicyEditor } from "./PolicyEditor";
import WrittenPagesEditor from "@/components/admin/WrittenPagesEditor";
import { apiClient } from "@/lib/api-client";
import { safeSrc } from "@/lib/builder/sanitize";
import { say } from "@/lib/toast";
import { confirmAction, Modal, Popover, TextInput } from "./ui";

export type LeftTab = "add" | "layers" | "pages" | "templates" | "theme" | "sections" | "menus";

const TABS: { key: LeftTab; label: string; icon: ReactNode }[] = [
  { key: "add", label: "Add", icon: <Plus size={18} /> },
  { key: "layers", label: "Layers", icon: <Layers size={18} /> },
  { key: "pages", label: "Pages", icon: <FileText size={18} /> },
  { key: "templates", label: "Templates", icon: <LayoutTemplate size={18} /> },
  { key: "theme", label: "Theme", icon: <Palette size={18} /> },
  { key: "sections", label: "Sections", icon: <Bookmark size={18} /> },
  { key: "menus", label: "Menus", icon: <MenuIcon size={18} /> },
];

export interface LeftProps {
  tab: LeftTab;
  setTab: (t: LeftTab) => void;
  doc: SiteDoc;
  commit: (next: SiteDoc) => void;
  target: Target;
  open: (t: Target) => void;
  selected: string | null;
  select: (id: string | null) => void;
  dragRef: React.MutableRefObject<DragPayload | null>;
  add: (drag: DragPayload) => void;
  layerTrees: { label: string; target: Target; tree: BuilderNode | null }[];
  menus: PickMenu[];
  reloadMenus: () => void;
  uploaded: UploadedFont[];
  uploadFont: (file: File, family: string, weight: number, style: string) => Promise<void>;
  deleteFont: (f: UploadedFont) => Promise<void>;
  env: EditorEnv;
  updateNode: (target: Target, id: string, change: (n: BuilderNode) => BuilderNode) => void;
  /** The template whose products or collections are being chosen, as "type:id". */
  assigning: string | null;
  setAssigning: (key: string | null) => void;
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const C = REGISTRY_ICONS[name] ?? FALLBACK_ICON;
  return <C size={size} aria-hidden />;
}

function drag(dragRef: LeftProps["dragRef"], payload: DragPayload) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragRef.current = payload;
      e.dataTransfer.setData("text/plain", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copyMove";
    },
    onDragEnd: () => { dragRef.current = null; },
  };
}

// ── Add ──────────────────────────────────────────────────────────────────────
function AddPanel(p: LeftProps) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const match = (s: string) => !query || s.toLowerCase().includes(query);
  const here = templateTypeOf(p.target);
  const sections = PRESETS.filter((x) => x.kind === "section" && fitsTemplate(x.context, here));
  const blocks = PRESETS.filter((x) => x.kind === "block" && fitsTemplate(x.context, here) && (match(x.label) || match(x.blurb)));
  return (
    <>
      <div className="sbe-sec">
        <div className="sbe-row" style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, color: "#7A808C" }} />
          <input className="sbe-in" style={{ paddingLeft: 30 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an element" aria-label="Find an element" />
        </div>
        <div className="sbe-help" style={{ marginTop: 8 }}>Drag onto the page, or click to add after what is selected.</div>
      </div>
      {!query && (
        <div className="sbe-sec">
          <div className="sbe-h"><span>Ready-made sections</span></div>
          <div className="sbe-list" style={{ gap: 6 }}>
            {sections.map((preset) => (
              <button key={preset.key} type="button" className="sbe-card" {...drag(p.dragRef, { preset: preset.key })}
                      onClick={() => p.add({ preset: preset.key })}>
                <b>{preset.label}</b><span>{preset.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!query && (
        <div className="sbe-sec">
          <div className="sbe-h"><span>Grid &amp; Flex</span></div>
          <div className="sbe-tiles">
            {LAYOUT_PRESETS.map((lp) => (
              <button key={lp.key} type="button" className="sbe-tile" title={lp.blurb} {...drag(p.dragRef, { layout: lp.key })}
                      onClick={() => p.add({ layout: lp.key })}>
                <span aria-hidden style={{ display: "grid", gap: 2, width: 34, height: 22,
                  gridTemplateColumns: lp.cols ? `repeat(${lp.cols},1fr)` : lp.key === "flex-row" ? "repeat(3,1fr)" : "1fr" }}>
                  {Array.from({ length: lp.cols ? lp.cols * (lp.rows ?? 1) : lp.key === "flex-row" ? 3 : 2 }, (_, i) => (
                    <span key={i} style={{ background: "#C9CED8", borderRadius: 2 }} />
                  ))}
                </span>
                <span className="sbe-tile-label" lang="en">{lp.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {blocks.length > 0 && (
        <div className="sbe-sec">
          <div className="sbe-h"><span>Ready-made blocks</span></div>
          <div className="sbe-list" style={{ gap: 6 }}>
            {blocks.map((preset) => (
              <button key={preset.key} type="button" className="sbe-card" {...drag(p.dragRef, { preset: preset.key })}
                      onClick={() => p.add({ preset: preset.key })}>
                <b>{preset.label}</b><span>{preset.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {CATEGORIES.map((cat) => {
        const items = REGISTRY.filter((c) => c.category === cat.key && c.type !== "column" && fitsTemplate(c.context, here)
                                             && (match(c.label) || match(c.blurb)));
        if (!items.length) return null;
        return (
          <div key={cat.key} className="sbe-sec">
            <div className="sbe-h"><span>{cat.label}</span></div>
            <div className="sbe-tiles">
              {items.map((c) => (
                <button key={c.type} type="button" className="sbe-tile" title={c.blurb} {...drag(p.dragRef, { add: c.type })}
                        onClick={() => p.add({ add: c.type })}>
                  <Icon name={c.icon} /><span className="sbe-tile-label" lang="en">{c.tile ?? c.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Layers ───────────────────────────────────────────────────────────────────
function LayerRow({ node, depth, p, target }: { node: BuilderNode; depth: number; p: LeftProps; target: Target }) {
  const [open, setOpen] = useState(depth < 2);
  const kids = node.children ?? [];
  const hidden = node.hide && Object.values(node.hide).some(Boolean);
  return (
    <>
      <div className="sbe-layer" aria-current={p.selected === node.id} style={{ paddingLeft: 4 + depth * 14 }}
           onClick={() => p.select(node.id)} {...(depth > 0 ? drag(p.dragRef, { move: node.id }) : {})}>
        <button type="button" className="sbe-icon sm" style={{ width: 20, height: 22, visibility: kids.length ? "visible" : "hidden" }}
                aria-label={open ? "Collapse" : "Expand"} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className="name" style={{ opacity: hidden ? 0.5 : 1 }}>{labelOf(node)}</span>
        {depth > 0 && (
          <span className="acts">
            <button type="button" className="sbe-icon sm" style={{ width: 22, height: 22 }} title={hidden ? "Shown on some devices only" : "Hide everywhere"}
                    aria-label={hidden ? "Show everywhere" : "Hide everywhere"}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.updateNode(target, node.id, (n) => ({ ...n, hide: hidden ? undefined : { desktop: true, tablet: true, mobile: true } }));
                    }}>
              {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </span>
        )}
      </div>
      {open && kids.map((k) => <LayerRow key={k.id} node={k} depth={depth + 1} p={p} target={target} />)}
    </>
  );
}

function LayersPanel(p: LeftProps) {
  return (
    <>
      {p.layerTrees.map(({ label, target, tree }) => (
        <div key={label} className="sbe-sec">
          <div className="sbe-h"><span>{label}</span></div>
          {tree ? <LayerRow node={tree} depth={0} p={p} target={target} /> : <div className="sbe-help">Empty.</div>}
        </div>
      ))}
      <div className="sbe-sec"><div className="sbe-help">Drag a layer onto the page to move it. Hidden elements are faded.</div></div>
    </>
  );
}

// ── Pages ────────────────────────────────────────────────────────────────────
function PagesPanel(p: LeftProps) {
  const [title, setTitle] = useState("");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [written, setWritten] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const pages = Object.entries(p.doc.pages ?? {});
  const pageTemplates = Object.entries(p.doc.templates?.page ?? {});
  return (
    <>
      <div className="sbe-sec">
        <div className="sbe-h"><span>Home</span></div>
        <button type="button" className="sbe-item" aria-current={sameTarget(p.target, { kind: "template", type: "home", id: "default" })}
                onClick={() => p.open({ kind: "template", type: "home", id: "default" })}>
          <Star size={15} /><span className="grow">Home page</span><span className="sub">/</span>
        </button>
      </div>
      <div className="sbe-sec">
        <div className="sbe-h"><span>Pages</span></div>
        <div className="sbe-list">
          {pages.map(([slug, page]) => (
            <div key={slug}>
              <div className="sbe-item" aria-current={sameTarget(p.target, { kind: "page", slug })} onClick={() => p.open({ kind: "page", slug })}>
                <FileText size={15} />
                <span className="grow">{page.title || slug}<span className="sub" style={{ display: "block" }}>/{slug}</span></span>
                <button type="button" className="sbe-btn sm ghost" onClick={(e) => { e.stopPropagation(); setEditing(editing === slug ? null : slug); }}>
                  {editing === slug ? "Done" : "Settings"}
                </button>
              </div>
              {editing === slug && (
                <div style={{ padding: "8px 8px 12px 30px" }}>
                  <div className="sbe-field"><label>Title</label>
                    <TextInput value={page.title} onChange={(v) => p.commit({ ...p.doc, pages: { ...p.doc.pages, [slug]: { ...page, title: v } } })} />
                  </div>
                  <div className="sbe-field"><label>Address</label>
                    <div className="sbe-row"><span className="sbe-help">/</span>
                      <TextInput value={slug} onChange={() => {}} onCommit={(v) => {
                        const next = renameSlug(p.doc, slug, v);
                        if (!next) { tell("That address is taken or not allowed. Use lowercase letters, numbers and hyphens."); return; }
                        p.commit(next);
                        setEditing(v.trim().toLowerCase());
                        if (sameTarget(p.target, { kind: "page", slug })) p.open({ kind: "page", slug: v.trim().toLowerCase() });
                      }} />
                    </div>
                  </div>
                  <div className="sbe-field"><label>Template</label>
                    <select className="sbe-in" value={page.template || "default"} onChange={(e) => p.commit({ ...p.doc, pages: { ...p.doc.pages, [slug]: { ...page, template: e.target.value } } })}>
                      {pageTemplates.map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="sbe-h" style={{ marginTop: 14 }}><span>Search engines</span></div>
                  <div className="sbe-field"><label>Title in search results</label>
                    <TextInput value={page.seo?.title ?? ""} placeholder={page.title}
                               onChange={(v) => p.commit({ ...p.doc, pages: { ...p.doc.pages, [slug]: { ...page, seo: { ...page.seo, title: v } } } })} />
                  </div>
                  <div className="sbe-field"><label>Description</label>
                    <textarea className="sbe-in" rows={3} value={page.seo?.description ?? ""}
                              onChange={(e) => p.commit({ ...p.doc, pages: { ...p.doc.pages, [slug]: { ...page, seo: { ...page.seo, description: e.target.value } } } })} />
                  </div>
                  <div className="sbe-field"><label>Sharing picture</label>
                    <ImageField env={p.env} value={page.seo?.image ?? ""}
                                onChange={(v) => p.commit({ ...p.doc, pages: { ...p.doc.pages, [slug]: { ...page, seo: { ...page.seo, image: v } } } })} />
                  </div>
                  <button type="button" className="sbe-btn sm danger" onClick={async () => {
                    if (!await confirmAction(`Delete the page “${page.title || slug}”? It goes from the draft now and from the shop when you publish.`)) return;
                    p.commit(removePage(p.doc, slug));
                    if (sameTarget(p.target, { kind: "page", slug })) p.open({ kind: "template", type: "home", id: "default" });
                  }}><Trash2 size={13} /> Delete page</button>
                </div>
              )}
            </div>
          ))}
          {!pages.length && <div className="sbe-help">No pages yet.</div>}
        </div>
      </div>
      {/* The five policies every shop needs, each written in a box of formatted
          text. They are pages like the ones above; this is the short way in. */}
      <div className="sbe-sec" data-policies>
        <div className="sbe-h"><span>Policies</span></div>
        <div className="sbe-list">
          {POLICIES.map((pol) => {
            const written = policyHtml(p.doc, pol) !== null;
            return (
              <div key={pol.key} className="sbe-item" data-policy={pol.key} onClick={() => setPolicy(pol)}>
                <ScrollText size={15} />
                <span className="grow">{pol.label}
                  <span className="sub" style={{ display: "block" }}>{written ? `/${pol.slug}` : "Not written yet"}</span>
                </span>
                <button type="button" className="sbe-btn sm ghost" onClick={(e) => { e.stopPropagation(); setPolicy(pol); }}>
                  {written ? "Edit" : "Write"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="sbe-help" style={{ marginTop: 6 }}>Each one is a page on your shop once you write it and publish.</div>
      </div>
      {/* The shop's six built-in pages of words — Contact, Get a quote and four
          policies at /policies/… — which menus and the link picker point at by
          name. Their editor used to be inside "Edit theme". */}
      <div className="sbe-sec" data-written-pages>
        <div className="sbe-h"><span>Built-in pages</span></div>
        <div className="sbe-list">
          <div className="sbe-item" onClick={() => setWritten(true)}>
            <FileText size={15} />
            <span className="grow">Quote, contact &amp; policy words
              <span className="sub" style={{ display: "block" }}>/quote · /contact · /policies/…</span>
            </span>
            <button type="button" className="sbe-btn sm ghost" onClick={(e) => { e.stopPropagation(); setWritten(true); }}>Edit</button>
          </div>
        </div>
        <div className="sbe-help" style={{ marginTop: 6 }}>
          Drawn in your site&apos;s own look. Saved straight to your shop — they are not part of the draft, and separate from the Policies above.
        </div>
      </div>
      {written && (
        <Modal wide title="Built-in pages" onClose={() => setWritten(false)}>
          <WrittenPagesEditor writable />
        </Modal>
      )}
      {policy && (
        <PolicyEditor
          policy={policy} doc={p.doc}
          onSave={(html) => { p.commit(savePolicy(p.doc, policy, html)); setPolicy(null); }}
          onRemove={() => {
            if (sameTarget(p.target, { kind: "page", slug: policy.slug })) p.open({ kind: "template", type: "home", id: "default" });
            p.commit(removePolicy(p.doc, policy));
            setPolicy(null);
          }}
          onOpenPage={() => { p.open({ kind: "page", slug: policy.slug }); setPolicy(null); }}
          onClose={() => setPolicy(null)}
        />
      )}
      <div className="sbe-sec">
        <div className="sbe-h"><span>New page</span></div>
        <form className="sbe-row" onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const res = addPage(p.doc, title);
          p.commit(res.doc);
          setTitle("");
          p.open({ kind: "page", slug: res.slug });
        }}>
          <input className="sbe-in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Shipping & returns" aria-label="New page title" />
          <button type="submit" className="sbe-btn" disabled={!title.trim()}><Plus size={14} /> Add</button>
        </form>
        <div className="sbe-help" style={{ marginTop: 6 }}>Pages show at /their-address on your shop once published.</div>
      </div>
    </>
  );
}

// ── Templates ────────────────────────────────────────────────────────────────
type Assignable = "product" | "collection";

/**
 * Every kind of page and the templates it can be drawn with.
 *
 * A product or collection uses its kind's default template unless one is
 * chosen for it here — so one product can have an apparel layout and another
 * a transfers layout, each with its own sections around the same buy box.
 */
function TemplatesPanel(p: LeftProps) {
  const types = Object.keys(TEMPLATE_LABELS) as TemplateType[];
  const [creating, setCreating] = useState<TemplateType | null>(null);
  return (
    <>
      <div className="sbe-sec">
        <div className="sbe-h"><span>Around every page</span></div>
        {(["announcement", "header", "footer"] as const).map((key) => (
          <button key={key} type="button" className="sbe-item" aria-current={sameTarget(p.target, { kind: "part", key })}
                  onClick={() => p.open({ kind: "part", key })}>
            <LayoutTemplate size={15} /><span className="grow">{targetLabel(p.doc, { kind: "part", key })}</span>
          </button>
        ))}
      </div>
      {types.map((type) => {
        const group = Object.entries(p.doc.templates?.[type] ?? {});
        const many = type === "page" || type === "product" || type === "collection";
        return (
          <div key={type} className="sbe-sec">
            <div className="sbe-h"><span>{TEMPLATE_LABELS[type]}</span>
              {many && creating !== type && (
                <button type="button" className="sbe-btn sm ghost" onClick={() => setCreating(type)}><Plus size={13} /> New</button>
              )}
            </div>
            {creating === type && (
              <NewTemplate type={type} group={group} onCancel={() => setCreating(null)}
                           onCreate={(name, from) => {
                             const res = addTemplate(p.doc, type, name, from);
                             p.commit(res.doc);
                             setCreating(null);
                             p.open({ kind: "template", type, id: res.id });
                           }} />
            )}
            {group.map(([id, tpl]) => <TemplateRow key={id} {...p} type={type} id={id} name={tpl.name} many={many} />)}
            {(type === "product" || type === "collection") && group.length > 1 && (
              <div className="sbe-help" style={{ margin: "4px 0 8px" }}>
                {type === "product"
                  ? "Each product uses its own template if you chose one for it, and the default otherwise."
                  : "Each collection uses its own template if you chose one for it, and the default otherwise."}
              </div>
            )}
          </div>
        );
      })}
      <div className="sbe-sec"><div className="sbe-help">The cart, checkout and account pages are the shop&apos;s own working pages; they wear your header and footer.</div></div>
    </>
  );
}

function NewTemplate({ type, group, onCreate, onCancel }: {
  type: TemplateType; group: [string, { name: string }][];
  onCreate: (name: string, from: string | null) => void; onCancel: () => void;
}) {
  const noun = TEMPLATE_LABELS[type].toLowerCase().replace(/ pages?$/, "").replace(/s$/, "");
  const [name, setName] = useState("");
  const [from, setFrom] = useState<string>(group.some(([id]) => id === "default") ? "default" : group[0]?.[0] ?? "");
  const ok = name.trim().length > 0;
  return (
    <form className="sbe-newtpl" onSubmit={(e) => { e.preventDefault(); if (ok) onCreate(name.trim(), from || null); }}>
      <div className="sbe-field">
        <label htmlFor={`tpl-name-${type}`}>Name</label>
        <input id={`tpl-name-${type}`} className="sbe-in" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
               placeholder={type === "product" ? "e.g. Apparel, DTF transfers" : type === "collection" ? "e.g. Apparel collections" : `e.g. ${noun} with sidebar`}
               onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} />
      </div>
      <div className="sbe-field">
        <label htmlFor={`tpl-from-${type}`}>Start from</label>
        <select id={`tpl-from-${type}`} className="sbe-in" value={from} onChange={(e) => setFrom(e.target.value)}>
          {group.map(([id, t]) => <option key={id} value={id}>A copy of “{t.name}”</option>)}
          <option value="">An empty {noun} template</option>
        </select>
      </div>
      <div className="sbe-row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <button type="button" className="sbe-btn sm ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="sbe-btn sm primary" disabled={!ok}>Create</button>
      </div>
    </form>
  );
}

function TemplateRow(p: LeftProps & { type: TemplateType; id: string; name: string; many: boolean }) {
  const { type, id, name, many } = p;
  const moreBtn = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const t: Target = { kind: "template", type, id };
  const rule = type === "page" ? p.doc.assignments?.page : type === "product" ? p.doc.assignments?.product : type === "collection" ? p.doc.assignments?.collection : undefined;
  const isDefault = (rule?.default || "default") === id;
  const kind: Assignable | null = type === "product" || type === "collection" ? type : null;
  const assigned = kind === "product" ? productsUsing(p.doc, id) : kind === "collection" ? collectionsUsing(p.doc, id) : [];
  const key = `${type}:${id}`;
  const choosing = p.assigning === key;
  const noun = kind === "product" ? ["product", "products"] : ["collection", "collections"];

  return (
    <div>
      <div className="sbe-item" aria-current={sameTarget(p.target, t)} onClick={() => { if (!renaming) p.open(t); }}>
        <LayoutTemplate size={15} />
        <span className="grow" style={{ minWidth: 0 }}>
          {renaming ? (
            <input className="sbe-in" style={{ height: 28 }} autoFocus defaultValue={name} maxLength={80} aria-label="Template name"
                   onClick={(e) => e.stopPropagation()}
                   onKeyDown={(e) => {
                     if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                     if (e.key === "Escape") { (e.target as HTMLInputElement).value = name; (e.target as HTMLInputElement).blur(); }
                   }}
                   onBlur={(e) => { setRenaming(false); p.commit(renameTemplate(p.doc, type, id, e.target.value)); }} />
          ) : (
            <span title={name} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          )}
          {many && (
            <span className="sub" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isDefault
                ? kind ? `Default · all other ${noun[1]}` : "Default"
                : kind ? (assigned.length ? `${assigned.length} ${assigned.length === 1 ? noun[0] : noun[1]}` : `No ${noun[1]} yet`) : ""}
            </span>
          )}
        </span>
        {kind && !isDefault && (
          <button type="button" className="sbe-btn sm ghost" aria-expanded={choosing}
                  onClick={(e) => { e.stopPropagation(); p.setAssigning(choosing ? null : key); }}>
            {choosing ? "Done" : kind === "product" ? "Products" : "Collections"}
          </button>
        )}
        {many && (
          <>
            <button ref={moreBtn} type="button" className="sbe-icon sm" aria-label={`More for ${name}`} aria-haspopup="menu" aria-expanded={more}
                    onClick={(e) => { e.stopPropagation(); setMore(!more); }}><MoreHorizontal size={14} /></button>
            <Popover open={more} onClose={() => setMore(false)} anchor={moreBtn} align="right" width={220}>
              {/* Drawn inside the row, so a click here must not also open the row's template. */}
              <div onClick={(e) => e.stopPropagation()}>
              <button type="button" className="sbe-item" onClick={() => { setMore(false); setRenaming(true); }}>
                <Pencil size={14} /><span className="grow">Rename</span>
              </button>
              <button type="button" className="sbe-item" onClick={() => {
                setMore(false);
                const res = addTemplate(p.doc, type, `${name} copy`, id);
                p.commit(res.doc);
                p.open({ kind: "template", type, id: res.id });
              }}><Copy size={14} /><span className="grow">Duplicate</span></button>
              {!isDefault && (
                <button type="button" className="sbe-item" title="Use for everything of this kind that has no template of its own" onClick={() => {
                  setMore(false);
                  const k = type as "page" | "product" | "collection";
                  p.commit({ ...p.doc, assignments: { ...p.doc.assignments, [k]: { ...(p.doc.assignments?.[k] ?? {}), default: id } } });
                }}><Star size={14} /><span className="grow">Make default</span></button>
              )}
              {id !== "default" && (
                <button type="button" className="sbe-item" style={{ color: "#B42318" }} onClick={async () => {
                  setMore(false);
                  const users = assigned.length ? ` ${assigned.length} ${assigned.length === 1 ? noun[0] : noun[1]} using it go back to the default.` : " Anything using it goes back to the default.";
                  if (!await confirmAction(`Delete the template “${name}”?${users}`)) return;
                  p.commit(removeTemplate(p.doc, type, id));
                  if (sameTarget(p.target, t)) p.open({ kind: "template", type, id: "default" });
                }}><Trash2 size={14} /><span className="grow">Delete</span></button>
              )}
              </div>
            </Popover>
          </>
        )}
      </div>
      {choosing && kind === "product" && (
        <div style={{ padding: "6px 4px 12px 28px" }}>
          <div className="sbe-help" style={{ marginBottom: 8 }}>
            These products show with “{name}”. Everything else uses the default. A product has one template, so picking it here moves it from any other.
          </div>
          <ProductsPicker env={p.env} value={assigned} onChange={(ids) => p.commit(assignProducts(p.doc, id, ids))} />
        </div>
      )}
      {choosing && kind === "collection" && (
        <div style={{ padding: "6px 4px 12px 28px" }}>
          <div className="sbe-help" style={{ marginBottom: 8 }}>
            These collections show with “{name}”. Everything else uses the default. A collection has one template, so ticking it here moves it from any other.
          </div>
          <CollectionsPicker env={p.env} value={assigned} doc={p.doc} templateId={id}
                             onChange={(ids) => p.commit(assignCollections(p.doc, id, ids))} />
        </div>
      )}
    </div>
  );
}

function CollectionsPicker({ env, value, onChange, doc, templateId }: {
  env: EditorEnv; value: string[]; onChange: (ids: string[]) => void; doc: SiteDoc; templateId: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const rows = env.collections.filter((c) => !query || c.name.toLowerCase().includes(query));
  const names = Object.fromEntries(Object.entries(doc.templates?.collection ?? {}).map(([k, v]) => [k, v.name]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {env.collections.length > 8 && (
        <div className="sbe-row" style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, color: "#7A808C" }} />
          <input className="sbe-in" style={{ paddingLeft: 30 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a collection" aria-label="Find a collection" />
        </div>
      )}
      <div className="sbe-list" style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #EEF0F4", borderRadius: 10, padding: 4 }}>
        {env.collections.length === 0 && <div className="sbe-help" style={{ padding: 8 }}>No collections yet.</div>}
        {rows.map((c) => {
          const other = doc.assignments?.collection?.byId?.[c.id];
          const elsewhere = other && other !== templateId ? names[other] : "";
          return (
            <label key={c.id} className="sbe-item" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={value.includes(c.id)}
                     onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))} />
              <span className="grow">{c.name}{!c.active && <span className="sub"> · hidden</span>}
                {elsewhere && <span className="sub" style={{ display: "block" }}>Now uses “{elsewhere}”</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Theme ────────────────────────────────────────────────────────────────────
const COLOR_NAMES: [string, string][] = [
  ["primary", "Brand (buttons, links)"], ["text", "Text"], ["muted", "Quiet text"], ["background", "Page"],
  ["surface", "Cards & panels"], ["border", "Lines"],
];
const SCALE_STEPS = ["h1", "h2", "h3", "h4", "h5", "h6", "body", "small", "button"];

/**
 * The shop's icon in the browser tab.
 *
 * Until one is set the tab shows the first letter of the shop's name. This is
 * the brand's own setting, not part of the draft: it is the shop's icon
 * whichever design is showing, so it is saved, and seen, straight away.
 */
function TabIcon({ env }: { env: EditorEnv }) {
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    apiClient.get<{ favicon_url?: string | null }>("/api/v1/admin/storefront")
      .then((b) => { if (live) { saved.current = b?.favicon_url ?? ""; setIcon(saved.current); } })
      .catch(() => { if (live) setIcon(""); });
    return () => { live = false; };
  }, []);

  const saved = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // An address is typed a letter at a time. Only a whole one — or none, to go
  // back to the letter — is worth saving, and only once the typing has stopped.
  const change = (next: string) => {
    setIcon(next);
    window.clearTimeout(timer.current);
    if (next && !safeSrc(next)) return;
    timer.current = window.setTimeout(() => { void save(next); }, 700);
  };

  const save = async (next: string) => {
    if (saved.current === next) return;
    const before = saved.current;
    try {
      await apiClient.put("/api/v1/admin/storefront", { favicon_url: next });
      saved.current = next;
      say.done(next ? "Your shop's tab icon is set. Reload the shop to see it." : "The tab icon is back to your shop's first letter.");
    } catch {
      setIcon(before ?? "");
      say.problem("The tab icon could not be saved. Try again.");
    }
  };

  return (
    <div className="sbe-sec" data-tab-icon>
      <div className="sbe-h"><span>Browser tab icon</span></div>
      {icon === null
        ? <div className="sbe-help">Loading…</div>
        : <ImageField env={env} value={icon} onChange={(v) => change(String(v ?? ""))} />}
      <div className="sbe-help" style={{ marginTop: 6 }}>
        The small picture beside your shop's name in a browser tab (the favicon). Use a square picture, 180 pixels or more.
        It is saved straight away, not with Publish.
      </div>
    </div>
  );
}

function ThemePanel(p: LeftProps) {
  const s = p.doc.settings ?? {};
  const typo = s.typography ?? {};
  const [fontQ, setFontQ] = useState("");
  const [upload, setUpload] = useState<{ family: string; weight: number; style: string; busy: boolean; error: string }>({ family: "", weight: 400, style: "normal", busy: false, error: "" });
  const used = useMemo(() => usedFamilies(p.doc), [p.doc]);
  const families = availableFamilies(s.fonts);
  const setSettings = (next: typeof s) => p.commit({ ...p.doc, settings: next });

  const role = (key: "heading" | "body" | "button", label: string) => {
    const r = typo[key] ?? {};
    return (
      <div className="sbe-field">
        <label>{label}</label>
        <div className="sbe-row">
          <select className="sbe-in" value={r.family ?? ""} style={{ flex: 2 }} aria-label={`${label} font`}
                  onChange={(e) => setSettings({ ...s, typography: { ...typo, [key]: { ...r, family: e.target.value || undefined } } })}>
            <option value="">System default</option>
            {families.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="sbe-in" value={r.weight ?? ""} style={{ flex: 1 }} aria-label={`${label} weight`}
                  onChange={(e) => setSettings({ ...s, typography: { ...typo, [key]: { ...r, weight: e.target.value ? Number(e.target.value) : undefined } } })}>
            <option value="">Weight</option>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>
    );
  };

  const addGoogle = (family: string) => {
    const font = GOOGLE_FONTS.find((f) => f.family === family);
    if (!font || (s.fonts ?? []).some((f) => f.family === family)) return;
    const weights = font.weights.filter((w) => [400, 500, 600, 700].includes(w));
    setSettings({ ...s, fonts: [...(s.fonts ?? []), { family, source: "google", weights: weights.length ? weights : [font.weights[0]!], styles: ["normal"] }] });
  };

  const suggestions = GOOGLE_FONTS.filter((f) => !(s.fonts ?? []).some((x) => x.family === f.family) && f.family.toLowerCase().includes(fontQ.trim().toLowerCase())).slice(0, 12);

  return (
    <>
      <TabIcon env={p.env} />
      <div className="sbe-sec">
        <div className="sbe-h"><span>Colours</span></div>
        {COLOR_NAMES.map(([key, label]) => {
          const v = s.colors?.[key] ?? "";
          return (
            <div key={key} className="sbe-field">
              <label>{label}</label>
              <div className="sbe-color">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"} aria-label={label}
                       onChange={(e) => setSettings({ ...s, colors: { ...s.colors, [key]: e.target.value } })} />
                <input className="sbe-in" value={v} aria-label={`${label} value`} onChange={(e) => setSettings({ ...s, colors: { ...s.colors, [key]: e.target.value } })} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="sbe-sec">
        <div className="sbe-h"><span>Fonts</span></div>
        {role("heading", "Headings")}
        {role("body", "Body text")}
        {role("button", "Buttons")}
      </div>

      <div className="sbe-sec">
        <div className="sbe-h"><span>Type sizes</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "48px repeat(4, minmax(0,1fr))", gap: 4, alignItems: "center", fontSize: 11, color: "#7A808C" }}>
          <span /> <span style={{ textAlign: "center" }}>Desktop</span><span style={{ textAlign: "center" }}>Tablet</span><span style={{ textAlign: "center" }}>Phone</span><span style={{ textAlign: "center" }}>Line</span>
          {SCALE_STEPS.map((step) => {
            const st = typo.scale?.[step] ?? { desktop: 16 };
            const put = (k: "desktop" | "tablet" | "mobile" | "lineHeight", raw: string) => {
              const n = raw === "" ? undefined : Number(raw);
              if (n !== undefined && !Number.isFinite(n)) return;
              const nextStep = { ...st, [k]: n };
              if (nextStep.desktop === undefined) nextStep.desktop = 16;
              setSettings({ ...s, typography: { ...typo, scale: { ...(typo.scale ?? {}), [step]: nextStep } } });
            };
            return (
              <div key={step} style={{ display: "contents" }}>
                <span style={{ fontWeight: 600, color: "#3B404B", fontSize: 12 }}>{step === "body" ? "Body" : step === "small" ? "Small" : step === "button" ? "Button" : step.toUpperCase()}</span>
                {(["desktop", "tablet", "mobile", "lineHeight"] as const).map((k) => (
                  <input key={k} className="sbe-in" style={{ height: 28, padding: "0 4px", textAlign: "center", fontSize: 12 }}
                         value={st[k] === undefined ? "" : String(st[k])} aria-label={`${step} ${k}`}
                         onChange={(e) => put(k, e.target.value)} />
                ))}
              </div>
            );
          })}
        </div>
        <div className="sbe-help" style={{ marginTop: 6 }}>Sizes in pixels. Line height as a multiple, like 1.4.</div>
      </div>

      <div className="sbe-sec">
        <div className="sbe-h"><span>Layout</span></div>
        <div className="sbe-grid2">
          {([["containerWidth", "Site width", 1200], ["sectionSpacing", "Section spacing", 64], ["radius", "Card corners", 10], ["buttonRadius", "Button corners", 10]] as const).map(([k, label, def]) => (
            <div key={k} className="sbe-field">
              <label>{label}</label>
              <input className="sbe-in" type="number" value={s.layout?.[k] ?? ""} placeholder={String(def)} aria-label={label}
                     onChange={(e) => setSettings({ ...s, layout: { ...s.layout, [k]: e.target.value === "" ? undefined : Math.max(0, Math.min(k === "containerWidth" ? 2400 : 200, Number(e.target.value))) } })} />
            </div>
          ))}
        </div>
      </div>

      <div className="sbe-sec">
        <div className="sbe-h"><span>This site&apos;s fonts</span></div>
        <div className="sbe-help" style={{ marginBottom: 8 }}>Only these load on your shop — the fewer, the faster. System fonts are always available.</div>
        <div className="sbe-list">
          {(s.fonts ?? []).map((f, i) => {
            const inUse = used.has(f.family);
            const catalog = GOOGLE_FONTS.find((g) => g.family === f.family);
            return (
              <div key={`${f.family}-${i}`} style={{ border: "1px solid #EEF0F4", borderRadius: 10, padding: "8px 10px" }}>
                <div className="sbe-row" style={{ justifyContent: "space-between" }}>
                  <span style={{ fontFamily: `"${f.family}", system-ui`, fontWeight: 600 }}>{f.family}</span>
                  <span className="sbe-row" style={{ gap: 4 }}>
                    <span className="sbe-badge muted">{f.source === "google" ? "Google" : f.source === "custom" ? "Uploaded" : "System"}</span>
                    <button type="button" className="sbe-icon sm" aria-label={`Remove ${f.family}`} title={inUse ? "In use — choose another font first" : "Remove"}
                            disabled={inUse} onClick={() => setSettings({ ...s, fonts: (s.fonts ?? []).filter((_, n) => n !== i) })}><Trash2 size={13} /></button>
                  </span>
                </div>
                {catalog && (
                  <div className="sbe-row" style={{ flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {catalog.weights.map((w) => {
                      const on = (f.weights ?? []).includes(w);
                      return (
                        <button key={w} type="button" className="sbe-btn sm" aria-pressed={on}
                                style={on ? { background: "#14161B", color: "#fff", borderColor: "#14161B" } : undefined}
                                onClick={() => {
                                  const ws = on ? (f.weights ?? []).filter((x) => x !== w) : [...(f.weights ?? []), w].sort((a, b) => a - b);
                                  if (!ws.length) return;
                                  const fonts = [...(s.fonts ?? [])];
                                  fonts[i] = { ...f, weights: ws };
                                  setSettings({ ...s, fonts });
                                }}>{w}</button>
                      );
                    })}
                    {catalog.italic && (
                      <button type="button" className="sbe-btn sm" aria-pressed={(f.styles ?? []).includes("italic")}
                              style={(f.styles ?? []).includes("italic") ? { background: "#14161B", color: "#fff", borderColor: "#14161B" } : undefined}
                              onClick={() => {
                                const fonts = [...(s.fonts ?? [])];
                                const italic = (f.styles ?? []).includes("italic");
                                fonts[i] = { ...f, styles: italic ? ["normal"] : ["normal", "italic"] };
                                setSettings({ ...s, fonts });
                              }}><i>Italic</i></button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sbe-sec">
        <div className="sbe-h"><span>Add a Google font</span></div>
        <input className="sbe-in" value={fontQ} onChange={(e) => setFontQ(e.target.value)} placeholder="Search fonts" aria-label="Search Google fonts" />
        <div className="sbe-list" style={{ marginTop: 6 }}>
          {suggestions.map((f) => {
            const url = previewUrl(f.family);
            return (
              <button key={f.family} type="button" className="sbe-item" onClick={() => addGoogle(f.family)}>
                {url && <link rel="stylesheet" href={url} />}
                <span className="grow" style={{ fontFamily: `"${f.family}", ${f.category === "serif" ? "serif" : "sans-serif"}`, fontSize: 15 }}>{f.family}</span>
                <span className="sub">{f.category}</span><Plus size={14} />
              </button>
            );
          })}
        </div>
        <div className="sbe-help" style={{ marginTop: 6 }}>System fonts: {SYSTEM_FONTS.slice(0, 6).map((f) => f.family).join(", ")} and more need nothing added.</div>
      </div>

      <div className="sbe-sec">
        <div className="sbe-h"><span>Your own font</span></div>
        <div className="sbe-field"><label>Font name</label>
          <input className="sbe-in" value={upload.family} placeholder="e.g. Brand Sans" onChange={(e) => setUpload({ ...upload, family: e.target.value })} />
        </div>
        <div className="sbe-grid2">
          <div className="sbe-field"><label>Weight</label>
            <select className="sbe-in" value={upload.weight} onChange={(e) => setUpload({ ...upload, weight: Number(e.target.value) })}>
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="sbe-field"><label>Style</label>
            <select className="sbe-in" value={upload.style} onChange={(e) => setUpload({ ...upload, style: e.target.value })}>
              <option value="normal">Normal</option><option value="italic">Italic</option>
            </select>
          </div>
        </div>
        <label className="sbe-btn" style={{ width: "100%", opacity: upload.busy || !/^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/.test(upload.family.trim()) ? 0.5 : 1, pointerEvents: upload.busy ? "none" : undefined }}>
          <Upload size={14} /> {upload.busy ? "Uploading…" : "Choose a WOFF2, WOFF, TTF or OTF file"}
          <input type="file" accept=".woff2,.woff,.ttf,.otf" hidden disabled={upload.busy || !/^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/.test(upload.family.trim())}
                 onChange={async (e) => {
                   const file = e.target.files?.[0];
                   e.target.value = "";
                   if (!file) return;
                   setUpload((u) => ({ ...u, busy: true, error: "" }));
                   try { await p.uploadFont(file, upload.family.trim(), upload.weight, upload.style); setUpload((u) => ({ ...u, busy: false })); }
                   catch (err) { setUpload((u) => ({ ...u, busy: false, error: err instanceof Error ? err.message : "That upload did not work." })); }
                 }} />
        </label>
        {upload.error && <div className="sbe-help" style={{ color: "#B42318", marginTop: 6 }}>{upload.error}</div>}
        {p.uploaded.length > 0 && (
          <div className="sbe-list" style={{ marginTop: 10 }}>
            {p.uploaded.map((f) => (
              <div key={f.id} className="sbe-item" style={{ cursor: "default" }}>
                <span className="grow">{f.family} <span className="sub">{f.weight} {f.style}</span></span>
                <button type="button" className="sbe-icon sm" aria-label={`Delete ${f.family} ${f.weight}`} onClick={() => p.deleteFont(f)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────
function SectionsPanel(p: LeftProps) {
  const shared = Object.entries(p.doc.globals ?? {});
  const saved = Object.entries(p.doc.saved ?? {});
  return (
    <>
      <div className="sbe-sec">
        <div className="sbe-h"><span>Shared sections</span></div>
        <div className="sbe-help" style={{ marginBottom: 8 }}>The same section on many pages. Edit it once and it changes everywhere it is used.</div>
        {shared.map(([id, g]) => {
          const uses = sharedUses(p.doc, id).length;
          return (
            <div key={id} className="sbe-item" aria-current={sameTarget(p.target, { kind: "global", id })} {...drag(p.dragRef, { shared: id })}
                 onClick={() => p.open({ kind: "global", id })}>
              <Copy size={15} />
              <span className="grow">{g.name}<span className="sub" style={{ display: "block" }}>Used {uses} {uses === 1 ? "time" : "times"}</span></span>
              <button type="button" className="sbe-btn sm ghost" onClick={(e) => { e.stopPropagation(); p.add({ shared: id }); }}>Insert</button>
              <button type="button" className="sbe-icon sm" aria-label="Delete shared section" disabled={uses > 0}
                      title={uses ? "Remove it from the pages that use it first" : "Delete"}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!await confirmAction(`Delete the shared section “${g.name}”?`)) return;
                        const globals = { ...p.doc.globals };
                        delete globals[id];
                        p.commit({ ...p.doc, globals });
                        if (sameTarget(p.target, { kind: "global", id })) p.open({ kind: "template", type: "home", id: "default" });
                      }}><Trash2 size={13} /></button>
            </div>
          );
        })}
        {!shared.length && <div className="sbe-help">None yet. Select a section and choose “Make it a shared section”.</div>}
      </div>
      <div className="sbe-sec">
        <div className="sbe-h"><span>Saved sections</span></div>
        <div className="sbe-help" style={{ marginBottom: 8 }}>Copies to drop in again. Changing one never changes another.</div>
        {saved.map(([id, sv]) => (
          <div key={id} className="sbe-item" {...drag(p.dragRef, { saved: id })} onClick={() => p.add({ saved: id })}>
            <Bookmark size={15} /><span className="grow">{sv.name}</span>
            <button type="button" className="sbe-btn sm ghost" onClick={(e) => { e.stopPropagation(); p.open({ kind: "saved", id }); }}>Edit</button>
            <button type="button" className="sbe-icon sm" aria-label="Delete saved section" onClick={async (e) => {
              e.stopPropagation();
              if (!await confirmAction(`Delete the saved section “${sv.name}”? Copies already on pages stay.`)) return;
              const next = { ...p.doc.saved };
              delete next[id];
              p.commit({ ...p.doc, saved: next });
              if (sameTarget(p.target, { kind: "saved", id })) p.open({ kind: "template", type: "home", id: "default" });
            }}><Trash2 size={13} /></button>
          </div>
        ))}
        {!saved.length && <div className="sbe-help">None yet. Select a section and choose “Save to reuse”.</div>}
      </div>
    </>
  );
}

// ── Menus ────────────────────────────────────────────────────────────────────
function MenusPanel(p: LeftProps) {
  return (
    <div className="sbe-sec">
      <div className="sbe-h"><span>Your menus</span>
        <span className="sbe-row" style={{ gap: 2 }}>
          <button type="button" className="sbe-icon sm" aria-label="Reload menus" title="Reload" onClick={p.reloadMenus}><RefreshCw size={13} /></button>
          <button type="button" className="sbe-btn sm ghost" onClick={() => p.env.newMenu()}><Plus size={13} /> New</button>
        </span>
      </div>
      <div className="sbe-help" style={{ marginBottom: 10 }}>
        Menus are the shop&apos;s own — the same ones the rest of the admin uses. Make as many as you need: one for the header, one for each footer column. Put one on the page with the Navigation menu element.
      </div>
      <div className="sbe-list">
        {p.menus.map((m) => (
          <div key={m.id} style={{ border: "1px solid #EEF0F4", borderRadius: 10, padding: "8px 10px" }}>
            <div className="sbe-row" style={{ justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
              <button type="button" className="sbe-btn sm ghost" onClick={() => p.env.editMenu(m.id)}><Pencil size={12} /> Edit links</button>
            </div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12.5, color: "#5B6170" }}>
              {(m.items ?? []).slice(0, 8).map((it, i) => (
                <li key={i}>{it.label}{it.children?.length ? ` (${it.children.length} below)` : ""}</li>
              ))}
              {(m.items ?? []).length > 8 && <li>…and {(m.items ?? []).length - 8} more</li>}
              {!(m.items ?? []).length && <li>No links yet</li>}
            </ul>
          </div>
        ))}
        {!p.menus.length && <div className="sbe-help">No menus yet.</div>}
      </div>
      <a className="sbe-btn" style={{ marginTop: 12, width: "100%", textDecoration: "none" }} href="/admin/storefront/menus" target="_blank" rel="noopener noreferrer">
        <ExternalLink size={14} /> Edit menus
      </a>
    </div>
  );
}

export function LeftPanel(p: LeftProps) {
  const current = TABS.find((t) => t.key === p.tab)!;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr)", height: "100%", minHeight: 0 }}>
      <nav aria-label="Builder panels" style={{ borderRight: "1px solid #EEF0F4", padding: "8px 4px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => p.setTab(t.key)} aria-pressed={p.tab === t.key} title={t.label}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 2px", border: 0, borderRadius: 10, cursor: "pointer",
                           background: p.tab === t.key ? "#14161B" : "none", color: p.tab === t.key ? "#fff" : "#3B404B", fontSize: 10.5, fontWeight: 600 }}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "14px 14px 10px", fontWeight: 700, fontSize: 15, borderBottom: "1px solid #EEF0F4", flex: "0 0 auto" }}>{current.label}</div>
        <div className="sbe-scroll">
          {p.tab === "add" && <AddPanel {...p} />}
          {p.tab === "layers" && <LayersPanel {...p} />}
          {p.tab === "pages" && <PagesPanel {...p} />}
          {p.tab === "templates" && <TemplatesPanel {...p} />}
          {p.tab === "theme" && <ThemePanel {...p} />}
          {p.tab === "sections" && <SectionsPanel {...p} />}
          {p.tab === "menus" && <MenusPanel {...p} />}
        </div>
      </div>
    </div>
  );
}

