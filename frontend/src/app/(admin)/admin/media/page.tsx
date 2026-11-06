"use client";

/** Media library: pictures and videos uploaded once, used anywhere (products,
 *  the website, banners). A video goes from the browser straight to the media
 *  storage (mediaService.uploadVideo), never through our server. */
import { ask, tell } from "@/lib/dialog";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { isVideoItem } from "@/lib/videoUrl";
import { mediaService, type MediaItem } from "@/services/media.service";

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [videos, setVideos] = useState(false);
  const [videoMaxMb, setVideoMaxMb] = useState(100);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** `added`: files just uploaded. The storage's list takes a few seconds to
   *  include a new file, so they are shown first until it does. */
  async function load(added: MediaItem[] = []) {
    setLoading(true);
    try {
      const res = await mediaService.list();
      setConfigured(res.configured);
      setVideos(!!res.videos);
      if (res.video_max_mb) setVideoMaxMb(res.video_max_mb);
      const listed = res.items || [];
      setItems([...added.filter((a) => !listed.some((i) => i.file_id === a.file_id)), ...listed]);
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
    setUploading("Uploading…");
    setError(null);
    const problems: string[] = [];
    const added: MediaItem[] = [];
    for (const f of files) {
      try {
        const video = f.type.startsWith("video/");
        if (video && f.size > videoMaxMb * 1024 * 1024) {
          problems.push(`${f.name}: videos can be up to ${videoMaxMb} MB.`);
          continue;
        }
        if (!video) setUploading(`Uploading ${f.name}…`);
        const up = video
          ? await mediaService.uploadVideo(f, (p) => setUploading(`Uploading ${f.name}: ${p}%`))
          : await mediaService.upload(f);
        if (up.url && up.file_id) {
          added.unshift({ file_id: up.file_id, url: up.url, thumbnail_url: null, name: up.name || f.name, size: f.size,
                          file_type: video ? "non-image" : "image", mime: f.type || null, created_at: new Date().toISOString() });
        }
      } catch (err) {
        problems.push(`${f.name}: ${err instanceof Error && err.message ? err.message : "the upload did not go through."}`);
      }
    }
    if (problems.length) setError(problems.join(" "));
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    await load(added);
  }

  async function copyUrl(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  async function remove(m: MediaItem) {
    const what = isVideoItem(m) ? "video" : "picture";
    if (!await ask(`Delete this ${what}? Anywhere it is used, it stops showing.`, { ok: "Delete", danger: true })) return;
    try { await mediaService.remove(m.file_id); setItems((p) => p.filter((x) => x.file_id !== m.file_id)); } catch { tell("It could not be deleted."); }
  }

  return (
    <div className="pc-page" data-media>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Storefront</div>
          <h1 className="pc-h1">Media library</h1>
          <p className="pc-sub-line">
            {videos
              ? `Upload pictures and videos (up to ${videoMaxMb} MB) here, then copy the link to use anywhere: products, the website, banners.`
              : "Upload pictures here, then copy the link to use anywhere: products, the website, banners."}
          </p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept={videos ? "image/*,video/*" : "image/*"} multiple onChange={handleUpload} hidden />
          <button type="button" className="pc-btn" data-kind="primary" onClick={() => fileRef.current?.click()} disabled={!!uploading || !configured}>
            {uploading ?? (videos ? "Upload pictures or videos" : "Upload pictures")}
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
        <div className="pc-card pc-empty">Nothing here yet. Press <b>{videos ? "Upload pictures or videos" : "Upload pictures"}</b> to add the first one.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
          {items.map((m) => (
            <div key={m.file_id} className="pc-card" data-media-item data-video={isVideoItem(m) ? "" : undefined}>
              <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: "1px solid var(--pc-line)" }}>
                {isVideoItem(m) ? (
                  <>
                    <video src={m.url} preload="metadata" muted playsInline controls aria-label={m.name}
                           style={{ width: "100%", height: "100%", objectFit: "cover", background: "#0B0F17" }} />
                    <span className="pc-pill" style={{ position: "absolute", top: 8, left: 8, pointerEvents: "none" }}>Video</span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnail_url || m.url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div title={m.name} style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                  <button type="button" className="pc-btn" style={{ flex: 1, height: "34px", fontSize: "13px" }} onClick={() => copyUrl(m.url, m.file_id)}>
                    {copied === m.file_id ? "Copied" : "Copy link"}
                  </button>
                  <button type="button" className="pc-btn" aria-label={`Delete ${m.name}`} style={{ height: "34px", padding: "0 10px", color: "var(--pc-red)" }} onClick={() => remove(m)}>
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
