"use client";

/**
 * One print job: its sheet, its files, the order it belongs to, and the buttons
 * that move it on.
 *
 * Where it stands (the stage, the steps, the next step) comes with the job from
 * the server (services/production_board), the same answer the Production board
 * shows. Approving, sending back, rejecting and printing call the job's status
 * route, which emails the customer; the message typed here goes with that
 * email. The private note is saved on its own and emails nobody. The sheet is
 * the same editor the old review screen used, and a layout not saved yet is
 * saved before the job moves on, so what is printed is what is on screen.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { ask, askText, tell } from "@/lib/dialog";
import { downloadFile } from "@/lib/download";
import { openSheetPdf } from "@/lib/gangSheetPdf";
import { API_BASE_URL } from "@/lib/constants";
import { GangSheetCanvas } from "@/components/storefront/GangSheetCanvas";
import type { GangSheetProduction } from "@/components/admin/GangSheetLineFiles";
import {
  gangSheetsService,
  type ArtworkInspection, type GangSheetArtwork, type GangSheetOrder, type GangSheetPlacement, type GangSheetStatus,
} from "@/services/gangSheets.service";
import { cutoffNote, jobSummary, paymentPill, productionService, type JobStanding } from "@/services/production.service";

type Job = GangSheetOrder & JobStanding & { production?: GangSheetProduction | null };

const STAGE: Record<string, [string, string]> = {
  draft: ["Not ordered", ""], review: ["Artwork review", "amber"], customer: ["Sent back", "red"],
  approved: ["Approved", "green"], production: ["In production", "blue"], ready: ["Ready to ship", "blue"],
  shipped: ["Shipped", "green"], rejected: ["Rejected", "red"], cancelled: ["Order cancelled", ""],
};

const IMAGE = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const inch = (n: number) => `${Number(Number(n).toFixed(2))}`;

/** The print check, as a pill: fine, worth a look, a problem, or never checked. */
function dpiPill(inspection?: ArtworkInspection | null): { label: string; tone: string } {
  const dpi = inspection?.measured?.effective_dpi;
  if (!inspection || inspection.verdict === "unknown") return { label: "Not checked", tone: "" };
  if (inspection.verdict === "ready") return { label: "DPI ok", tone: "green" };
  const words = typeof dpi === "number" ? `${dpi} DPI` : inspection.verdict === "blocked" ? "Problem" : "Worth a look";
  return { label: words, tone: inspection.verdict === "blocked" ? "red" : "amber" };
}

