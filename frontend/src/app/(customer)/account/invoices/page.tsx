"use client";

/**
 * Billing, Invoices: what the company owes and paying it. Every order is its
 * own invoice (the API builds them from the orders); a cancelled or refunded
 * order owes nothing. Net 30 invoices fall due 30 days after the order, which
 * is what "due soon" and "overdue" are measured against.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { accountService } from "@/services/account.service";
import { apiClient } from "@/lib/api-client";
import { tell } from "@/lib/dialog";
import { day, money } from "@/lib/customerWords";
import { BillingTabs } from "@/components/portal/BillingTabs";
import { Banner, Chip, Empty, Loading, PageHead, saveOrderPdf } from "@/components/portal/ui";
import { dueDate, invoiceState, owed, type Invoice } from "@/components/portal/data";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [net30, setNet30] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offered, setOffered] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");

  const load = useCallback(() => {
    setError(null);
    (accountService.getInvoices() as Promise<Invoice[]>)
      .then((d) => setInvoices(d ?? []))
      .catch((e: { status?: number }) => {
        setInvoices([]);
        if (e?.status === 403) setOffered(false);
        else setError("Your invoices could not be loaded.");
      });
    apiClient.get<{ net30_enabled: boolean }>("/api/v1/account/net30-status")
      .then((d) => setNet30(!!d.net30_enabled)).catch(() => setNet30(false));
  }, []);
  useEffect(load, [load]);

  async function download(inv: Invoice) {
    setBusy(inv.id);
    if (!await saveOrderPdf(inv.id, "invoice", inv.doc_number)) tell("That invoice could not be downloaded. Please try again.");
    setBusy(null);
  }

  const list = invoices ?? [];
  const open = list.filter((i) => owed(i) > 0);
  const totalOwed = open.reduce((s, i) => s + owed(i), 0);
  const now = Date.now();
  const dueNow = open.filter((i) => { const d = dueDate(i, net30); return !d || d.getTime() <= now; }).reduce((s, i) => s + owed(i), 0);
  const overdue = open.filter((i) => invoiceState(i, net30)[0] === "Overdue").reduce((s, i) => s + owed(i), 0);
  const rows = show === "open" ? open : list;

  return (
    <>
      <PageHead eyebrow="Billing" title="Invoices" sub="See what you owe and pay it." />
      <BillingTabs />
      {!offered ? (
        <div className="cp-card">
          <Empty title="Invoices are not offered here">
            Orders at this shop are paid at checkout. Receipts for them are under <Link href="/account/orders?tab=receipts" className="cp-link">Orders, Receipts</Link>.
          </Empty>
        </div>
      ) : (
        <div className="cp-stack">
          {error && <Banner tone="bad" onRetry={load}>{error}</Banner>}
          <div className="cp-stats">
            <div className="cp-card cp-stat"><div className="cp-stat-n">{money(totalOwed)}</div><div className="cp-stat-l">Total owed</div><div className="cp-stat-s">{open.length} open invoice{open.length === 1 ? "" : "s"}</div></div>
            <div className="cp-card cp-stat"><div className="cp-stat-n">{money(dueNow)}</div><div className="cp-stat-l">Due now</div><div className="cp-stat-s">{net30 ? "Past or at its due date" : "Pay any time online"}</div></div>
            {net30 && <div className="cp-card cp-stat"><div className="cp-stat-n" style={overdue > 0 ? { color: "var(--cp-bad)" } : undefined}>{money(overdue)}</div><div className="cp-stat-l">Overdue</div><div className="cp-stat-s">More than 30 days old</div></div>}
          </div>

          <div className="cp-card" style={{ overflow: "hidden" }}>
            <div className="cp-card-head" style={{ padding: "14px 20px 0", flexWrap: "wrap" }}>
              <h2 className="cp-h3">{show === "open" ? "Open invoices" : "All invoices"}</h2>
              <div className="cp-actions">
                <button type="button" className="cp-btn cp-btn-sm" aria-pressed={show === "open"} onClick={() => setShow("open")}
                  style={show === "open" ? { borderColor: "var(--cp-accent)", color: "var(--cp-accent-text)" } : undefined}>Open</button>
                <button type="button" className="cp-btn cp-btn-sm" aria-pressed={show === "all"} onClick={() => setShow("all")}
                  style={show === "all" ? { borderColor: "var(--cp-accent)", color: "var(--cp-accent-text)" } : undefined}>All</button>
              </div>
            </div>
            {invoices === null ? <Loading what="Loading invoices" /> : rows.length === 0 ? (
              <Empty title={show === "open" ? "Nothing owed" : "No invoices yet"}>{show === "open" ? "Every invoice is paid." : "Each order you place becomes an invoice here."}</Empty>
            ) : (
              <div className="cp-tbl-wrap">
                <table className="cp-tbl">
                  <thead>
                    <tr><th>Invoice</th><th>Date</th><th>Due</th><th className="cp-num">Amount</th><th className="cp-num">Owed</th><th>Status</th><th><span className="cp-sr">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => {
                      const [w, tone] = invoiceState(i, net30);
                      const d = owed(i) > 0 ? dueDate(i, net30) : null;
                      return (
                        <tr key={i.id}>
                          <td><Link href={`/account/orders/${i.id}`} className="cp-row-link">{i.doc_number ?? "Invoice"}</Link></td>
                          <td>{day(i.txn_date)}</td>
                          <td>{owed(i) > 0 ? (d ? day(d.toISOString()) : "Now") : "—"}</td>
                          <td className="cp-num">{money(i.total_amt)}</td>
                          <td className="cp-num">{money(owed(i))}</td>
                          <td><Chip tone={tone}>{w}</Chip></td>
                          <td className="cp-end">
                            <span className="cp-actions" style={{ justifyContent: "flex-end" }}>
                              {owed(i) > 0 && <a href={`/checkout/invoice/${i.doc_number}`} className="cp-btn cp-btn-sm cp-btn-p">Pay</a>}
                              <button type="button" className="cp-btn cp-btn-sm" disabled={busy === i.id} onClick={() => download(i)}>
                                {busy === i.id ? "Preparing…" : "Download"}
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="cp-note">Pay opens a secure page for that invoice. A payment shows here as soon as it goes through.</p>
        </div>
      )}
    </>
  );
}
