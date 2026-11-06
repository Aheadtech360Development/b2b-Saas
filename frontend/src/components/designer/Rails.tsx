"use client";

/**
 * The turntable under the stage (the four views, by angle) and the sheet's
 * tabs. Each tab carries a live caption, so the state of the order reads
 * without opening anything.
 */
import { Copy, Hash, Shapes, Share2, Sparkles, Type, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { VIEW_KEYS, VIEW_LABEL, type Silhouette, type ViewKey } from "@/lib/designer/types";
import { ART_TOOLS, shirtKeys, shirtSides, useDesigner, type ArtTool, type Tab } from "@/stores/designer.store";
import { useActiveGarment, useGarmentUrl, useQuote, useShirt } from "./context";
import s from "./designer.module.css";

const ANGLE: Record<ViewKey, string> = { front: "0°", back: "180°", left: "90° L", right: "90° R" };

function ViewThumb({ preview, silhouette, view, hex }: { preview?: string; silhouette?: Silhouette; view: ViewKey; hex: string }) {
  const blank = useGarmentUrl(preview ? undefined : silhouette, view, hex);
  const src = preview ?? blank;
  return src ? <img src={src} alt="" /> : <span className={s.shimmer} />;
}

export function Turntable({ onShare }: { onShare: () => void }) {
  const view = useDesigner((st) => st.view);
  const zoom = useDesigner((st) => st.zoom);
  const previews = useDesigner((st) => st.previews);
  const { design: views } = useShirt();
  const { setView, setZoom } = useDesigner.getState();
  const { garment, hex } = useActiveGarment();

  return (
    <div className={s.turntable}>
      <div className={s.views} role="tablist" aria-label="Garment views">
        {VIEW_KEYS.map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v}
            className={`${s.viewBtn} ${view === v ? s.viewOn : ""}`} onClick={() => setView(v)}>
            <ViewThumb preview={previews[v]} silhouette={garment?.silhouette} view={v} hex={hex} />
            <span className={s.viewText}>
              <span>{VIEW_LABEL[v]}</span>
              <span className={`${s.viewAngle} ${s.num}`}>{ANGLE[v]}</span>
            </span>
            {!!views?.[v].length && <span className={s.viewDot} aria-label="Has artwork" />}
          </button>
        ))}
      </div>
      <div className={s.turntableEnd}>
        <button type="button" className={s.iconBtn} onClick={() => setZoom(zoom > 1 ? 1 : 1.8)}
          aria-label={zoom > 1 ? "Zoom out" : "Zoom in"} data-tip={zoom > 1 ? "Zoom out" : "Zoom in"}>
          {zoom > 1 ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
        </button>
        <button type="button" className={s.iconBtn} onClick={onShare} aria-label="Share this view" data-tip="Share this view">
          <Share2 size={18} />
        </button>
      </div>
    </div>
  );
}

const TABS: { key: Exclude<Tab, "saved">; label: string }[] = [
  { key: "garment", label: "Garment" },
  { key: "artwork", label: "Artwork" },
  { key: "sizes", label: "Sizes" },
  { key: "review", label: "Review" },
];

export function SheetTabs() {
  const tab = useDesigner((st) => st.tab);
  const doc = useDesigner((st) => st.doc);
  const setTab = useDesigner((st) => st.setTab);
  const { garment } = useActiveGarment();
  const { key, design } = useShirt();
  const quote = useQuote();
  if (!doc) return null;

  const pieces = design ? VIEW_KEYS.reduce((n, v) => n + design[v].length, 0) : 0;
  const sides = shirtSides(doc, key).length;
  const caption: Record<Exclude<Tab, "saved">, string> = {
    garment: garment ? `${garment.name}${doc.products.length > 1 ? ` +${doc.products.length - 1}` : ""}` : "",
    artwork: pieces ? `${pieces} ${pieces === 1 ? "piece" : "pieces"}, ${sides} ${sides === 1 ? "side" : "sides"}` : "Nothing yet",
    sizes: quote?.totalQty ? `${quote.totalQty} pieces` : "Not chosen",
    review: quote?.problems.length ? "Not ready" : "Ready",
  };

  return (
    <div className={s.tabs} role="tablist" aria-label="Build your order">
      {TABS.map(({ key, label }) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} id={`tab-${key}`}
          className={`${s.tab} ${tab === key ? s.tabOn : ""}`} onClick={() => setTab(key)}>
          <span className={s.tabLabel}>{label}</span>
          <span className={s.tabCaption}>{caption[key]}</span>
        </button>
      ))}
    </div>
  );
}

