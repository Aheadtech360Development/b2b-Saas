"use client";

import { useEffect, useRef, useState } from "react";
import { mediaService, type MediaItem } from "@/services/media.service";

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await mediaService.list();
      setConfigured(res.configured);
      setItems(res.items || []);
    } catch {
      setError("Failed to load media");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of files) await mediaService.upload(f);
      await load();
    } catch {
      setError("Upload failed. Check that media storage (ImageKit) is configured.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copyUrl(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  async function remove(id: string) {
    if (!confirm("Delete this file?")) return;
    try { await mediaService.remove(id); setItems((p) => p.filter((x) => x.file_id !== id)); } catch { alert("Delete failed"); }
  }

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "1100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "32px", color: "#2A2830", letterSpacing: ".03em", lineHeight: 1 }}>Media Library</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Upload images here, then copy the URL to use anywhere — products, storefront, banners.</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || !configured}
            style={{ background: uploading || !configured ? "#9ca3af" : "#1C3557", color: "#fff", border: "none", padding: "11px 22px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, cursor: uploading || !configured ? "not-allowed" : "pointer" }}>
            {uploading ? "Uploading…" : "+ Upload Images"}
          </button>
        </div>
      </div>

      {!configured && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", padding: "14px 18px", borderRadius: "10px", fontSize: "13px", marginBottom: "16px" }}>
          <strong>Media storage not configured yet.</strong> Add your ImageKit keys to <code>backend/.env</code> and restart the backend, then upload will work.
        </div>
      )}
      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}

      {loading ? (
        <div style={{ padding: "40px", color: "#888", fontSize: "13px" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: "48px", textAlign: "center", color: "#999", fontSize: "14px", background: "#FAFAF8", border: "1px dashed #D8D6CE", borderRadius: "12px" }}>
          No files yet. Click <strong>Upload Images</strong> to add your first one.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
          {items.map((m) => (
            <div key={m.file_id} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
              <div style={{ aspectRatio: "1 / 1", background: "#F4F3EF", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.thumbnail_url || m.url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                  <button onClick={() => copyUrl(m.url, m.file_id)} style={{ flex: 1, background: "#F0F4FA", border: "1px solid #C9D6E8", color: "#1C3557", padding: "5px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                    {copied === m.file_id ? "Copied!" : "Copy URL"}
                  </button>
                  <button onClick={() => remove(m.file_id)} style={{ background: "rgba(239,68,68,.08)", border: "none", color: "#B91C1C", padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
