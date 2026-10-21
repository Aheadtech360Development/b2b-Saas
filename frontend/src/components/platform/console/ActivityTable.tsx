"use client";

/**
 * The activity log, readable (design screen 16): what happened, to which brand,
 * by whom and when, filtered and paged, with the chosen row opened beside it.
 * Used on its own page and, fixed to one brand, on the brand's Activity tab.
 */
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { consoleApi, type ActivityRow, type Brand } from "./api";
import { Failed, Loading, useLoad, when } from "./ui";

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "DENIED", "REFUND"];

function what(r: ActivityRow): string {
  if (r.entity_type === "impersonation_session") return "Platform support opened the brand's console";
  return r.summary || [r.entity_type, r.entity_id].filter(Boolean).join(", ");
}

function actionOf(r: ActivityRow): string {
  return r.entity_type === "impersonation_session" ? "SUPPORT" : r.action;
}

export function ActivityTable({ brand: fixedBrand, brands }: { brand?: string; brands?: Brand[] }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [brand, setBrand] = useState(fixedBrand ?? "");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ActivityRow | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => { setTerm(q); setPage(1); }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data, error, loading, reload } = useLoad(
    () => consoleApi.activity({ q: term, brand: fixedBrand ?? brand, action, date_from: from, date_to: to, page, page_size: 40 }),
    [term, brand, action, from, to, page, fixedBrand],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div>
      <div className="pc-filters">
        <label className="pc-field" style={{ maxWidth: "none", flex: "2 1 260px" }}>
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the log" aria-label="Search the log" />
        </label>
        {!fixedBrand && (
          <select className="pc-input" style={{ width: "auto", minWidth: 150 }} value={brand} aria-label="Brand"
            onChange={(e) => { setBrand(e.target.value); setPage(1); }}>
            <option value="">Brand: All</option>
            {(brands ?? []).map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
          </select>
        )}
        <select className="pc-input" style={{ width: "auto", minWidth: 140 }} value={action} aria-label="Action"
          onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">Action: All</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a.charAt(0) + a.slice(1).toLowerCase()}</option>)}
        </select>
        <input className="pc-input" type="date" style={{ width: "auto" }} value={from} aria-label="From"
          onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <input className="pc-input" type="date" style={{ width: "auto" }} value={to} aria-label="To"
          onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>

      {error && <Failed message={error} onRetry={reload} />}
      {loading && !data ? <Loading what="Loading the log" /> : null}
      {data && (
        <div className="pc-list" data-panel={open ? "" : undefined}>
          <div className="pc-card pc-scroll-x">
            <table className="pc-table" style={{ minWidth: 760 }}>
              <thead><tr><th>Action</th><th>What</th>{!fixedBrand && <th>Brand</th>}<th>By</th><th>When</th></tr></thead>
              <tbody>
                {data.items.length === 0 && <tr><td colSpan={5} className="pc-empty">Nothing in the log matches.</td></tr>}
                {data.items.map((r) => (
                  <tr key={r.id} data-href="" data-open={open?.id === r.id ? "" : undefined} onClick={() => setOpen(r)}>
                    <td><span className="pc-pill" data-tone={r.action === "DENIED" ? "red" : r.entity_type === "impersonation_session" ? "amber" : undefined}>{actionOf(r)}</span></td>
                    <td className="pc-td-clip" style={{ maxWidth: 360 }}>{what(r)}</td>
                    {!fixedBrand && <td>{r.brand_name ?? r.brand_slug ?? <span className="pc-sub-line">none</span>}</td>}
                    <td>
                      {r.actor_email ?? <span className="pc-sub-line">none</span>}
                      {r.actor_email && r.actor_platform === false && r.entity_type === "auth" && r.actor_active === false && (
                        <div className="pc-sub-line" style={{ color: "var(--pc-amber)" }}>No longer active</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pc-table-foot">
              <span>{data.total.toLocaleString()} entries</span>
              <span className="pc-pager">
                <button type="button" className="pc-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                Page {page} of {pages}
                <button type="button" className="pc-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </span>
            </div>
          </div>
          {open && (
            <aside className="pc-panel">
              <div className="pc-panel-head">
                <div><div className="pc-eyebrow">Selected entry</div><div className="pc-h2" style={{ marginTop: 4 }}>{actionOf(open)}</div></div>
                <button type="button" className="pc-x" aria-label="Close" onClick={() => setOpen(null)}><X size={18} /></button>
              </div>
              <div className="pc-panel-body">
                <div><div className="pc-small-head">What</div><div style={{ fontSize: 14 }}>{what(open)}</div></div>
                <div className="pc-kv"><span>By</span><b>{open.actor_email ?? "none"}{open.actor_platform ? " (platform)" : ""}</b></div>
                <div className="pc-kv"><span>Brand</span><b>{open.brand_name ?? open.brand_slug ?? "none"}</b></div>
                <div className="pc-kv"><span>When</span><b>{when(open.created_at)}</b></div>
                <div className="pc-kv"><span>IP</span><b className="pc-mono">{open.ip_address ?? "not recorded"}</b></div>
                {open.path && <div className="pc-kv"><span>Request</span><b className="pc-mono">{open.method} {open.path}{open.status_code ? ` (${open.status_code})` : ""}</b></div>}
                {open.new_values !== null && open.new_values !== undefined && (
                  <div>
                    <div className="pc-small-head">Details</div>
                    <pre className="pc-mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, background: "#F8FAFC", border: "1px solid var(--pc-line)", borderRadius: 8, padding: 10 }}>
                      {typeof open.new_values === "string" ? open.new_values : JSON.stringify(open.new_values, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
