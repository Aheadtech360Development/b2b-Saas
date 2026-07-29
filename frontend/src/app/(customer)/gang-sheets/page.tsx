"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GANG_SHEET_STATUS_COLOR,
  GANG_SHEET_STATUS_LABEL,
  gangSheetsService,
  type GangSheetArtwork,
  type GangSheetOrder,
  type GangSheetSize,
  type GangSheetPlacement,
} from "@/services/gangSheets.service";
import { GangSheetCanvas } from "@/components/storefront/GangSheetCanvas";
import { GangSheetTimeline } from "@/components/storefront/GangSheetTimeline";
import { analyzeArtwork, dpiFor, DPI_STYLE } from "@/lib/artworkAnalysis";
import { openSheetPdf } from "@/lib/gangSheetPdf";
import { useAuthStore } from "@/stores/auth.store";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8E6E1",
  borderRadius: "var(--brand-corner-radius, 10px)",
  padding: "22px",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid #DDD9D2",
  borderRadius: "6px",
  fontSize: "14px",
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "#6B6B6B",
  textTransform: "uppercase",
  letterSpacing: ".05em",
  marginBottom: "5px",
};

// Local-only analysis fields (underscore-prefixed) travel with the draft in the
// UI but are stripped before submit — the API only knows the fields in ArtworkIn.
type Draft = Omit<GangSheetArtwork, "id" | "sort_order"> & {
  _pxW?: number;
  _pxH?: number;
  _isImage?: boolean;
  _hasAlpha?: boolean;
  _alphaChecked?: boolean;
};

