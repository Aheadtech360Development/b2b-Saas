"use client";

/**
 * The console's Leads: what printcopilot.co's own forms sent — demo requests,
 * and contact messages sent from the platform's address (api/v1/leads).
 * Newest first; marked handled once somebody has answered. They are kept in
 * our own database, not an outside CRM.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Lead {
  id: string;
  kind: "demo" | "contact";
  name: string;
  email: string;
  data: Record<string, string>;
  handled_at: string | null;
  created_at: string | null;
}

interface Page { items: Lead[]; total: number; open: number; page: number; per_page: number }

type Filter = "all" | "demo" | "contact";

const KIND: Record<Lead["kind"], string> = { demo: "Demo request", contact: "Contact" };
// The answers each form sends, in the order worth reading them.
const ORDER = ["business_name", "business_type", "country", "department", "company", "phone", "message"];

const TH: React.CSSProperties = { textAlign: "left", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid #E4E4E7", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "12px 14px", fontSize: "13.5px", color: "#18181B", borderBottom: "1px solid #F4F4F5", verticalAlign: "top" };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

function Answers({ data }: { data: Record<string, string> }) {
  const keys = [...ORDER.filter((k) => data[k]), ...Object.keys(data).filter((k) => !ORDER.includes(k) && data[k])];
  if (!keys.length) return <span style={{ color: "#A1A1AA" }}>No other answers</span>;
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      {keys.map((k) => (
        <div key={k} style={{ fontSize: "13px", lineHeight: 1.45 }}>
          <span style={{ color: "#71717A" }}>{k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}: </span>
          <span style={{ whiteSpace: k === "message" ? "pre-wrap" : "normal", overflowWrap: "anywhere" }}>{data[k]}</span>
        </div>
      ))}
    </div>
  );
}

export function LeadsTab() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    const kind = filter === "all" ? "" : `&kind=${filter}`;
    apiClient.get<Page>(`/api/v1/platform/leads?page=${page}${kind}`)
      .then(setData)
      .catch(() => setFailed(true));
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  async function handled(lead: Lead) {
    setBusy(lead.id);
    try {
      const next = await apiClient.post<Lead>(`/api/v1/platform/leads/${lead.id}/handled`, { handled: !lead.handled_at });
      setData((d) => d && {
        ...d,
        open: d.open + (next.handled_at ? -1 : 1),
        items: d.items.map((x) => (x.id === next.id ? next : x)),
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;
  const chip = (key: Filter, label: string) => (
    <button key={key} type="button" onClick={() => { setFilter(key); setPage(1); }}
      style={{
        padding: "7px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
        border: filter === key ? "1px solid #18181B" : "1px solid #E4E4E7",
        background: filter === key ? "#18181B" : "#fff", color: filter === key ? "#fff" : "#3F3F46",
      }}>
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#18181B" }}>Leads</h1>
          <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>
            Demo requests and contact messages from printcopilot.co{data ? `: ${data.open} not handled yet` : ""}.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {chip("all", "All")}
          {chip("demo", "Demo requests")}
          {chip("contact", "Contact")}
        </div>
      </div>

      {failed && (
        <div role="alert" style={{ background: "#FEF2F2", color: "#B42318", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>
          The leads could not be loaded. <button type="button" onClick={load} style={{ background: "none", border: 0, color: "inherit", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Try again</button>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: "12px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
          <thead>
            <tr>
              <th style={TH}>Received</th>
              <th style={TH}>Form</th>
              <th style={TH}>Who</th>
              <th style={TH}>Answers</th>
              <th style={TH}>Handled</th>
            </tr>
          </thead>
          <tbody>
            {!data && !failed && (
              <tr><td style={{ ...TD, color: "#71717A" }} colSpan={5}>Loading…</td></tr>
            )}
            {data && data.items.length === 0 && (
              <tr><td style={{ ...TD, color: "#71717A" }} colSpan={5}>Nothing here yet.</td></tr>
            )}
            {data?.items.map((l) => (
              <tr key={l.id} style={{ opacity: l.handled_at ? 0.6 : 1 }}>
                <td style={{ ...TD, whiteSpace: "nowrap", color: "#52525B" }}>{when(l.created_at)}</td>
                <td style={{ ...TD, whiteSpace: "nowrap" }}>{KIND[l.kind] ?? l.kind}</td>
                <td style={TD}>
                  <div style={{ fontWeight: 700 }}>{l.name}</div>
                  <a href={`mailto:${l.email}`} style={{ color: "#2563EB", fontSize: "13px", textDecoration: "none", overflowWrap: "anywhere" }}>{l.email}</a>
                </td>
                <td style={{ ...TD, maxWidth: "420px" }}><Answers data={l.data} /></td>
                <td style={{ ...TD, whiteSpace: "nowrap" }}>
                  <label style={{ display: "inline-flex", gap: "8px", alignItems: "center", cursor: busy === l.id ? "wait" : "pointer", fontSize: "13px" }}>
                    <input type="checkbox" checked={Boolean(l.handled_at)} disabled={busy === l.id} onChange={() => void handled(l)} />
                    {l.handled_at ? when(l.handled_at) : "Not yet"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", marginTop: "14px", fontSize: "13px" }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #E4E4E7", background: "#fff", cursor: page <= 1 ? "default" : "pointer" }}>Newer</button>
          <span style={{ color: "#71717A" }}>Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
            style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #E4E4E7", background: "#fff", cursor: page >= pages ? "default" : "pointer" }}>Older</button>
        </div>
      )}
    </div>
  );
}

export default LeadsTab;
