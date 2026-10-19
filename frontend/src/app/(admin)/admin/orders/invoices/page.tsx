"use client";

/**
 * Invoices and payments: what the shop is owed on its orders, and when
 * (backend services/invoices.py decides which orders, their due dates and
 * states).
 *
 * Each row's main button is what that invoice needs next: an overdue one a
 * reminder, an unpaid one marking paid when the money arrives, a paid one its
 * PDF; the rest are under More. A reminder emails the invoice again with its
 * own due date and goes on the order's history; Mark paid is the order's own
 * route, the same as on the order page. New invoice starts a draft order:
 * confirming it emails its invoice.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ask, tell } from "@/lib/dialog";

type Tab = "all" | "unpaid" | "overdue" | "paid";
type State = "paid" | "overdue" | "due_soon" | "unpaid";

interface Row {
  order_id: string; order_number: string; invoice_number: string; customer: string; terms: string;
  invoiced_at: string | null; due_on: string; total: number; balance: number; paid_at: string | null;
  state: State; can_remind: boolean;
}
interface Answer {
  items: Row[]; total: number; page: number; pages: number;
  outstanding: number; overdue: number; paid_this_month: number; counts: Record<Tab, number>;
}

const TABS: [Tab, string][] = [["all", "All"], ["unpaid", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"]];
const STATE: Record<State, { words: string; tone?: string }> = {
  overdue: { words: "Overdue", tone: "red" },
  due_soon: { words: "Due soon", tone: "amber" },
  unpaid: { words: "Unpaid", tone: "blue" },
  paid: { words: "Paid", tone: "green" },
};
const PAGE_SIZE = 50;

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const offset = () => -new Date().getTimezoneOffset();
const errorText = (e: unknown, fallback: string) => (e instanceof ApiClientError && e.message ? e.message : fallback);

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading invoices…</div></div>}>
      <Invoices />
    </Suspense>
  );
}

function Invoices() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "all") as Tab;
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [qText, setQText] = useState(q);
  const shown = `${tab}|${q}|${page}`;

  const setParams = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    if (!("page" in next)) p.delete("page");
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`);
  }, [params, pathname, router]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ tab, page: String(page), page_size: String(PAGE_SIZE), utc_offset: String(offset()) });
    if (q) p.set("q", q);
    apiClient.get<Answer>(`/api/v1/admin/invoices?${p}`)
      .then((a) => { setData(a); setError(""); })
      .catch((e) => setError(errorText(e, "The invoices could not be loaded.")));
  }, [tab, q, page]);
  useEffect(() => { load(); setPicked(new Set()); }, [load]);

  // The search box writes to the address a moment after typing stops.
  useEffect(() => {
    if (qText === q) return;
    const t = setTimeout(() => setParams({ q: qText.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [qText, q, setParams]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as Element).closest?.("[data-row-menu]")) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  async function remind(ids: string[], words: string) {
    if (!ids.length) return;
    if (!(await ask(words, { title: "Send payment reminders", ok: "Send" }))) return;
    setBusy("remind");
    try {
      const r = await apiClient.post<{ sent: string[]; skipped: { why: string }[] }>(
        "/api/v1/admin/invoices/remind", { order_ids: ids, utc_offset: offset() });
      const sentWords = r.sent.length ? `Reminder sent for ${r.sent.join(", ")}.` : "No reminder was sent.";
      setFlash({ ok: r.sent.length > 0, text: [sentWords, ...r.skipped.map((s) => s.why)].join(" ") });
      setPicked(new Set());
      load();
    } catch (e) {
      setFlash({ ok: false, text: errorText(e, "The reminders could not be sent.") });
    } finally { setBusy(null); }
  }

  async function markPaid(r: Row) {
    if (!(await ask(`Mark ${r.invoice_number} (order ${r.order_number}) paid? ${money(r.balance)} is recorded as received.`,
      { title: "Mark paid", ok: "Mark paid" }))) return;
    setBusy(r.order_id);
    try {
      await apiClient.post(`/api/v1/admin/orders/${r.order_id}/mark-paid`, {});
      setFlash({ ok: true, text: `${r.invoice_number} is paid.` });
      load();
    } catch (e) {
      setFlash({ ok: false, text: errorText(e, "The invoice could not be marked paid.") });
    } finally { setBusy(null); }
  }

  async function download(r: Row) {
    setBusy(r.order_id);
    try {
      const blob = await apiClient.blob(`/api/v1/admin/invoices/${r.order_id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${r.invoice_number}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tell(errorText(e, "The invoice PDF could not be made."));
    } finally { setBusy(null); }
  }

  function headerRemind() {
    const rows = data?.items ?? [];
    if (picked.size) {
      const ids = rows.filter((r) => picked.has(r.order_id) && r.balance > 0).map((r) => r.order_id);
      if (!ids.length) { tell("The invoices you picked are paid: nothing to remind."); return; }
      remind(ids, `Email a payment reminder for the ${ids.length} unpaid ${ids.length === 1 ? "invoice" : "invoices"} you picked?`);
      return;
    }
    const overdue = rows.filter((r) => r.state === "overdue").map((r) => r.order_id);
    if (!overdue.length) { tell("No invoice on this page is overdue. Pick the ones to remind with their boxes."); return; }
    remind(overdue, `Email a payment reminder for the ${overdue.length} overdue ${overdue.length === 1 ? "invoice" : "invoices"} on this page?`);
  }

  const rows = data?.items ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.order_id));

  return (
    <div className="pc-page" style={{ maxWidth: "1240px" }}>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Orders</div>
          <h1 className="pc-h1">Invoices and payments</h1>
          <p className="pc-lede">Net terms, payment links and what is owed.</p>
        </div>
        <div className="pc-row-actions">
          <button type="button" className="pc-btn" disabled={busy === "remind" || !data} onClick={headerRemind}>
            {busy === "remind" ? "Sending…" : "Send reminders"}
          </button>
          <Link href="/admin/orders/new" className="pc-btn" data-kind="primary"><Plus size={17} strokeWidth={2.4} /> New invoice</Link>
        </div>
      </div>

      <nav className="pc-tabs" aria-label="Invoices">
        {TABS.map(([key, label]) => (
          <a key={key} href={`?tab=${key}`} className="pc-tab" data-on={tab === key ? "" : undefined}
             onClick={(e) => { e.preventDefault(); setParams({ tab: key === "all" ? null : key }); }}>{label}</a>
        ))}
      </nav>

      {flash && <div className="pc-flash" data-bad={flash.ok ? undefined : ""} role="status">{flash.text}</div>}
      {error && <div className="pc-flash" data-bad="" role="status">{error}</div>}

      <div className="pc-stats4" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }} data-invoice-stats>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{data ? money(data.outstanding) : "…"}</div><div className="pc-stat4-l">Outstanding</div></div>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{data ? money(data.overdue) : "…"}</div><div className="pc-stat4-l">Overdue</div></div>
        <div className="pc-card pc-stat4"><div className="pc-stat4-v">{data ? money(data.paid_this_month) : "…"}</div><div className="pc-stat4-l">Paid this month</div></div>
      </div>

      <div className="pc-filters">
        <label className="pc-field" style={{ flex: "1 1 320px", maxWidth: "420px" }}>
          <Search size={17} strokeWidth={2} />
          <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search by invoice, order or customer" aria-label="Search invoices" />
        </label>
      </div>

      <div className="pc-card pc-scroll-x" data-shown={data ? shown : undefined} aria-busy={!data}>
        {!data ? <div className="pc-empty">Loading invoices…</div> : !rows.length ? (
          <div className="pc-empty">
            {tab === "overdue" ? "Nothing is overdue." : tab === "paid" ? "No invoice has been paid yet."
              : "No invoices yet. Orders on Net terms, bank transfer or cash on delivery, and confirmed drafts, show here."}
          </div>
        ) : (
          <table className="pc-table">
            <thead>
              <tr>
                <th className="pc-td-check">
                  <input type="checkbox" className="pc-check" aria-label="Pick every invoice on this page" checked={allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.order_id)))} />
                </th>
                <th>Invoice</th><th>Customer</th><th>Order</th><th>Due</th><th>Amount</th><th>Status</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATE[r.state];
                const main = r.state === "paid" ? "download" : r.state === "overdue" && r.can_remind ? "remind" : "paid";
                return (
                  <tr key={r.order_id} data-invoice={r.invoice_number}>
                    <td className="pc-td-check">
                      <input type="checkbox" className="pc-check" aria-label={`Pick ${r.invoice_number}`} checked={picked.has(r.order_id)}
                        onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.order_id)) n.delete(r.order_id); else n.add(r.order_id); return n; })} />
                    </td>
                    <td><b>{r.invoice_number}</b><div className="pc-sub-line">{r.terms}</div></td>
                    <td>{r.customer}</td>
                    <td><Link className="pc-link" href={`/admin/orders/${r.order_id}`}>{r.order_number}</Link></td>
                    <td>{day(r.due_on)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {money(r.state === "paid" ? r.total : r.balance)}
                      {r.state !== "paid" && r.balance < r.total && <div className="pc-sub-line">of {money(r.total)}</div>}
                    </td>
                    <td><span className="pc-pill" data-tone={st.tone} style={{ textTransform: "none" }}>{st.words}</span></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="pc-btn" disabled={busy === r.order_id}
                        onClick={() => main === "download" ? download(r) : main === "remind"
                          ? remind([r.order_id], `Email a payment reminder for ${r.invoice_number} to ${r.customer}? It says ${money(r.balance)} is due ${day(r.due_on)}.`)
                          : markPaid(r)}>
                        {main === "download" ? "Download" : main === "remind" ? "Send reminder" : "Mark paid"}
                      </button>
                      <span className="pc-pop-wrap" data-row-menu style={{ marginLeft: 6 }}>
                        <button type="button" className="pc-btn" aria-label={`More for ${r.invoice_number}`} aria-haspopup="menu"
                          aria-expanded={menu === r.order_id} onClick={() => setMenu(menu === r.order_id ? null : r.order_id)}>
                          <MoreHorizontal size={16} />
                        </button>
                        {menu === r.order_id && (
                          <div className="pc-pop" role="menu" style={{ right: 0, left: "auto" }}>
                            {r.state !== "paid" && r.can_remind && main !== "remind" && (
                              <button type="button" role="menuitem" className="pc-pop-item" onClick={() => { setMenu(null);
                                remind([r.order_id], `Email a payment reminder for ${r.invoice_number} to ${r.customer}? It says ${money(r.balance)} is due ${day(r.due_on)}.`); }}>Send reminder</button>
                            )}
                            {r.state !== "paid" && main !== "paid" && (
                              <button type="button" role="menuitem" className="pc-pop-item" onClick={() => { setMenu(null); markPaid(r); }}>Mark paid</button>
                            )}
                            {main !== "download" && (
                              <button type="button" role="menuitem" className="pc-pop-item" onClick={() => { setMenu(null); download(r); }}>Download PDF</button>
                            )}
                            <Link role="menuitem" className="pc-pop-item" href={`/admin/orders/${r.order_id}`}>Open the order</Link>
                          </div>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {data && data.pages > 1 && (
          <div className="pc-table-foot">
            <span>Page {data.page} of {data.pages} · {data.total} invoices</span>
            <span className="pc-row-actions">
              <button type="button" className="pc-btn" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button>
              <button type="button" className="pc-btn" disabled={page >= data.pages} onClick={() => setParams({ page: String(page + 1) })}>Next</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
