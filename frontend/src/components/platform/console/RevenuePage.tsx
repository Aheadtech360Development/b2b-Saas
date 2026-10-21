"use client";

/**
 * Revenue and billing (design screen 9): what the platform earns from plans,
 * what the brands sell, and where billing is stuck.
 *
 * Plan revenue is at list price: Stripe holds the exact invoices (a promotion
 * code, or an older price a brand subscribed at). Orders revenue is paid
 * orders, shipping and tax included, as the old Analytics counted it.
 */
import Link from "next/link";
import { useMemo } from "react";
import { platformService } from "@/services/platform.service";
import { consoleApi, type Brand } from "./api";
import { BillingPill, Failed, Loading, PageHead, Stat, dollars, money, needs, useLoad } from "./ui";

function planRevenue(b: Brand): number {
  return b.paying && b.billing_status !== "trialing" ? b.plan_detail.amount_cents : 0;
}

export function RevenuePage() {
  const brands = useLoad(() => consoleApi.brands(), []);
  const analytics = useLoad(() => platformService.analytics(), []);
  const list = brands.data?.items ?? [];
  const sales = useMemo(() => new Map((analytics.data?.brands ?? []).map((b) => [b.slug, b])), [analytics.data]);

  const mrr = list.reduce((sum, b) => sum + planRevenue(b), 0);
  const paid = list.filter((b) => planRevenue(b) > 0).length;
  const noCard = list.filter((b) => b.status === "active" && !b.paying && !b.trial.on_trial).length;
  const problems = list.flatMap((b) => needs(b).filter((n) => n.level === "fix" || n.title.includes("trial is over")).map((n) => ({ b, n })));

  return (
    <div>
      <PageHead eyebrow="Revenue" title="Revenue and billing" lede="What the platform earns, and where money is stuck." />
      {(brands.error || analytics.error) && <Failed message={brands.error || analytics.error || ""} onRetry={() => { void brands.reload(); void analytics.reload(); }} />}
      {(brands.loading && !brands.data) ? <Loading what="Loading revenue" /> : null}
      {brands.data && (
        <>
          <div className="pc-stats4">
            <Stat value={money(mrr, { whole: true })} label="Plan revenue a month" sub={`From ${paid} paid brand${paid === 1 ? "" : "s"}, at list price`} />
            <Stat value={analytics.data ? dollars(analytics.data.totals.revenue) : "…"} label="Orders revenue (paid)" sub="All brands, all time" />
            <Stat value={noCard} label="Brands with no card" sub="Out of trial, nothing billed" tone={noCard ? "amber" : undefined} />
            <Stat value={list.filter((b) => b.billing_status === "past_due" || b.billing_status === "unpaid").length} label="Payments failed" />
          </div>

          <div className="pc-card pc-scroll-x">
            <table className="pc-table" style={{ minWidth: 760 }}>
              <thead><tr><th>Brand</th><th>Plan</th><th className="pc-num">Plan revenue</th><th className="pc-num">Orders revenue (paid)</th><th className="pc-num">Paid orders</th><th>Billing</th></tr></thead>
              <tbody>
                {list.map((b) => {
                  const s = sales.get(b.slug);
                  return (
                    <tr key={b.id}>
                      <td><Link href={`/platform/brands/${b.slug}?tab=plan`} className="pc-row-title">{b.name}</Link></td>
                      <td>{b.plan_detail.known ? b.plan_detail.name : <span className="pc-pill" data-tone="red" style={{ textTransform: "none" }}>{b.plan_detail.name}, not a plan</span>}</td>
                      <td className="pc-num">{money(planRevenue(b), { whole: true })}</td>
                      <td className="pc-num">{s ? dollars(s.revenue) : "…"}</td>
                      <td className="pc-num">{s ? s.orders.toLocaleString() : "…"}</td>
                      <td><BillingPill brand={b} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section className="pc-card" style={{ marginTop: 20 }}>
            <div className="pc-card-head"><h2 className="pc-h2">Billing problems</h2>
              <Link href="/platform/health" className="pc-link">Open Health</Link></div>
            {problems.length === 0 ? <div className="pc-empty">No billing problems.</div> : problems.map(({ b, n }, i) => (
              <div key={`${b.slug}-${i}`} className="pc-need">
                <div className="pc-need-tile" data-tone={n.level === "fix" ? "urgent" : "attention"}>!</div>
                <div className="pc-need-text"><div className="pc-need-title">{n.title}</div><div className="pc-need-detail">{n.detail}</div></div>
                <Link href={`/platform/brands/${b.slug}?tab=plan`} className="pc-btn">Open brand</Link>
              </div>
            ))}
          </section>
          <p className="pc-hint" style={{ marginTop: 12 }}>
            Gang Sheet commission is taken by Stripe on each order and shown in Stripe; it is not totalled here yet.
          </p>
        </>
      )}
    </div>
  );
}
