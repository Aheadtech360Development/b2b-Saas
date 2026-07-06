"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { accountService } from "@/services/account.service";

interface QBInvoice {
  id: string;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  total_amt: number;
  balance: number;
  status: "open" | "partial" | "paid";
  email_status: string | null;
  customer_memo: string | null;
}

const STATUS_STYLE: Record<QBInvoice["status"], { bg: string; color: string; label: string }> = {
  paid:    { bg: "#DCFCE7", color: "#15803D", label: "Paid" },
  partial: { bg: "#FEF9C3", color: "#A16207", label: "Partial" },
  open:    { bg: "#FEE2E2", color: "#B91C1C", label: "Unpaid" },
};

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function money(n: number) {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function InvoicesPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasLoaded = useRef(false);
  const [invoices, setInvoices] = useState<QBInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    accountService.getInvoices()
      .then((data) => setInvoices((data as QBInvoice[]) ?? []))
      .catch(() => setError("Failed to load invoices."))
      .finally(() => setLoading(false));
  }, [isLoading]);

  const totalOutstanding = invoices
    .filter((inv) => inv.status !== "paid")
    .reduce((sum, inv) => sum + inv.balance, 0);

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 }}>
          Invoices
        </h1>
        <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>
          Invoices synced from QuickBooks
        </p>
      </div>

      {/* Summary strip */}
      {!loading && invoices.length > 0 && (
        <div style={{
          display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap",
        }}>
          <div style={{
            background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "8px",
            padding: "14px 20px", minWidth: "160px",
          }}>
            <div style={{ fontSize: "11px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
              Total Invoices
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827", marginTop: "4px" }}>
              {invoices.length}
            </div>
          </div>
          <div style={{
            background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "8px",
            padding: "14px 20px", minWidth: "160px",
          }}>
            <div style={{ fontSize: "11px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
              Outstanding Balance
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: totalOutstanding > 0 ? "#B91C1C" : "#15803D", marginTop: "4px" }}>
              {money(totalOutstanding)}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: "#9CA3AF", fontSize: "14px" }}>
          Loading invoices…
        </div>
      ) : error ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#DC2626", fontSize: "14px" }}>
          {error}
        </div>
      ) : invoices.length === 0 ? (
        <div style={{
          padding: "60px 0", textAlign: "center", color: "#9CA3AF", fontSize: "14px",
          border: "1px solid #E5E7EB", borderRadius: "8px", background: "#F9FAFB",
        }}>
          No invoices found.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Invoice #</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Date</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Due Date</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Amount</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Balance</th>
                <th style={{ textAlign: "center", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => {
                const st = STATUS_STYLE[inv.status] ?? STATUS_STYLE.open;
                return (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom: i < invoices.length - 1 ? "1px solid #F3F4F6" : "none",
                      background: i % 2 === 0 ? "#fff" : "#FAFAFA",
                    }}
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#111827", fontFamily: "monospace" }}>
                      {inv.doc_number ?? inv.id}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#374151" }}>{fmt(inv.txn_date)}</td>
                    <td style={{ padding: "12px 16px", color: "#374151" }}>{fmt(inv.due_date)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#111827", fontWeight: 500 }}>
                      {money(inv.total_amt)}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: inv.balance > 0 ? "#B91C1C" : "#15803D" }}>
                      {money(inv.balance)}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: st.bg,
                        color: st.color,
                      }}>
                        {st.label}
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
  );
}
