"use client";

/**
 * Users across brands (design screen 11): everyone with an account at any
 * brand, staff and buyers, with the brand, last sign-in and 2-step. The total
 * on Brands counts the same accounts, so the two add up.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { consoleApi, type Person } from "./api";
import { Failed, Loading, PageHead, ago, useLoad } from "./ui";

function csv(rows: Person[]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Email", "Brand", "Type", "Role", "Last login", "2-step", "Active"];
  return [head.map(cell).join(","), ...rows.map((u) => [u.name, u.email, u.brand_name, u.type, u.role,
    u.last_login ?? "", u.two_factor === null ? "n/a" : u.two_factor ? "on" : "off", u.active ? "yes" : "no"].map(cell).join(","))].join("\n");
}

export function UsersPage() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [kind, setKind] = useState<"" | "staff" | "buyer">("");
  const [brand, setBrand] = useState("");
  const [twoStep, setTwoStep] = useState<"" | "on" | "off">("");
  const [page, setPage] = useState(1);
  const brands = useLoad(() => consoleApi.brands(), []);

  useEffect(() => {
    const t = window.setTimeout(() => { setTerm(q); setPage(1); }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data, error, loading, reload } = useLoad(
    () => consoleApi.users({ q: term, kind, brand, two_step: twoStep, page, page_size: 50 }),
    [term, kind, brand, twoStep, page],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  function exportCsv() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([csv(data.items)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "users.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHead eyebrow="Users" title="Users" lede="Everyone across every brand."
        actions={<button type="button" className="pc-btn" onClick={exportCsv} disabled={!data?.items.length}>Export</button>} />
      <nav className="pc-tabs" aria-label="Kind">
        {([["", "All", data?.counts.all], ["staff", "Staff", data?.counts.staff], ["buyer", "Buyers", data?.counts.buyers]] as const).map(([k, l, n]) => (
          <button key={l} type="button" className="pc-tab" data-on={kind === k ? "" : undefined}
            onClick={() => { setKind(k); setPage(1); }}>{l}{n !== undefined && <span className="pc-tab-count">{n}</span>}</button>
        ))}
      </nav>
      <div className="pc-filters">
        <label className="pc-field" style={{ maxWidth: "none", flex: "2 1 260px" }}>
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search users" />
        </label>
        <select className="pc-input" style={{ width: "auto", minWidth: 150 }} value={brand} aria-label="Brand"
          onChange={(e) => { setBrand(e.target.value); setPage(1); }}>
          <option value="">Brand: All</option>
          {(brands.data?.items ?? []).map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
        </select>
        <select className="pc-input" style={{ width: "auto", minWidth: 140 }} value={twoStep} aria-label="2-step"
          onChange={(e) => { setTwoStep(e.target.value as "" | "on" | "off"); setPage(1); }}>
          <option value="">2-step: All</option>
          <option value="on">Staff with 2-step</option>
          <option value="off">Staff without 2-step</option>
        </select>
      </div>
      {error && <Failed message={error} onRetry={reload} />}
      {loading && !data ? <Loading what="Loading users" /> : null}
      {data && (
        <div className="pc-card pc-scroll-x">
          <table className="pc-table" style={{ minWidth: 760 }}>
            <thead><tr><th>User</th><th>Brand</th><th>Type</th><th>Last login</th><th>2-step</th></tr></thead>
            <tbody>
              {data.items.length === 0 && <tr><td colSpan={5} className="pc-empty">No account matches.</td></tr>}
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td><div style={{ fontWeight: 600 }}>{u.name || u.email}</div><div className="pc-sub-line">{u.email}</div>
                    {!u.active && <span className="pc-pill" style={{ marginTop: 4 }}>Inactive</span>}</td>
                  <td>{u.brand_slug ? <Link href={`/platform/brands/${u.brand_slug}?tab=users`} className="pc-row-title">{u.brand_name}</Link> : u.brand_name}</td>
                  <td><span className="pc-pill" data-tone={u.type === "staff" ? "blue" : undefined}>{u.type === "staff" ? "Staff" : "Buyer"}</span></td>
                  <td>{u.last_login ? ago(u.last_login) : "Never"}</td>
                  <td>{u.two_factor === null ? "n/a" : u.two_factor ? "On" : "Off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pc-table-foot">
            <span>Showing {data.items.length} of {data.total.toLocaleString()}. Users counts staff and buyers, the same accounts as the total on Brands.</span>
            <span className="pc-pager">
              <button type="button" className="pc-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              Page {page} of {pages}
              <button type="button" className="pc-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
