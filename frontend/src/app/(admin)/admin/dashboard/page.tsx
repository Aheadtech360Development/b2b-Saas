"use client";

/**
 * Home: what needs the shop today, in the order to do it.
 *
 * Everything on it comes from one answer, GET /admin/home, which the server
 * works out from the shop's own orders, print jobs and settings. A count of
 * orders is taken from a queue the server defines once, and its button opens
 * the order list on that same queue, so "3 paid orders to ship" opens those
 * three.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { hasScope } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import { HomeSales } from "@/components/admin/HomeSales";
import { PlanUsageNotice } from "@/components/admin/PlanUsageNotice";

type Severity = "urgent" | "attention" | "info";
interface Need { key: string; severity: Severity; count: number; label: string; detail: string; action: string; href: string }
interface Stage { key: string; label: string; count: number; href: string }
interface Step { key: string; title: string; detail: string; done: boolean; href: string }
interface RecentOrder { id: string; order_number: string; customer: string; created_at: string | null; total: number; status: string }

interface HomeData {
  needs: Need[];
  pipeline: Stage[];
  checklist: Step[];
  recent_orders: RecentOrder[];
}

/** How many things to do are shown before "Show more". */
const FIRST_NEEDS = 5;
const STATUS_TONE: Record<string, string> = {
  pending: "amber", confirmed: "blue", processing: "blue", ready_for_pickup: "blue",
  shipped: "green", delivered: "green", cancelled: "red", refunded: "red",
};
const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");

