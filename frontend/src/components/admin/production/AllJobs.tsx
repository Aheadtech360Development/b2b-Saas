"use client";

/**
 * Every print job, whatever its status, under Production (/admin/production/all):
 * the queue keeps only what is still to be printed, so finished and rejected
 * jobs are found here, with the gang sheet numbers over them (sheets made,
 * checked out, ordered, waiting for review, and the jobs by status).
 *
 * It was the gang sheet page's Dashboard and Print jobs tabs; that page is now
 * the builder's setup only. A job opens on its own page, the one the queue
 * opens.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { gangSheetsService, type GangSheetDashboard, type GangSheetOrder, type GangSheetStatus } from "@/services/gangSheets.service";

/** A job's status in the admin's words and tones, the order the work goes in. */
export const JOB_STATUSES: [GangSheetStatus, string, string][] = [
  ["submitted", "Submitted", ""], ["in_review", "In review", "amber"], ["revision_requested", "Sent back", "red"],
  ["approved", "Approved", "green"], ["production", "In production", "blue"], ["completed", "Completed", "green"],
  ["rejected", "Rejected", "red"],
];
export const jobPill = (s: string): [string, string] => {
  const hit = JOB_STATUSES.find(([k]) => k === s);
  return hit ? [hit[1], hit[2]] : [s.replace(/_/g, " "), ""];
};
const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const shortDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : "–");

type JobRow = GangSheetOrder & { order_number?: string | null; order_payment_status?: string | null };