export default function GangSheetBuilderPage() {
  const { isAuthenticated } = useAuthStore();
  const [sizes, setSizes] = useState<GangSheetSize[]>([]);
  const [sizeId, setSizeId] = useState("");
  const [qty, setQty] = useState(1);
  const [artworks, setArtworks] = useState<Draft[]>([]);
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<GangSheetOrder | null>(null);
  const [orders, setOrders] = useState<GangSheetOrder[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // The product this build belongs to, when arrived here from a product page.
  const [productId, setProductId] = useState<string | null>(null);

  useEffect(() => {
    setProductId(new URLSearchParams(window.location.search).get("product"));
  }, []);

  useEffect(() => {
    gangSheetsService
      .listSizes()
      .then((s) => {
        setSizes(s);
        const first = s[0];
        if (first) setSizeId((cur) => cur || first.id);
      })
      .catch(() => setSizes([]));
  }, []);

  const loadOrders = useCallback(() => {
    if (!isAuthenticated()) return;
    gangSheetsService.myOrders().then(setOrders).catch(() => setOrders([]));
  }, [isAuthenticated]);
  useEffect(loadOrders, [loadOrders]);

  const size = useMemo(() => sizes.find((s) => s.id === sizeId), [sizes, sizeId]);
  const isCustom = size?.pricing_mode === "custom_length";

  // Buyer-chosen length for a custom-length size (inches). Reset to the size's
  // minimum whenever the selected size changes.
  const [customLength, setCustomLength] = useState(0);
  useEffect(() => {
    if (isCustom && size) setCustomLength((cur) => (cur >= size.min_length_in && cur <= size.max_length_in ? cur : size.min_length_in));
  }, [sizeId, isCustom, size]);

  // Effective sheet length + unit price: a custom size uses the chosen length and
  // per-inch price; a fixed size uses its stored height and flat price.
  const effHeight = size ? (isCustom ? customLength : size.height_in) : 0;
  const unitPrice = size ? (isCustom ? customLength * size.price_per_inch : size.price_per_sheet) : 0;

  // The printable area excludes bleed on all sides — the same rule the server
  // enforces on submit, surfaced here so the buyer finds out before submitting.
  const usable = useMemo(
    () => (size ? { w: size.width_in - size.bleed_in * 2, h: effHeight - size.bleed_in * 2 } : null),
    [size, effHeight]
  );
  function fits(a: Draft): boolean {
    if (!usable) return true;
    return (
      (a.width_in <= usable.w && a.height_in <= usable.h) ||
      (a.height_in <= usable.w && a.width_in <= usable.h)
    );
  }
  const oversized = artworks.filter((a) => !fits(a));

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        // Inspect locally (pixels + transparency) before the bytes leave, then upload.
        const analysis = await analyzeArtwork(file);
        const res = await gangSheetsService.uploadArtwork(file);
        setArtworks((cur) => [
          ...cur,
          {
            file_url: res.url,
            file_name: res.file_name,
            file_type: res.type,
            width_in: 0,
            height_in: 0,
            quantity: 1,
            _pxW: analysis.pxW,
            _pxH: analysis.pxH,
            _isImage: analysis.isImage,
            _hasAlpha: analysis.hasAlpha,
            _alphaChecked: analysis.transparencyChecked,
          },
        ]);
      }
    } catch {
      setError("That file could not be uploaded. Allowed: PNG, JPG, PDF, SVG, AI, EPS, PSD, TIFF (max 50 MB).");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function patch(i: number, p: Partial<Draft>) {
    setArtworks((cur) => cur.map((a, idx) => (idx === i ? { ...a, ...p } : a)));
  }

  async function submit() {
    setError(null);
    if (!size) { setError("Choose a sheet size."); return; }
    if (!artworks.length) { setError("Upload at least one artwork file."); return; }
    const incomplete = artworks.some((a) => !(a.width_in > 0) || !(a.height_in > 0));
    if (incomplete) { setError("Enter the print width and height for every artwork file."); return; }
    if (oversized.length) { setError(`${oversized.length} file(s) are larger than the printable area.`); return; }

    setSubmitting(true);
    try {
      const order = await gangSheetsService.submit({
        sheet_size_id: size.id,
        sheet_quantity: qty,
        custom_length_in: isCustom ? customLength : undefined,
        // Strip the local-only analysis fields — the API only accepts ArtworkIn.
        artworks: artworks.map((a) => ({
          file_url: a.file_url,
          file_name: a.file_name,
          file_type: a.file_type,
          width_in: a.width_in,
          height_in: a.height_in,
          quantity: a.quantity,
        })),
        product_id: productId || undefined,
        contact_name: name || undefined,
        contact_email: email || undefined,
        customer_notes: notes || undefined,
      });
      setPlaced(order);
      setArtworks([]); setNotes(""); setQty(1);
      loadOrders();
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      setError(msg || "Could not submit this gang sheet.");
    } finally {
      setSubmitting(false);
    }
  }

  if (placed) {
    const placedSize = sizes.find((s) => s.id === placed.sheet_size_id);
    return (
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "40px 20px 60px" }}>
        <div style={{ ...CARD, textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "34px", marginBottom: "10px" }}>✅</div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "6px" }}>Gang sheet submitted</h1>
          <p style={{ color: "#666", fontSize: "14px", marginBottom: "10px" }}>
            Reference <strong>{placed.reference}</strong> — our team will review your layout and get back to you.
          </p>
          <div style={{ fontSize: "14px", color: "#333" }}>
            {placed.sheet_name} · {placed.sheet_quantity} sheet(s) · <strong>${placed.subtotal.toFixed(2)}</strong>
          </div>
        </div>

        {placedSize && placed.artworks && placed.artworks.length > 0 && (
          <div style={{ ...CARD, marginBottom: "20px" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>Arrange your sheet (optional)</div>
            <p style={{ fontSize: "13px", color: "#777", marginBottom: "16px" }}>
              Drag your designs where you want them, or hit Auto-arrange. Save it and our team prints it exactly like this — leave it and we&apos;ll lay it out for you.
            </p>
            <ArrangeStep order={placed} size={placedSize} />
          </div>
        )}

        <div style={{ textAlign: "center" }}>
          <button onClick={() => setPlaced(null)} style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "11px 22px", borderRadius: "var(--brand-button-radius, 6px)", fontWeight: 600, cursor: "pointer" }}>
            Build another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "36px 20px 60px" }}>
      <h1 style={{ fontSize: "26px", fontWeight: 800, marginBottom: "6px", fontFamily: "var(--brand-font-heading, inherit)" }}>
        Gang Sheet Builder
      </h1>
      <p style={{ color: "#666", fontSize: "14px", marginBottom: "26px" }}>
        Upload your designs, tell us the printed size of each, and we&apos;ll arrange them on the sheet.
      </p>

      {/* Sizes and pricing are visible to everyone, but a job is submitted against
          an account — say so up front rather than failing at the submit button. */}
      {sizes.length > 0 && !isAuthenticated() && (
        <div style={{ background: "#FFF7ED", border: "1px solid #FDBA74", color: "#9A3412", padding: "12px 15px", borderRadius: "8px", fontSize: "13px", marginBottom: "18px" }}>
          Browse the sizes and pricing below — you&apos;ll need to{" "}
          <a href="/login" style={{ color: "#9A3412", fontWeight: 700 }}>sign in</a> to upload artwork and submit your gang sheet.
        </div>
      )}

      {sizes.length === 0 ? (
        <div style={{ ...CARD, color: "#666", fontSize: "14px" }}>
          Gang sheets aren&apos;t available from this store yet. Please check back soon.
        </div>
      ) : (
        <>
          {/* Sheet size + quantity */}
          <div style={{ ...CARD, marginBottom: "18px" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>1 · Choose your sheet</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "14px" }}>
              <div>
                <label style={LABEL}>Sheet size</label>
                <select style={INPUT} value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
                  {sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.pricing_mode === "custom_length"
                        ? `${s.name} — ${s.width_in}″ × custom ($${s.price_per_inch.toFixed(2)}/in)`
                        : `${s.name} — ${s.width_in}″ × ${s.height_in}″ ($${s.price_per_sheet.toFixed(2)})`}
                    </option>
                  ))}
                </select>
              </div>
              {isCustom && size ? (
                <div>
                  <label style={LABEL}>Length (in) · {size.min_length_in}–{size.max_length_in}</label>
                  <input style={INPUT} type="number" min={size.min_length_in} max={size.max_length_in} step="1"
                    value={customLength}
                    onChange={(e) => setCustomLength(Math.min(size.max_length_in, Math.max(size.min_length_in, Number(e.target.value) || size.min_length_in)))} />
                </div>
              ) : null}
              <div>
                <label style={LABEL}>Number of sheets</label>
                <input style={INPUT} type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            </div>
            {usable && (
              <div style={{ fontSize: "12px", color: "#888", marginTop: "10px" }}>
                Printable area {usable.w.toFixed(2)}″ × {usable.h.toFixed(2)}″ (after {size!.bleed_in}″ bleed) · {size!.spacing_in}″ spacing between designs
              </div>
            )}
          </div>

          {/* Artwork */}
          <div style={{ ...CARD, marginBottom: "18px" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>2 · Upload your artwork</div>
            <p style={{ fontSize: "13px", color: "#777", marginBottom: "14px" }}>
              PNG, JPG, PDF, SVG, AI, EPS, PSD or TIFF — up to 50 MB each. Enter the size you want each design printed at.
            </p>

            <input ref={fileRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.svg,.ai,.eps,.psd,.tif,.tiff" onChange={(e) => onFiles(e.target.files)} style={{ display: "none" }} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ border: "1px dashed #C9C5BD", background: "#FAFAF8", color: "#444", width: "100%", padding: "18px", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", marginBottom: artworks.length ? "16px" : 0 }}
            >
              {uploading ? "Uploading…" : "＋ Add artwork files"}
            </button>

            {artworks.map((a, i) => {
              const bad = !fits(a);
              return (
                <div key={`${a.file_url}-${i}`} style={{ border: `1px solid ${bad ? "#FCA5A5" : "#EFEDE8"}`, background: bad ? "#FEF2F2" : "#fff", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "10px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, wordBreak: "break-all" }}>{a.file_name}</span>
                    <button onClick={() => setArtworks((cur) => cur.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "12px", whiteSpace: "nowrap" }}>Remove</button>
                  </div>
                  {/* Quality + transparency — advisory, never blocks */}
                  {a._isImage && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px", alignItems: "center", fontSize: "12px" }}>
                      {(() => {
                        const d = dpiFor(a._pxW ?? 0, a._pxH ?? 0, a.width_in, a.height_in);
                        if (!d) return <span style={{ color: "#9CA3AF" }}>Enter size to check print quality</span>;
                        const st = DPI_STYLE[d.rating];
                        return (
                          <span style={{ background: st.bg, color: st.fg, padding: "2px 9px", borderRadius: "12px", fontWeight: 700 }}>
                            {st.label} · {d.dpi} DPI{d.rating !== "good" ? " — may look soft when printed" : ""}
                          </span>
                        );
                      })()}
                      {a._alphaChecked && (
                        a._hasAlpha
                          ? <span style={{ color: "#166534", fontWeight: 600 }}>✔ Transparent background</span>
                          : <span style={{ color: "#92400E", fontWeight: 600 }}>⚠ Background detected</span>
                      )}
                      {a._pxW ? <span style={{ color: "#9CA3AF" }}>{a._pxW}×{a._pxH}px</span> : null}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: "10px" }}>
                    <div>
                      <label style={LABEL}>Width (in)</label>
                      <input style={INPUT} type="number" step="0.25" min="0" value={a.width_in || ""} onChange={(e) => patch(i, { width_in: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={LABEL}>Height (in)</label>
                      <input style={INPUT} type="number" step="0.25" min="0" value={a.height_in || ""} onChange={(e) => patch(i, { height_in: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={LABEL}>Quantity</label>
                      <input style={INPUT} type="number" min="1" value={a.quantity} onChange={(e) => patch(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                    </div>
                  </div>
                  {bad && usable && (
                    <div style={{ fontSize: "12px", color: "#B91C1C", marginTop: "8px" }}>
                      Too large for the printable area ({usable.w.toFixed(2)}″ × {usable.h.toFixed(2)}″).
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Details + submit */}
          <div style={{ ...CARD, marginBottom: "18px" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>3 · Your details</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label style={LABEL}>Name</label>
                <input style={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>Email</label>
                <input style={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <label style={LABEL}>Notes for the print team</label>
            <textarea style={{ ...INPUT, resize: "vertical" }} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know about placement, colours, or deadlines?" />
          </div>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "11px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>
              {error}
            </div>
          )}

          {/* Cost breakdown — live; updates with sheet size and quantity */}
          <div style={{ ...CARD }}>
            {(() => {
              const unit = unitPrice;
              const firstSheet = unit;
              const extraSheets = Math.max(0, qty - 1) * unit;
              const fees = 0;               // reserved for supplier surcharges
              const subtotal = firstSheet + extraSheets + fees;
              const taxRate = 0;            // gang sheets untaxed until configured
              const tax = subtotal * taxRate;
              const grand = subtotal + tax;
              const Row = ({ label, val, muted }: { label: string; val: string; muted?: boolean }) => (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: muted ? "#888" : "#333", padding: "3px 0" }}>
                  <span>{label}</span><span>{val}</span>
                </div>
              );
              return (
                <>
                  <div style={{ fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, marginBottom: "8px" }}>Cost breakdown</div>
                  <Row label={isCustom ? `Sheet price (${size?.width_in}″ × ${customLength}″ @ $${size?.price_per_inch.toFixed(2)}/in)` : `Sheet price (${size?.name ?? "—"})`} val={`$${firstSheet.toFixed(2)}`} />
                  {qty > 1 && <Row label={`Extra sheets (${qty - 1} × $${unit.toFixed(2)})`} val={`$${extraSheets.toFixed(2)}`} />}
                  {fees > 0 && <Row label="Additional fees" val={`$${fees.toFixed(2)}`} />}
                  <div style={{ borderTop: "1px solid #EFEDE8", margin: "6px 0" }} />
                  <Row label="Subtotal" val={`$${subtotal.toFixed(2)}`} muted />
                  {taxRate > 0 && <Row label={`Tax (${(taxRate * 100).toFixed(1)}%)`} val={`$${tax.toFixed(2)}`} muted />}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700 }}>Grand total</span>
                    <span style={{ fontSize: "26px", fontWeight: 800 }}>${grand.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={submit}
                    disabled={submitting || uploading}
                    style={{ width: "100%", marginTop: "14px", background: submitting || uploading ? "#9ca3af" : "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "14px 30px", borderRadius: "var(--brand-button-radius, 6px)", fontSize: "15px", fontWeight: 700, cursor: submitting || uploading ? "not-allowed" : "pointer" }}
                  >
                    {submitting ? "Submitting…" : "Submit gang sheet"}
                  </button>
                </>
              );
            })()}
          </div>

          {/* History */}
          {orders.length > 0 && (
            <div style={{ marginTop: "34px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 800, marginBottom: "12px" }}>Your gang sheets</h2>
              <div style={{ display: "grid", gap: "14px" }}>
                {orders.map((o) => {
                  const c = GANG_SHEET_STATUS_COLOR[o.status] ?? { bg: "#eee", fg: "#555" };
                  return (
                    <div key={o.id} style={{ ...CARD, padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "14px" }}>
                            {o.reference}{(o.version ?? 1) > 1 ? <span style={{ color: "#888", fontWeight: 500 }}> · v{o.version}</span> : null}
                          </div>
                          <div style={{ fontSize: "12px", color: "#888" }}>
                            {o.sheet_name} · {o.sheet_quantity} sheet(s) · ${o.subtotal.toFixed(2)}
                          </div>
                          {o.supplier_notes && (
                            <div style={{ fontSize: "12px", color: "#9A3412", marginTop: "4px" }}>“{o.supplier_notes}”</div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ background: c.bg, color: c.fg, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>
                            {GANG_SHEET_STATUS_LABEL[o.status] ?? o.status}
                          </span>
                          {o.status === "revision_requested" && (
                            <button
                              onClick={() => gangSheetsService.resubmit(o.id).then(() => loadOrders()).catch(() => {})}
                              style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                            >
                              Resubmit
                            </button>
                          )}
                          <button
                            onClick={() => gangSheetsService.reorder(o.id).then(() => loadOrders()).catch(() => {})}
                            style={{ background: "none", border: "1px solid #DDD9D2", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                          >
                            Reorder
                          </button>
                        </div>
                      </div>
                      <GangSheetTimeline status={o.status} timeline={o.status_timeline} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Post-submit optional layout editor. Kept as its own component so its drag
// state never re-renders the whole builder.
function ArrangeStep({ order, size }: { order: GangSheetOrder; size: GangSheetSize }) {
  const [layout, setLayout] = useState<GangSheetPlacement[]>(order.layout ?? []);
  const [arts, setArts] = useState<GangSheetArtwork[]>(order.artworks ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await gangSheetsService.saveLayout(order.id, layout);
      setSaved(true);
    } catch {
      /* non-fatal — arranging is optional */
    } finally {
      setSaving(false);
    }
  }

  // Add another design straight onto the sheet — upload, then attach it to this
  // order at a sensible default size; the buyer resizes it on the canvas.
  async function addDesign(files: FileList | null) {
    if (!files?.length) return;
    setAdding(true);
    try {
      for (const file of Array.from(files)) {
        const res = await gangSheetsService.uploadArtwork(file);
        const printable = size.width_in - size.bleed_in * 2;
        const dflt = Math.max(1, Math.min(4, Math.round(printable / 2)));
        const updated = await gangSheetsService.addArtwork(order.id, {
          file_url: res.url, file_name: res.file_name, file_type: res.type,
          width_in: dflt, height_in: dflt, quantity: 1,
        });
        if (updated.artworks) setArts(updated.artworks);
      }
    } catch {
      /* ignore — non-fatal */
    } finally {
      setAdding(false);
      if (addRef.current) addRef.current.value = "";
    }
  }

  return (
    <div>
      <input ref={addRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.svg,.ai,.eps,.psd,.tif,.tiff" onChange={(e) => addDesign(e.target.files)} style={{ display: "none" }} />
      <button
        onClick={() => addRef.current?.click()}
        disabled={adding}
        style={{ border: "1px dashed #C9C5BD", background: "#FAFAF8", color: "#444", width: "100%", padding: "12px", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", marginBottom: "14px" }}
      >
        {adding ? "Uploading…" : "＋ Add another design to this sheet"}
      </button>

      <GangSheetCanvas
        sheet={{ width_in: order.sheet_width_in, height_in: order.sheet_height_in, bleed_in: size.bleed_in, spacing_in: size.spacing_in }}
        artworks={arts}
        value={layout}
        onChange={(l) => { setLayout(l); setSaved(false); }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "14px" }}>
        <button
          onClick={save}
          disabled={saving || layout.length === 0}
          style={{ background: saving || layout.length === 0 ? "#9ca3af" : "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "var(--brand-button-radius, 6px)", fontSize: "14px", fontWeight: 700, cursor: saving || layout.length === 0 ? "not-allowed" : "pointer" }}
        >
          {saving ? "Saving…" : "Save my layout"}
        </button>
        <button
          onClick={() => openSheetPdf({ reference: order.reference, customerName: order.contact_name, sheet: { width_in: order.sheet_width_in, height_in: order.sheet_height_in, bleed_in: size.bleed_in }, artworks: arts, layout })}
          disabled={layout.length === 0}
          style={{ background: "#fff", color: "var(--brand-primary, #1C3557)", border: "1px solid #DDD9D2", padding: "10px 18px", borderRadius: "var(--brand-button-radius, 6px)", fontSize: "14px", fontWeight: 600, cursor: layout.length === 0 ? "not-allowed" : "pointer", opacity: layout.length === 0 ? 0.5 : 1 }}
        >
          Preview PDF
        </button>
        {saved && <span style={{ color: "#166534", fontSize: "13px", fontWeight: 600 }}>✓ Layout saved</span>}
      </div>
    </div>
  );
}
