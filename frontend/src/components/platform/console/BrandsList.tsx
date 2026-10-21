"use client";

/**
 * Brands (design screen 1): every brand in one list, with its plan, billing,
 * health, this month's orders, its people and when it last did anything.
 * Brand Health is merged in here. Suspend lives inside Manage, away from the
 * safe actions on the row.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { tell } from "@/lib/dialog";
import { platformService } from "@/services/platform.service";
import { consoleApi, type Brand } from "./api";
import { openConsole } from "./openConsole";
import {
  BillingPill, Failed, HealthPill, Loading, PageHead, Stat, StatusPill, ago, billingOf, errorText, needs, ofLimit, useLoad,
} from "./ui";

type Sort = "newest" | "oldest" | "name" | "active";

export function BrandsList() {
  const { data, error, loading, reload } = useLoad(() => consoleApi.brands(), []);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [health, setHealth] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [busy, setBusy] = useState<string | null>(null);

  const brands = data?.items ?? [];
  const attention = useMemo(() => brands.filter((b) => needs(b).length > 0), [brands]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = brands.filter((b) =>
      (!term || [b.name, b.slug, b.owner_email ?? "", b.email, b.custom_domain ?? ""].some((v) => v.toLowerCase().includes(term)))
      && (!status || b.status === status)
      && (!plan || (plan === "none" ? !b.plan_detail.known : b.plan === plan))
      && (!health || (health === "attention" ? needs(b).length > 0 : b.health === health)));
    const by: Record<Sort, (a: Brand, b: Brand) => number> = {
      newest: (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      oldest: (a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      name: (a, b) => a.name.localeCompare(b.name),
      active: (a, b) => (b.last_activity ?? "").localeCompare(a.last_activity ?? ""),
    };
    return [...list].sort(by[sort]);
  }, [brands, q, status, plan, health, sort]);

  async function moveToStarter(b: Brand) {
    setBusy(b.slug);
    try {
      await platformService.updateTenant(b.slug, { plan: "starter" });
      await reload();
    } catch (e) {
      await tell(errorText(e, "The plan could not be changed."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-console-brands>
      <PageHead eyebrow="Brands" title="Brands"
        lede="Every brand is its own tenant. Plan, billing, health and usage in one list."
        actions={<Link href="/platform/brands/new" className="pc-btn" data-kind="primary">+ Create brand</Link>} />

      {error && <Failed message={error} onRetry={reload} />}
      {loading && !data ? <Loading what="Loading brands" /> : null}

      {data && (
        <>
          <div className="pc-stats4">
            <Stat value={data.totals.brands} label="Brands" />
            <Stat value={data.totals.active} label="Active" />
            <Stat value={data.totals.suspended} label="Suspended" tone={data.totals.suspended ? "amber" : undefined} />
            <Stat value={data.totals.users} label="Users" sub="Staff and buyers across brands" />
          </div>
          {attention.length > 0 && (
            <button type="button" className="pc-card pc-stat4" onClick={() => setHealth("attention")}
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "18px", cursor: "pointer", font: "inherit" }}>
              <div className="pc-stat4-v" style={{ color: "var(--pc-amber)" }}>{attention.length}</div>
              <div className="pc-stat4-l">Need attention</div>
              <div className="pc-stat4-s">{attention.map((b) => b.name).join(", ")}</div>
            </button>
          )}

          <div className="pc-filters">
            <label className="pc-field" style={{ maxWidth: "none", flex: "2 1 280px" }}>
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brands, slugs or owners" aria-label="Search brands" />
            </label>
            <select className="pc-input" style={{ width: "auto", minWidth: "140px" }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">Status: All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select className="pc-input" style={{ width: "auto", minWidth: "140px" }} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
              <option value="">Plan: All</option>
              <option value="starter">Starter</option>
              <option value="wholesale">Wholesale</option>
              <option value="scale">Scale</option>
              <option value="none">Not a plan</option>
            </select>
            <select className="pc-input" style={{ width: "auto", minWidth: "150px" }} value={health} onChange={(e) => setHealth(e.target.value)} aria-label="Health">
              <option value="">Health: All</option>
              <option value="attention">Needs attention</option>
              <option value="selling">Selling</option>
              <option value="no_sales">No sales</option>
              <option value="empty">Empty</option>
            </select>
            <select className="pc-input" style={{ width: "auto", minWidth: "150px" }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
              <option value="active">Last activity</option>
            </select>
          </div>

          <div className="pc-card pc-scroll-x">
            <table className="pc-table" style={{ minWidth: "980px" }}>
              <thead>
                <tr>
                  <th>Brand</th><th>Plan</th><th>Billing</th><th>Health</th><th>Usage</th>
                  <th className="pc-num">Users</th><th>Last activity</th><th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr><td colSpan={8} className="pc-empty">{brands.length ? "No brand matches." : "No brands yet. Create the first one."}</td></tr>
                )}
                {shown.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/platform/brands/${b.slug}`} className="pc-row-title">{b.name}</Link>
                      <div className="pc-sub-line">Store: {b.slug}</div>
                      {b.name.toLowerCase().replace(/[^a-z0-9]/g, "") !== b.slug.replace(/-/g, "") && (
                        <div className="pc-sub-line" style={{ color: "var(--pc-amber)" }}>Name and store address differ</div>
                      )}
                      {b.status !== "active" && <div style={{ marginTop: 4 }}><StatusPill status={b.status} /></div>}
                    </td>
                    <td>
                      {b.plan_detail.known ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{b.plan_detail.name}</div>
                          <div className="pc-sub-line">{b.plan_detail.price_display}, {b.plan_detail.commission_display} on Gang Sheet</div>
                        </>
                      ) : (
                        <>
                          <span className="pc-pill" data-tone="red" style={{ textTransform: "none" }}>{b.plan_detail.name}, not a plan</span>
                          <div style={{ marginTop: 6 }}>
                            <button type="button" className="pc-btn" style={{ height: 30, fontSize: 12.5, padding: "0 10px" }}
                              disabled={busy === b.slug} onClick={() => void moveToStarter(b)}>
                              {busy === b.slug ? "Moving…" : "Move to Starter"}
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                    <td><BillingPill brand={b} />{billingOf(b).label === "Free trial" && b.trial.days_left !== null && (
                      <div className="pc-sub-line">{b.trial.days_left} days left</div>)}</td>
                    <td><HealthPill health={b.health} /><div className="pc-sub-line">{b.products} products, {b.orders} orders</div></td>
                    <td>{ofLimit(b.orders_month, b.limits.orders_per_month)} orders<div className="pc-sub-line">this month</div></td>
                    <td className="pc-num">{b.users}</td>
                    <td>{ago(b.last_activity)}</td>
                    <td>
                      <div className="pc-list-action" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button type="button" className="pc-btn" onClick={() => void openConsole(b.slug, b.name)}>Open console</button>
                        <Link href={`/platform/brands/${b.slug}`} className="pc-btn">Manage</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pc-hint" style={{ marginTop: 12 }}>
            Usage counts this month&apos;s orders against the plan&apos;s stated limit; limits are not enforced.
          </p>
        </>
      )}
    </div>
  );
}
