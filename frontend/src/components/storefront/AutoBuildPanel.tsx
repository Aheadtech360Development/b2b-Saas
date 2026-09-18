"use client";

/**
 * AutoBuildPanel — "upload multiple images at once" and get finished sheets.
 *
 * The buyer adds designs, sets each one's print size and how many they want,
 * picks how the sheet should be laid out, and presses Apply. The studio packs
 * everything onto as many sheets as it takes. This panel only collects the
 * decisions; packing, uploads and image tools all live in the studio, so the
 * same code runs whether a design was placed by hand or built here.
 */
import { useRef, useState } from "react";
import type { ArtworkInspection } from "@/services/gangSheets.service";
import { PrintCheck } from "@/components/storefront/PrintCheck";
import type { Layout } from "@/lib/sheetPacking";

export interface AutoBuildUpload {
  uid: string;
  file_url: string;
  file_name: string;
  file_type: string;
  isImage: boolean;
  pxW: number;
  pxH: number;
  aspect: number;
}

export interface AutoBuildItem {
  key: string;
  uid: string;
  w: number;
  h: number;
  lock: boolean;
  qty: number;
  /** The upload this item used before its background was removed — so it can be put back. */
  originalUid?: string | null;
}

export interface PickableDesign {
  file_url: string;
  name: string;
  file_type?: string | null;
}

