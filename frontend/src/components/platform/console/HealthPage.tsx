"use client";

/**
 * Health (design screen 17): what needs somebody now (Fix) and what to keep an
 * eye on (Watch), worked out from each brand's own state; each brand's usage
 * against its plan's limits; and the brands' size and last activity.
 */
import Link from "next/link";
import { useState } from "react";
import { tell } from "@/lib/dialog";
import { platformService } from "@/services/platform.service";
import { consoleApi } from "./api";
import { Failed, HealthPill, Loading, PageHead, ago, errorText, needs, ofLimit, useLoad } from "./ui";

export function HealthPage() {
  const { data, error, loading, reload } = useLoad(() => consoleApi.brands(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const list = data?.items ?? [];
  const items = list.flatMap((b) => needs(b).map((n) => ({ b, ...n })))
    .sort((x, y) => (x.level === y.level ? 0 : x.level === "fix" ? -1 : 1));

  async function moveToStarter(slug: string) {
    setBusy(slug);
    try {
      await platformService.updateTenant(slug, { plan: "starter" });
      await reload();
    } catch (e) {
      await tell(errorText(e, "The plan could not be changed."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHead eyebrow="Health" title="Health and alerts" lede="What needs you, what to watch, and each brand's usage." />
      {error && <Failed message={error} onRetry={reload} />}
      {loading && !data ? <Loading what="Checking brands" /> : null}
      {data && (
        <div className="pc-stack">
          <section className="pc-card">
            <div className="pc-card-head"><h2 className="pc-h2">Needs attention</h2><span className="pc-sorted">{items.length} item{items.length === 1 ? "" : "s"}</span></div>
            {items.length === 0 ? <div className="pc-empty">Nothing needs you right now.</div> : items.map((it, i) => (
              <div key={`${it.b.slug}-${i}`} className="pc-need">
                <div className="pc-need-tile" data-tone={it.level === "fix" ? "urgent" : "attention"}>{it.level === "fix" ? "!" : "•"}</div>
                <div className="pc-need-text">
                  <div className="pc-need-title"><span className="pc-pill" data-tone={it.level === "fix" ? "red" : "amber"} style={{ marginRight: 8 }}>{it.level === "fix" ? "Fix" : "Watch"}</span>{it.title}</div>
                  <div className="pc-need-detail">{it.detail}</div>
                </div>
                {it.title.includes("plan that does not exist") ? (
                  <button type="button" className="pc-btn" disabled={busy === it.b.slug} onClick={() => void moveToStarter(it.b.slug)}>
                    {busy === it.b.slug ? "Moving…" : "Move to Starter"}
                  </button>
                ) : (
                  <Link href={`/platform/brands/${it.b.slug}`} className="pc-btn">Open brand</Link>
                )}
              </div>
            ))}
          </section>

          <section className="pc-card pc-scroll-x">
            <div className="pc-card-head"><h2 className="pc-h2">Usage against limits</h2></div>
            <table className="pc-table" style={{ minWidth: 620 }}>
              <thead><tr><th>Brand</th><th>Plan</th><th>Orders this month</th><th>Staff</th></tr></thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/platform/brands/${b.slug}`} className="pc-row-title">{b.name}</Link></td>
                    <td>{b.plan_detail.known ? b.plan_detail.name : `${b.plan_detail.name} (as ${b.plan_detail.treated_as})`}</td>
                    <td>{ofLimit(b.orders_month, b.limits.orders_per_month)}</td>
                    <td>{ofLimit(b.staff, b.limits.staff_accounts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="pc-card pc-scroll-x">
            <div className="pc-card-head"><h2 className="pc-h2">Brand health</h2></div>
            <table className="pc-table" style={{ minWidth: 720 }}>
              <thead><tr><th>Brand</th><th>State</th><th className="pc-num">Products</th><th className="pc-num">Orders</th><th className="pc-num">Users</th><th>Last activity</th></tr></thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/platform/brands/${b.slug}`} className="pc-row-title">{b.name}</Link>
                      {b.status !== "active" && <div className="pc-sub-line">{b.status}</div>}</td>
                    <td><HealthPill health={b.health} /></td>
                    <td className="pc-num">{b.products}</td>
                    <td className="pc-num">{b.orders}</td>
                    <td className="pc-num">{b.users}</td>
                    <td>{ago(b.last_activity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="pc-hint">Limits are stated by each plan, not enforced. Trial reminders go to brands by email on each of the last three days.</p>
        </div>
      )}
    </div>
  );
}