export default function AdminHome() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canOrders = hasScope(user?.role, "orders", user?.scopes);
  const canReports = hasScope(user?.role, "analytics", user?.scopes);
  const canSettings = hasScope(user?.role, "settings", user?.scopes);

  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [domainLive, setDomainLive] = useState(false);
  const [allNeeds, setAllNeeds] = useState(false);

  useEffect(() => {
    apiClient.get<HomeData>("/api/v1/admin/home").then(setData).catch(() => setFailed(true));
  }, []);

  // Whether a shop's own domain has caught up is a live lookup, so it is asked
  // for separately, and only by somebody who may see the domain at all.
  useEffect(() => {
    const step = data?.checklist.find((s) => s.key === "domain");
    if (!step || step.done || !/waiting for DNS/i.test(step.detail) || !canSettings) return;
    apiClient.post<{ status?: string }>("/api/v1/admin/storefront/domain/check", {})
      .then((r) => setDomainLive(r?.status === "live"))
      .catch(() => {});
  }, [data, canSettings]);

  const steps = (data?.checklist ?? []).map((s) =>
    s.key === "domain" && domainLive ? { ...s, done: true, detail: s.detail.replace(/: waiting for DNS/i, " is live") } : s);
  const doneCount = steps.filter((s) => s.done).length;
  // The first few are today's work; the rest is one press away, so a long list
  // does not push the pipeline off the screen.
  const needs = allNeeds ? data?.needs ?? [] : (data?.needs ?? []).slice(0, FIRST_NEEDS);
  const more = (data?.needs.length ?? 0) - needs.length;

  return (
    <div className="pc-page">
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Home</div>
          <h1 className="pc-h1">Today</h1>
          <p className="pc-lede">What needs you right now, in the order to do it.</p>
        </div>
        {canOrders && (
          <Link href="/admin/orders/drafts" className="pc-btn" data-kind="primary">
            <Plus size={17} strokeWidth={2.4} /> New order
          </Link>
        )}
      </div>

      {/* ── Near or past the orders the plan includes (Retail) ───────── */}
      <PlanUsageNotice />

      {/* ── Sales, sessions and conversion rate, for any days ─────────── */}
      {canReports && <HomeSales />}

      {failed && <div className="pc-card pc-empty">Could not load today&apos;s work. Reload to try again.</div>}

      {!failed && (
        <div className="pc-home">
          <div className="pc-stack">
            {/* ── Needs you today ───────────────────────────────────────── */}
            <section className="pc-card" aria-labelledby="needs-title">
              <div className="pc-card-head" style={{ borderBottom: 0 }}>
                <h2 className="pc-h2" id="needs-title">Needs you today</h2>
                <span className="pc-sorted"><Sparkles size={14} strokeWidth={2} /> Sorted by Copilot</span>
              </div>
              {!data && [0, 1, 2].map((i) => (
                <div key={i} className="pc-need"><div className="at-skel" style={{ height: "44px", width: "100%", borderRadius: "9px" }} /></div>
              ))}
              {data && data.needs.length === 0 && (
                <div className="pc-need" style={{ color: "var(--pc-green)", fontWeight: 600 }}>
                  <span className="pc-step-dot" style={{ background: "var(--pc-green)", borderColor: "var(--pc-green)" }}><Check size={13} strokeWidth={3} /></span>
                  Nothing needs you right now. No orders waiting, no artwork to review, and stock is fine.
                </div>
              )}
              {needs.map((n) => (
                <div key={n.key} className="pc-need" data-need={n.key}>
                  <span className="pc-need-tile" data-tone={n.severity}>{n.count > 99 ? "99+" : n.count}</span>
                  <div className="pc-need-text">
                    <div className="pc-need-title">{n.label}</div>
                    {n.detail && <div className="pc-need-detail">{n.detail}</div>}
                  </div>
                  <Link href={n.href} className="pc-btn">{n.action}</Link>
                </div>
              ))}
              {more > 0 && (
                <div className="pc-need" style={{ justifyContent: "center", padding: "12px 20px" }}>
                  <button type="button" className="pc-link" onClick={() => setAllNeeds(true)}>Show {more} more</button>
                </div>
              )}
            </section>

            {/* ── Production pipeline ───────────────────────────────────── */}
            <section className="pc-card" aria-labelledby="pipe-title">
              <div className="pc-card-head">
                <h2 className="pc-h2" id="pipe-title">Production pipeline</h2>
                <Link href="/admin/production" className="pc-link">Open Production</Link>
              </div>
              <div className="pc-pipe">
                {(data?.pipeline ?? [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }, { key: "e" }] as Stage[]).map((s) => (
                  <Link key={s.key} href={s.href ?? "#"} data-live={s.count > 0 ? "" : undefined} data-stage={s.key}>
                    <div className="pc-pipe-n">{data ? s.count : "–"}</div>
                    <div className="pc-pipe-l">{s.label ?? ""}</div>
                  </Link>
                ))}
              </div>
            </section>

            {/* ── Recent orders ─────────────────────────────────────────── */}
            {canOrders && (
              <section className="pc-card" aria-labelledby="recent-title">
                <div className="pc-card-head">
                  <h2 className="pc-h2" id="recent-title">Recent orders</h2>
                  <Link href="/admin/orders" className="pc-link">View all orders</Link>
                </div>
                {data && data.recent_orders.length === 0 ? (
                  <div className="pc-empty">No orders yet. The first one will show here.</div>
                ) : (
                  <table className="pc-table">
                    <thead>
                      <tr><th>Order</th><th>Customer</th><th>Date</th><th className="pc-num">Total</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {(data?.recent_orders ?? []).map((o) => (
                        <tr key={o.id} data-href onClick={() => router.push(`/admin/orders/${o.id}`)}>
                          <td><Link href={`/admin/orders/${o.id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>{o.order_number}</Link></td>
                          <td>{o.customer}</td>
                          <td>{day(o.created_at)}</td>
                          <td className="pc-num">{money(o.total)}</td>
                          <td><span className="pc-pill" data-tone={STATUS_TONE[o.status]}>{o.status.replace(/_/g, " ")}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </div>

          <div className="pc-stack">
            {/* ── Get ready to go live ──────────────────────────────────── */}
            {steps.length > 0 && doneCount < steps.length && (
              <section className="pc-card" aria-labelledby="live-title" style={{ paddingBottom: "8px" }}>
                <div className="pc-card-head" style={{ paddingBottom: "12px" }}>
                  <h2 className="pc-h2" id="live-title">Get ready to go live</h2>
                  <span style={{ fontSize: "13px", color: "var(--pc-muted)", whiteSpace: "nowrap" }}>{doneCount} of {steps.length} done</span>
                </div>
                <div style={{ borderTop: 0 }}>
                  <div className="pc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
                    <i style={{ width: `${(doneCount / steps.length) * 100}%` }} />
                  </div>
                  {steps.map((s) => (
                    <div key={s.key} className="pc-step" data-done={s.done ? "" : undefined} data-step={s.key}>
                      <span className="pc-step-dot" aria-hidden>{s.done && <Check size={13} strokeWidth={3} />}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="pc-step-title">{s.title}</div>
                        {s.detail && <div className="pc-step-detail">{s.detail}</div>}
                      </div>
                      {s.done
                        ? <span className="pc-step-done">Done</span>
                        : <Link href={s.href} className="pc-link" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{s.key === "setup" ? "Continue" : "Set up"}</Link>}
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