interface Props {
  uploads: AutoBuildUpload[];
  items: AutoBuildItem[];
  setItems: (fn: (cur: AutoBuildItem[]) => AutoBuildItem[]) => void;
  myImages: PickableDesign[];
  galleryDesigns: PickableDesign[];
  imageMargin: number;
  bleed: number;
  maxW: number;
  maxH: number;
  uploading: boolean;
  busyKey: string | null;
  busyLabel: string;
  checks: Record<string, ArtworkInspection | null | "loading">;
  message: string | null;
  onUploadFiles: (files: FileList) => void;
  onPick: (d: PickableDesign) => void;
  onRemoveBackground: (item: AutoBuildItem) => void;
  onRestoreBackground: (item: AutoBuildItem) => void;
  onUpscale: (uid: string) => void;
  onPressCheck: (item: AutoBuildItem) => void;
  onApply: (opts: { layout: Layout; inset: number; gap: number }) => void;
  onClose: () => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function dpiOf(u: AutoBuildUpload | undefined, w: number, h: number) {
  if (!u || !u.isImage || !u.pxW || !u.pxH || w <= 0 || h <= 0) return null;
  const dpi = Math.floor(Math.min(u.pxW / w, u.pxH / h));
  if (dpi >= 300) return { dpi, color: "#16A34A", label: "Optimal" };
  if (dpi >= 250) return { dpi, color: "#CA8A04", label: "Good" };
  if (dpi >= 200) return { dpi, color: "#EA580C", label: "Fair" };
  return { dpi, color: "#DC2626", label: "Low" };
}

/** A tiny drawing of each layout, so the choice is seen rather than read. */
function LayoutPicture({ kind }: { kind: Layout }) {
  const box = (l: number, t: number, w: number, h: number, c: string, k: string) => (
    <span key={k} style={{ position: "absolute", left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, background: c, borderRadius: "4px" }} />
  );
  return (
    <div style={{ position: "relative", height: "118px", background: "#F7F8FA", borderRadius: "8px 8px 0 0", overflow: "hidden" }}>
      {kind === "standard" ? [
        box(4, 6, 38, 38, "#7DD3FC", "a"), box(45, 6, 22, 60, "#6EE7B7", "b"), box(70, 6, 26, 26, "#FCD34D", "c"),
        box(70, 36, 26, 22, "#FCA5A5", "d"), box(4, 48, 38, 20, "#C4B5FD", "e"), box(4, 72, 26, 22, "#FCD34D", "f"),
        box(33, 58, 34, 36, "#7DD3FC", "g"), box(70, 62, 26, 32, "#6EE7B7", "h"),
      ] : [
        box(4, 6, 36, 24, "#7DD3FC", "a"), box(43, 8, 22, 20, "#6EE7B7", "b"), box(68, 6, 28, 24, "#FCD34D", "c"),
        box(4, 40, 28, 22, "#FCA5A5", "d"), box(35, 40, 22, 22, "#C4B5FD", "e"), box(60, 40, 36, 22, "#7DD3FC", "f"),
        box(4, 72, 38, 20, "#6EE7B7", "g"), box(45, 72, 22, 20, "#FCD34D", "h"), box(70, 72, 26, 20, "#FCA5A5", "i"),
        <span key="c1" style={{ position: "absolute", left: 0, right: 0, top: "34%", borderTop: "1.5px dashed #64748B" }} />,
        <span key="c2" style={{ position: "absolute", left: 0, right: 0, top: "67%", borderTop: "1.5px dashed #64748B" }} />,
        <span key="s1" style={{ position: "absolute", left: "2px", top: "calc(34% - 8px)", fontSize: "13px" }}>✂</span>,
        <span key="s2" style={{ position: "absolute", left: "2px", top: "calc(67% - 8px)", fontSize: "13px" }}>✂</span>,
      ]}
    </div>
  );
}

export function AutoBuildPanel(p: Props) {
  const [layout, setLayout] = useState<Layout>("standard");
  const [useArtboard, setUseArtboard] = useState(true);
  const [artboard, setArtboard] = useState(0.25);
  const [useGap, setUseGap] = useState(true);
  const [gap, setGap] = useState(p.imageMargin || 0.5);
  const [picker, setPicker] = useState<"mine" | "gallery" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upOf = (uid: string) => p.uploads.find((u) => u.uid === uid);
  const patch = (key: string, patch: Partial<AutoBuildItem>) =>
    p.setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  function setW(it: AutoBuildItem, raw: number) {
    const u = upOf(it.uid);
    const w = Math.max(0.25, Math.min(raw || 0, p.maxW));
    const h = it.lock && u?.aspect ? Math.min(w / u.aspect, p.maxH) : it.h;
    patch(it.key, { w: round2(w), h: round2(h) });
  }
  function setH(it: AutoBuildItem, raw: number) {
    const u = upOf(it.uid);
    const h = Math.max(0.25, Math.min(raw || 0, p.maxH));
    const w = it.lock && u?.aspect ? Math.min(h * u.aspect, p.maxW) : it.w;
    patch(it.key, { w: round2(w), h: round2(h) });
  }

  const totalPieces = p.items.reduce((n, it) => n + Math.max(0, it.qty), 0);
  const inset = Math.max(p.bleed, useArtboard ? artboard : 0);

  return (
    <div style={S.shell}>
    <div style={S.wrap}>
      <input ref={fileRef} type="file" multiple accept="image/*,.svg,.pdf" style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) p.onUploadFiles(e.target.files); e.target.value = ""; }} />

      <div style={S.head}>
        <div>
          <div style={S.title}>Auto Build — upload multiple images at once</div>
          <div style={S.sub}>Set each design&apos;s size and how many you need. Apply packs them onto as many sheets as it takes.</div>
        </div>
        <button onClick={p.onClose} style={S.ghost}>← Back to sheet</button>
      </div>

      {/* Margins */}
      <div style={S.row}>
        <label style={S.check}>
          <input type="checkbox" checked={useArtboard} onChange={(e) => setUseArtboard(e.target.checked)} /> With sheet margin
        </label>
        <input type="number" min={0} step={0.05} value={artboard} disabled={!useArtboard}
          onWheel={(e) => e.currentTarget.blur()}
          onChange={(e) => setArtboard(Math.max(0, Number(e.target.value) || 0))} style={S.num} /> in
        <label style={{ ...S.check, marginLeft: "18px" }}>
          <input type="checkbox" checked={useGap} onChange={(e) => setUseGap(e.target.checked)} /> With image margin
        </label>
        <input type="number" min={0} step={0.05} value={gap} disabled={!useGap}
          onWheel={(e) => e.currentTarget.blur()}
          onChange={(e) => setGap(Math.max(0, Number(e.target.value) || 0))} style={S.num} /> in
        {p.bleed > 0 && useArtboard && artboard < p.bleed && (
          <span style={S.hint}>The sheet&apos;s own safe area is {p.bleed}″, so that is used.</span>
        )}
      </div>

      {/* Layout */}
      <div style={S.card}>
        <div style={{ fontSize: "14px", fontWeight: 800 }}>Layout</div>
        <div style={S.sub}>Choose how your images are arranged on the sheet.</div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "10px" }}>
          {([
            ["standard", "Standard", "Packs tightly in every direction for the least wasted film."],
            ["cutting", "For Cutting", "Groups images into rows so cuts run across the full width."],
          ] as const).map(([k, name, desc]) => (
            <button key={k} onClick={() => setLayout(k)}
              style={{ ...S.layout, ...(layout === k ? S.layoutOn : null) }}>
              <LayoutPicture kind={k} />
              <span style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "9px 11px", textAlign: "left" }}>
                <span style={{ ...S.radio, ...(layout === k ? S.radioOn : null) }} />
                <span>
                  <span style={{ display: "block", fontSize: "13px", fontWeight: 800, color: "#1A1A1A" }}>{name}</span>
                  <span style={{ display: "block", fontSize: "11.5px", color: "#666", lineHeight: 1.4, marginTop: "2px" }}>{desc}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Designs */}
      {p.items.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: "14px", color: "#666", marginBottom: "14px" }}>
            No images yet. Upload your designs, or pick from ones you&apos;ve used before.
          </div>
          <Adders onUpload={() => fileRef.current?.click()} onPick={setPicker} uploading={p.uploading} />
        </div>
      ) : (
        <>
          <div style={S.grid}>
            {p.items.map((it) => {
              const u = upOf(it.uid);
              const d = dpiOf(u, it.w, it.h);
              const busy = p.busyKey === it.key;
              const check = p.checks[it.key];
              return (
                <div key={it.key} style={S.item}>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <div style={S.preview}>
                      {u?.isImage
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={u.file_url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                        : <span style={{ fontSize: "11px", color: "#666", padding: "6px", textAlign: "center" }}>{u?.file_name ?? "Design"}</span>}
                      {busy && <span style={S.busy}>{p.busyLabel}…</span>}
                    </div>

                    <div style={{ flex: 1, minWidth: 0, display: "grid", gap: "7px" }}>
                      <label style={S.field}>Width
                        <span style={S.unitWrap}>
                          <input type="number" step={0.1} min={0.25} value={it.w} onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) => setW(it, Number(e.target.value))} style={S.sizeInput} /> in
                        </span>
                      </label>
                      <label style={S.field}>Height
                        <span style={S.unitWrap}>
                          <input type="number" step={0.1} min={0.25} value={it.h} onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) => setH(it, Number(e.target.value))} style={S.sizeInput} /> in
                        </span>
                      </label>
                      <label style={S.check}>
                        <input type="checkbox" checked={it.lock} onChange={(e) => patch(it.key, { lock: e.target.checked })} /> Lock aspect ratio
                      </label>
                      {d && (
                        <div style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12px" }}>
                          <span style={{ width: "11px", height: "11px", borderRadius: "2px", background: d.color }} />
                          <span style={{ fontWeight: 700 }}>{d.label}</span>
                          <span style={{ marginLeft: "auto", color: "#666" }}>({d.dpi} DPI)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button disabled={busy || !u?.isImage}
                      onClick={() => (it.originalUid ? p.onRestoreBackground(it) : p.onRemoveBackground(it))}
                      style={{ ...S.tool, ...(it.originalUid ? S.toolOn : null) }}>
                      {it.originalUid ? "✓ Background removed" : "Remove background"}
                    </button>
                    <button disabled={busy || !u?.isImage} onClick={() => p.onUpscale(it.uid)} style={S.tool}>Upscale</button>
                    <button disabled={busy} onClick={() => p.onPressCheck(it)} style={{ ...S.tool, ...S.pressCheck }}>✓ Print check</button>
                  </div>

                  {check === "loading" && <div style={{ fontSize: "12px", color: "#666" }}>Checking…</div>}
                  {check && check !== "loading" && <PrintCheck result={check} />}

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={S.stepper}>
                      <button onClick={() => patch(it.key, { qty: Math.max(1, it.qty - 1) })} style={S.stepBtn} aria-label="Fewer">−</button>
                      <input type="number" min={1} value={it.qty} onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => patch(it.key, { qty: Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))) })}
                        style={S.stepInput} />
                      <button onClick={() => patch(it.key, { qty: Math.min(999, it.qty + 1) })} style={S.stepBtn} aria-label="More">+</button>
                    </div>
                    <button onClick={() => p.setItems((cur) => {
                      const i = cur.findIndex((x) => x.key === it.key);
                      const copy = { ...it, key: `${it.key}-${Math.random().toString(36).slice(2, 7)}` };
                      return [...cur.slice(0, i + 1), copy, ...cur.slice(i + 1)];
                    })} style={{ ...S.small, marginLeft: "auto" }}>Duplicate</button>
                    <button onClick={() => p.setItems((cur) => cur.filter((x) => x.key !== it.key))} style={{ ...S.small, ...S.danger }}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>

        </>
      )}

      {p.message && <div style={S.message}>{p.message}</div>}
    </div>

    {/* The action bar sits below the scrolling list, so it never covers a card. */}
    {p.items.length > 0 && (
      <div style={S.footer}>
            <Adders onUpload={() => fileRef.current?.click()} onPick={setPicker} uploading={p.uploading} compact />
            <span style={{ marginLeft: "auto", fontSize: "13px", color: "#444" }}>
              {totalPieces} piece{totalPieces === 1 ? "" : "s"} from {p.items.length} design{p.items.length === 1 ? "" : "s"}
            </span>
            <button onClick={() => p.onApply({ layout, inset, gap: useGap ? gap : 0 })}
              disabled={!totalPieces || !!p.busyKey} style={{ ...S.apply, opacity: !totalPieces || p.busyKey ? 0.5 : 1 }}>
              Apply
            </button>
          </div>
    )}

      {picker && (
        <div style={S.pickerBackdrop} onClick={() => setPicker(null)}>
          <div style={S.pickerBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <strong>{picker === "mine" ? "My images" : "Design gallery"}</strong>
              <button onClick={() => setPicker(null)} style={S.close}>✕</button>
            </div>
            {(picker === "mine" ? p.myImages : p.galleryDesigns).length === 0 ? (
              <div style={{ fontSize: "13px", color: "#888", padding: "20px 0", textAlign: "center" }}>Nothing here yet.</div>
            ) : (
              <div style={S.pickGrid}>
                {(picker === "mine" ? p.myImages : p.galleryDesigns).map((d, i) => (
                  <button key={`${d.file_url}-${i}`} onClick={() => { p.onPick(d); setPicker(null); }} style={S.pickTile} title={d.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.file_url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "contain", background: "#F6F6F7" }} />
                    <span style={{ display: "block", fontSize: "10px", color: "#555", padding: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Adders({ onUpload, onPick, uploading, compact }: {
  onUpload: () => void; onPick: (w: "mine" | "gallery") => void; uploading: boolean; compact?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: compact ? "flex-start" : "center" }}>
      <button onClick={onUpload} disabled={uploading} style={S.primary}>{uploading ? "Uploading…" : "Upload image(s)"}</button>
      <button onClick={() => onPick("mine")} style={S.secondary}>From my images</button>
      <button onClick={() => onPick("gallery")} style={S.secondary}>From gallery</button>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  shell: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" },
  wrap: { flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: "14px" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" },
  title: { fontSize: "17px", fontWeight: 800, color: "#1A1A1A" },
  sub: { fontSize: "12.5px", color: "#666", marginTop: "3px" },
  row: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", color: "#333" },
  check: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#333", cursor: "pointer" },
  num: { width: "70px", padding: "7px 8px", border: "1px solid #D8D5CF", borderRadius: "7px", fontSize: "13px" },
  hint: { fontSize: "12px", color: "#92400E", marginLeft: "8px" },
  card: { border: "1px solid #E5E3DE", borderRadius: "12px", padding: "14px" },
  layout: { width: "240px", padding: 0, border: "1.5px solid #E5E3DE", borderRadius: "10px", background: "#fff", cursor: "pointer", overflow: "hidden" },
  layoutOn: { borderColor: "#1A1A1A", boxShadow: "0 0 0 1px #1A1A1A" },
  radio: { width: "14px", height: "14px", borderRadius: "50%", border: "2px solid #9CA3AF", flexShrink: 0, marginTop: "2px" },
  radioOn: { borderColor: "#1A1A1A", boxShadow: "inset 0 0 0 3px #fff", background: "#1A1A1A" },
  empty: { border: "1.5px dashed #D8D5CF", borderRadius: "12px", padding: "34px 18px", textAlign: "center" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: "12px" },
  item: { border: "1px solid #E5E3DE", borderRadius: "12px", padding: "12px", display: "grid", gap: "10px", alignContent: "start" },
  preview: { position: "relative", width: "130px", height: "130px", flexShrink: 0, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "repeating-conic-gradient(#E8E8E8 0% 25%, #fff 0% 50%) 50% / 14px 14px" },
  busy: { position: "absolute", inset: 0, background: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, textAlign: "center", padding: "6px" },
  field: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "12.5px", color: "#333" },
  unitWrap: { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#666" },
  sizeInput: { width: "88px", padding: "6px 8px", border: "1px solid #D8D5CF", borderRadius: "7px", fontSize: "13px" },
  tool: { padding: "7px 11px", border: "1px solid #D8D5CF", background: "#fff", borderRadius: "7px", fontSize: "12px", fontWeight: 700, color: "#1A1A1A", cursor: "pointer" },
  toolOn: { background: "#F0FDF4", borderColor: "#86EFAC", color: "#166534" },
  pressCheck: { background: "#1A1A1A", borderColor: "#1A1A1A", color: "#fff" },
  stepper: { display: "inline-flex", alignItems: "center", border: "1px solid #D8D5CF", borderRadius: "8px", overflow: "hidden" },
  stepBtn: { width: "30px", height: "30px", border: "none", background: "#1A1A1A", color: "#fff", fontSize: "16px", fontWeight: 700, cursor: "pointer" },
  stepInput: { width: "52px", height: "30px", border: "none", textAlign: "center", fontSize: "13px" },
  small: { padding: "7px 11px", border: "1px solid #D8D5CF", background: "#fff", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
  danger: { color: "#B91C1C", borderColor: "#FECACA" },
  footer: { flexShrink: 0, display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "12px 22px", background: "#fff", borderTop: "1px solid #EDEBE7", boxShadow: "0 -4px 12px rgba(0,0,0,.04)" },
  apply: { padding: "11px 30px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "9px", fontSize: "14px", fontWeight: 800, cursor: "pointer" },
  primary: { padding: "10px 16px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  secondary: { padding: "10px 16px", background: "#fff", color: "#1A1A1A", border: "1px solid #D8D5CF", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  ghost: { padding: "8px 14px", background: "#fff", color: "#1A1A1A", border: "1px solid #D8D5CF", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  message: { background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: "8px", padding: "10px 12px", fontSize: "13px" },
  pickerBackdrop: { position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  pickerBox: { width: "min(620px, 100%)", maxHeight: "80vh", overflowY: "auto", background: "#fff", borderRadius: "12px", padding: "16px" },
  pickGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "8px" },
  pickTile: { border: "1px solid #E5E3DE", borderRadius: "8px", padding: 0, background: "#fff", cursor: "pointer", overflow: "hidden" },
  close: { border: "none", background: "none", fontSize: "16px", cursor: "pointer", color: "#666" },
};
