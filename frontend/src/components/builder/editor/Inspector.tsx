"use client";

/**
 * The right-hand panel: the selected element's settings, its look at the
 * current device, and the rest (its name, where it shows).
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Bookmark, Copy, CornerLeftUp, Link2, Share2, Trash2, Unlink } from "lucide-react";
import type { Breakpoint, BuilderNode, SiteDoc } from "@/lib/builder/types";
import { BY_TYPE, labelOf } from "@/lib/builder/registry";
import { findNode, pathTo } from "@/lib/builder/tree";
import { targetLabel, treeAt, type Target } from "@/lib/builder/doc";
import { FieldControl, type EditorEnv } from "./fields";
import { StylePanel } from "./StylePanel";
import { ContainerLayout, ItemPlacement } from "./LayoutPanel";
import { LAYOUT_CONTAINERS, modeAt } from "@/lib/builder/layout";
import { Toggle } from "./ui";

export interface InspectorActions {
  change: (next: BuilderNode) => void;
  select: (id: string | null) => void;
  remove: () => void;
  duplicate: () => void;
  nudge: (d: -1 | 1) => void;
  saveSection: () => void;
  makeShared: () => void;
  detach: () => void;
  openShared: (gid: string) => void;
  openTarget: (t: Target) => void;
}

export function Inspector({ doc, where, nodeId, device, env, act, current }: {
  doc: SiteDoc; where: Target | null; nodeId: string | null; device: Breakpoint; env: EditorEnv;
  act: InspectorActions; current: Target;
}) {
  const [tab, setTab] = useState<"content" | "layout" | "style" | "advanced">("content");
  const tree = where ? treeAt(doc, where) : null;
  const node = nodeId ? findNode(tree, nodeId) : null;

  if (!node || !where) {
    return (
      <div className="sbe-scroll">
        <div className="sbe-sec">
          <div className="sbe-h"><span>Nothing selected</span></div>
          <p className="sbe-help" style={{ fontSize: 13 }}>
            Click anything on the page to change it, or drag an element from the left onto the page.
          </p>
          <div className="sbe-note" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Shortcuts</div>
            <div className="sbe-row" style={{ justifyContent: "space-between" }}><span>Undo / redo</span><span><span className="sbe-kbd">Ctrl Z</span> <span className="sbe-kbd">Ctrl Y</span></span></div>
            <div className="sbe-row" style={{ justifyContent: "space-between", marginTop: 4 }}><span>Duplicate</span><span className="sbe-kbd">Ctrl D</span></div>
            <div className="sbe-row" style={{ justifyContent: "space-between", marginTop: 4 }}><span>Delete</span><span className="sbe-kbd">Del</span></div>
            <div className="sbe-row" style={{ justifyContent: "space-between", marginTop: 4 }}><span>Select the parent</span><span className="sbe-kbd">Esc</span></div>
            <div className="sbe-row" style={{ justifyContent: "space-between", marginTop: 4 }}><span>Edit text in place</span><span>double-click</span></div>
          </div>
        </div>
      </div>
    );
  }

  const def = BY_TYPE[node.type];
  const props = (node.props ?? {}) as Record<string, unknown>;
  const path = pathTo(tree, node.id);
  const isRoot = tree?.id === node.id;
  const parentNode = path.length > 1 ? path[path.length - 2]! : null;
  const inLayout = !!parentNode && modeAt(parentNode, device) !== "block";
  const showLayout = LAYOUT_CONTAINERS.has(node.type) || inLayout;
  const nothingToFill = !(def?.fields ?? []).length && node.type !== "global_ref";
  // A container or a cell with nothing to fill in opens where its settings are.
  const activeTab = tab === "layout" && !showLayout ? "content" : tab === "content" && nothingToFill && showLayout ? "layout" : tab;
  const ownMode = LAYOUT_CONTAINERS.has(node.type) ? modeAt(node, device) : null;
  const blurb = ownMode === "grid" && node.type !== "row" ? "A grid: what is in it sits in cells, and can span them."
    : ownMode === "flex" && node.type !== "stack" ? "A flex container: what is in it sits in a line that can wrap."
    : parentNode && modeAt(parentNode, device) === "grid" && node.type === "column" ? "A cell of a grid. Drop things into it, or drag its corner to span cells."
    : def?.blurb ?? node.type;
  const elsewhere = where.kind !== current.kind || JSON.stringify(where) !== JSON.stringify(current);
  const setProp = (key: string, value: unknown) => {
    const next = { ...props };
    if (value === undefined) delete next[key]; else next[key] = value;
    act.change({ ...node, props: next });
  };
  const fields = (def?.fields ?? []).filter((f) => !f.when || f.when.is.includes(props[f.when.key]));
  const contextWarn = def?.context && where.kind === "template" && !def.context.includes(where.type)
    ? `This element shows the ${def.context.join(" or ")} being viewed, so it only has something to show on ${def.context.join(" or ")} templates.`
    : def?.context && where.kind === "page" && !def.context.includes("page")
      ? `This element only has something to show on ${def.context.join(" or ")} templates.` : "";

  return (
    <>
      <div className="sbe-sec" style={{ paddingBottom: 10, flex: "0 0 auto", borderBottom: "1px solid #EEF0F4" }}>
        <div className="sbe-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf(node)}</div>
            <div className="sbe-help">{blurb}</div>
          </div>
        </div>
        <div className="sbe-crumbs" aria-label="Where this is">
          {path.slice(0, -1).map((n) => (
            <span key={n.id} style={{ display: "contents" }}>
              <button type="button" onClick={() => act.select(n.id)}>{labelOf(n)}</button><span aria-hidden>›</span>
            </span>
          ))}
          <span style={{ color: "#14161B", fontWeight: 600, padding: "2px 4px" }}>{labelOf(node)}</span>
        </div>
        {elsewhere && (
          <div className="sbe-note warn" style={{ margin: "10px 0 0" }}>
            This is part of <b>{targetLabel(doc, where)}</b>
            {where.kind === "part" ? " — it shows on every page." : where.kind === "template" ? " — it changes every page that uses it." : "."}
          </div>
        )}
        <div className="sbe-row" style={{ gap: 2, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="sbe-icon sm" title="Select the parent (Esc)" aria-label="Select the parent" disabled={path.length < 2} onClick={() => act.select(path[path.length - 2]?.id ?? null)}><CornerLeftUp size={15} /></button>
          <button type="button" className="sbe-icon sm" title="Move up" aria-label="Move up" disabled={isRoot} onClick={() => act.nudge(-1)}><ArrowUp size={15} /></button>
          <button type="button" className="sbe-icon sm" title="Move down" aria-label="Move down" disabled={isRoot} onClick={() => act.nudge(1)}><ArrowDown size={15} /></button>
          <button type="button" className="sbe-icon sm" title="Duplicate (Ctrl D)" aria-label="Duplicate" disabled={isRoot} onClick={act.duplicate}><Copy size={15} /></button>
          {node.type === "section" && <button type="button" className="sbe-icon sm" title="Save to reuse" aria-label="Save this section to reuse" onClick={act.saveSection}><Bookmark size={15} /></button>}
          {node.type === "section" && where.kind !== "global" && where.kind !== "saved" && (
            <button type="button" className="sbe-icon sm" title="Make it a shared section" aria-label="Make it a shared section" onClick={act.makeShared}><Share2 size={15} /></button>
          )}
          {node.type === "global_ref" && <button type="button" className="sbe-icon sm" title="Detach — make an ordinary copy" aria-label="Detach" onClick={act.detach}><Unlink size={15} /></button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="sbe-icon sm" title="Delete (Del)" aria-label="Delete" disabled={isRoot} onClick={act.remove} style={{ color: "#B42318" }}><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="sbe-tabs" role="tablist">
        {([...(nothingToFill && showLayout ? [] : (["content"] as const)), ...(showLayout ? (["layout"] as const) : []), "style", "advanced"] as const).map((t) => (
          <button key={t} type="button" role="tab" className="sbe-tab" aria-selected={activeTab === t} onClick={() => setTab(t)}>
            {t === "content" ? "Content" : t === "layout" ? "Layout" : t === "style" ? `Style · ${device === "desktop" ? "Desktop" : device === "tablet" ? "Tablet" : "Phone"}` : "Advanced"}
          </button>
        ))}
      </div>

      <div className="sbe-scroll">
        {activeTab === "layout" && (
          <>
            <ContainerLayout node={node} device={device} onChange={act.change} />
            {inLayout && parentNode && (
              <ItemPlacement node={node} parent={parentNode} device={device} onChange={act.change} onParentChange={act.change} />
            )}
          </>
        )}

        {activeTab === "content" && (
          <div className="sbe-sec">
            {contextWarn && <div className="sbe-note warn">{contextWarn}</div>}
            {node.type === "global_ref" && typeof props.ref === "string" && props.ref && (
              <div className="sbe-note">
                A shared section shows the same content everywhere it is used.
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="sbe-btn sm" onClick={() => act.openShared(String(props.ref))}><Link2 size={14} /> Edit the shared section</button>
                </div>
              </div>
            )}
            {fields.map((f) => (
              <div key={f.key} className="sbe-field">
                {f.kind !== "toggle" && <label>{f.label}</label>}
                <FieldControl field={f} value={props[f.key]} onChange={(v) => setProp(f.key, v)} env={env} />
                {f.help && <div className="sbe-help">{f.help}</div>}
              </div>
            ))}
            {!fields.length && node.type !== "global_ref" && <div className="sbe-help">Nothing to set here — try the Style tab.</div>}
          </div>
        )}

        {activeTab === "style" && (
          <StylePanel node={node} def={def} device={device} settings={doc.settings ?? {}} env={env} onChange={act.change} />
        )}

        {activeTab === "advanced" && (
          <div className="sbe-sec">
            <div className="sbe-field">
              <label>Name in the layers list</label>
              <input className="sbe-in" value={node.name ?? ""} placeholder={def?.label ?? node.type}
                     onChange={(e) => act.change({ ...node, name: e.target.value || undefined })} aria-label="Name in the layers list" />
            </div>
            <div className="sbe-h" style={{ marginTop: 16 }}><span>Show on</span></div>
            {(["desktop", "tablet", "mobile"] as const).map((bp) => (
              <Toggle key={bp} label={bp === "desktop" ? "Desktop" : bp === "tablet" ? "Tablet" : "Phone"}
                      value={!node.hide?.[bp]}
                      onChange={(show) => {
                        const hide = { ...(node.hide ?? {}) };
                        if (show) delete hide[bp]; else hide[bp] = true;
                        act.change({ ...node, hide: Object.keys(hide).length ? hide : undefined });
                      }} />
            ))}
            <div className="sbe-help" style={{ marginTop: 6 }}>A hidden element is still on the page for the other devices.</div>
            <div className="sbe-h" style={{ marginTop: 16 }}><span>Element id</span></div>
            <code style={{ fontSize: 12, color: "#5B6170", wordBreak: "break-all" }}>[data-b=&quot;{node.id}&quot;]</code>
            <div className="sbe-help" style={{ marginTop: 4 }}>Quote this if you ask for help with this element.</div>
          </div>
        )}
      </div>
    </>
  );
}
