"use client";

/**
 * UploadBySizeModal — the buyer's "Upload by size" flow.
 *
 * Upload one or more designs, set each one's exact width × height and quantity,
 * and we print them pre-cut. Price comes from the product's area-tiered table
 * (set in the gang-sheet admin): a bigger print falls to a cheaper per-sq-inch
 * rate. The figure shown is a live mirror of the server calc — the backend
 * recomputes on add-to-cart, so the price is never client-trusted.
 *
 * Each design carries its own artwork tools. They are the same ones the gang
 * sheet studio uses — background removal, upscale, halftone, crop and colour —
 * so a fix made here behaves identically there.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { gangSheetsService, priceUploadBySize } from "@/services/gangSheets.service";
import { cartService } from "@/services/cart.service";
import { useAuthStore } from "@/stores/auth.store";
import { ImageEditorModal } from "@/components/storefront/ImageEditorModal";
import { WorkingOverlay } from "@/components/storefront/WorkingOverlay";
import { removeImageBackground, BackgroundRemovalError } from "@/lib/backgroundRemoval";
import type { ProductDetail } from "@/types/product.types";

interface Props {
  product: ProductDetail;
  onClose: () => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/** One design on the order: its artwork, its print size, its quantity. */
interface Item {
  id: number;
  file_url: string;
  file_name: string;
  file_type: string;
  pxW: number;
  pxH: number;
  aspect: number;      // pxW / pxH
  w: number;
  h: number;
  qty: number;
  lockAspect: boolean;
}

/** Preset print widths, in inches — the height follows from the artwork. */
const PRESETS: { key: string; w: number }[] = [
  { key: "XS", w: 2 }, { key: "S", w: 3 }, { key: "M", w: 4 }, { key: "L", w: 6 },
  { key: "XL", w: 8 }, { key: "2XL", w: 10 }, { key: "3XL", w: 11 }, { key: "4XL", w: 12 },
  { key: "5XL", w: 13 }, { key: "6XL", w: 14 },
];

/** Checkerboard so a transparent design reads as transparent, not white. */
const CHECKER =
  "repeating-conic-gradient(#E8E8E8 0% 25%, #ffffff 0% 50%) 50% / 16px 16px";
const BG_OPTIONS = [
  { key: "checker", css: CHECKER, label: "Transparent" },
  { key: "white", css: "#ffffff", label: "White" },
  { key: "grey", css: "#9CA3AF", label: "Grey" },
  { key: "black", css: "#111111", label: "Black" },
  { key: "colour", css: "linear-gradient(135deg,#F87171,#FBBF24,#34D399,#60A5FA)", label: "Colour" },
];

function dpiBand(dpi: number) {
  if (dpi >= 300) return { color: "#16A34A", label: "Optimal" };
  if (dpi >= 250) return { color: "#CA8A04", label: "Good" };
  if (dpi >= 200) return { color: "#EA580C", label: "Fair" };
  return { color: "#DC2626", label: "Low" };
}

