"use client";

/**
 * UploadBySizeModal — the buyer's "Upload by size" flow.
 *
 * The simplest DTF option (mirrors EZDTFMaker's "Upload Image By Size"): upload
 * ONE design, set its exact width×height + quantity, and we print it pre-cut.
 * Price comes from the product's area-tiered table (set in the gang-sheet admin):
 * bigger prints fall to a cheaper per-sq-inch rate. The estimate shown here is a
 * live mirror of the server calc — the backend recomputes authoritatively on
 * "Add to Cart" so the price is never client-trusted.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { gangSheetsService, priceUploadBySize } from "@/services/gangSheets.service";
import { cartService } from "@/services/cart.service";
import { useAuthStore } from "@/stores/auth.store";
import type { ProductDetail } from "@/types/product.types";

interface Props {
  product: ProductDetail;
  onClose: () => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

interface Uploaded {
  file_url: string;
  file_name: string;
  file_type: string;
  pxW: number;
  pxH: number;
  aspect: number; // pxW / pxH
}

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

  const [up, setUp] = useState<Uploaded | null>(null);
  const [uploading, setUploading] = useState(false);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const [qty, setQty] = useState(1);
  const [lockAspect, setLockAspect] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);

  const price = useMemo(() => priceUploadBySize(config, w, h, qty), [config, w, h, qty]);
  const dpi = up && w > 0 && h > 0 ? Math.floor(Math.min(up.pxW / w, up.pxH / h)) : 0;
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

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await gangSheetsService.uploadArtwork(file);
      let pxW = 0, pxH = 0;
      const type = (res.type || file.name.split(".").pop() || "").toLowerCase();
      try { const d = await readDims(res.url); pxW = d.w; pxH = d.h; } catch { /* vector — dims unknown */ }
      const aspect = pxW && pxH ? pxW / pxH : 1;
      setUp({ file_url: res.url, file_name: res.file_name, file_type: type, pxW, pxH, aspect });
      // Sensible starting size: ~10in wide (or the printer width, whichever is
      // smaller), height from the aspect, clamped to the product's max height.
      let startW = Math.min(maxW, 10);
      let startH = round2(startW / aspect);
      if (startH > maxH) { startH = maxH; startW = round2(startH * aspect); }
      setW(round2(clamp(startW, 0.5, maxW)));
      setH(round2(clamp(startH, 0.5, maxH)));
    } catch {
      setError("That file could not be uploaded. Allowed: PNG, JPG, JPEG, SVG (max 50 MB).");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setWidth(val: number) {
    const nw = clamp(val, 0.5, maxW);
    setW(round2(nw));
    if (lockAspect && up) setH(round2(clamp(nw / up.aspect, 0.5, maxH)));
  }
  function setHeight(val: number) {
    const nh = clamp(val, 0.5, maxH);
    setH(round2(nh));
    if (lockAspect && up) setW(round2(clamp(nh * up.aspect, 0.5, maxW)));
  }

  async function addToCart() {
    if (!up) { setError("Upload a design first."); return; }
    if (!isAuthenticated()) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    if (!price) { setError("This product has no pricing set yet — please contact the store."); return; }
    setAdding(true);
    setError(null);
    try {
      const order = await gangSheetsService.submitUploadBySize({
        product_id: product.id,
        width_in: w,
        height_in: h,
        quantity: qty,
        file_url: up.file_url,
        file_name: up.file_name,
        file_type: up.file_type,
      });
      await cartService.addGangSheet(order.id);
      window.location.href = "/cart";
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not add this to your cart. Please try again.");
      setAdding(false);
    }
  }

  const isImage = up && ["png", "jpg", "jpeg", "webp", "gif"].includes(up.file_type);

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.uploadsTab}>🖼 Upload by size</div>
          <button onClick={onClose} style={S.closeX} aria-label="Close">✕</button>
        </div>

        <div style={S.bodyWrap}>
          {!up ? (
            /* ── Step 1: upload ─────────────────────────────────────────── */
            <div
              onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(e) => { e.preventDefault(); setDropActive(false); onFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              style={{ ...S.dropzone, borderColor: dropActive ? "var(--brand-primary,#1C3557)" : "#7FB6E6", background: dropActive ? "#EEF6FF" : "#FBFDFF" }}
            >
              <div style={{ fontSize: "13px", color: "#555", marginBottom: "12px" }}>Drag &amp; drop artwork file or</div>
              <div style={S.chooseBtn}>{uploading ? "Uploading…" : "Choose File"} <span style={{ fontWeight: 400, opacity: 0.8 }}>(Max 50MB)</span></div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "16px" }}>File types supported</div>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "8px" }}>
                {[".SVG", ".JPG", ".JPEG", ".PNG"].map((t) => (
                  <span key={t} style={S.typePill}>{t}</span>
                ))}
              </div>
            </div>
          ) : (
            /* ── Step 2: size + price ───────────────────────────────────── */
            <div style={S.grid}>
              {/* Preview */}
              <div style={S.previewCard}>
                <div style={{ textAlign: "center", fontSize: "13px", color: "#555", marginBottom: "10px" }}>
                  Resolution: <strong style={{ color: band.color }}>{dpi} DPI</strong> <span style={{ color: band.color, fontWeight: 700 }}>· {band.label}</span>
                </div>
                <div style={S.previewBox}>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={up.file_url} alt={up.file_name} style={{ maxWidth: "100%", maxHeight: "340px", objectFit: "contain" }} />
                  ) : (
                    <div style={{ padding: "40px", color: "#4338CA", fontWeight: 800, fontSize: "22px" }}>{up.file_type.toUpperCase()}</div>
                  )}
                </div>
                <button onClick={() => { setUp(null); setError(null); }} style={S.replaceBtn}>↺ Replace image</button>
              </div>

              {/* Controls */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700 }}>Keep Aspect Ratio {up.aspect ? `(${round2(up.aspect)})` : ""}</span>
                  <button onClick={() => setLockAspect((v) => !v)} style={{ ...S.toggle, background: lockAspect ? "var(--brand-primary,#1C3557)" : "#CBD5E1" }}>
                    <span style={{ ...S.knob, transform: lockAspect ? "translateX(18px)" : "translateX(0)" }} />
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <Field label="Width (in)" hint={`Max is ${maxW} in`}>
                    <input type="number" min={0.5} max={maxW} step={0.1} value={w || ""} onChange={(e) => setWidth(Number(e.target.value) || 0)} style={S.num} />
                  </Field>
                  <Field label="Height (in)" hint={`Max is ${maxH} in`}>
                    <input type="number" min={0.5} max={maxH} step={0.1} value={h || ""} onChange={(e) => setHeight(Number(e.target.value) || 0)} style={S.num} />
                  </Field>
                  <Field label="Quantity">
                    <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} style={S.num} />
                  </Field>
                </div>

                {/* Price breakdown */}
                {price ? (
                  <div style={S.priceCard}>
                    <Row k="Price / in²" v={`$${price.rate.toFixed(3)}`} />
                    <Row k="Total Area" v={`${price.area.toFixed(2)} in²`} />
                    <Row k="Price" v={<span style={{ color: "#666", fontSize: "12px" }}>{price.area.toFixed(2)} in² × {qty} × ${price.rate.toFixed(3)}/in² = ${price.total.toFixed(2)}</span>} />
                    <div style={{ borderTop: "1px solid #E8E6E1", margin: "8px 0" }} />
                    <Row k={<strong style={{ fontSize: "15px" }}>Total Price</strong>} v={<strong style={{ fontSize: "18px" }}>${price.total.toFixed(2)}</strong>} />
                  </div>
                ) : (
                  <div style={{ ...S.priceCard, color: "#B45309" }}>No pricing is set for this product yet.</div>
                )}
              </div>
            </div>
          )}

          {error && <div style={S.errorBar}>{error}</div>}
        </div>

        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" onChange={(e) => onFiles(e.target.files)} style={{ display: "none" }} />

        {/* Footer */}
        <div style={S.footer}>
          <button
            onClick={addToCart}
            disabled={!up || adding || uploading || !price}
            style={{ ...S.cartBtn, opacity: !up || adding || uploading || !price ? 0.55 : 1, cursor: !up || adding ? "default" : "pointer" }}
          >
            🛒 {adding ? "Adding…" : "Add To Cart"}{price && up ? ` · $${price.total.toFixed(2)}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "#444", marginBottom: "4px" }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: "10px", color: "#999", marginTop: "3px" }}>{hint}</div>}
    </label>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "13px" }}>
      <span style={{ color: "#666" }}>{k}</span>
      <span style={{ color: "#111", fontWeight: 600 }}>{v}</span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, zIndex: 300, background: "rgba(20,24,31,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  modal: { width: "min(1040px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#EDEDEF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.35)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "#fff" },
  uploadsTab: { background: "#2AA7E6", color: "#fff", fontWeight: 700, fontSize: "14px", padding: "8px 16px", borderRadius: "8px" },
  closeX: { width: "34px", height: "34px", borderRadius: "50%", border: "1px solid #D7D7DB", background: "#fff", cursor: "pointer", fontSize: "14px", color: "#666" },
  bodyWrap: { padding: "18px", overflowY: "auto", flex: 1 },
  dropzone: { border: "2px dashed #7FB6E6", borderRadius: "12px", padding: "60px 24px", textAlign: "center", cursor: "pointer", background: "#fff", minHeight: "280px", display: "flex", flexDirection: "column", justifyContent: "center" },
  chooseBtn: { display: "inline-block", background: "#2AA7E6", color: "#fff", fontWeight: 700, fontSize: "14px", padding: "12px 22px", borderRadius: "8px" },
  typePill: { border: "1px solid #9DC7EC", color: "#2A6FA7", borderRadius: "6px", padding: "5px 10px", fontSize: "11px", fontWeight: 600, background: "#fff" },
  grid: { display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(300px, 1.2fr)", gap: "18px", alignItems: "start" },
  previewCard: { background: "#fff", borderRadius: "12px", padding: "16px" },
  previewBox: { border: "2px dashed #9DC7EC", borderRadius: "8px", minHeight: "260px", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBFDFF", overflow: "hidden" },
  replaceBtn: { marginTop: "12px", width: "100%", background: "none", border: "1px solid #DDD9D2", borderRadius: "8px", padding: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#555" },
  toggle: { width: "40px", height: "22px", borderRadius: "20px", border: "none", position: "relative", cursor: "pointer", padding: 0 },
  knob: { position: "absolute", top: "2px", left: "2px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "transform .15s" },
  num: { width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #DDD9D2", borderRadius: "8px", fontSize: "14px", background: "#fff" },
  priceCard: { background: "#fff", borderRadius: "12px", padding: "14px 16px", marginTop: "18px" },
  errorBar: { background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginTop: "14px" },
  footer: { display: "flex", justifyContent: "flex-end", padding: "14px 18px", background: "#fff", borderTop: "1px solid #E8E6E1" },
  cartBtn: { background: "#2AA7E6", color: "#fff", border: "none", borderRadius: "10px", padding: "13px 26px", fontSize: "15px", fontWeight: 800 },
};