export default function PrintJobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loadError, setLoadError] = useState("");
  const [margins, setMargins] = useState<{ bleed_in: number; spacing_in: number } | null>(null);
  const [layout, setLayout] = useState<GangSheetPlacement[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState("");
  const [internalSaved, setInternalSaved] = useState("");
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);

  const take = useCallback((j: Job, keepLayout = false) => {
    setJob(j);
    if (!keepLayout) { setLayout(j.layout ?? []); setDirty(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    gangSheetsService.adminOrder(id)
      .then((d) => {
        if (cancelled) return;
        const j = d as Job;
        take(j);
        setInternal(j.internal_notes ?? "");
        // Bleed and spacing live on the sheet size; a design ordered by size is
        // the sheet itself, cut to its size, with nothing to trim.
        if (!j.sheet_size_id) { setMargins({ bleed_in: 0, spacing_in: 0 }); return; }
        gangSheetsService.adminListSizes()
          .then((sizes) => {
            const s = sizes.find((x) => x.id === j.sheet_size_id);
            if (!cancelled) setMargins(s ? { bleed_in: s.bleed_in, spacing_in: s.spacing_in } : { bleed_in: 0, spacing_in: 0 });
          })
          .catch(() => { if (!cancelled) setMargins({ bleed_in: 0, spacing_in: 0 }); });
      })
      .catch((e) => { if (!cancelled) setLoadError(errorText(e, "This print job could not be loaded.")); });
    productionService.settings().then((s) => { if (!cancelled) setCutoff(s.cutoff); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, take]);

  const artworks = useMemo(() => job?.artworks ?? [], [job]);
  const flagged = useMemo(() => artworks.filter((a) => a.inspection && ["check", "blocked"].includes(a.inspection.verdict)), [artworks]);
  const findings = useMemo(() => {
    const seen = new Set<string>();
    for (const a of artworks) for (const f of a.inspection?.findings ?? []) if (f.level !== "ok" && f.message) seen.add(f.message);
    return [...seen];
  }, [artworks]);

  if (loadError) {
    return (
      <div className="pc-page">
        <Link href="/admin/production" className="pc-back"><ArrowLeft size={16} strokeWidth={2.2} /> Production</Link>
        <div className="pc-card pc-empty">{loadError}</div>
      </div>
    );
  }
  if (!job) return <div className="pc-page"><div className="pc-card pc-empty">Loading the print job…</div></div>;

  const j = job;
  const stage = j.stage;
  const stagePill = STAGE[stage] ?? [stage, ""];
  const pay = paymentPill({ paid: j.order_paid, payment_method: j.order_payment_method, order_id: j.order_id });
  const summary = jobSummary({ kind: j.job_kind, sheet_name: j.sheet_name, width_in: j.sheet_width_in, height_in: j.sheet_height_in, quantity: j.sheet_quantity, subtotal: j.subtotal });
  const note = stage === "review" ? cutoffNote(cutoff) : null;
  const printFile = j.production?.print_file ?? null;
  const fileHref = (url: string) => (url.startsWith("/") ? `${API_BASE_URL}${url}` : url);

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Save an arrangement not saved yet, so the job moves on with what is on screen. */
  async function saveLayout(quiet = false): Promise<boolean> {
    if (!dirty) return true;
    try {
      const fresh = await gangSheetsService.adminSaveLayout(j.id, layout) as Job;
      take(fresh);
      if (!quiet) setFlash({ text: "Layout saved." });
      return true;
    } catch (e) {
      setFlash({ text: errorText(e, "The layout could not be saved."), bad: true });
      return false;
    }
  }

  async function move(to: GangSheetStatus, done: string, withMessage?: string) {
    setBusy(to);
    setFlash(null);
    try {
      if (!(await saveLayout(true))) { setBusy(""); return; }
      const fresh = await gangSheetsService.adminSetStatus(j.id, to, withMessage) as Job;
      take(fresh, true);
      if (withMessage !== undefined) setMessage("");
      setFlash({ text: done });
    } catch (e) {
      setFlash({ text: errorText(e, "That did not work. Nothing was changed."), bad: true });
    }
    setBusy("");
  }

  async function approve() {
    const text = message.trim();
    const low = flagged.length
      ? `${flagged.length === 1 ? "1 file is" : `${flagged.length} files are`} below print quality (see Artwork files). `
      : "";
    const yes = await ask(
      `${low}Approve ${j.reference}? The customer is emailed that it is approved${text ? ", with your message" : ""}.`,
      { title: "Approve the artwork", ok: low ? "Approve as is" : "Approve" },
    );
    if (yes) await move("approved", `Approved. The customer has been emailed${text ? " with your message" : ""}.`, text || undefined);
  }

  async function requestRevision() {
    let text = message.trim();
    if (!text) {
      const typed = await askText(
        "What should the customer change? This is emailed to them.",
        "",
        { title: "Request a revision", ok: "Send", placeholder: "For example: the logo is too small to print sharp, please upload a larger file." },
      );
      if (!typed?.trim()) return;
      text = typed.trim();
    } else if (!(await ask(`Send ${j.reference} back to the customer with your message?`, { title: "Request a revision", ok: "Send" }))) {
      return;
    }
    await move("revision_requested", "Sent back to the customer with your message.", text);
  }

  async function reject() {
    const typed = await askText(
      `Reject ${j.reference}? The customer is emailed that it could not be accepted. Say why: it is sent to them.`,
      message.trim(),
      { title: "Reject this job", ok: "Reject", danger: true, placeholder: "Reason" },
    );
    if (typed === null) return;
    await move("rejected", "Rejected. The customer has been emailed.", typed.trim() || undefined);
  }

  const startPrinting = () => move("production", "Printing. The customer has been told it is in production.");
  const markReady = () => move("completed", `Ready to ship.${j.order_number ? ` Order ${j.order_number} goes to its ship queue once every sheet on it is ready.` : ""} The customer has been told.`);
  const reopen = () => move("in_review", "Back in review.");

  async function saveInternal() {
    if (internal.trim() === (j.internal_notes ?? "").trim()) return;
    try {
      const fresh = await gangSheetsService.adminSaveNotes(j.id, internal) as Job;
      take(fresh, true);
      setInternalSaved("Saved");
      setTimeout(() => setInternalSaved(""), 2500);
    } catch (e) {
      setInternalSaved("");
      setFlash({ text: errorText(e, "The note could not be saved."), bad: true });
    }
  }

  async function downloadPdf() {
    if (!layout.length) { await tell("Nothing is placed on the sheet yet. Arrange it first, or press Auto-nest.", { title: "Download PDF" }); return; }
    openSheetPdf({
      reference: j.reference, customerName: j.contact_name,
      sheet: { width_in: j.sheet_width_in, height_in: j.sheet_height_in, bleed_in: margins?.bleed_in ?? 0 },
      artworks, layout,
    });
  }

  const working = !!busy;
  /** A button that moves the job to `to`: says it is working while it does. */
  const btn = (label: string, act: () => void, to: GangSheetStatus, kind?: string) => (
    <button key={to} type="button" className="pc-btn" data-kind={kind} disabled={working} onClick={act}>{busy === to ? "Working…" : label}</button>
  );

  const head: React.ReactNode[] = [
    <button key="pdf" type="button" className="pc-btn" onClick={downloadPdf} disabled={working}>Download PDF</button>,
  ];
  if (stage === "review" || stage === "customer") {
    head.push(btn("Reject", reject, "rejected", "danger"), btn("Request revision", requestRevision, "revision_requested"), btn("Approve", approve, "approved", "primary"));
  } else if (stage === "approved") {
    head.push(btn("Request revision", requestRevision, "revision_requested"), btn("Start printing", startPrinting, "production", "primary"));
  } else if (stage === "production") {
    head.push(btn("Mark ready to ship", markReady, "completed", "primary"));
  } else if ((stage === "ready" || stage === "shipped") && j.order_id) {
    head.push(<Link key="order" href={`/admin/orders/${j.order_id}`} className="pc-btn" data-kind={stage === "ready" ? "primary" : undefined}>{stage === "ready" ? "Ship the order" : "Open order"}</Link>);
  } else if (stage === "rejected") {
    head.push(btn("Reopen", reopen, "in_review"));
  }

  return (
    <div className="pc-page" style={{ maxWidth: "1240px" }} data-job-page={j.reference} data-stage={stage}>
      <Link href="/admin/production" className="pc-back no-print"><ArrowLeft size={16} strokeWidth={2.2} /> Production</Link>

      <div className="pc-head" style={{ alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <div className="pc-title-row">
            <h1 className="pc-h1" style={{ margin: 0 }}>{j.reference}</h1>
            {j.order_id && <span className="pc-pill" data-tone={pay.tone || undefined}>{pay.label}</span>}
            <span className="pc-pill" data-tone={stagePill[1] || undefined}>{stagePill[0]}</span>
          </div>
          <p className="pc-sub-line" style={{ marginTop: "6px" }}>
            {summary}.{note ? ` ${note.text}.` : ""}
          </p>
        </div>
        <div className="pc-row-actions no-print" data-job-actions>{head}</div>
      </div>

      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)}><X size={16} /></button>
        </div>
      )}
      {stage === "draft" && (
        <div className="pc-note" style={{ marginBottom: "16px" }}>
          Not ordered yet: the buyer built this sheet and has not checked out. It joins the queue when they do.
        </div>
      )}
      {stage === "customer" && (
        <div className="pc-note" data-tone="red" style={{ marginBottom: "16px" }}>
          Sent back to the customer{j.supplier_notes ? `: "${j.supplier_notes}"` : ""}. When they send new artwork it comes back here for review.
        </div>
      )}

      <div className="pc-cols">
        <div className="pc-stack">
          {/* ── The sheet ───────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-label="Sheet layout" data-sheet>
            {artworks.length === 0 ? (
              <>
                <h2 className="pc-h2">Sheet layout</h2>
                <div className="pc-empty">This job has no artwork.</div>
              </>
            ) : !margins ? (
              <>
                <h2 className="pc-h2">Sheet layout</h2>
                <div className="pc-empty">Loading the sheet…</div>
              </>
            ) : (
              <>
                <GangSheetCanvas
                  variant="admin"
                  title={<h2 className="pc-h2">Sheet layout</h2>}
                  sheet={{ width_in: j.sheet_width_in, height_in: j.sheet_height_in, bleed_in: margins.bleed_in, spacing_in: margins.spacing_in }}
                  artworks={artworks}
                  value={layout}
                  onChange={(next) => { setLayout(next); setDirty(true); }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginTop: "12px" }}>
                  <span className="pc-sub-line" style={{ fontSize: "12.5px", margin: 0, color: dirty ? "var(--pc-amber)" : undefined }}>
                    {dirty ? "Changed, not saved yet." : "Saved."}
                  </span>
                  <button type="button" className="pc-btn" data-kind={dirty ? "primary" : undefined} disabled={!dirty || working} onClick={() => void saveLayout()} data-save-layout>
                    Save layout
                  </button>
                </div>
              </>
            )}
          </section>

          {/* ── Notes ───────────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="notes-title" data-notes>
            <h2 className="pc-h2" id="notes-title">Notes</h2>
            {j.customer_notes && (
              <div className="pc-note" data-tone="blue" style={{ marginTop: "12px" }}>
                <b>From the customer:</b> {j.customer_notes}
              </div>
            )}
            <div className="pc-notes2" style={{ marginTop: "14px" }}>
              <div>
                <label className="pc-label" htmlFor="msg">Message to customer</label>
                <textarea id="msg" className="pc-input" value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="Sent with the approval or revision email" />
              </div>
              <div>
                <label className="pc-label" htmlFor="internal">
                  Internal note (private) {internalSaved && <span style={{ color: "var(--pc-green)", fontWeight: 500 }}>· {internalSaved}</span>}
                </label>
                <textarea id="internal" className="pc-input" value={internal} onChange={(e) => setInternal(e.target.value)}
                  onBlur={() => void saveInternal()} placeholder="Only your team sees this" />
              </div>
            </div>
          </section>

          {(j.versions?.length ?? 0) > 1 && (
            <details className="pc-card pc-details">
              <summary>
                <h2 className="pc-h2">Earlier versions ({j.versions!.length})</h2>
                <span className="pc-link pc-details-more" aria-hidden />
              </summary>
              <div style={{ padding: "0 20px 16px" }}>
                {j.versions!.slice().reverse().map((v) => (
                  <div key={v.version} style={{ padding: "10px 0", borderTop: "1px solid var(--pc-line-soft)", fontSize: "13.5px" }}>
                    <div style={{ fontWeight: 600 }}>
                      Version {v.version}{v.version === j.version ? " (current)" : ""}
                      <span className="pc-sub-line" style={{ marginLeft: "8px", fontWeight: 400 }}>{v.created_at ? new Date(v.created_at).toLocaleString() : ""}</span>
                    </div>
                    {v.artworks.map((a, k) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "8px", color: "var(--pc-muted)" }}>
                        <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="pc-link" style={{ fontSize: "13px", overflowWrap: "anywhere" }}>{a.file_name}</a>
                        <span style={{ whiteSpace: "nowrap" }}>{inch(a.width_in)} × {inch(a.height_in)} in, qty {a.quantity}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="pc-stack">
          {/* ── Status ──────────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="status-title" data-status>
            <h2 className="pc-h2" id="status-title">Status</h2>
            <div className="pc-vsteps" style={{ marginTop: "14px" }}>
              {j.steps.map((s) => (
                <div key={s.key} className="pc-vstep" data-state={s.state}>
                  <span className="pc-step-ring" aria-hidden>
                    {s.state === "done" ? <Check size={13} strokeWidth={3} /> : s.state === "stopped" ? <X size={13} strokeWidth={3} /> : null}
                  </span>
                  {s.label}
                </div>
              ))}
            </div>
            {["review", "customer", "approved", "production"].includes(stage) && j.order_id && (
              <p className="pc-sub-line" style={{ marginTop: "14px", fontSize: "13px" }}>Marking this ready to ship moves the linked order to its ship queue.</p>
            )}
          </section>

          {/* ── The order ───────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="order-title" data-linked-order>
            <h2 className="pc-h2" id="order-title">Linked order</h2>
            {j.order_id ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "12px" }}>
                  <span style={{ fontWeight: 600 }}>Order {j.order_number}</span>
                  <Link href={`/admin/orders/${j.order_id}`} className="pc-link">Open order</Link>
                </div>
                <div style={{ marginTop: "8px" }}><span className="pc-pill" data-tone={pay.tone || undefined}>{pay.label}</span></div>
              </>
            ) : (
              <p className="pc-sub-line" style={{ marginTop: "10px" }}>No order yet. The buyer has not checked out.</p>
            )}
            <p className="pc-sub-line" style={{ marginTop: "10px", fontSize: "13px" }}>
              Contact: {j.contact_name || "Guest"}{j.contact_email ? <>, <a href={`mailto:${j.contact_email}`} className="pc-link" style={{ fontSize: "13px" }}>{j.contact_email}</a></> : null}
            </p>
          </section>

          {/* ── Files ───────────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="files-title" data-files>
            <h2 className="pc-h2" id="files-title">Artwork files</h2>
            <div className="pc-files" style={{ marginTop: "6px" }}>
              {artworks.map((a: GangSheetArtwork, i) => {
                const pill = dpiPill(a.inspection);
                const ext = (a.file_type ?? a.file_name.split(".").pop() ?? "").toLowerCase();
                return (
                  <div key={a.id ?? i} className="pc-file" data-file={a.file_name}>
                    {IMAGE.has(ext)
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.file_url} alt="" className="pc-file-thumb" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                      : <span className="pc-file-thumb">{ext.toUpperCase().slice(0, 4) || "FILE"}</span>}
                    <div style={{ minWidth: 0 }}>
                      <div className="pc-file-name">{a.file_name}</div>
                      <div className="pc-file-size">{inch(a.width_in)} × {inch(a.height_in)} in, qty {a.quantity}</div>
                    </div>
                    <span className="pc-pill" data-tone={pill.tone || undefined}>{pill.label}</span>
                    <button type="button" className="pc-link" style={{ fontSize: "13px" }} onClick={() => { void downloadFile(a.file_url, a.file_name); }}>Download</button>
                  </div>
                );
              })}
            </div>
            {findings.length > 0 && (
              <div className="pc-note" style={{ marginTop: "10px", display: "grid", gap: "4px" }} data-findings>
                {findings.map((f) => <div key={f}>{f}</div>)}
                {flagged.length > 0 && <div>Ask for a larger file, or approve as is.</div>}
              </div>
            )}
            {printFile && (
              <div style={{ marginTop: "12px", fontSize: "13px" }}>
                <span className="pc-sub-line" style={{ fontSize: "13px" }}>Print-ready file: </span>
                <a href={fileHref(printFile.url)} className="pc-link" style={{ fontSize: "13px", overflowWrap: "anywhere" }}>{printFile.name}</a>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