export function GangSheetNumbers({ statusHref }: { statusHref: (status: string) => string }) {
  const [data, setData] = useState<GangSheetDashboard | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { gangSheetsService.adminDashboard().then(setData).catch(() => setFailed(true)); }, []);
  if (failed) return <div className="pc-card pc-empty">The numbers could not be loaded.</div>;
  if (!data) return <div className="pc-card pc-empty">Loading the numbers…</div>;

  const total = data.status_breakdown.reduce((s, r) => s + r.count, 0) || 1;
  const waiting = data.status_breakdown.find((r) => r.status === "in_review")?.count ?? 0;
  const rank = (s: string) => { const i = JOB_STATUSES.findIndex(([k]) => k === s); return i < 0 ? 99 : i; };
  const rows = [...data.status_breakdown].sort((a, b) => rank(a.status) - rank(b.status));
  return (
    <div className="pc-stack" data-gs-numbers>
      <div className="pc-stats4" style={{ marginBottom: 0 }}>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{data.total_sheets.toLocaleString()}</div><div className="pc-stat4-l">Sheets made</div>
          <div className="pc-stat4-s">{data.total_jobs.toLocaleString()} {data.total_jobs === 1 ? "job" : "jobs"}</div></div>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{data.total_orders.toLocaleString()}</div><div className="pc-stat4-l">Checked out</div>
          <div className="pc-stat4-s">Jobs on a placed order</div></div>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{usd(data.total_amount)}</div><div className="pc-stat4-l">Ordered</div>
          <div className="pc-stat4-s">From placed orders</div></div>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{waiting}</div><div className="pc-stat4-l">Waiting for review</div>
          <div className="pc-stat4-s"><Link href="/admin/production" className="pc-link" style={{ fontSize: "12.5px" }}>Open the print queue</Link></div></div>
      </div>
      {rows.length > 0 && (
        <section className="pc-card" aria-labelledby="gs-status-title">
          <div className="pc-card-head"><h2 className="pc-h2" id="gs-status-title">Jobs by status</h2></div>
          <div className="pc-pad" style={{ display: "grid", gap: "14px" }}>
            {rows.map((r) => {
              const [label, tone] = jobPill(r.status);
              const pct = Math.round((r.count / total) * 100);
              return (
                <Link key={r.status} href={statusHref(r.status)} className="pc-bar-row" data-status={r.status} title={`Show the ${label.toLowerCase()} jobs`} scroll={false}>
                  <span className="pc-bar-top"><span className="pc-pill" data-tone={tone || undefined}>{label}</span><span>{r.count} · {pct}%</span></span>
                  <span className="pc-bar"><span data-tone={tone || undefined} style={{ width: `${Math.max(pct, 2)}%` }} /></span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      {/* The old gang sheet dashboard's two lists: the latest jobs, and the latest that became orders. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }} data-gs-recent>
        <section className="pc-card" data-recent="designs">
          <div className="pc-card-head"><h2 className="pc-h2">Recent designs</h2></div>
          {data.recent_designs.length === 0 ? <div className="pc-empty">None yet.</div> : (
            <table className="pc-table"><tbody>
              {data.recent_designs.map((d, i) => {
                const [label, tone] = jobPill(d.status);
                return (
                  <tr key={d.id ?? i}>
                    <td>
                      {d.id ? <Link href={`/admin/production/${d.id}`} className="pc-row-title">{d.order_number ? `Order ${d.order_number} · ` : ""}{d.reference}</Link>
                        : <span className="pc-row-title">{d.reference}</span>}
                      <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{d.contact || "Guest"} · {d.sheet_name}</div>
                    </td>
                    <td style={{ textAlign: "right" }}><span className="pc-pill" data-tone={tone || undefined} style={{ textTransform: "none" }}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody></table>
          )}
        </section>
        <section className="pc-card" data-recent="orders">
          <div className="pc-card-head"><h2 className="pc-h2">Recent orders</h2></div>
          {data.recent_orders.length === 0 ? <div className="pc-empty">No orders yet.</div> : (
            <table className="pc-table"><tbody>
              {data.recent_orders.map((o, i) => (
                <tr key={o.id ?? i}>
                  <td>
                    {o.order_id ? <Link href={`/admin/orders/${o.order_id}`} className="pc-row-title">{o.order_number ? `Order ${o.order_number} · ` : ""}{o.reference}</Link>
                      : <span className="pc-row-title">{o.reference}</span>}
                    <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{o.contact || "Guest"}{o.created_at ? ` · ${shortDay(o.created_at)}` : ""}</div>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div style={{ fontWeight: 600 }}>{usd(o.subtotal)}</div>
                    <span className="pc-pill" data-tone={o.paid ? "green" : "amber"} style={{ textTransform: "none" }}>{o.paid ? "Paid" : "Ordered"}</span>
                  </td>
                </tr>
              ))}
            </tbody></table>
          )}
        </section>
      </div>
    </div>
  );
}

export function AllJobs({ status, onStatus }: { status: string; onStatus: (status: string) => void }) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setJobs(null);
    setFailed(false);
    gangSheetsService.adminListOrders(status || undefined)
      .then((rows) => { if (!cancelled) setJobs(rows as JobRow[]); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [status]);

  const words = q.trim().toLowerCase();
  const shown = (jobs ?? []).filter((j) => !words || `${j.reference} ${j.contact_name ?? ""} ${j.contact_email ?? ""} ${j.order_number ?? ""}`.toLowerCase().includes(words));

  return (
    <div className="pc-stack" style={{ gap: "16px" }} data-gs-jobs>
      <div className="pc-filters">
        <label className="pc-field">
          <Search size={17} strokeWidth={2} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job, customer, email or order" aria-label="Search print jobs" />
        </label>
        <select className="pc-input" style={{ width: "220px", height: "42px" }} value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {JOB_STATUSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <div className="pc-card" data-shown={jobs ? status : undefined} aria-busy={jobs === null && !failed}>
        {failed ? <div className="pc-empty">The print jobs could not be loaded.</div>
          : jobs === null ? <div className="pc-empty">Loading the print jobs…</div>
          : shown.length === 0 ? <div className="pc-empty">{words ? "No job matches that search." : status ? "No job has that status." : "No gang sheet jobs yet."}</div>
          : (
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "900px" }}>
                <thead><tr><th>Job</th><th>Customer</th><th>Sheet</th><th className="pc-num">Qty</th><th className="pc-num">Total</th><th>Status</th><th>Order</th><th>Created</th></tr></thead>
                <tbody>
                  {shown.map((j) => {
                    const [label, tone] = jobPill(j.status);
                    const paid = j.order_payment_status === "paid";
                    return (
                      <tr key={j.id} data-gs-job={j.reference}>
                        <td><Link href={`/admin/production/${j.id}`} className="pc-link">{j.reference}</Link>{j.revision_count > 0 && <div className="pc-sub-line" style={{ fontSize: "12px" }}>sent back {j.revision_count === 1 ? "once" : `${j.revision_count} times`}</div>}</td>
                        <td>{j.contact_name || "Guest"}{j.contact_email ? <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{j.contact_email}</div> : null}</td>
                        <td>{j.sheet_name} <span style={{ color: "var(--pc-faint)" }}>({j.sheet_width_in}″ × {j.sheet_height_in}″)</span></td>
                        <td className="pc-num">{j.sheet_quantity}</td>
                        <td className="pc-num" style={{ fontWeight: 600 }}>{usd(j.subtotal)}</td>
                        <td><span className="pc-pill" data-tone={tone || undefined}>{label}</span></td>
                        <td>
                          {j.order_id ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                              <Link href={`/admin/orders/${j.order_id}`} className="pc-link">{j.order_number ?? "Order"}</Link>
                              <span className="pc-pill" data-tone={paid ? "green" : "amber"}>{paid ? "Paid" : "Unpaid"}</span>
                            </span>
                          ) : <span className="pc-pill">Draft</span>}
                        </td>
                        <td style={{ color: "var(--pc-muted)" }}>{shortDay(j.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
