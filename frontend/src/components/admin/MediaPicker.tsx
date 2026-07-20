"use client";

/**
 * MediaPicker — reusable modal for choosing image(s).
 * Two ways to pick: (1) select from the brand's Media Library, or
 * (2) upload from device — which auto-saves into the Media Library, then selects it.
 *
 * Single mode (default): click an image → it's chosen and the modal closes.
 * Multiple mode (`multiple`): tap several images, then "Add N images".
 */
import { useEffect, useRef, useState } from "react";
import { mediaService, type MediaItem } from "@/services/media.service";

export function MediaPicker({ onSelect, onSelectMultiple, onClose, multiple }: {
  onSelect?: (url: string) => void;
  onSelectMultiple?: (urls: string[]) => void;
  onClose: () => void;
  multiple?: boolean;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    mediaService.list()
      .then((r) => { setItems(r.items || []); setConfigured(r.configured); })
      .catch(() => setError("Couldn't load your media library."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function toggle(url: string) {
    if (multiple) {
      setSelected((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
    } else {
      onSelect?.(url);
      onClose();
    }
  }

  function done() {
    if (selected.length === 0) return;
    onSelectMultiple ? onSelectMultiple(selected) : selected.forEach((u) => onSelect?.(u));
    onClose();
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    // Multiple files can be picked at once and each is saved to the library.
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true); setError(null);
    try {
      const urls: string[] = [];
      for (const f of files) {
        const res = await mediaService.upload(f); // saved into the library
        urls.push(res.url);
      }
      if (multiple) {
        setSelected((prev) => [...prev, ...urls]);
        load(); // refresh library grid to show the new uploads
      } else {
        onSelect?.(urls[0]!);
        onClose();
        return;
      }
    } catch {
      setError("Upload failed. Try a smaller image or paste a URL.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const btn: React.CSSProperties = { border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", padding: "10px 18px" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", zIndex: 1100, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "720px", maxHeight: "84vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #EEE" }}>
          <div>
            <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#2A2830" }}>Choose {multiple ? "images" : "an image"}</h3>
            {multiple && <p style={{ fontSize: "12px", color: "#7A7880", marginTop: "2px" }}>Tap to select multiple, then add them all.</p>}
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input ref={fileRef} type="file" accept="image/*" multiple={multiple} onChange={upload} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading || !configured} style={{ ...btn, background: "#1C3557", color: "#fff", opacity: uploading || !configured ? 0.6 : 1 }}>
              {uploading ? "Uploading…" : "⬆ Upload from device"}
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#999", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
          {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>{error}</div>}

          {!configured ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#7A7880" }}>
              <p style={{ fontSize: "14px", marginBottom: "6px" }}>Media Library isn&apos;t configured yet.</p>
              <p style={{ fontSize: "13px", color: "#aaa" }}>You can still paste an image URL below.</p>
            </div>
          ) : loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#999", fontSize: "14px" }}>Loading your images…</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#7A7880" }}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>🖼</div>
              <p style={{ fontSize: "14px" }}>No images yet — upload one to get started.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "12px" }}>
              {items.map((m) => {
                const isSel = selected.includes(m.url);
                return (
                  <button key={m.file_id} onClick={() => toggle(m.url)} title={m.name}
                    style={{ position: "relative", padding: 0, border: isSel ? "2px solid #1A5CFF" : "1px solid #E2E0DA", borderRadius: "8px", overflow: "hidden", cursor: "pointer", background: "#F4F3EF", aspectRatio: "1 / 1" }}
                    onMouseOver={(e) => { if (!isSel) e.currentTarget.style.borderColor = "#1C3557"; }}
                    onMouseOut={(e) => { if (!isSel) e.currentTarget.style.borderColor = "#E2E0DA"; }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.thumbnail_url || m.url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: isSel ? 0.85 : 1 }} />
                    {multiple && isSel && (
                      <span style={{ position: "absolute", top: "6px", right: "6px", background: "#1A5CFF", color: "#fff", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700 }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — paste URL + (multiple) add button */}
        <div style={{ borderTop: "1px solid #EEE", padding: "14px 22px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="…or paste an image URL" style={{ flex: 1, minWidth: "180px", border: "1px solid #E2E0DA", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", outline: "none" }} />
          <button
            onClick={() => {
              const u = urlInput.trim(); if (!u) return;
              if (multiple) { setSelected((p) => (p.includes(u) ? p : [...p, u])); setUrlInput(""); }
              else { onSelect?.(u); onClose(); }
            }}
            disabled={!urlInput.trim()}
            style={{ ...btn, background: "#F0F4FA", border: "1px solid #C9D6E8", color: "#1C3557", opacity: urlInput.trim() ? 1 : 0.5 }}
          >
            {multiple ? "Add URL" : "Use URL"}
          </button>
          {multiple && (
            <button onClick={done} disabled={selected.length === 0} style={{ ...btn, background: selected.length ? "#1C3557" : "#9ca3af", color: "#fff", cursor: selected.length ? "pointer" : "not-allowed" }}>
              Add {selected.length > 0 ? `${selected.length} ` : ""}image{selected.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
