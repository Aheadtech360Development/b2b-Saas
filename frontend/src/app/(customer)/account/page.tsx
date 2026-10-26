"use client";

/**
 * The portal's home: where the buyer's orders and print jobs stand, what needs
 * them, and the quickest ways to start again. A company account also sees what
 * it owes and its terms (the design's Wholesale home); a retail buyer, their
 * latest print job and orders (Default home).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useBranding } from "@/components/providers/BrandingProvider";
import { usePortal } from "@/components/portal/context";
import { accountService } from "@/services/account.service";
import { gangSheetsService } from "@/services/gangSheets.service";
import { apiClient } from "@/lib/api-client";
import { day, money } from "@/lib/customerWords";
import { tell } from "@/lib/dialog";
import {
  Chip, Empty, Loading, OrderChip, PageHead, Steps, num,
} from "@/components/portal/ui";
import {
  JOB_STEPS, dueDate, invoiceState, isTradeAccount, jobLine, jobState, jobStep, owed, reorderToCart,
  type FullProfile, type Invoice, type Job, type OrderPage, type OrderRow, type QuoteRow,
} from "@/components/portal/data";

interface Need {
  key: string;
  count: number;
  title: string;
  sub: string;
  href: string;
  action: string;
  tone?: "bad" | "warn";
}

function NeedsYou({ needs }: { needs: Need[] }) {
  if (!needs.length) return null;
  return (
    <section className="cp-card cp-pad" aria-labelledby="needs-you">
      <h2 id="needs-you" className="cp-h2" style={{ marginBottom: 14 }}>Needs you</h2>
      <div className="cp-rows">
        {needs.map((n) => (
          <div key={n.key} className="cp-row">
            <span className="cp-row-n" style={n.tone === "bad" ? { background: "var(--cp-bad-bg)", color: "var(--cp-bad)" } : undefined}>{n.count}</span>
            <div className="cp-row-body">
              <div className="cp-row-t">{n.title}</div>
              <div className="cp-row-s">{n.sub}</div>
            </div>
            <Link href={n.href} className="cp-btn">{n.action}</Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentOrders({ orders, onReorder, busy, compact }: {
  orders: OrderRow[];
  onReorder: (id: string) => void;
  busy: string | null;
  compact?: boolean;
}) {
  return (
    <section className="cp-card" aria-labelledby="recent-orders" style={{ overflow: "hidden" }}>
      <div className="cp-card-head" style={{ padding: "16px 20px 0" }}>
        <h2 id="recent-orders" className="cp-h2">Recent orders</h2>
        <Link href="/account/orders" className="cp-link">See all</Link>
      </div>
      {orders.length === 0 ? (
        <Empty title="No orders yet">Your orders show up here once you place one.</Empty>
      ) : (
        <div className="cp-tbl-wrap">
          <table className="cp-tbl" style={{ minWidth: compact ? 480 : 560 }}>
            <thead>
              <tr><th>Order</th><th>Date</th><th className="cp-num">Total</th><th>Status</th>{!compact && <th><span className="cp-sr">Actions</span></th>}</tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/account/orders/${o.id}`} className="cp-row-link">{o.order_number}</Link></td>
                  <td>{day(o.created_at)}</td>
                  <td className="cp-num">{money(num(o.total))}</td>
                  <td><OrderChip status={o.status} /></td>
                  {!compact && (
                    <td className="cp-end">
                      <button type="button" className="cp-btn cp-btn-sm" disabled={busy === o.id} onClick={() => onReorder(o.id)}>
                        {busy === o.id ? "Adding…" : "Reorder"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GoodToKnow() {
  const b = useBranding();
  const pickup = b?.pickup_enabled !== false && b?.pickup_address
    ? [b.pickup_name, b.pickup_address, b.pickup_hours].filter(Boolean).join(", ")
    : null;
  const contact = [b?.support_email, b?.support_phone].filter(Boolean).join(" · ");
  if (!pickup && !contact) return null;
  return (
    <section className="cp-card cp-pad" aria-labelledby="good-to-know">
      <h2 id="good-to-know" className="cp-h2" style={{ marginBottom: 12 }}>Good to know</h2>
      <div className="cp-stack-sm" style={{ fontSize: 14, color: "var(--cp-body)", lineHeight: 1.55 }}>
        {pickup && <p style={{ margin: 0 }}>Pickup: {pickup}{b?.pickup_note ? `. ${b.pickup_note}` : ""}</p>}
        {contact && <p style={{ margin: 0 }}>Questions: {contact}</p>}
      </div>
    </section>
  );
}

export default function AccountHomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  // The design's Wholesale home for a trade account, its Default home for a retail shopper.
  const company = isTradeAccount(user);
  const { printing } = usePortal();
  const loaded = useRef(false);

  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !user || user.is_admin || loaded.current) return;
    loaded.current = true;
    const soft = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    Promise.all([
      soft(accountService.getOrders({ page: 1 }) as Promise<OrderPage>, { items: [], total: 0, page: 1, pages: 1 }),
      soft(gangSheetsService.myOrders() as Promise<Job[]>, []),
      soft(apiClient.get<{ items: QuoteRow[] }>(`/api/v1/quotes?utc_offset=${-new Date().getTimezoneOffset()}`), { items: [] }),
      company ? soft(accountService.getInvoices() as Promise<Invoice[]>, []) : Promise.resolve([] as Invoice[]),
      company ? soft(accountService.getFullProfile() as Promise<FullProfile>, null) : Promise.resolve(null),
    ]).then(([o, j, q, inv, p]) => {
      setOrders((o?.items ?? []).slice(0, 5));
      setJobs(j ?? []);
      setQuotes(q?.items ?? []);
      setInvoices(inv ?? []);
      setProfile(p);
      setReady(true);
    });
  }, [isLoading, user, company]);

  async function reorder(id: string) {
    setBusy(id);
    try {
      await reorderToCart(id);
      router.push("/cart");
    } catch {
      tell("That order could not be added to your cart. Please try again.");
      setBusy(null);
    }
  }

  const first = user?.first_name?.trim();
  const title = `Welcome back${first ? `, ${first}` : ""}`;

  if (!ready) {
    return (
      <>
        <PageHead eyebrow="Home" title={title} />
        <Loading what="Loading your account" />
      </>
    );
  }

  const net30 = !!profile?.company?.net30_enabled;
  const openInvoices = invoices.filter((i) => owed(i) > 0);
  const owedTotal = openInvoices.reduce((s, i) => s + owed(i), 0);

  // What needs the buyer, most urgent first.
  const needs: Need[] = [];
  const changes = jobs.filter((j) => j.status === "revision_requested");
  if (changes.length) {
    needs.push({
      key: "changes", count: changes.length, tone: "bad",
      title: changes.length === 1 ? `Print job ${changes[0]!.reference} needs a change` : "Print jobs need a change",
      sub: changes[0]!.supplier_notes || "The print team asked for a change to your artwork.",
      href: changes.length === 1 ? `/account/gang-sheets/${changes[0]!.id}` : "/account/gang-sheets?tab=action",
      action: "View job",
    });
  }
  const toAccept = quotes.filter((q) => q.status === "sent");
  if (toAccept.length) {
    needs.push({
      key: "quotes", count: toAccept.length,
      title: toAccept.length === 1 ? `Quote ${toAccept[0]!.number} is ready to accept` : "Quotes are ready to accept",
      sub: toAccept[0]!.valid_until ? `Valid until ${day(toAccept[0]!.valid_until)}.` : "The shop has priced your request.",
      href: "/account/quotes", action: "See quote",
    });
  }
  const overdue = net30 ? openInvoices.filter((i) => invoiceState(i, net30)[0] === "Overdue") : [];
  if (overdue.length) {
    needs.push({
      key: "overdue", count: overdue.length, tone: "bad",
      title: overdue.length === 1 ? `Invoice ${overdue[0]!.doc_number} is overdue` : "Invoices are overdue",
      sub: `${money(overdue.reduce((s, i) => s + owed(i), 0))} past its due date.`,
      href: "/account/invoices", action: "Pay",
    });
  }
  const toPay = !company ? orders.filter((o) => o.order_number.startsWith("DRAFT-") && o.payment_status !== "paid" && !["cancelled", "refunded"].includes(o.status)) : [];
  if (toPay.length) {
    needs.push({
      key: "pay", count: toPay.length,
      title: `Invoice ${toPay[0]!.order_number} is waiting for payment`,
      sub: `${money(num(toPay[0]!.total))} to pay online.`,
      href: `/checkout/invoice/${toPay[0]!.order_number}`, action: "Pay now",
    });
  }
  const checking = jobs.filter((j) => j.status === "in_review");
  if (checking.length) {
    needs.push({
      key: "checking", count: checking.length,
      title: checking.length === 1 ? "Print job in artwork check" : "Print jobs in artwork check",
      sub: "The print team is checking your artwork. We email you if anything needs a change.",
      href: checking.length === 1 ? `/account/gang-sheets/${checking[0]!.id}` : "/account/gang-sheets",
      action: "View job",
    });
  }

  const latestJob = jobs.find((j) => j.order_status !== "delivered") ?? jobs[0] ?? null;
  const jobSummary = (() => {
    if (!jobs.length) return "";
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const w = jobState(j)[0].toLowerCase();
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    const parts = [...counts.entries()].map(([w, n]) => `${n} ${w}`);
    return `${jobs.length} job${jobs.length === 1 ? "" : "s"} in total: ${parts.join(", ")}.`;
  })();

  const lastOrder = orders.find((o) => !o.order_number.startsWith("DRAFT-")) ?? null;

  const printJobs = (
    <section className="cp-card cp-pad" aria-labelledby="your-jobs">
      <div className="cp-card-head">
        <h2 id="your-jobs" className="cp-h2">Your print jobs</h2>
        {jobs.length > 0 && <Link href="/account/gang-sheets" className="cp-link">See all</Link>}
      </div>
      {latestJob ? (
        <>
          <div className="cp-job">
            <div className="cp-job-top">
              <div className="cp-thumb" aria-hidden>
                {latestJob.artworks?.[0]?.file_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={latestJob.artworks[0].file_url} alt="" />
                  : null}
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div className="cp-job-title">{latestJob.reference}<Chip tone={jobState(latestJob)[1]}>{jobState(latestJob)[0]}</Chip></div>
                <div className="cp-job-meta">{jobLine(latestJob)}</div>
              </div>
              <Link href={`/account/gang-sheets/${latestJob.id}`} className="cp-btn">View job</Link>
            </div>
            <Steps steps={JOB_STEPS} {...jobStep(latestJob)} />
          </div>
          <p className="cp-note" style={{ marginTop: 12 }}>{jobSummary}</p>
        </>
      ) : (
        <Empty title="No print jobs yet">
          <div style={{ marginTop: 12 }}><Link href="/gang-sheets" className="cp-btn cp-btn-p">Build a gang sheet</Link></div>
        </Empty>
      )}
    </section>
  );

  if (!company) {
    return (
      <>
        <PageHead eyebrow="Home" title={title} sub="Where your orders and print jobs stand." />
        <div className="cp-cols">
          <div className="cp-col-main">
            <NeedsYou needs={needs} />
            {printing !== false && printJobs}
            <RecentOrders orders={orders} onReorder={reorder} busy={busy} />
          </div>
          <div className="cp-col-side">
            <section className="cp-card cp-pad" aria-labelledby="start-new">
              <h2 id="start-new" className="cp-h2" style={{ marginBottom: 14 }}>Start something new</h2>
              <div className="cp-stack-sm">
                {printing !== false
                  ? <Link href="/gang-sheets" className="cp-btn cp-btn-p cp-btn-block">Build a gang sheet</Link>
                  : <Link href="/products" className="cp-btn cp-btn-p cp-btn-block">Shop the catalogue</Link>}
                {lastOrder && (
                  <button type="button" className="cp-btn cp-btn-block" disabled={busy === lastOrder.id} onClick={() => reorder(lastOrder.id)}>
                    {busy === lastOrder.id ? "Adding…" : "Reorder your last order"}
                  </button>
                )}
                <Link href="/account/messages" className="cp-btn cp-btn-block">Message the shop</Link>
              </div>
            </section>
            <GoodToKnow />
          </div>
        </div>
      </>
    );
  }

  const tier = profile?.company?.pricing_tier_name;
  const discount = profile?.company?.pricing_tier_discount;
  const due = openInvoices.slice(0, 5);

  return (
    <>
      <PageHead eyebrow="Home" title={title} sub="Your account, your terms, your orders." />
      <div className="cp-stats" style={{ marginBottom: 24 }}>
        <div className="cp-card cp-stat">
          <div className="cp-stat-n">{money(owedTotal)}</div>
          <div className="cp-stat-l">Balance owed</div>
          <div className="cp-stat-s">Across {openInvoices.length} open invoice{openInvoices.length === 1 ? "" : "s"}</div>
        </div>
        <div className="cp-card cp-stat">
          <div className="cp-stat-n">{net30 ? "Net 30" : "Pay at checkout"}</div>
          <div className="cp-stat-l">Your terms</div>
          <div className="cp-stat-s">{net30 ? "Invoices fall due 30 days after the order" : "Orders are paid when placed"}</div>
        </div>
        <div className="cp-card cp-stat">
          <div className="cp-stat-n">{tier || "Standard"}</div>
          <div className="cp-stat-l">Your pricing tier</div>
          <div className="cp-stat-s">{discount ? `${Number(discount)}% off retail` : "Shop prices"}</div>
        </div>
      </div>
      <div className="cp-cols">
        <div className="cp-col-main">
          <NeedsYou needs={needs} />
          <section className="cp-card" aria-labelledby="invoices-due" style={{ overflow: "hidden" }}>
            <div className="cp-card-head" style={{ padding: "16px 20px 0" }}>
              <h2 id="invoices-due" className="cp-h2">Invoices due</h2>
              <Link href="/account/invoices" className="cp-link">All invoices</Link>
            </div>
            {due.length === 0 ? (
              <Empty title="Nothing owed">Every invoice is paid.</Empty>
            ) : (
              <div className="cp-tbl-wrap">
                <table className="cp-tbl" style={{ minWidth: 520 }}>
                  <thead><tr><th>Invoice</th><th>Due</th><th className="cp-num">Amount</th><th>Status</th><th><span className="cp-sr">Pay</span></th></tr></thead>
                  <tbody>
                    {due.map((i) => {
                      const [w, tone] = invoiceState(i, net30);
                      const d = dueDate(i, net30);
                      return (
                        <tr key={i.id}>
                          <td><Link href={`/account/orders/${i.id}`} className="cp-row-link">{i.doc_number}</Link></td>
                          <td>{d ? day(d.toISOString()) : "Now"}</td>
                          <td className="cp-num">{money(owed(i))}</td>
                          <td><Chip tone={tone}>{w}</Chip></td>
                          <td className="cp-end"><Link href={`/checkout/invoice/${i.doc_number}`} className="cp-btn cp-btn-sm cp-btn-p">Pay</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {printing !== false && jobs.length > 0 && printJobs}
          <RecentOrders orders={orders} onReorder={reorder} busy={busy} compact />
        </div>
        <div className="cp-col-side">
          <section className="cp-card cp-pad" aria-labelledby="order-faster">
            <h2 id="order-faster" className="cp-h2" style={{ marginBottom: 14 }}>Order faster</h2>
            <div className="cp-stack-sm">
              <Link href="/account/quick-order" className="cp-btn cp-btn-p cp-btn-block">Quick order by SKU</Link>
              <Link href="/account/quick-order#grid" className="cp-btn cp-btn-block">Matrix ordering grid</Link>
              {lastOrder && (
                <button type="button" className="cp-btn cp-btn-block" disabled={busy === lastOrder.id} onClick={() => reorder(lastOrder.id)}>
                  {busy === lastOrder.id ? "Adding…" : "Reorder your last order"}
                </button>
              )}
              <Link href="/account/quotes?new=1" className="cp-btn cp-btn-block">Request a quote</Link>
            </div>
          </section>
          <GoodToKnow />
        </div>
      </div>
    </>
  );
}
