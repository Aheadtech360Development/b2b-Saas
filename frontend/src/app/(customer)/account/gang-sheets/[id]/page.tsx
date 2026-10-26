"use client";

/**
 * One print job: the sheet as it was sent (the layout the print team works
 * from), its artwork files with the resolution check each had on upload, where
 * it stands, its tracking, and the order it was bought on.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { gangSheetsService, type GangSheetArtwork } from "@/services/gangSheets.service";
import { cartService } from "@/services/cart.service";
import { trackSheetAdd } from "@/lib/tracking";
import { downloadFile } from "@/lib/download";
import { day } from "@/lib/customerWords";
import { GangSheetCanvas } from "@/components/storefront/GangSheetCanvas";
import { Banner, Chip, Loading, PageHead, type Tone } from "@/components/portal/ui";
import { JOB_STEPS, jobKind, jobLine, jobState, jobStep, type Job } from "@/components/portal/data";

const CHECK: Record<string, [string, Tone]> = {
  ready: ["Print ready", "ok"],
  check: ["Check resolution", "warn"],
  blocked: ["Too low to print", "bad"],
  unknown: ["Not checked", "mute"],
};

function ArtworkRow({ a }: { a: GangSheetArtwork }) {
  const [w, tone] = CHECK[a.inspection?.verdict ?? "unknown"] ?? CHECK.unknown!;
  const first = a.inspection?.findings?.find((f) => f.level !== "ok");
  const image = /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(a.file_url) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes((a.file_type ?? "").toLowerCase());
  return (
    <div className="cp-row" style={{ alignItems: "flex-start" }}>
      <div className="cp-thumb" aria-hidden style={{ width: 56, height: 56 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={a.file_url} alt="" /> : <span style={{ fontSize: 11, fontWeight: 700 }}>{(a.file_type ?? "FILE").toUpperCase()}</span>}
      </div>
      <div className="cp-row-body">
        <div className="cp-row-t" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.file_name}>{a.file_name}</div>
        <div className="cp-row-s">{a.width_in} x {a.height_in} in, qty {a.quantity}</div>
        {first && <div className="cp-row-s">{first.message}</div>}
      </div>
      <div className="cp-actions">
        <Chip tone={tone}>{w}</Chip>
        <button type="button" className="cp-btn cp-btn-sm" onClick={() => downloadFile(a.file_url, a.file_name)}>Download</button>
      </div>
    </div>
  );
}

export default function PrintJobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    gangSheetsService.myOrder(id)
      .then((j) => setJob(j as Job))
      .catch(() => setError("This print job could not be loaded."));
  }, [id]);
  useEffect(load, [load]);

  async function reorder() {
    if (!job) return;
    setBusy(true);
    try {
      const clone = await gangSheetsService.reorder(job.id);
      await cartService.addGangSheet(clone.id);
      trackSheetAdd(clone, { navigating: true });
      window.location.href = "/cart";
    } catch {
      setNotice("Could not reorder this job. Please try again.");
      setBusy(false);
    }
  }

  async function resubmit() {
    if (!job) return;
    setBusy(true);
    try {
      await gangSheetsService.resubmit(job.id);
      load();
      setNotice("Sent back to the print team for review.");
    } catch {
      setNotice("That didn't go through. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHead back={{ href: "/account/gang-sheets", label: "Print jobs" }} eyebrow="Print job" title="Print job" />
        <Banner tone="bad" onRetry={load}>{error}</Banner>
      </>
    );
  }
  if (!job) return <Loading what="Loading print job" />;

  const [words, tone] = jobState(job);
  const kind = jobKind(job);
  const editable = (job.status === "submitted" || job.status === "revision_requested") && kind === "gang_sheet";
  const artworks = job.artworks ?? [];
  const layout = job.layout ?? [];
  const ask = `/account/messages?job=${encodeURIComponent(job.reference)}`;

  return (
    <>
      <PageHead
        back={{ href: "/account/gang-sheets", label: "Print jobs" }}
        eyebrow="Print job"
        title={job.reference}
        sub={<>{kind === "upload_by_size" ? "Upload by size" : "Gang sheet"} · {jobLine(job)}{job.created_at ? ` · ${day(job.created_at)}` : ""}</>}
        actions={
          <>
            <button type="button" className="cp-btn" disabled={busy} onClick={reorder}>{busy ? "Working…" : "Reorder"}</button>
            <Link href={ask} className="cp-btn">Message the shop</Link>
            <Chip tone={tone}>{words}</Chip>
          </>
        }
      />

      <div className="cp-stack-sm" style={{ marginBottom: notice || job.supplier_notes ? 24 : 0 }}>
        {notice && <Banner tone="info">{notice}</Banner>}
        {job.supplier_notes && <Banner tone="warn"><strong>From the print team:</strong> {job.supplier_notes}</Banner>}
      </div>

      <div className="cp-cols">
        <div className="cp-col-main">
          <section className="cp-card cp-pad" aria-labelledby="proof">
            <div className="cp-card-head">
              <h2 id="proof" className="cp-h2">{kind === "gang_sheet" ? "Your sheet" : "Your design"}</h2>
              <span className="cp-actions">
                {editable && (
                  <Link href={`/gang-sheets?edit=${job.id}${job.product_id ? `&product=${job.product_id}` : ""}`} className="cp-btn cp-btn-p cp-btn-sm">
                    Edit in builder
                  </Link>
                )}
                {job.status === "revision_requested" && kind === "upload_by_size" && job.product_slug && (
                  <Link href={`/products/${job.product_slug}?revise=${job.id}`} className="cp-btn cp-btn-p cp-btn-sm">Update and resubmit</Link>
                )}
                {job.status === "revision_requested" && (
                  <button type="button" className="cp-btn cp-btn-sm" disabled={busy} onClick={resubmit}>Resubmit</button>
                )}
                {!editable && job.status !== "revision_requested" && <Link href={ask} className="cp-btn cp-btn-sm">Request a change</Link>}
              </span>
            </div>
            {kind === "gang_sheet" && layout.length > 0 ? (
              <GangSheetCanvas
                sheet={{ width_in: job.sheet_width_in, height_in: job.sheet_height_in, bleed_in: 0.125, spacing_in: 0.125 }}
                artworks={artworks}
                value={layout}
                onChange={() => {}}
                readOnly
              />
            ) : artworks.length > 0 ? (
              <div className="cp-tiles">
                {artworks.map((a, i) => (
                  <div key={a.id ?? i} className="cp-tile-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.file_url} alt={a.file_name} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="cp-note" style={{ margin: 0 }}>No layout saved for this job yet.</p>
            )}
            <p className="cp-note" style={{ margin: "12px 0 0" }}>
              This is what you sent. The print team checks it before printing and emails you if anything needs a change.
            </p>
          </section>

          <section className="cp-card cp-pad" aria-labelledby="files">
            <h2 id="files" className="cp-h2" style={{ marginBottom: 14 }}>Artwork files</h2>
            {artworks.length === 0 ? <p className="cp-note" style={{ margin: 0 }}>No files on this job.</p> : (
              <div className="cp-rows" style={{ gap: 14 }}>{artworks.map((a, i) => <ArtworkRow key={a.id ?? i} a={a} />)}</div>
            )}
          </section>
        </div>

        <div className="cp-col-side">
          <section className="cp-card cp-pad" aria-labelledby="progress">
            <h2 id="progress" className="cp-h2" style={{ marginBottom: 14 }}>Progress</h2>
            {job.status === "rejected"
              ? <p className="cp-note" style={{ margin: 0 }}>The print team could not accept this job. Ask them in Messages what to change.</p>
              : (
                <ol className="cp-history">
                  {JOB_STEPS.map((s, i) => {
                    const { at, finished } = jobStep(job);
                    const done = i < at || (finished && i === at);
                    const on = i === at && !finished;
                    return (
                      <li key={s}>
                        <span className="dot" aria-hidden style={{ background: done ? "var(--cp-accent)" : on ? "var(--cp-accent-line)" : "var(--cp-line-2)" }} />
                        <div className="t" style={{ color: done || on ? "var(--cp-ink)" : "var(--cp-muted)", fontWeight: on ? 600 : 500 }}>
                          {s}{on && job.status === "revision_requested" ? ": needs a change" : ""}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
          </section>

          <section className="cp-card cp-pad" aria-labelledby="tracking">
            <h2 id="tracking" className="cp-h2" style={{ marginBottom: 10 }}>Tracking</h2>
            {job.tracking_number ? (
              <div className="cp-stack-sm">
                <div style={{ fontSize: 14 }}>{job.carrier ? `${job.carrier.toUpperCase()}, ` : ""}<span className="cp-mono">{job.tracking_number}</span></div>
                {job.tracking_url && <div><a href={job.tracking_url} target="_blank" rel="noreferrer" className="cp-btn cp-btn-p cp-btn-sm">Track package</a></div>}
              </div>
            ) : (
              <p className="cp-note" style={{ margin: 0 }}>Tracking shows here when your job ships.</p>
            )}
          </section>

          <section className="cp-card cp-pad" aria-labelledby="linked-order">
            <h2 id="linked-order" className="cp-h2" style={{ marginBottom: 10 }}>Linked order</h2>
            {job.order_id ? (
              <div className="cp-row">
                <div className="cp-row-body"><div className="cp-row-t">Order {job.order_number ?? ""}</div></div>
                <Link href={`/account/orders/${job.order_id}`} className="cp-btn cp-btn-sm">View order</Link>
              </div>
            ) : (
              <p className="cp-note" style={{ margin: 0 }}>Not ordered yet. Add it to your cart from the builder to check out.</p>
            )}
          </section>

        </div>
      </div>
    </>
  );
}
