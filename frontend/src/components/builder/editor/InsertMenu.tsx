"use client";

/**
 * The menu behind a + on the canvas: pick what goes at that exact spot.
 *
 * It offers what fits the page being edited — a product template gets the
 * product's own elements first (title, price, options, reviews), a collection
 * template the collection's — then ready-made blocks, then every ordinary
 * element. Sections are offered only where a section can go.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { SiteDoc, TemplateType } from "@/lib/builder/types";
import { CATEGORIES, PRESETS, REGISTRY, fitsTemplate, type ComponentDef } from "@/lib/builder/registry";
import { TEMPLATE_LABELS } from "@/lib/builder/doc";
import { FALLBACK_ICON, REGISTRY_ICONS } from "./icons";
import type { DragPayload } from "./Canvas";

const WIDTH = 332;

export interface InsertAt { x: number; y: number }

export function InsertMenu({ at, here, doc, sections, onPick, onClose }: {
  /** Where the + is on screen; the menu opens beside it and stays in the window. */
  at: InsertAt;
  here: TemplateType | null;
  doc: SiteDoc;
  /** Whether a whole section can go at this spot. */
  sections: boolean;
  onPick: (payload: DragPayload) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const query = q.trim().toLowerCase();
  const match = (...words: string[]) => !query || words.some((w) => w.toLowerCase().includes(query));

  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(at.x - WIDTH / 2, vw - WIDTH - 8));
    const below = vh - at.y - 20;
    const above = at.y - 28;
    // Below the + when there is room for a useful list, else above it.
    if (below >= 300 || below >= above) setPos({ left, top: at.y + 14, maxHeight: Math.max(220, Math.min(480, below)) });
    else {
      const h = Math.max(220, Math.min(480, above));
      setPos({ left, top: Math.max(8, at.y - 14 - h), maxHeight: h });
    }
  }, [at.x, at.y]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const groups = useMemo(() => {
    const fits = REGISTRY.filter((c) => c.type !== "column" && fitsTemplate(c.context, here) && (sections || c.type !== "section"));
    const own = fits.filter((c) => c.context?.length && match(c.label, c.blurb));
    const blocks = PRESETS.filter((x) => x.kind === "block" && fitsTemplate(x.context, here) && match(x.label, x.blurb));
    const bands = sections ? PRESETS.filter((x) => x.kind === "section" && fitsTemplate(x.context, here) && match(x.label, x.blurb)) : [];
    const byCategory = CATEGORIES.map((cat) => ({
      label: cat.label,
      items: fits.filter((c) => c.category === cat.key && !c.context?.length && match(c.label, c.blurb)),
    })).filter((g) => g.items.length);
    const saved = Object.entries(doc.saved ?? {}).filter(([, v]) => match(v.name)).map(([id, v]) => ({ id, name: v.name }));
    return { own, blocks, bands, byCategory, saved };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, sections, query, doc.saved]);

  // What Enter adds: the closest name. "heading" means the Heading element,
  // not a block whose description happens to mention one.
  const first = useMemo((): { payload: DragPayload; key: string } | null => {
    const all: { payload: DragPayload; key: string; label: string }[] = [
      ...groups.own.map((c) => ({ payload: { add: c.type }, key: `add:${c.type}`, label: c.label })),
      ...groups.blocks.map((b) => ({ payload: { preset: b.key }, key: `preset:${b.key}`, label: b.label })),
      ...groups.byCategory.flatMap((g) => g.items.map((c) => ({ payload: { add: c.type }, key: `add:${c.type}`, label: c.label }))),
      ...groups.bands.map((b) => ({ payload: { preset: b.key }, key: `preset:${b.key}`, label: b.label })),
      ...groups.saved.map((s) => ({ payload: { saved: s.id }, key: `saved:${s.id}`, label: s.name })),
    ];
    if (!all.length) return null;
    if (!query) return all[0]!;
    const rank = (label: string) => {
      const l = label.toLowerCase();
      return l === query ? 0 : l.startsWith(query) ? 1 : l.split(/\s+/).some((w) => w.startsWith(query)) ? 2 : l.includes(query) ? 3 : 4;
    };
    return all.map((x, i) => ({ x, r: rank(x.label), i })).sort((a, b) => a.r - b.r || a.i - b.i)[0]!.x;
  }, [groups, query]);
  const nothing = !first;
  const mark = (key: string) => (query && first?.key === key ? " enter" : "");

  const tile = (c: ComponentDef) => {
    const Icon = REGISTRY_ICONS[c.icon] ?? FALLBACK_ICON;
    return (
      <button key={c.type} type="button" className={`sbe-tile${mark(`add:${c.type}`)}`} style={{ cursor: "pointer" }} title={c.blurb} onClick={() => onPick({ add: c.type })}>
        <Icon size={18} aria-hidden /><span className="sbe-tile-label" lang="en">{c.tile ?? c.label}</span>
      </button>
    );
  };

  const ownLabel = here === "product" ? "From the product" : here === "collection" ? "From the collection"
    : here ? `For ${TEMPLATE_LABELS[here].toLowerCase()}` : "";

  return (
    <div ref={ref} className="sbe-insert" role="dialog" aria-label="Add an element here"
         style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: WIDTH, maxHeight: pos?.maxHeight ?? 420, visibility: pos ? "visible" : "hidden" }}>
      <div className="sbe-insert-top">
        <div className="sbe-row" style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, color: "#7A808C" }} />
          <input className="sbe-in" style={{ paddingLeft: 30 }} autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="What do you want to add?" aria-label="Find an element to add"
                 onKeyDown={(e) => { if (e.key === "Enter" && first) { e.preventDefault(); onPick(first.payload); } }} />
        </div>
      </div>
      <div className="sbe-insert-body">
        {groups.own.length > 0 && (
          <>
            <div className="sbe-menu-h">{ownLabel}</div>
            <div className="sbe-tiles">{groups.own.map(tile)}</div>
          </>
        )}
        {groups.blocks.length > 0 && (
          <>
            <div className="sbe-menu-h">Ready-made blocks</div>
            <div className="sbe-list" style={{ gap: 4 }}>
              {groups.blocks.map((b) => (
                <button key={b.key} type="button" className={`sbe-card${mark(`preset:${b.key}`)}`} style={{ cursor: "pointer" }} onClick={() => onPick({ preset: b.key })}>
                  <b>{b.label}</b><span>{b.blurb}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {groups.byCategory.map((g) => (
          <div key={g.label}>
            <div className="sbe-menu-h">{g.label}</div>
            <div className="sbe-tiles">{g.items.map(tile)}</div>
          </div>
        ))}
        {groups.bands.length > 0 && (
          <>
            <div className="sbe-menu-h">Ready-made sections</div>
            <div className="sbe-list" style={{ gap: 4 }}>
              {groups.bands.map((b) => (
                <button key={b.key} type="button" className={`sbe-card${mark(`preset:${b.key}`)}`} style={{ cursor: "pointer" }} onClick={() => onPick({ preset: b.key })}>
                  <b>{b.label}</b><span>{b.blurb}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {groups.saved.length > 0 && (
          <>
            <div className="sbe-menu-h">Your saved sections</div>
            <div className="sbe-list">
              {groups.saved.map((s) => (
                <button key={s.id} type="button" className={`sbe-item${mark(`saved:${s.id}`)}`} onClick={() => onPick({ saved: s.id })}><span className="grow">{s.name}</span></button>
              ))}
            </div>
          </>
        )}
        {nothing && <div className="sbe-help" style={{ padding: "14px 10px" }}>Nothing matches “{q}”.</div>}
        {query && first && <div className="sbe-help" style={{ padding: "10px 2px 0" }}>Press Enter to add the outlined one.</div>}
      </div>
    </div>
  );
}
