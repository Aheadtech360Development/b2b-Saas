"use client";

/**
 * Production: every ordered print job, from artwork review to the shipping table.
 *
 * The columns, the counts above them and each card's button come from one
 * answer (GET /admin/production, services/production_board), so a count can
 * never disagree with the column under it. A job joins the queue when its
 * order is placed, paid or not (cash on delivery is paid on handover); a sheet
 * nobody checked out is a draft and stays out until somebody asks to see it.
 * Moving a job on calls the same status route the job's own page uses, so the
 * customer's emails are the same from both.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { askText, tell } from "@/lib/dialog";
import { gangSheetsService, type GangSheetStatus } from "@/services/gangSheets.service";
import {
  cutoffNote, cutoffWords, jobSummary, paymentPill, productionService,
  type JobColumn, type ProductionBoard, type ProductionJob,
} from "@/services/production.service";

const COLUMNS: { key: JobColumn; title: string; empty: string }[] = [
  { key: "review", title: "Artwork review", empty: "Ordered jobs land here for a look at the artwork." },
  { key: "approved", title: "Approved", empty: "Approved jobs wait here until you start printing." },
  { key: "production", title: "In production", empty: "Jobs you are printing now." },
  { key: "ready", title: "Ready to ship", empty: "Finished jobs. The linked order moves to its ship queue." },
];

const STAGE_PILL: Record<string, [string, string]> = {
  review: ["Artwork review", "amber"], customer: ["Sent back", "red"], approved: ["Approved", "green"],
  production: ["In production", "blue"], ready: ["Ready to ship", "blue"], draft: ["Draft", ""],
};

const money = (n: number) => `$${n.toFixed(2)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "–");
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function ProductionPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading production…</div></div>}>
      <Production />
    </Suspense>
  );
}

function Production() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "list" ? "list" : "board";

  const [board, setBoard] = useState<ProductionBoard | null>(null);
  const [loadError, setLoadError] = useState("");
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [drafts, setDrafts] = useState<ProductionJob[] | null>(null);
  const [draftsBusy, setDraftsBusy] = useState(false);
  // The cutoff note depends on the clock: look again every minute.
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    try {
      setBoard(await productionService.board());
      setLoadError("");
    } catch (e) {
      setLoadError(errorText(e, "The production queue could not be loaded."));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function setView(next: "board" | "list") {
    const q = new URLSearchParams(params.toString());
    if (next === "list") q.set("view", "list"); else q.delete("view");
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  }

  async function move(job: ProductionJob, to: GangSheetStatus, done: string) {
    setBusy(job.id);
    try {
      await gangSheetsService.adminSetStatus(job.id, to);
      await load();
      setFlash({ text: done });
    } catch (e) {
      setFlash({ text: errorText(e, "That did not work. Nothing was changed."), bad: true });
    }
    setBusy("");
  }

  async function editCutoff() {
    const current = board?.cutoff ?? "";
    const typed = await askText(
      "Artwork approved before this time ships the same day. Write it as HH:MM on a 24-hour clock, for example 12:00. Leave it empty to switch the cutoff off.",
      current,
      { title: "Same-day cutoff", ok: "Save", placeholder: "12:00" },
    );
    if (typed === null) return;
    try {
      await productionService.saveCutoff(typed.trim());
      await load();
      setFlash({ text: typed.trim() ? `Same-day cutoff set to ${cutoffWords(typed.trim().padStart(5, "0"))}.` : "The same-day cutoff is off." });
    } catch (e) {
      await tell(errorText(e, "The cutoff could not be saved."), { title: "Same-day cutoff" });
    }
  }

  async function toggleDrafts() {
    if (drafts) { setDrafts(null); return; }
    setDraftsBusy(true);
    try { setDrafts((await productionService.drafts(100)).drafts); }
    catch (e) { setFlash({ text: errorText(e, "The drafts could not be loaded."), bad: true }); }
    setDraftsBusy(false);
  }

  if (loadError && !board) {
    return <div className="pc-page"><div className="pc-card pc-empty">{loadError} <button type="button" className="pc-link" onClick={() => void load()}>Try again</button></div></div>;
  }
  if (!board) return <div className="pc-page"><div className="pc-card pc-empty">Loading production…</div></div>;

  const c = board.counts;
  const note = cutoffNote(board.cutoff, new Date(), board.timezone);

  /** The card's own button: the next step for where the job stands. */
  function action(job: ProductionJob, compact = false) {
    const n = job.next;
    if (!n) return null;
    const cls = "pc-btn";
    if (n.key === "review") return <Link href={`/admin/production/${job.id}`} className={cls} data-kind="primary" data-job-action>{n.label}</Link>;
    if (n.key === "open") return <Link href={`/admin/production/${job.id}`} className={cls} data-job-action>{compact ? "Open" : "Open the job"}</Link>;
    if (n.key === "order") {
      return job.order_id
        ? <Link href={`/admin/orders/${job.order_id}`} className={cls} data-kind="primary" data-job-action>{job.pickup ? "Open order" : "Ship the order"}</Link>
        : null;
    }
    const to = n.to as GangSheetStatus;
    const done = n.key === "start"
      ? `${job.reference} is printing. The customer has been told it is in production.`
      : `${job.reference} is ready to ship.${job.order_number ? ` Order ${job.order_number} goes to its ship queue once every sheet on it is ready.` : ""}`;
    return (
      <button type="button" className={cls} data-kind="primary" disabled={!!busy} onClick={() => move(job, to, done)} data-job-action>
        {busy === job.id ? "Working…" : n.label}
      </button>
    );
  }

  function card(job: ProductionJob) {
    const pay = paymentPill(job);
    return (
      <div key={job.id} className="pc-job" data-job={job.reference} data-busy={busy === job.id ? "" : undefined}>
        <div className="pc-job-top">
          <Link href={`/admin/production/${job.id}`} className="pc-job-ref">{job.reference}</Link>
          <span className="pc-pill" data-tone={pay.tone || undefined} title={job.payment_method === "cod" ? "Cash on delivery: paid when it is handed over" : undefined}>{pay.label}</span>
        </div>
        <div className="pc-job-who">{job.customer}</div>
        <div className="pc-job-what">{jobSummary(job)}</div>
        {job.stage === "review" && note && <div className="pc-job-cut" data-late={note.late ? "" : undefined}>{note.text}</div>}
        {job.stage === "customer" && <div className="pc-job-back">Sent back to the customer for new artwork{job.revision_count > 1 ? ` (${job.revision_count} times)` : ""}.</div>}
        <div className="pc-job-order">
          <span>{job.order_number ? `Order ${job.order_number}` : "No order"}</span>
          {job.order_id && <Link href={`/admin/orders/${job.order_id}`} className="pc-link" style={{ fontSize: "13px" }}>Open order</Link>}
        </div>
        {action(job)}
      </div>
    );
  }

  return (
    <div className="pc-page" data-production data-shown={view}>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Production</div>
          <h1 className="pc-h1">Production</h1>
          <p className="pc-sub-line">Every ordered print job, from artwork review to the shipping table.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button type="button" className="pc-cutoff" data-off={board.cutoff ? undefined : ""} onClick={editCutoff} data-cutoff>
            {board.cutoff ? `Same-day cutoff: ${cutoffWords(board.cutoff)}` : "Set a same-day cutoff"}
          </button>
          <Link href="/admin/production/all" className="pc-link" data-all-jobs-link>All print jobs</Link>
          <Link href="/admin/gang-sheets" className="pc-link">Gang sheet setup</Link>
          <div className="pc-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
          </div>
        </div>
      </div>

      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)}><X size={16} /></button>
        </div>
      )}

      <div className="pc-stats4" data-stats>
        <div className="pc-card pc-stat4">
          <div className="pc-stat4-v">{c.queue}</div>
          <div className="pc-stat4-l">In the queue</div>
          <div className="pc-stat4-s">{money(c.value)} in the queue{c.unpaid ? ` · ${c.unpaid} not paid yet` : ""}</div>
        </div>
        <div className="pc-card pc-stat4">
          <div className="pc-stat4-v">{c.production}</div>
          <div className="pc-stat4-l">In production</div>
        </div>
        <div className="pc-card pc-stat4">
          <div className="pc-stat4-v">{c.ready}</div>
          <div className="pc-stat4-l">Ready to ship</div>
        </div>
        <div className="pc-card pc-stat4">
          <div className="pc-stat4-v">{c.drafts}</div>
          <div className="pc-stat4-l">Unpaid drafts</div>
          <div className="pc-stat4-s">Hidden from the queue</div>
        </div>
      </div>

      {view === "board" ? (
        <div className="pc-board" data-board>
          {COLUMNS.map((col) => {
            const jobs = board.jobs.filter((j) => j.column === col.key);
            return (
              <section key={col.key} className="pc-col" data-column={col.key} aria-label={col.title}>
                <div className="pc-col-head"><span>{col.title}</span><span className="pc-col-count">{jobs.length}</span></div>
                <div className="pc-col-body">
                  {jobs.length ? jobs.map(card) : <div className="pc-col-empty">{col.empty}</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="pc-card" style={{ marginBottom: "18px" }} data-list>
          {board.jobs.length === 0 ? (
            <div className="pc-empty">Nothing in the queue. Ordered print jobs show up here.</div>
          ) : (
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "860px" }}>
                <thead>
                  <tr><th>Job</th><th>Customer</th><th>What</th><th>Stage</th><th>Payment</th><th>Order</th><th>Ordered</th><th aria-label="Action" /></tr>
                </thead>
                <tbody>
                  {board.jobs.map((job) => {
                    const stage = STAGE_PILL[job.stage] ?? [job.stage, ""];
                    const pay = paymentPill(job);
                    return (
                      <tr key={job.id} data-job={job.reference}>
                        <td><Link href={`/admin/production/${job.id}`} className="pc-link">{job.reference}</Link></td>
                        <td>{job.customer}</td>
                        <td style={{ color: "var(--pc-ink-2, var(--pc-ink))" }}>{jobSummary(job)}</td>
                        <td><span className="pc-pill" data-tone={stage[1] || undefined}>{stage[0]}</span></td>
                        <td><span className="pc-pill" data-tone={pay.tone || undefined}>{pay.label}</span></td>
                        <td>{job.order_id ? <Link href={`/admin/orders/${job.order_id}`} className="pc-link">{job.order_number}</Link> : "–"}</td>
                        <td style={{ color: "var(--pc-muted)" }}>{day(job.ordered_at)}</td>
                        <td className="pc-num" style={{ whiteSpace: "nowrap" }}><span className="pc-list-action">{action(job, true)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <section className="pc-card pc-pad" data-drafts>
        <div className="pc-drafts">
          <div style={{ maxWidth: "560px" }}>
            <h2 className="pc-h2" style={{ fontSize: "17px" }}>{c.drafts === 1 ? "1 unpaid draft" : `${c.drafts} unpaid drafts`}</h2>
            <p className="pc-sub-line" style={{ marginTop: "4px" }}>
              Buyers built these sheets but never checked out{c.drafts_value ? ` (${money(c.drafts_value)} in all)` : ""}. They stay out of the queue so you only print work somebody ordered.
            </p>
          </div>
          {c.drafts > 0 && (
            <button type="button" className="pc-btn" onClick={toggleDrafts} disabled={draftsBusy} data-show-drafts>
              {draftsBusy ? "Loading…" : drafts ? "Hide drafts" : "Show drafts"}
            </button>
          )}
        </div>
        {drafts && (
          <div className="pc-scroll-x" style={{ marginTop: "16px", border: "1px solid var(--pc-line)", borderRadius: "10px" }}>
            <table className="pc-table" style={{ minWidth: "640px" }}>
              <thead><tr><th>Sheet</th><th>Buyer</th><th>What</th><th>Last saved</th></tr></thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id} data-draft={d.reference}>
                    <td><Link href={`/admin/production/${d.id}`} className="pc-link">{d.reference}</Link></td>
                    <td>{d.customer}{d.contact_email ? <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{d.contact_email}</div> : null}</td>
                    <td>{jobSummary(d)}</td>
                    <td style={{ color: "var(--pc-muted)" }}>{day(d.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {drafts.length < c.drafts && <div className="pc-sub-line" style={{ padding: "10px 16px" }}>The {drafts.length} saved most recently.</div>}
          </div>
        )}
      </section>
    </div>
  );
}
