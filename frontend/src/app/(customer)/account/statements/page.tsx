// frontend/src/app/(customer)/account/statements/page.tsx
"use client";

/**
 * Billing, Statements: the company's ledger, every charge and payment with the
 * balance after it, for any dates. Downloads as a PDF, or is emailed to the
 * company's contacts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { day, money } from "@/lib/customerWords";
import { BillingTabs } from "@/components/portal/BillingTabs";
import { Banner, Chip, Empty, Loading, PageHead, saveBlob } from "@/components/portal/ui";

interface Transaction {
  id: string;
  date: string;
  description: string;
  type: "charge" | "payment" | "credit" | "refund";
  amount: number;
  reference: string | null;
  order_id: string | null;
  running_balance: number;
}

interface StatementData {
  items: Transaction[];
  summary: { total_charges: number; total_payments: number; current_balance: number };
}

const TYPE_WORDS: Record<string, string> = { charge: "Invoice", payment: "Payment", credit: "Credit", refund: "Refund" };

export default function StatementsPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasLoaded = useRef(false);
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [refSearch, setRefSearch] = useState("");
  const [busy, setBusy] = useState<"pdf" | "email" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("date_from", from);
      if (to) params.set("date_to", to);
      const qs = params.toString();
      setData(await apiClient.get<StatementData>(`/api/v1/account/statements${qs ? `?${qs}` : ""}`));
      setMessage(null);
    } catch {
      setMessage({ tone: "bad", text: "Your statement could not be loaded." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated() || hasLoaded.current) return;
    hasLoaded.current = true;
    load();
  }, [isLoading, isAuthenticated, load]);

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const qs = params.toString();
      const blob = await apiClient.blob(`/api/v1/account/statements/pdf${qs ? `?${qs}` : ""}`);
      saveBlob(blob, `Statement_${dateFrom || "All"}.pdf`);
    } catch {
      setMessage({ tone: "bad", text: "The PDF could not be downloaded." });
    } finally {
      setBusy(null);
    }
  }

  async function emailStatement() {
    setBusy("email");
    setMessage(null);
    try {
      const result = await apiClient.post<{ message: string }>("/api/v1/account/statements/email",
        { date_from: dateFrom || null, date_to: dateTo || null });
      setMessage({ tone: "ok", text: result.message });
    } catch {
      setMessage({ tone: "bad", text: "The statement could not be emailed." });
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => (data?.items ?? []).filter((t) => {
    if (typeFilter && t.type !== typeFilter) return false;
    if (refSearch) {
      const q = refSearch.toLowerCase();
      if (!t.reference?.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [data, typeFilter, refSearch]);

  return (
    <>
      <PageHead eyebrow="Billing" title="Statements" sub="Charges, payments and your balance."
        actions={
          <>
            <button type="button" className="cp-btn" onClick={emailStatement} disabled={busy !== null}>{busy === "email" ? "Sending…" : "Email it to us"}</button>
            <button type="button" className="cp-btn cp-btn-p" onClick={downloadPdf} disabled={busy !== null}>{busy === "pdf" ? "Preparing…" : "Download PDF"}</button>
          </>
        } />
      <BillingTabs />
      <div className="cp-stack">
        {message && <Banner tone={message.tone} onRetry={message.tone === "bad" && !data ? () => load() : undefined}>{message.text}</Banner>}
        {data && (
          <div className="cp-stats">
            <div className="cp-card cp-stat"><div className="cp-stat-n">{money(data.summary.total_charges)}</div><div className="cp-stat-l">Total charges</div></div>
            <div className="cp-card cp-stat"><div className="cp-stat-n">{money(data.summary.total_payments)}</div><div className="cp-stat-l">Total payments</div></div>
            <div className="cp-card cp-stat"><div className="cp-stat-n">{money(data.summary.current_balance)}</div><div className="cp-stat-l">Current balance</div></div>
          </div>
        )}
        <form className="cp-filters" style={{ marginBottom: 0 }} onSubmit={(e) => { e.preventDefault(); load(dateFrom || undefined, dateTo || undefined); }}>
          <label className="cp-sr" htmlFor="s-from">From date</label>
          <input id="s-from" className="cp-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
          <label className="cp-sr" htmlFor="s-to">To date</label>
          <input id="s-to" className="cp-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
          <label className="cp-sr" htmlFor="s-type">Type</label>
          <select id="s-type" className="cp-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Type: All</option>
            {Object.entries(TYPE_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="cp-sr" htmlFor="s-ref">Reference</label>
          <input id="s-ref" className="cp-input cp-grow" type="search" placeholder="Reference or description" value={refSearch} onChange={(e) => setRefSearch(e.target.value)} />
          <button type="submit" className="cp-btn">Apply dates</button>
        </form>
        <div className="cp-card" style={{ overflow: "hidden" }}>
          {loading && !data ? <Loading what="Loading statement" /> : rows.length === 0 ? (
            <Empty title="Nothing in this period">Try other dates.</Empty>
          ) : (
            <div className="cp-tbl-wrap">
              <table className="cp-tbl">
                <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Reference</th><th className="cp-num">Charges</th><th className="cp-num">Credits</th><th className="cp-num">Balance</th></tr></thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>{day(t.date)}</td>
                      <td>{t.description}</td>
                      <td><Chip tone={t.type === "charge" ? "mute" : t.type === "refund" ? "warn" : "ok"}>{TYPE_WORDS[t.type] ?? t.type}</Chip></td>
                      <td className="cp-mono cp-muted">{t.reference || "—"}</td>
                      <td className="cp-num">{t.type === "charge" ? money(t.amount) : ""}</td>
                      <td className="cp-num">{t.type !== "charge" ? money(t.amount) : ""}</td>
                      <td className="cp-num">{money(t.running_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="cp-note">Every payment and refund is its own row, and every order appears once.</p>
      </div>
    </>
  );
}