export function UploadBySizeModal({ product, onClose }: Props) {
  const { isAuthenticated } = useAuthStore();
  const config = product.gang_sheet_config ?? null;
  const maxW = Number(config?.printer_width) || 22;
  const maxH = Number(config?.max_height) || 200;

  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgKey, setBgKey] = useState("checker");
  const [editorTab, setEditorTab] = useState<"enhance" | "halftone" | "crop" | "colors" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [dropActive, setDropActive] = useState(false);

  const active = items.find((i) => i.id === activeId) ?? null;
  const bg = BG_OPTIONS.find((b) => b.key === bgKey) ?? BG_OPTIONS[0]!;

  /** What each design costs, and what the order comes to. */
  const priced = useMemo(
    () =>
      items.map((it) => ({
        id: it.id,
        price: priceUploadBySize(config, it.w, it.h, it.qty),
      })),
    [items, config],
  );
  const activePrice = priced.find((p) => p.id === activeId)?.price ?? null;
  const orderTotal = priced.reduce((sum, p) => sum + (p.price?.total ?? 0), 0);
  const totalArea = items.reduce((sum, it) => sum + it.w * it.h * it.qty, 0);

  /** The preset whose width matches, if any — otherwise the size is custom. */
  const activePreset = active
    ? PRESETS.find((p) => Math.abs(p.w - active.w) < 0.01)?.key ?? null
    : null;

  const dpi = active && active.w > 0 && active.pxW
    ? Math.floor(Math.min(active.pxW / active.w, active.pxH / active.h))
    : 0;
  const band = dpiBand(dpi);

  // Lock scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function readDims(src: string): Promise<{ w: number; h: number }> {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = rej;
      img.src = src;
    });
  }

  function patch(id: number, p: Partial<Item>) {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }

  async function onFiles(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    if (!chosen.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of chosen) {
        const res = await gangSheetsService.uploadArtwork(file);
        let pxW = 0, pxH = 0;
        const type = (res.type || file.name.split(".").pop() || "").toLowerCase();
        try { const d = await readDims(res.url); pxW = d.w; pxH = d.h; } catch { /* vector — dims unknown */ }
        const aspect = pxW && pxH ? pxW / pxH : 1;

        // A sensible opening size: about 10in wide, or the printer width if that
        // is narrower, with the height following the artwork's own proportions.
        let startW = Math.min(maxW, 10);
        let startH = round2(startW / aspect);
        if (startH > maxH) { startH = maxH; startW = round2(startH * aspect); }

        const id = nextId.current++;
        setItems((list) => [...list, {
          id, file_url: res.url, file_name: res.file_name, file_type: type,
          pxW, pxH, aspect,
          w: round2(clamp(startW, 0.5, maxW)),
          h: round2(clamp(startH, 0.5, maxH)),
          qty: 1, lockAspect: true,
        }]);
        setActiveId(id);
      }
    } catch {
      setError("That file could not be uploaded. Allowed: PNG, JPG, JPEG, SVG (max 50 MB).");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setWidth(val: number) {
    if (!active) return;
    const nw = clamp(val, 0.5, maxW);
    patch(active.id, {
      w: round2(nw),
      ...(active.lockAspect ? { h: round2(clamp(nw / active.aspect, 0.5, maxH)) } : {}),
    });
  }
  function setHeight(val: number) {
    if (!active) return;
    const nh = clamp(val, 0.5, maxH);
    patch(active.id, {
      h: round2(nh),
      ...(active.lockAspect ? { w: round2(clamp(nh * active.aspect, 0.5, maxW)) } : {}),
    });
  }
  function applyPreset(widthIn: number) {
    if (!active) return;
    const nw = clamp(widthIn, 0.5, maxW);
    patch(active.id, { w: round2(nw), h: round2(clamp(nw / active.aspect, 0.5, maxH)) });
  }
  /** Put the artwork back to its own proportions after a free resize. */
  function resetAspect() {
    if (!active) return;
    patch(active.id, { h: round2(clamp(active.w / active.aspect, 0.5, maxH)), lockAspect: true });
  }

  /** Upload an edited version and point the design at it. */
  async function replaceArtwork(id: number, file: File, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await gangSheetsService.uploadArtwork(file);
      let pxW = 0, pxH = 0;
      try { const d = await readDims(res.url); pxW = d.w; pxH = d.h; } catch { /* ignore */ }
      const aspect = pxW && pxH ? pxW / pxH : 1;
      // The print size the buyer chose is kept; only the artwork changed. The
      // height follows the new proportions when the ratio is still locked.
      setItems((list) => list.map((it) => it.id !== id ? it : {
        ...it,
        file_url: res.url, file_name: res.file_name,
        file_type: (res.type || it.file_type).toLowerCase(),
        pxW, pxH, aspect,
        h: it.lockAspect ? round2(clamp(it.w / aspect, 0.5, maxH)) : it.h,
      }));
    } catch {
      setError(`${label} finished, but the result could not be uploaded. Please try again.`);
    } finally {
      setBusy(null);
    }
  }

  /** Fetch the current artwork back as a File so a tool can work on it. */
  async function currentAsFile(it: Item): Promise<File> {
    const blob = await (await fetch(it.file_url)).blob();
    return new File([blob], it.file_name, { type: blob.type || "image/png" });
  }

  async function removeBg() {
    if (!active) return;
    setBusy("Removing the background");
    setProgress(null);
    setError(null);
    try {
      const file = await currentAsFile(active);
      const png = await removeImageBackground(file, (p) => {
        setBusy(p.label);
        setProgress(p.ratio);
      });
      setProgress(null);
      await replaceArtwork(active.id, png, "Background removal");
    } catch (e) {
      // A model that found no subject has a message worth reading; anything
      // else is a failure to finish, and the artwork is left as it was.
      setError(e instanceof BackgroundRemovalError
        ? e.message
        : "Background removal didn't finish. Try a smaller file, or a different browser.");
      setProgress(null);
      setBusy(null);
    }
  }

  function removeItem(id: number) {
    setItems((list) => {
      const next = list.filter((it) => it.id !== id);
      if (id === activeId) setActiveId(next[next.length - 1]?.id ?? null);
      return next;
    });
  }

  async function addToCart() {
    if (!items.length) { setError("Upload a design first."); return; }
    if (!isAuthenticated()) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    if (!priced.every((p) => p.price)) {
      setError("This product has no pricing set yet — please contact the store.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      // Each design is its own print job, so each becomes its own order and its
      // own cart line — the same shape the sheet builder uses.
      for (const it of items) {
        const order = await gangSheetsService.submitUploadBySize({
          product_id: product.id,
          width_in: it.w,
          height_in: it.h,
          quantity: it.qty,
          file_url: it.file_url,
          file_name: it.file_name,
          file_type: it.file_type,
        });
        await cartService.addGangSheet(order.id);
      }
      window.location.href = "/cart";
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not add this to your cart. Please try again.");
      setAdding(false);
    }
  }

  const isImage = active && ["png", "jpg", "jpeg", "webp", "gif"].includes(active.file_type);

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div
        style={{ ...S.modal, width: items.length ? "min(1100px, 100%)" : "min(560px, 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={S.header}>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={S.uploadBtn}>
            {uploading ? "Uploading…" : "＋ Uploads"}
          </button>
          <button onClick={onClose} aria-label="Close" style={S.close}>✕</button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.svg,image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />

        <div style={items.length ? S.body : S.bodyEmpty}>
          {/* ── Left: the design ─────────────────────────────────────────── */}
          <div style={S.left}>
            {active ? (
              <>
                <div style={S.dpiRow}>
                  Resolution:{" "}
                  <strong style={{ color: band.color }}>
                    {dpi ? `${dpi} DPI · ${band.label}` : "—"}
                  </strong>
                </div>
                <div style={{ ...S.stage, background: bg.css }}>
                  {/* Size callouts, the way a print shop marks a proof. */}
                  <span style={{ ...S.tag, top: "6px", left: "50%", transform: "translateX(-50%)" }}>
                    {active.w}in
                  </span>
                  <span style={{ ...S.tag, left: "6px", top: "50%", transform: "translateY(-50%)" }}>
                    {active.h}in
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={active.file_url} alt={active.file_name} style={S.art} />
                  {busy && (
                    <WorkingOverlay
                      label={`${busy}…`}
                      progress={progress}
                      note={busy.startsWith("Downloading")
                        ? "Only the first time — after this it's quick."
                        : undefined}
                    />
                  )}
                </div>

                <div style={S.bgRow}>
                  <span style={{ fontSize: "11px", color: "#8A8A8A" }}>Visual BG:</span>
                  {BG_OPTIONS.map((b) => (
                    <button
                      key={b.key}
                      onClick={() => setBgKey(b.key)}
                      title={b.label}
                      style={{
                        ...S.bgSwatch,
                        background: b.css,
                        borderColor: bgKey === b.key ? "#1A1A1A" : "#D6D3CC",
                        borderWidth: bgKey === b.key ? "2px" : "1px",
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
                onDragLeave={() => setDropActive(false)}
                onDrop={(e) => { e.preventDefault(); setDropActive(false); onFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                style={{ ...S.dropzone, borderColor: dropActive ? "#1A1A1A" : "#D6D3CC", background: dropActive ? "#F6F6F7" : "#fff" }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                  <span style={S.dropIcon}>↑</span>
                  <span style={{ fontWeight: 700, fontSize: "15px", color: "#1A1A1A" }}>
                    Drop your design here, or click to upload
                  </span>
                  <span style={{ fontSize: "12px", color: "#8A8A8A", lineHeight: 1.7, maxWidth: "330px" }}>
                    PNG, JPG or SVG. Add as many as you like — each one gets its own
                    size, quantity and price.
                  </span>
                </div>
                {uploading && <WorkingOverlay label="Uploading your design…" note="Large files take a moment." />}
              </div>
            )}
          </div>

          {/* ── Right: tools, size, price ────────────────────────────────── */}
          {items.length > 0 && <div style={S.right}>
            {active && (
              <>
                <div style={S.toolGrid}>
                  <button onClick={removeBg} disabled={!isImage || !!busy} style={S.tool}>
                    <span style={S.toolIcon}>◫</span>Remove BG
                  </button>
                  <button onClick={() => setEditorTab("enhance")} disabled={!isImage || !!busy} style={S.tool}>
                    <span style={S.toolIcon}>⤢</span>Upscale
                  </button>
                  <button onClick={() => setEditorTab("halftone")} disabled={!isImage || !!busy} style={S.tool}>
                    <span style={S.toolIcon}>⁘</span>Halftone
                  </button>
                </div>

                <div style={S.editBar}>EDIT</div>
                <div style={S.editGrid}>
                  <button onClick={() => setEditorTab("crop")} disabled={!isImage || !!busy} style={S.tool}>
                    <span style={S.toolIcon}>⌗</span>Crop
                  </button>
                  <button onClick={() => setEditorTab("colors")} disabled={!isImage || !!busy} style={S.tool}>
                    <span style={S.toolIcon}>◑</span>Colors
                  </button>
                </div>

                {/* Aspect ratio */}
                <div style={S.ratioRow}>
                  <span style={{ fontSize: "13px", color: "#1A1A1A" }}>
                    Keep Aspect Ratio ({active.aspect.toFixed(2)})
                  </span>
                  <button onClick={resetAspect} title="Reset to the artwork's own proportions" style={S.resetBtn}>↺</button>
                  <button
                    onClick={() => patch(active.id, { lockAspect: !active.lockAspect })}
                    aria-label="Toggle aspect ratio lock"
                    style={{ ...S.switch, background: active.lockAspect ? "#1A1A1A" : "#D6D3CC" }}
                  >
                    <span style={{ ...S.knob, left: active.lockAspect ? "22px" : "3px" }} />
                  </button>
                </div>

                {/* Size presets */}
                <div style={S.presetWrap}>
                  {/* Which chip is lit is read back from the width itself, so
                      typing 6 by hand lights L, and nudging it off a preset
                      falls back to Custom without any extra state to keep. */}
                  <button
                    onClick={() => { /* the size fields are already free-form */ }}
                    style={{ ...S.preset, ...(activePreset ? null : S.presetActive) }}
                  >
                    Custom
                  </button>
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => applyPreset(p.w)}
                      title={`${p.w}in wide`}
                      style={{ ...S.preset, ...(activePreset === p.key ? S.presetActive : null) }}
                    >
                      {p.key}
                    </button>
                  ))}
                </div>

                {/* Width / height / quantity */}
                <div style={S.sizeGrid}>
                  <div>
                    <label style={S.label}>Width (in)</label>
                    <input type="number" min={0.5} max={maxW} step={0.01} value={active.w}
                      onChange={(e) => setWidth(Number(e.target.value))} style={S.input} />
                    <div style={S.hint}>Max is {maxW} in</div>
                  </div>
                  <div>
                    <label style={S.label}>Height (in)</label>
                    <input type="number" min={0.5} max={maxH} step={0.01} value={active.h}
                      onChange={(e) => setHeight(Number(e.target.value))} style={S.input} />
                    <div style={S.hint}>Max is {maxH} in</div>
                  </div>
                  <div>
                    <label style={S.label}>Quantity</label>
                    <input type="number" min={1} step={1} value={active.qty}
                      onChange={(e) => patch(active.id, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                      style={S.input} />
                  </div>
                </div>
              </>
            )}

            {/* Every design on this order, with what each one costs. */}
            <div style={S.strip}>
              <button onClick={() => fileRef.current?.click()} title="Add another design" style={S.addTile}>＋</button>
              {items.map((it) => {
                const p = priced.find((x) => x.id === it.id)?.price ?? null;
                const on = it.id === activeId;
                return (
                  <div key={it.id} style={{ textAlign: "center" }}>
                    <button
                      onClick={() => setActiveId(it.id)}
                      style={{ ...S.thumb, borderColor: on ? "#1A1A1A" : "#E2E2DE", borderWidth: on ? "2px" : "1px" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      <span style={S.qtyBadge}>{it.qty}</span>
                      {p && <span style={S.priceBadge}>${p.total.toFixed(2)}</span>}
                      <span
                        onClick={(e) => { e.stopPropagation(); removeItem(it.id); }}
                        title="Remove this design"
                        style={S.removeDot}
                      >✕</span>
                    </button>
                    <div style={{ fontSize: "10px", color: "#8A8A8A", marginTop: "3px" }}>
                      {it.w}in × {it.h}in
                    </div>
                  </div>
                );
              })}
            </div>

            {error && <div style={S.error}>{error}</div>}

            {/* Price breakdown — the same arithmetic the server will redo. */}
            {items.length > 0 && (
              <div style={S.priceBox}>
                {activePrice && (
                  <>
                    <Row label={<>Price / in<sup>2</sup>:</>} value={`$${activePrice.rate.toFixed(4)}`} />
                    <Row label="Total Area:" value={<>{totalArea.toFixed(2)} in<sup>2</sup></>} />
                    <Row
                      label="Price:"
                      value={
                        <span style={{ color: "#6B6B6B" }}>
                          {(active!.w * active!.h).toFixed(2)} in<sup>2</sup> × {active!.qty} × {activePrice.rate.toFixed(4)}/in<sup>2</sup> = ${activePrice.total.toFixed(2)}
                        </span>
                      }
                    />
                  </>
                )}
                <div style={S.totalRow}>
                  <span>Total Price:</span>
                  <span style={{ fontSize: "22px", fontWeight: 800 }}>${orderTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div style={S.footer}>
          <button onClick={onClose} style={S.ghost}>Cancel</button>
          <button
            onClick={addToCart}
            disabled={adding || !items.length || !!busy}
            style={{ ...S.cta, ...(items.length ? null : S.ctaOff) }}
          >
            {items.length > 0 && <span style={S.ctaCount}>{items.length}</span>}
            {adding ? "Adding…" : isAuthenticated() ? "Add To Cart" : "Sign in to order"}
          </button>
        </div>
      </div>

      {/* The studio's editor, so both flows share one set of tools. */}
      {editorTab && active && (
        <ImageEditorModal
          src={active.file_url}
          fileName={active.file_name}
          initialTab={editorTab}
          onClose={() => setEditorTab(null)}
          onApply={(file) => { setEditorTab(null); replaceArtwork(active.id, file, "Edit"); }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "5px 0", fontSize: "13px" }}>
      <span style={{ color: "#6B6B6B" }}>{label}</span>
      <span style={{ color: "#1A1A1A", textAlign: "right" }}>{value}</span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
  modal: { background: "#fff", borderRadius: "14px", maxHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #EFEFEC" },
  uploadBtn: { background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 18px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  close: { width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #E2E2DE", background: "#fff", cursor: "pointer", fontSize: "14px", color: "#6B6B6B" },
  body: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,420px)", gap: "18px", padding: "18px", overflowY: "auto" },
  bodyEmpty: { padding: "26px 22px", overflowY: "auto" },
  left: { minWidth: 0 },
  right: { minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" },
  dpiRow: { fontSize: "12px", color: "#6B6B6B", textAlign: "center", marginBottom: "8px" },
  stage: { position: "relative", border: "1.5px dashed #9CA3AF", borderRadius: "6px", minHeight: "320px", display: "grid", placeItems: "center", padding: "18px", overflow: "hidden" },
  art: { maxWidth: "100%", maxHeight: "360px", objectFit: "contain", display: "block" },
  tag: { position: "absolute", background: "#1A1A1A", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", zIndex: 2 },
  bgRow: { display: "flex", alignItems: "center", gap: "7px", justifyContent: "center", marginTop: "10px" },
  bgSwatch: { width: "22px", height: "22px", borderRadius: "5px", borderStyle: "solid", cursor: "pointer", padding: 0 },
  dropzone: { position: "relative", border: "1.5px dashed", borderRadius: "12px", minHeight: "210px", display: "grid", placeItems: "center", textAlign: "center", cursor: "pointer", padding: "28px", transition: "border-color .15s, background .15s" },
  dropIcon: { width: "42px", height: "42px", borderRadius: "50%", background: "#F3F3F1", color: "#1A1A1A", fontSize: "19px", display: "grid", placeItems: "center" },
  toolGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" },
  editBar: { textAlign: "center", fontSize: "10px", fontWeight: 700, letterSpacing: ".08em", color: "#8A8A8A", background: "#F6F6F7", borderRadius: "6px", padding: "5px" },
  editGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" },
  tool: { display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "12px 8px", border: "1px solid #E2E2DE", borderRadius: "9px", background: "#fff", color: "#1A1A1A", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
  toolIcon: { fontSize: "17px", lineHeight: 1 },
  busy: { background: "#F6F6F7", border: "1px solid #E2E2DE", borderRadius: "8px", padding: "9px 12px", fontSize: "12px", color: "#4A4A4A" },
  ratioRow: { display: "flex", alignItems: "center", gap: "8px" },
  resetBtn: { border: "none", background: "none", cursor: "pointer", color: "#6B6B6B", fontSize: "14px" },
  switch: { marginLeft: "auto", width: "44px", height: "24px", borderRadius: "14px", border: "none", cursor: "pointer", position: "relative", padding: 0 },
  knob: { position: "absolute", top: "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left .15s" },
  presetWrap: { display: "flex", flexWrap: "wrap", gap: "6px" },
  preset: { padding: "8px 13px", borderRadius: "7px", border: "1px solid #E2E2DE", background: "#fff", color: "#1A1A1A", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
  presetActive: { background: "#1A1A1A", color: "#fff", borderColor: "#1A1A1A" },
  sizeGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" },
  label: { display: "block", fontSize: "12px", fontWeight: 600, color: "#4A4A4A", marginBottom: "5px" },
  input: { width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid #D6D3CC", borderRadius: "8px", fontSize: "14px" },
  hint: { fontSize: "10px", color: "#9CA3AF", marginTop: "3px" },
  strip: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-start", paddingTop: "4px" },
  addTile: { width: "74px", height: "74px", borderRadius: "9px", border: "1.5px dashed #D6D3CC", background: "#fff", color: "#9CA3AF", fontSize: "22px", cursor: "pointer" },
  thumb: { position: "relative", width: "74px", height: "74px", borderRadius: "9px", borderStyle: "solid", background: "#fff", padding: "5px", cursor: "pointer", overflow: "visible" },
  qtyBadge: { position: "absolute", top: "-7px", right: "-7px", background: "#1A1A1A", color: "#fff", fontSize: "10px", fontWeight: 700, borderRadius: "50%", width: "19px", height: "19px", display: "grid", placeItems: "center" },
  priceBadge: { position: "absolute", bottom: "-8px", left: "50%", transform: "translateX(-50%)", background: "#1A1A1A", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "10px", whiteSpace: "nowrap" },
  removeDot: { position: "absolute", top: "-7px", left: "-7px", background: "#fff", border: "1px solid #E2E2DE", color: "#B91C1C", fontSize: "9px", borderRadius: "50%", width: "18px", height: "18px", display: "grid", placeItems: "center" },
  priceBox: { border: "1px solid #E2E2DE", borderRadius: "10px", padding: "12px 14px", background: "#FAFAF8" },
  totalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E2DE", marginTop: "8px", paddingTop: "10px", fontSize: "15px", fontWeight: 800, color: "#1A1A1A" },
  error: { background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: "8px", padding: "9px 12px", fontSize: "12px" },
  footer: { display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 18px", borderTop: "1px solid #EFEFEC" },
  ghost: { padding: "12px 20px", background: "#fff", color: "#4A4A4A", border: "1px solid #D6D3CC", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  ctaOff: { background: "#D6D3CC", cursor: "not-allowed" },
  cta: { position: "relative", padding: "13px 30px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "9px" },
  ctaCount: { background: "#fff", color: "#1A1A1A", borderRadius: "50%", width: "20px", height: "20px", fontSize: "11px", fontWeight: 800, display: "grid", placeItems: "center" },
};
