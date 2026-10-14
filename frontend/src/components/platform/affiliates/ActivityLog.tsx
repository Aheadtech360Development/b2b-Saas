"use client";

import { Fragment, useEffect, useState } from "react";

import { Banner, Empty, Icon, Skeleton, errorText, useToast } from "@/components/partners/ui";
import { aff } from "./api";
import type { Go } from "./AffiliatesTab";
import { actorWords, activityWords, diffLines, type Activity } from "./shared";

type Row = Activity & { id: number; at: string; partner_id: string | null };

function when(at: string) {
  const d = new Date(at);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ActivityLog({ go }: { go: Go }) {
  const [actor, setActor] = useState("");
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Row[]; total: number; pages: number } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ page: String(page), days: String(days) });
      if (actor) p.set("actor", actor);
      if (q.trim()) p.set("q", q.trim());
      aff.get<{ rows: Row[]; total: number; pages: number }>(`/activity?${p}`).then(setData).catch((e) => setError(errorText(e)));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [actor, days, q, page]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Activity log</h1>
          <p>Who changed what, before and after, with the reason. Nothing here can be edited or deleted.</p>
        </div>
        <button className="btn" onClick={() => aff.save("/activity.csv", "partner-activity.csv").catch((e) => toast.show(errorText(e)))}><Icon name="download" />Export</button>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <section className="card">
        <div className="filters">
          {([["", "Everyone"], ["admin", "Admins"], ["system", "System"], ["partner", "Affiliates"]] as const).map(([k, label]) => (
            <button key={k} className={`pill${actor === k ? " on" : ""}`} aria-pressed={actor === k} onClick={() => { setActor(k); setPage(1); }}>{label}</button>
          ))}
          <select className="select" style={{ width: 160 }} aria-label="Period" value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }}>
            <option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option><option value={0}>All time</option>
          </select>
          <div className="ig"><Icon name="search" />
            <input className="input" type="search" placeholder="Search activity" aria-label="Search activity" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        {!data ? <div className="pad col">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={44} />)}</div>
          : data.rows.length === 0 ? <div className="pad"><Empty icon="history" title="Nothing in this period" /></div>
            : (
              <div className="tw">
                <table className="tbl">
                  <thead><tr><th>When</th><th>By</th><th>What</th><th>Record</th><th>Reason</th><th /></tr></thead>
                  <tbody>{data.rows.map((r) => {
                    const detail = !!(r.before || r.after);
                    const record = r.partner_name ?? (r.subject_kind === "settings" ? "Settings" : r.subject_kind === "terms" ? "Terms"
                      : r.subject_kind === "batch" ? "Batch" : r.subject_kind === "application" ? "Application" : r.subject_kind ?? "");
                    return (
                      <Fragment key={r.id}>
                        <tr onClick={() => detail && setOpen(open === r.id ? null : r.id)} style={{ cursor: detail ? "pointer" : undefined }}>
                          <td>{when(r.at)}</td>
                          <td>{actorWords(r)}</td>
                          <td className="ink wrap">{activityWords(r)}</td>
                          <td>{r.partner_id ? <a href={`#affiliates/affiliates/${r.partner_id}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); go("affiliates", r.partner_id!); }}>{record}</a> : record}</td>
                          <td className="wrap muted" style={{ maxWidth: 280 }}>{r.reason ?? ""}</td>
                          <td className="tr">{detail ? <Icon name={open === r.id ? "cd" : "cr"} size="s" /> : null}</td>
                        </tr>
                        {open === r.id ? (
                          <tr><td colSpan={6} style={{ height: "auto", padding: 12, background: "var(--soft)" }}>
                            <div className="g2">
                              <div><div className="eyebrow">Before</div><div className="diff">{diffLines(r.before) || "Nothing"}</div></div>
                              <div><div className="eyebrow">After</div><div className="diff">{diffLines(r.after) || "Nothing"}</div></div>
                            </div>
                          </td></tr>
                        ) : null}
                      </Fragment>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
        <div className="tfoot">
          <span>Showing {data?.rows.length ?? 0} of {data?.total ?? 0} entries</span>
          {data && data.pages > 1 ? (
            <div className="pager">
              <button className="btn sm ico" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="cl" /></button>
              <button className="btn sm ico" aria-label="Next page" disabled={page >= data.pages} onClick={() => setPage(page + 1)}><Icon name="cr" /></button>
            </div>
          ) : null}
        </div>
      </section>
      {toast.node}
    </>
  );
}
