"use client";

/**
 * "Upload your own gang sheet" — the third way a brand sells one.
 *
 * The builder is for somebody arranging designs; upload-by-size is for one
 * design at an exact size. This is for the buyer who has already laid their
 * sheet out, in their own software, and wants it printed: pick how long it
 * runs, hand over the file, done.
 *
 * It takes a file from their computer and nothing else. Drive, Dropbox and the
 * rest are a login and a permission prompt in the middle of a sale, for a file
 * they have already made and almost certainly have open.
 *
 * The four tools underneath are the ones that fix what actually arrives:
 * sheets laid out the wrong way round, screen-grabbed art with no blacks,
 * colour art going on a one-colour press, and soft scans. They run on the
 * pixels, so what goes to the printer is what is on screen — see lib/imageTools.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Contrast, Loader2, RotateCw, Sparkles, Undo2, UploadCloud, Wand2, X } from "lucide-react";
import { cartService } from "@/services/cart.service";
import { gangSheetsService, type GangSheetSize } from "@/services/gangSheets.service";
import { useAuthStore } from "@/stores/auth.store";
import { applyTool, type Pixels, type Tool } from "@/lib/imageTools";

const TOOL_LABEL: Record<Tool, { label: string; hint: string; Icon: typeof RotateCw }> = {
  rotate: { label: "Rotate", hint: "Turn the sheet a quarter turn", Icon: RotateCw },
  enhance: { label: "Enhance", hint: "Open out flat, washed-out artwork", Icon: Sparkles },
  grayscale: { label: "Grayscale", hint: "Take the colour out", Icon: Contrast },
  sharpen: { label: "Sharpen", hint: "Crisp up soft edges", Icon: Wand2 },
};

const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.tif,.tiff";

export function UploadOwnSheetModal({
  product, onClose,
}: {
  product: { id: string; name?: string };
  onClose: () => void;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  const [sizes, setSizes] = useState<GangSheetSize[]>([]);
  const [sizeId, setSizeId] = useState("");
  const [customLength, setCustomLength] = useState(0);
  const [qty, setQty] = useState(1);

  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<Pixels | null>(null);
  const [edited, setEdited] = useState<Pixels | null>(null);
  /** What has been done, in order, so Undo can replay from the original. */
  const [history, setHistory] = useState<Tool[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const size = useMemo(() => sizes.find((s) => s.id === sizeId), [sizes, sizeId]);
  const isCustom = size?.pricing_mode === "custom_length";
  const sheetLen = size ? (isCustom ? customLength : Number(size.height_in)) : 0;
  const unitPrice = size
    ? (isCustom ? customLength * Number(size.price_per_inch) : Number(size.price_per_sheet))
    : 0;

  useEffect(() => {
    gangSheetsService.listSizes(product.id)
      .then((list) => {
        const usable = list.filter((s) => s.is_active);
        setSizes(usable);
        const first = usable[0];
        if (first) {
          setSizeId(first.id);
          setCustomLength(first.pricing_mode === "custom_length" ? Number(first.min_length_in) : 0);
        }
      })
      .catch(() => setError("Could not load this product's sheet sizes."));
  }, [product.id]);

  useEffect(() => {
    if (!size || size.pricing_mode !== "custom_length") return;
    setCustomLength((cur) =>
      cur >= Number(size.min_length_in) && cur <= Number(size.max_length_in)
        ? cur : Number(size.min_length_in));
  }, [size]);

  // ── The picture on screen ──────────────────────────────────────────────────
  const shown = edited ?? original;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shown) return;
    canvas.width = shown.width;
    canvas.height = shown.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(shown.data, shown.width, shown.height), 0, 0);
  }, [shown]);

  /** Read a chosen file into pixels we can work on. */
  const load = useCallback(async (chosen: File) => {
    setError(null);
    setBusy("Opening your sheet");
    try {
      // A PDF or TIFF cannot be decoded here. It still uploads and still
      // prints — it simply cannot be previewed or edited, and saying so is
      // better than showing an empty box.
      try {
        const bitmap = await createImageBitmap(chosen);
        const c = document.createElement("canvas");
        c.width = bitmap.width;
        c.height = bitmap.height;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.drawImage(bitmap, 0, 0);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        setOriginal({ width: img.width, height: img.height, data: img.data });
        bitmap.close?.();
      } catch {
        setOriginal(null);
      }
      setEdited(null);
      setHistory([]);
      setFile(chosen);
    } finally {
      setBusy(null);
    }
  }, []);

  function run(tool: Tool) {
    if (!shown) return;
    setBusy(TOOL_LABEL[tool].label);
    // Out of the paint frame, so the button's pressed state is drawn before a
    // big sheet takes a second or two.
    requestAnimationFrame(() => {
      try {
        setEdited(applyTool(tool, shown));
        setHistory((h) => [...h, tool]);
      } catch {
        setError("That could not be applied to this file.");
      } finally {
        setBusy(null);
      }
    });
  }

  function undo() {
    if (!original || !history.length) return;
    const next = history.slice(0, -1);
    setHistory(next);
    setEdited(next.length ? next.reduce<Pixels>((acc, t) => applyTool(t, acc), original) : null);
  }

  /** The file to send: the edited pixels when there are any, else what came in. */
  async function fileToSend(): Promise<File> {
    if (!file) throw new Error("No file");
    if (!edited) return file;
    const canvas = document.createElement("canvas");
    canvas.width = edited.width;
    canvas.height = edited.height;
    canvas.getContext("2d")!.putImageData(new ImageData(edited.data, edited.width, edited.height), 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("Could not prepare the edited file");
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], base + "-edited.png", { type: "image/png" });
  }

  async function addToCart() {
    if (!file) { setError("Choose your gang sheet file first."); return; }
    if (!size) { setError("Pick a sheet size first."); return; }
    if (!isAuthenticated) {
      window.location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const toSend = await fileToSend();
      const up = await gangSheetsService.uploadArtwork(toSend);
      // One artwork, filling the sheet inside its bleed. The sheet is already
      // laid out — there is nothing here to arrange.
      const bleed = Number(size.bleed_in) || 0;
      const order = await gangSheetsService.submit({
        sheet_size_id: size.id,
        sheet_quantity: qty,
        product_id: product.id,
        custom_length_in: isCustom ? customLength : undefined,
        artworks: [{
          file_url: up.url,
          file_name: up.file_name,
          file_type: up.type,
          width_in: Math.max(0.1, Number(size.width_in) - bleed * 2),
          height_in: Math.max(0.1, sheetLen - bleed * 2),
          quantity: 1,
        }],
      });
      await cartService.addGangSheet(order.id);
      window.location.href = "/cart";
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not add this to your cart. Please try again.");
      setAdding(false);
    }
  }

  const ready = Boolean(file && size);

  return (
    <div style={S.backdrop} onClick={() => !adding && onClose()}>
      <div style={S.box} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Upload your own gang sheet">
        <div style={S.head}>
          <div>
            <div style={S.title}>Upload your own gang sheet</div>
            <div style={S.sub}>Already laid out? Send it as it is — pick the length and we print it.</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={S.close}><X size={18} strokeWidth={2.2} /></button>
        </div>

        <div style={S.body}>
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(e) => { e.preventDefault(); setDropActive(false); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }}
              onClick={() => fileRef.current?.click()}
              style={{ ...S.drop, borderColor: dropActive ? "#16A34A" : "#D4D8DE", background: dropActive ? "#E9F7EF" : "#FBFCFD" }}
            >
              <UploadCloud size={32} strokeWidth={1.9} color="#16A34A" />
              <div style={S.dropTitle}>Drag your sheet here, or choose a file</div>
              <div style={S.dropHint}>From this computer · PNG, JPG, PDF, TIFF</div>
              <span style={S.chooseBtn}>Choose a file</span>
            </div>
          ) : (
            <>
              <div style={S.preview}>
                {original ? (
                  <canvas ref={canvasRef} style={{ maxWidth: "100%", maxHeight: "clamp(180px, 34vh, 340px)", objectFit: "contain", display: "block", margin: "0 auto" }} />
                ) : (
                  <div style={S.noPreview}>
                    <strong>{file.name}</strong>
                    <span>This file type cannot be previewed here. It uploads and prints as it is.</span>
                  </div>
                )}
                {busy && (
                  <div style={S.busy}>
                    <Loader2 size={16} strokeWidth={2.2} style={{ animation: "spin 1s linear infinite" }} /> {busy}…
                  </div>
                )}
              </div>

              {original && (
                <div style={S.tools}>
                  {(Object.keys(TOOL_LABEL) as Tool[]).map((tool) => {
                    const { label, hint, Icon } = TOOL_LABEL[tool];
                    return (
                      <button key={tool} onClick={() => run(tool)} disabled={!!busy} title={hint} style={S.tool}>
                        <Icon size={16} strokeWidth={2} /> {label}
                      </button>
                    );
                  })}
                  <button onClick={undo} disabled={!history.length || !!busy}
                    title="Undo the last change" style={{ ...S.tool, opacity: history.length ? 1 : 0.45 }}>
                    <Undo2 size={16} strokeWidth={2} /> Undo
                  </button>
                </div>
              )}

              <div style={S.fileRow}>
                <span style={{ color: "#5B6170" }}>
                  {file.name}
                  {original && shown ? " · " + shown.width + " × " + shown.height + " px" : ""}
                  {history.length ? " · " + history.length + " change" + (history.length === 1 ? "" : "s") : ""}
                </span>
                <button onClick={() => { setFile(null); setOriginal(null); setEdited(null); setHistory([]); }} style={S.link}>
                  Choose a different file
                </button>
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />

          {sizes.length > 0 && (
            <div style={{ marginTop: "18px" }}>
              <div style={S.label}>Sheet size</div>
              <div style={S.sizes}>
                {sizes.map((s) => {
                  const on = s.id === sizeId;
                  return (
                    <button key={s.id} onClick={() => setSizeId(s.id)} style={{ ...S.size, ...(on ? S.sizeOn : {}) }}>
                      {on && <Check size={13} strokeWidth={2.6} />}
                      {s.name}
                    </button>
                  );
                })}
              </div>
              {isCustom && size && (
                <div style={S.lenRow}>
                  <label style={{ fontSize: "13px", color: "#5B6170" }}>Length</label>
                  <input type="number" min={size.min_length_in} max={size.max_length_in} value={customLength}
                    onChange={(e) => setCustomLength(Math.min(Number(size.max_length_in),
                      Math.max(Number(size.min_length_in), Number(e.target.value) || Number(size.min_length_in))))}
                    style={S.num} />
                  <span style={{ fontSize: "13px", color: "#5B6170" }}>
                    in · {Number(size.min_length_in)}–{Number(size.max_length_in)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
            <div style={{ ...S.label, marginBottom: 0 }}>Sheets</div>
            <input type="number" min={1} value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              style={{ ...S.num, width: "74px" }} />
          </div>

          {error && <div role="alert" style={S.error}>{error}</div>}
        </div>

        <div style={S.foot}>
          <span style={S.price}>
            {unitPrice > 0 ? "$" + (unitPrice * qty).toFixed(2) : "—"}
            <span style={S.priceSub}>{qty > 1 ? " · " + qty + " sheets" : ""}</span>
          </span>
          <button onClick={onClose} disabled={adding} style={S.ghost}>Cancel</button>
          <button onClick={addToCart} disabled={!ready || adding} style={{ ...S.primary, opacity: ready && !adding ? 1 : 0.55 }}>
            {adding ? "Adding…" : "Add to cart"}
          </button>
        </div>
        <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, zIndex: 700, background: "rgba(16,24,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  box: { background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "620px", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(16,24,40,.28)", fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif", overflow: "hidden" },
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "20px 22px 14px" },
  title: { fontSize: "18px", fontWeight: 800, color: "#1F2430" },
  sub: { fontSize: "13px", color: "#5B6170", marginTop: "4px", lineHeight: 1.5 },
  close: { background: "none", border: "none", color: "#5B6170", cursor: "pointer", padding: "6px", display: "flex", borderRadius: "8px" },
  body: { padding: "0 22px 18px", overflowY: "auto", flex: 1 },
  drop: { border: "2px dashed #D4D8DE", borderRadius: "14px", padding: "30px 18px", textAlign: "center", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" },
  dropTitle: { fontSize: "14.5px", fontWeight: 700, color: "#1F2430", marginTop: "8px" },
  dropHint: { fontSize: "12px", color: "#848A96" },
  chooseBtn: { marginTop: "12px", background: "#16A34A", color: "#fff", borderRadius: "10px", padding: "10px 18px", fontSize: "13px", fontWeight: 700 },
  preview: { position: "relative", background: "#F4F5F7", border: "1px solid #E6E8EC", borderRadius: "12px", padding: "14px", backgroundImage: "repeating-conic-gradient(#E8E8E8 0% 25%, #F7F7F7 0% 50%)", backgroundSize: "16px 16px" },
  noPreview: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", textAlign: "center", padding: "26px 10px", fontSize: "13px", color: "#5B6170" },
  busy: { position: "absolute", inset: 0, background: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "#1F2430", borderRadius: "12px" },
  tools: { display: "flex", gap: "7px", flexWrap: "wrap", marginTop: "12px" },
  tool: { display: "inline-flex", alignItems: "center", gap: "6px", background: "#fff", border: "1px solid #E6E8EC", borderRadius: "10px", padding: "9px 13px", fontSize: "12.5px", fontWeight: 600, color: "#1F2430", cursor: "pointer", fontFamily: "inherit" },
  fileRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginTop: "10px", fontSize: "12px" },
  link: { background: "none", border: "none", color: "#15803D", fontWeight: 600, cursor: "pointer", fontSize: "12px", fontFamily: "inherit", padding: 0 },
  label: { fontSize: "11px", fontWeight: 700, color: "#5B6170", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "8px" },
  sizes: { display: "flex", gap: "7px", flexWrap: "wrap" },
  size: { display: "inline-flex", alignItems: "center", gap: "6px", background: "#fff", border: "1px solid #E6E8EC", borderRadius: "10px", padding: "9px 13px", fontSize: "13px", fontWeight: 600, color: "#1F2430", cursor: "pointer", fontFamily: "inherit" },
  sizeOn: { background: "#E9F7EF", borderColor: "#BFE6CE", color: "#15803D" },
  lenRow: { display: "flex", alignItems: "center", gap: "9px", marginTop: "10px" },
  num: { width: "92px", padding: "9px 11px", border: "1px solid #E6E8EC", borderRadius: "10px", fontSize: "13.5px", fontFamily: "inherit", color: "#1F2430" },
  error: { marginTop: "14px", background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: "10px", padding: "10px 12px", fontSize: "12.5px", lineHeight: 1.5 },
  foot: { display: "flex", alignItems: "center", gap: "9px", padding: "14px 22px", borderTop: "1px solid #EFF1F4", background: "#FBFCFD" },
  price: { flex: 1, fontSize: "18px", fontWeight: 800, color: "#1F2430" },
  priceSub: { fontSize: "12px", fontWeight: 500, color: "#848A96" },
  ghost: { background: "#fff", border: "1px solid #E6E8EC", color: "#1F2430", borderRadius: "10px", padding: "11px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  primary: { background: "#16A34A", border: "none", color: "#fff", borderRadius: "10px", padding: "11px 22px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};

export default UploadOwnSheetModal;