const TOOL: Record<ArtTool, { label: string; Icon: typeof Upload }> = {
  upload: { label: "Upload", Icon: Upload },
  text: { label: "Text", Icon: Type },
  graphics: { label: "Graphics", Icon: Shapes },
  ai: { label: "AI design", Icon: Sparkles },
  names: { label: "Names", Icon: Hash },
};

/**
 * When the order has more than one shirt: which one is being designed, and
 * copying another shirt's design onto it.
 */
export function CopyDesign() {
  const doc = useDesigner((st) => st.doc);
  const catalog = useDesigner((st) => st.catalog);
  const copyDesignFrom = useDesigner((st) => st.copyDesignFrom);
  const { key, design } = useShirt();
  const [from, setFrom] = useState("");
  if (!doc) return null;
  const others = shirtKeys(doc).filter((k) => k !== key);
  if (!others.length) return null;
  const name = (k: string) => {
    const [gid, cid] = k.split(":");
    const g = catalog.find((x) => x.id === gid);
    const n = shirtSides(doc, k).length;
    return `${g?.name}, ${g?.colors.find((c) => c.id === cid)?.name}${n ? ` (${n} ${n === 1 ? "side" : "sides"})` : " (blank)"}`;
  };
  const pick = from && others.includes(from) ? from : others[0]!;
  const hasArt = design ? VIEW_KEYS.some((v) => design[v].length) : false;
  const setActive = useDesigner.getState().setActive;
  return (
    <div className={s.copyRow}>
      <div className={s.chips} role="radiogroup" aria-label="Shirt you are designing">
        {shirtKeys(doc).map((k) => {
          const [gid = "", cid = ""] = k.split(":");
          const g = catalog.find((x) => x.id === gid);
          const c = g?.colors.find((x) => x.id === cid);
          const on = k === key;
          return (
            <button key={k} type="button" role="radio" aria-checked={on}
              className={`${s.chip} ${s.colorChip} ${on ? s.chipOn : ""}`}
              onClick={() => setActive(doc.products.findIndex((p) => p.garmentId === gid), cid)}>
              <span className={s.chipDot} style={{ background: c?.hex }} aria-hidden />
              {doc.products.length > 1 ? `${g?.name}, ` : ""}{c?.name}
            </button>
          );
        })}
      </div>
      <div className={s.row}>
      <label className={s.grow}>
        <span className={s.srOnly}>Copy the design from</span>
        <select className={s.select} value={pick} onChange={(e) => setFrom(e.target.value)}>
          {others.map((k) => <option key={k} value={k}>Copy from {name(k)}</option>)}
        </select>
      </label>
      <button type="button" className={s.btn}
        onClick={() => {
          if (hasArt && !window.confirm("Replace this shirt's design with the copy? Its current artwork will be removed.")) return;
          copyDesignFrom(pick);
        }}>
        <Copy size={16} /> Copy here
      </button>
      </div>
    </div>
  );
}

/** The Artwork tab's tools, as one row. */
export function ArtTools() {
  const panel = useDesigner((st) => st.panel);
  const setPanel = useDesigner((st) => st.setPanel);
  return (
    <div className={s.artTools} role="toolbar" aria-label="Add artwork">
      {ART_TOOLS.map((k) => {
        const { label, Icon } = TOOL[k];
        return (
          <button key={k} type="button" aria-pressed={panel === k}
            className={`${s.artTool} ${panel === k ? s.artToolOn : ""}`} onClick={() => setPanel(k)}>
            <Icon size={19} strokeWidth={1.9} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
