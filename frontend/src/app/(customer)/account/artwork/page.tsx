"use client";

/**
 * Artwork library: every file the buyer has sent with a print job, once each,
 * newest first: the same files the builder's Gallery offers, so "Use again"
 * opens the builder where they wait. The resolution check each file had on
 * upload shows on its tile.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { gangSheetsService, type GangSheetArtwork } from "@/services/gangSheets.service";
import { downloadFile } from "@/lib/download";
import { Banner, Chip, Empty, Loading, PageHead, type Tone } from "@/components/portal/ui";

const CHECK: Record<string, [string, Tone]> = {
  ready: ["Print ready", "ok"],
  check: ["Check resolution", "warn"],
  blocked: ["Too low to print", "bad"],
  unknown: ["Not checked", "mute"],
};

const typeOf = (a: GangSheetArtwork) =>
  (a.file_type || a.file_name.split(".").pop() || a.file_url.split("?")[0]!.split(".").pop() || "file").toLowerCase();

const IMAGE = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

export default function ArtworkLibraryPage() {
  const [files, setFiles] = useState<GangSheetArtwork[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<"new" | "name">("new");

  function load() {
    setError(null);
    gangSheetsService.myArtworks()
      .then(setFiles)
      .catch(() => { setFiles([]); setError("Your artwork could not be loaded."); });
  }
  useEffect(load, []);

  const types = useMemo(() => [...new Set((files ?? []).map(typeOf))].sort(), [files]);
  const shown = useMemo(() => {
    const list = (files ?? []).filter((a) =>
      (!q || a.file_name.toLowerCase().includes(q.trim().toLowerCase())) && (!type || typeOf(a) === type));
    return sort === "name" ? [...list].sort((a, b) => a.file_name.localeCompare(b.file_name)) : list;
  }, [files, q, type, sort]);

  return (
    <>
      <PageHead eyebrow="Artwork" title="Artwork library" sub="Every file you have uploaded, ready to use again."
        actions={<Link href="/gang-sheets" className="cp-btn cp-btn-p">Upload artwork</Link>} />

      {error && <div style={{ marginBottom: 16 }}><Banner tone="bad" onRetry={load}>{error}</Banner></div>}

      <div className="cp-filters">
        <label className="cp-sr" htmlFor="a-q">Search by file name</label>
        <input id="a-q" className="cp-input cp-grow" type="search" placeholder="Search by file name" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="cp-sr" htmlFor="a-type">Type</label>
        <select id="a-type" className="cp-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Type: All</option>
          {types.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
        <label className="cp-sr" htmlFor="a-sort">Sort</label>
        <select id="a-sort" className="cp-select" value={sort} onChange={(e) => setSort(e.target.value as "new" | "name")}>
          <option value="new">Newest first</option>
          <option value="name">By name</option>
        </select>
      </div>

      {files === null ? (
        <Loading what="Loading your artwork" />
      ) : files.length === 0 ? (
        <div className="cp-card">
          <Empty title="No artwork yet">
            Files you send with a print job land here on their own.
            <div style={{ marginTop: 12 }}><Link href="/gang-sheets" className="cp-btn cp-btn-p">Build a gang sheet</Link></div>
          </Empty>
        </div>
      ) : shown.length === 0 ? (
        <div className="cp-card"><Empty title="No files match">Try another name or type.</Empty></div>
      ) : (
        <div className="cp-tiles">
          {shown.map((a, i) => {
            const [w, tone] = CHECK[a.inspection?.verdict ?? "unknown"] ?? CHECK.unknown!;
            const t = typeOf(a);
            return (
              <article key={a.id ?? `${a.file_url}-${i}`} className="cp-card cp-tile">
                <div className="cp-tile-img">
                  {IMAGE.has(t)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.file_url} alt="" loading="lazy" />
                    : <span className="cp-chip">{t.toUpperCase()}</span>}
                </div>
                <div className="cp-tile-name" title={a.file_name}>{a.file_name}</div>
                <div className="cp-actions" style={{ justifyContent: "space-between" }}>
                  <span className="cp-note">{a.width_in} x {a.height_in} in</span>
                  <Chip tone={tone}>{w}</Chip>
                </div>
                <div className="cp-actions">
                  <Link href="/gang-sheets" className="cp-btn cp-btn-sm cp-btn-p">Use again</Link>
                  <button type="button" className="cp-btn cp-btn-sm" onClick={() => downloadFile(a.file_url, a.file_name)}>Download</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="cp-note" style={{ marginTop: 16 }}>
        Files from your print jobs land here on their own, and the builder&apos;s Gallery offers the same ones. A resolution check runs on upload.
      </p>
    </>
  );
}
