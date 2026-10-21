"use client";

/** A brand's people: its staff first, then its buyers. */
import { consoleApi } from "../api";
import type { BrandTabProps } from "../BrandPage";
import { Failed, Loading, ago, useLoad } from "../ui";

export function UsersTab({ brand }: BrandTabProps) {
  const { data, error, loading, reload } = useLoad(() => consoleApi.brandUsers(brand.slug), [brand.slug]);
  return (
    <div>
      {error && <Failed message={error} onRetry={reload} />}
      {loading && !data ? <Loading what="Loading people" /> : null}
      {data && (
        <div className="pc-card pc-scroll-x">
          <table className="pc-table" style={{ minWidth: 720 }}>
            <thead><tr><th>User</th><th>Type</th><th>Role</th><th>Last login</th><th>2-step</th><th>Account</th></tr></thead>
            <tbody>
              {data.items.length === 0 && <tr><td colSpan={6} className="pc-empty">No accounts yet.</td></tr>}
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td><div style={{ fontWeight: 600 }}>{u.name || u.email}</div><div className="pc-sub-line">{u.email}</div></td>
                  <td><span className="pc-pill" data-tone={u.type === "staff" ? "blue" : undefined}>{u.type === "staff" ? "Staff" : "Buyer"}</span></td>
                  <td className="pc-sub-line" style={{ margin: 0 }}>{u.role.replace(/^tenant_/, "").replace(/_/g, " ")}</td>
                  <td>{u.last_login ? ago(u.last_login) : "Never"}</td>
                  <td>{u.two_factor === null ? "n/a" : u.two_factor ? "On" : "Off"}</td>
                  <td>{u.active ? "Active" : <span className="pc-pill">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
