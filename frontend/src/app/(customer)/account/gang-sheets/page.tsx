"use client";

/**
 * Print jobs: every gang sheet the buyer built and every design they uploaded
 * by size, from the moment it arrives to the day it ships. A job that can
 * still be changed opens in the builder from here; one the print team sent
 * back is fixed and resubmitted from here; any job can be ordered again.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { gangSheetsService } from "@/services/gangSheets.service";
import { cartService } from "@/services/cart.service";
import { trackSheetAdd } from "@/lib/tracking";
import { day } from "@/lib/customerWords";
import { Banner, Chip, Empty, ICONS, Icon, Loading, PageHead, Steps, Tabs } from "@/components/portal/ui";
import {
  JOB_STEPS, jobKind, jobLine, jobState, jobStep, jobTab, type Job, type JobTab,
} from "@/components/portal/data";

const TAB_WORDS: Record<JobTab, string> = {
  all: "All", action: "Needs your action", production: "In production", shipped: "Shipped", delivered: "Delivered",
};

function JobCard({ job, busy, onReorder, onResubmit }: {
  job: Job;
  busy: boolean;
  onReorder: () => void;
  onResubmit: () => void;
}) {
  const [words, tone] = jobState(job);
  const kind = jobKind(job);
  const editable = (job.status === "submitted" || job.status === "revision_requested") && kind === "gang_sheet";
  return (
    <article className="cp-job">
      <div className="cp-job-top">
        <div className="cp-thumb" aria-hidden><Icon d={ICONS.jobs} size={26} /></div>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div className="cp-job-title">
            {job.reference}
            {(job.version ?? 1) > 1 && <span className="cp-muted" style={{ fontWeight: 500, fontSize: 14 }}>v{job.version}</span>}
            <Chip tone={tone}>{words}</Chip>
          </div>
          <div className="cp-job-meta">
            {kind === "upload_by_size" ? "Upload by size" : "Gang sheet"} · {jobLine(job)}{job.created_at ? ` · ${day(job.created_at)}` : ""}
          </div>
          {job.supplier_notes && (
            <div className="cp-banner" data-tone="warn" style={{ marginTop: 10 }}>
              <span><strong>From the print team:</strong> {job.supplier_notes}</span>
            </div>
          )}
        </div>
        <div className="cp-actions">
          <Link href={`/account/gang-sheets/${job.id}`} className="cp-btn">View job</Link>
          {job.status === "revision_requested" && kind === "upload_by_size" && job.product_slug && (
            <Link href={`/products/${job.product_slug}?revise=${job.id}`} className="cp-btn cp-btn-p">Update and resubmit</Link>
          )}
          {editable && (
            <Link href={`/gang-sheets?edit=${job.id}${job.product_id ? `&product=${job.product_id}` : ""}`} className="cp-btn cp-btn-p">
              Edit in builder
            </Link>
          )}
          {job.status === "revision_requested" && (
            <button type="button" className="cp-btn" disabled={busy} onClick={onResubmit}>{busy ? "…" : "Resubmit"}</button>
          )}
          {!editable && job.status !== "revision_requested" && (
            <Link href={`/account/messages?job=${encodeURIComponent(job.reference)}`} className="cp-btn">Request a change</Link>
          )}
          <button type="button" className="cp-btn" disabled={busy} onClick={onReorder}>{busy ? "Adding…" : "Reorder"}</button>
        </div>
      </div>
      {job.status === "rejected"
        ? <p className="cp-note" style={{ margin: 0 }}>The print team could not accept this job. Ask them in Messages what to change.</p>
        : <Steps steps={JOB_STEPS} {...jobStep(job)} />}
    </article>
  );
}

function PrintJobs() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") ?? "all") as JobTab;
  const q = (params.get("q") ?? "").trim();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState(q);
  const [state, setState] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const saved = params.get("saved") === "1";
  const revised = params.get("revised") === "1";

  useEffect(() => setSearch(q), [q]);

  const load = useCallback(() => {
    setLoading(true);
    gangSheetsService.myOrders()
      .then((j) => { setJobs(j as Job[]); setErr(null); })
      .catch(() => { setJobs([]); setErr("Your print jobs could not be loaded."); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function resubmit(id: string) {
    setBusy(id);
    setErr(null);
    try { await gangSheetsService.resubmit(id); load(); }
    catch { setErr("That didn't go through. Please try again."); }
    finally { setBusy(null); }
  }

  // "Reorder" has to end somewhere the buyer can pay: the copy goes straight
  // into the cart and the buyer with it.
  async function reorder(id: string) {
    setBusy(id);
    setErr(null);
    try {
      const clone = await gangSheetsService.reorder(id);
      await cartService.addGangSheet(clone.id);
      trackSheetAdd(clone, { navigating: true });
      window.location.href = "/cart";
    } catch {
      setErr("Could not reorder this job. Please try again.");
      setBusy(null);
      load();
    }
  }

  const counts = useMemo(() => {
    const c: Record<JobTab, number> = { all: jobs.length, action: 0, production: 0, shipped: 0, delivered: 0 };
    for (const j of jobs) { const t = jobTab(j); if (t) c[t] += 1; }
    return c;
  }, [jobs]);

  const shown = jobs.filter((j) => {
    if (tab !== "all" && jobTab(j) !== tab) return false;
    if (q && !j.reference.toLowerCase().includes(q.toLowerCase()) && !(j.order_number ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (state && jobState(j)[0] !== state) return false;
    const d = (j.created_at ?? "").slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  });
  const stateWords = [...new Set(jobs.map((j) => jobState(j)[0]))];

  const go = (next: { tab?: string; q?: string }) => {
    const sp = new URLSearchParams();
    const t = next.tab ?? tab;
    const s = next.q ?? q;
    if (t && t !== "all") sp.set("tab", t);
    if (s) sp.set("q", s);
    const qs = sp.toString();
    router.replace(`/account/gang-sheets${qs ? `?${qs}` : ""}`);
  };

  return (
    <>
      <PageHead eyebrow="Print jobs" title="Print jobs" sub="Follow every sheet from artwork check to your door."
        actions={<Link href="/gang-sheets" className="cp-btn cp-btn-p">Build a gang sheet</Link>} />

      <div className="cp-stack-sm" style={{ marginBottom: saved || revised || err ? 16 : 0 }}>
        {saved && <Banner tone="ok">Your gang sheet is saved. Open it with Edit in builder to keep working on it, and use Save and add to cart there when it is ready.</Banner>}
        {revised && <Banner tone="ok">Your changes were saved and sent back to the print team for review.</Banner>}
        {err && <Banner tone="bad" onRetry={load}>{err}</Banner>}
      </div>

      <Tabs label="Print jobs" tabs={(Object.keys(TAB_WORDS) as JobTab[]).map((t) => ({
        key: t, label: TAB_WORDS[t], count: counts[t], on: tab === t, onClick: () => go({ tab: t }),
      }))} />

      <form className="cp-filters" onSubmit={(e) => { e.preventDefault(); go({ q: search.trim() }); }}>
        <label className="cp-sr" htmlFor="j-q">Search by job number</label>
        <input id="j-q" className="cp-input cp-grow" type="search" placeholder="Search by job number"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="cp-sr" htmlFor="j-state">Status</label>
        <select id="j-state" className="cp-select" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Status: All</option>
          {stateWords.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
        <label className="cp-sr" htmlFor="j-from">From</label>
        <input id="j-from" className="cp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <label className="cp-sr" htmlFor="j-to">To</label>
        <input id="j-to" className="cp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
      </form>

      {loading ? (
        <Loading what="Loading your print jobs" />
      ) : jobs.length === 0 ? (
        <div className="cp-card">
          <Empty title="No print jobs yet">
            Build a gang sheet or upload a design to start one.
            <div style={{ marginTop: 12 }}><Link href="/gang-sheets" className="cp-btn cp-btn-p">Build a gang sheet</Link></div>
          </Empty>
        </div>
      ) : shown.length === 0 ? (
        <div className="cp-card"><Empty title="No jobs here">Nothing matches this tab or search.</Empty></div>
      ) : (
        <div className="cp-stack-sm" style={{ gap: 16 }}>
          {shown.map((j) => (
            <JobCard key={j.id} job={j} busy={busy === j.id} onReorder={() => reorder(j.id)} onResubmit={() => resubmit(j.id)} />
          ))}
        </div>
      )}
      <p className="cp-note" style={{ marginTop: 16 }}>
        Edit in builder shows while a job can still be changed. After that, request a change and the print team will help.
      </p>
    </>
  );
}

export default function AccountGangSheetsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PrintJobs />
    </Suspense>
  );
}
