"use client";

/** Media library: pictures uploaded once, used anywhere (products, the website, banners). */
import { ask, tell } from "@/lib/dialog";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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
      setError("The media library could not be loaded.");
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
      setError("The upload did not go through. Check that media storage is set up.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copyUrl(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  async function remove(id: string) {
    if (!await ask("Delete this picture? Anywhere it is used, it stops showing.", { ok: "Delete", danger: true })) return;
    try { await mediaService.remove(id); setItems((p) => p.filter((x) => x.file_id !== id)); } catch { tell("It could not be deleted."); }
  }

  return (
    <div className="pc-page" data-media>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Storefront</div>
          <h1 className="pc-h1">Media library</h1>
          <p className="pc-sub-line">Upload pictures here, then copy the link to use anywhere: products, the website, banners.</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} hidden />
          <button type="button" className="pc-btn" data-kind="primary" onClick={() => fileRef.current?.click()} disabled={uploading || !configured}>
            {uploading ? "Uploading…" : "Upload pictures"}
          </button>
        </div>
      </div>

      {!configured && (
        <div className="pc-note" style={{ marginBottom: "16px" }}>
          <b>Media storage is not set up yet.</b> Uploads start working once its keys are added to the server.
        </div>
      )}
      {error && <div className="pc-flash" data-bad="" role="alert">{error}</div>}

      {loading ? (
        <div className="pc-card pc-empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="pc-card pc-empty">No pictures yet. Press <b>Upload pictures</b> to add the first one.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
          {items.map((m) => (
            <div key={m.file_id} className="pc-card" data-media-item>
              <div style={{ aspectRatio: "1 / 1", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: "1px solid var(--pc-line)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.thumbnail_url || m.url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div title={m.name} style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                  <button type="button" className="pc-btn" style={{ flex: 1, height: "34px", fontSize: "13px" }} onClick={() => copyUrl(m.url, m.file_id)}>
                    {copied === m.file_id ? "Copied" : "Copy link"}
                  </button>
                  <button type="button" className="pc-btn" aria-label={`Delete ${m.name}`} style={{ height: "34px", padding: "0 10px", color: "var(--pc-red)" }} onClick={() => remove(m.file_id)}>
                    <X size={15} strokeWidth={2.4} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
