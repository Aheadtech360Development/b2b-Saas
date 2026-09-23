"use client";

/**
 * "Upload Artwork & Order" — the file a sign, a flyer or a business card is
 * printed from.
 *
 * What every print shop's uploader does and nothing more: pick a file or drop
 * one on the box, see what you picked, and order. The file is checked here for
 * the obvious things — a format the press can use, a size that will upload —
 * and again on the server, which is the check that counts.
 *
 * Nothing is edited, cropped or re-encoded: a print file that gets
 * re-compressed on the way in is a ruined print file.
 */
import { useRef, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";

/** What a press can actually use. Matches the server's allow-list. */
const ACCEPTED = [".pdf", ".ai", ".eps", ".psd", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"];
const MAX_MB = 50;
const PREVIEWABLE = /\.(png|jpe?g|webp|svg)$/i;

export interface UploadedArtwork {
  url: string;
  file_name: string;
  file_type: string;
}

export function DesignUploadModal({ productName, busyLabel, onClose, onReady }: {
  productName: string;
  /** What the confirm button says while the order is being placed. */
  busyLabel?: string;
  onClose: () => void;
  onReady: (artwork: UploadedArtwork) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedArtwork | null>(null);
  const [busy, setBusy] = useState<null | "upload" | "order">(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  function choose(picked: File | null) {
    setError(null);
    setUploaded(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!picked) { setFile(null); return; }

    const ext = picked.name.slice(picked.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setFile(null);
      setError(`We can't print a ${ext || "file"} like that. Send ${ACCEPTED.slice(0, 5).join(", ")} or similar.`);
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      setFile(null);
      setError(`That file is ${(picked.size / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_MB} MB.`);
      return;
    }
    setFile(picked);
    if (PREVIEWABLE.test(picked.name)) setPreview(URL.createObjectURL(picked));
  }

  async function upload(): Promise<UploadedArtwork | null> {
    if (uploaded) return uploaded;
    if (!file) return null;
    setBusy("upload");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await apiClient.postForm<UploadedArtwork>("/api/v1/upload/artwork", form);
      setUploaded(r);
      return r;
    } catch (err) {
      setError(err instanceof ApiClientError && err.message ? err.message : "That file didn't upload. Please try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    const art = await upload();
    if (!art) return;
    setBusy("order");
    try {
      await onReady(art);
    } catch (err) {
      setError(err instanceof ApiClientError && err.message ? err.message : "Could not add that to your cart.");
      setBusy(null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "14px", padding: "24px", width: "100%", maxWidth: "460px", boxShadow: "0 24px 70px rgba(0,0,0,.3)", fontFamily: "inherit", color: "#111" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
          <div style={{ fontSize: "17px", fontWeight: 800 }}>Upload your design</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: "22px", lineHeight: 1, cursor: "pointer", color: "#888" }}>×</button>
        </div>
        <p style={{ fontSize: "13px", color: "#666", lineHeight: 1.6, margin: "0 0 16px" }}>
          The artwork for your {productName.toLowerCase()}. We print it as supplied, so
          send the finished file.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files?.[0] ?? null); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${over ? "#DC2626" : "#D5D2CB"}`, borderRadius: "10px",
            padding: file ? "16px" : "30px 16px", textAlign: "center", cursor: "pointer",
            background: over ? "#FEF2F2" : "#FAFAF8", transition: "border-color .15s, background .15s",
          }}
        >
          {file ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left" }}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" style={{ width: "58px", height: "58px", objectFit: "contain", background: "#fff", border: "1px solid #EEE", borderRadius: "6px", flexShrink: 0 }} />
              ) : (
                <div style={{ width: "58px", height: "58px", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #EEE", borderRadius: "6px", fontSize: "11px", fontWeight: 800, color: "#888", flexShrink: 0 }}>
                  {file.name.slice(file.name.lastIndexOf(".") + 1).toUpperCase()}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                <div style={{ fontSize: "12px", color: "#777" }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB{uploaded ? " · uploaded" : ""}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); choose(null); }}
                  style={{ background: "none", border: "none", padding: "2px 0", fontSize: "12px", color: "#B91C1C", cursor: "pointer" }}
                >
                  Choose a different file
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>Drop your file here, or browse</div>
              <div style={{ fontSize: "12px", color: "#888" }}>PDF, AI, EPS, PSD, SVG, PNG, JPG · up to {MAX_MB} MB</div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
        </div>

        {error && <p style={{ color: "#B42318", fontSize: "13px", marginTop: "12px", marginBottom: 0 }}>{error}</p>}

        <button
          onClick={confirm}
          disabled={!file || busy !== null}
          style={{
            width: "100%", marginTop: "18px", padding: "13px", borderRadius: "9px", border: "none",
            background: !file || busy ? "#C9C6C0" : "#111", color: "#fff", fontSize: "14.5px", fontWeight: 800,
            cursor: !file || busy ? "default" : "pointer",
          }}
        >
          {busy === "upload" ? "Uploading…" : busy === "order" ? (busyLabel ?? "Adding…") : "Add to cart"}
        </button>
      </div>
    </div>
  );
}

export default DesignUploadModal;
