"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GANG_SHEET_STATUS_COLOR,
  GANG_SHEET_STATUS_LABEL,
  gangSheetsService,
  type GangSheetArtwork,
  type GangSheetOrder,
  type GangSheetSize,
} from "@/services/gangSheets.service";
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

type Draft = Omit<GangSheetArtwork, "id" | "sort_order">;

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
  const total = useMemo(
    () => (size ? size.price_per_sheet * Math.max(1, qty) : 0),
    [size, qty]
  );

  // The printable area excludes bleed on all sides — the same rule the server
  // enforces on submit, surfaced here so the buyer finds out before submitting.
  const usable = useMemo(
    () => (size ? { w: size.width_in - size.bleed_in * 2, h: size.height_in - size.bleed_in * 2 } : null),
    [size]
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
        artworks,
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
    return (
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "48px 20px" }}>
        <div style={{ ...CARD, textAlign: "center" }}>
          <div style={{ fontSize: "34px", marginBottom: "10px" }}>✅</div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "6px" }}>Gang sheet submitted</h1>
          <p style={{ color: "#666", fontSize: "14px", marginBottom: "16px" }}>
            Reference <strong>{placed.reference}</strong> — our team will review your layout and get back to you.
          </p>
          <div style={{ fontSize: "14px", color: "#333", marginBottom: "20px" }}>
            {placed.sheet_name} · {placed.sheet_quantity} sheet(s) · <strong>${placed.subtotal.toFixed(2)}</strong>
          </div>
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
                      {s.name} — {s.width_in}″ × {s.height_in}″ (${s.price_per_sheet.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "10px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, wordBreak: "break-all" }}>{a.file_name}</span>
                    <button onClick={() => setArtworks((cur) => cur.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "12px", whiteSpace: "nowrap" }}>Remove</button>
                  </div>
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

          <div style={{ ...CARD, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>Total</div>
              <div style={{ fontSize: "26px", fontWeight: 800 }}>${total.toFixed(2)}</div>
              <div style={{ fontSize: "12px", color: "#888" }}>
                {qty} × {size?.name} @ ${size?.price_per_sheet.toFixed(2)}
              </div>
            </div>
            <button
              onClick={submit}
              disabled={submitting || uploading}
              style={{ background: submitting || uploading ? "#9ca3af" : "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "14px 30px", borderRadius: "var(--brand-button-radius, 6px)", fontSize: "15px", fontWeight: 700, cursor: submitting || uploading ? "not-allowed" : "pointer" }}
            >
              {submitting ? "Submitting…" : "Submit gang sheet"}
            </button>
          </div>

          {/* History */}
          {orders.length > 0 && (
            <div style={{ marginTop: "34px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 800, marginBottom: "12px" }}>Your gang sheets</h2>
              <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
                {orders.map((o, i) => {
                  const c = GANG_SHEET_STATUS_COLOR[o.status] ?? { bg: "#eee", fg: "#555" };
                  return (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "13px 16px", borderBottom: i < orders.length - 1 ? "1px solid #F1EFEB" : "none" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "14px" }}>{o.reference}</div>
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
                        <button
                          onClick={() => gangSheetsService.reorder(o.id).then(() => loadOrders()).catch(() => {})}
                          style={{ background: "none", border: "1px solid #DDD9D2", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                        >
                          Reorder
                        </button>
                      </div>
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
