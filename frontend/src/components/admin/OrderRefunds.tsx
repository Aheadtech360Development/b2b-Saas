"use client";

/**
 * Refunds and chargebacks on one order.
 *
 * Every refund is listed with who issued it and whether it was made here or in
 * Stripe, and the card says plainly how much is left to refund — which is what
 * the refund form offers, not the order total, so two partial refunds can
 * never add up to more than was paid.
 *
 * The form sends a request id generated once per opening of the form. The
 * server passes it to Stripe as the idempotency key, so a double click or a
 * retry after a timeout is one refund, not two.
 *
 * The button only appears for people allowed to use it (billing, with write);
 * the server refuses everyone else regardless.
 */
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { canWrite } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

export interface RefundRow {
  refund_id: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  source: "admin" | "stripe" | string;
  by: string | null;
  note: string | null;
  failure_reason: string | null;
  at: string | null;
}

export interface DisputeRow {
  stripe_dispute_id: string;
  amount: number | null;
  currency: string | null;
  reason: string | null;
  status: string | null;
  outcome: string | null;
  evidence_due_by: string | null;
  closed_at: string | null;
  funds_withdrawn_at: string | null;
  funds_reinstated_at: string | null;
  created_at: string | null;
}

const CARD: React.CSSProperties = {
  background: "#fff", border: "1px solid #ECECEC", borderRadius: "14px",
  padding: "20px 22px", marginBottom: "16px", boxShadow: "0 1px 2px rgba(0,0,0,.03)",
};
const HEAD: React.CSSProperties = {
  fontFamily: "var(--font-jakarta)", fontSize: "15px", fontWeight: 800,
  letterSpacing: "-0.01em", color: "#1A1A1A", margin: 0,
};
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #E3E3E3", borderRadius: "8px",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", boxSizing: "border-box", outline: "none",
};

const REASONS = [
  { value: "requested_by_customer", label: "Customer asked for it" },
  { value: "duplicate", label: "Charged twice" },
  { value: "fraudulent", label: "Fraudulent payment" },
];

const money = (n: number) => `$${n.toFixed(2)}`;

const OPEN = new Set(["needs_response", "warning_needs_response", "under_review", "warning_under_review"]);

function disputeWords(d: DisputeRow): { text: string; tone: string } {
  const status = d.outcome || d.status || "";
  if (status === "won") return { text: "Won — the money stays with you", tone: "#059669" };
  if (status === "lost") return { text: "Lost — the money went back to the customer", tone: "#E8242A" };
  if (status === "warning_closed") return { text: "Inquiry closed, no chargeback", tone: "#6B7280" };
  if (status.includes("needs_response")) return { text: "Needs your response", tone: "#D97706" };
  if (status.includes("under_review")) return { text: "Under review by the bank", tone: "#1A73E8" };
  return { text: status.replace(/_/g, " "), tone: "#6B7280" };
}

export function OrderRefunds({
  orderId, total, amountRefunded, remaining, refundable, refunds, disputes, onChanged,
}: {
  orderId: string;
  total: number;
  amountRefunded: number;
  /** What can still be refunded, from the server. Null when the order was not
   *  paid by card and so cannot be refunded here. */
  remaining: number | null;
  refundable: boolean;
  refunds: RefundRow[];
  disputes: DisputeRow[];
  onChanged: () => void | Promise<void>;
}) {
  const user = useAuthStore(s => s.user);
  const allowed = canWrite(user?.role, "billing", user?.scopes, user?.read_only);

  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("requested_by_customer");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const left = remaining ?? 0;
  const canRefund = refundable && left > 0;

  if (!refunds.length && !disputes.length && !canRefund) return null;

  function start() {
    setFull(true);
    setAmount(left.toFixed(2));
    setReason("requested_by_customer");
    setNote("");
    setError(null);
    // One id per opening of the form: every submit from this form is the same
    // refund as far as Stripe is concerned.
    setRequestId(typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setOpen(true);
  }

  const asked = full ? left : Number(amount);
  const valid = Number.isFinite(asked) && asked > 0 && asked <= left + 1e-9;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiClient.post<{ message: string; amount: number; remaining: number | null }>(
        `/api/v1/admin/orders/${orderId}/refund`,
        { amount: full ? null : Number(asked.toFixed(2)), reason, note: note || null, request_id: requestId },
      );
      setOpen(false);
      setDone(`${r.message}: ${money(r.amount)}${r.remaining != null ? ` · ${money(r.remaining)} left` : ""}`);
      await onChanged();
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail || err?.message || "The refund could not be issued.");
    }
    setBusy(false);
  }

  const openDisputes = disputes.filter(d => OPEN.has(d.status ?? "") && !d.outcome);

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
        <div>
          <h3 style={HEAD}>Refunds</h3>
          <div style={{ fontSize: "12.5px", color: "#7A7880", marginTop: "3px" }}>
            {money(amountRefunded)} of {money(total)} refunded
            {remaining != null && <> · <strong style={{ color: "#1A1A1A" }}>{money(left)}</strong> left to refund</>}
          </div>
        </div>
        {canRefund && allowed && (
          <button onClick={start}
            style={{ background: "#fff", color: "#E8242A", border: "1px solid #FECACA", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-jakarta)" }}>
            Refund
          </button>
        )}
      </div>

      {/* A chargeback in progress is the most urgent thing on the card. */}
      {openDisputes.map(d => (
        <div key={d.stripe_dispute_id} style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.3)", borderRadius: "10px", padding: "11px 13px", marginBottom: "10px", fontSize: "12.5px", color: "#92400E", lineHeight: 1.55 }}>
          <strong>The customer disputed {d.amount != null ? money(d.amount) : "this payment"} with their bank</strong>
          {d.reason && <> ({d.reason.replace(/_/g, " ")})</>}.
          {d.evidence_due_by && <> Respond by <strong>{new Date(d.evidence_due_by).toLocaleDateString()}</strong> from your payouts dashboard, or the bank decides without your side.</>}
        </div>
      ))}

      {done && <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#059669", marginBottom: "10px" }}>{done}</div>}

      {refunds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {refunds.map(r => {
            const failed = r.status === "failed" || r.status === "canceled";
            return (
              <div key={r.refund_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", border: "1px solid #F1F1F1", borderRadius: "9px", padding: "9px 12px", opacity: failed ? .7 : 1 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: failed ? "#E8242A" : "#2A2830", textDecoration: failed ? "line-through" : "none" }}>
                    {money(r.amount)}
                    <span style={{ fontWeight: 500, color: "#7A7880", marginLeft: "6px" }}>
                      {r.reason ? r.reason.replace(/_/g, " ") : "no reason given"}
                    </span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#9CA3AF", marginTop: "2px" }}>
                    {r.at ? new Date(r.at).toLocaleString() : ""}
                    {" · "}{r.by ?? (r.source === "stripe" ? "made in your payouts dashboard" : "staff")}
                    {r.note && <> · “{r.note}”</>}
                  </div>
                  {failed && r.failure_reason && (
                    <div style={{ fontSize: "11.5px", color: "#E8242A", marginTop: "2px" }}>
                      Failed: {r.failure_reason.replace(/_/g, " ")} — the money did not go back.
                    </div>
                  )}
                </div>
                <span style={{
                  padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, flexShrink: 0,
                  background: failed ? "rgba(232,36,42,.08)" : r.status === "succeeded" ? "rgba(5,150,105,.1)" : "rgba(217,119,6,.1)",
                  color: failed ? "#E8242A" : r.status === "succeeded" ? "#059669" : "#D97706",
                }}>
                  {r.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Closed chargebacks, for the record */}
      {disputes.filter(d => !openDisputes.includes(d)).map(d => {
        const w = disputeWords(d);
        return (
          <div key={d.stripe_dispute_id} style={{ fontSize: "12.5px", color: "#4A4850", borderTop: "1px solid #F4F4F4", paddingTop: "9px", marginTop: "9px" }}>
            Chargeback of {d.amount != null ? money(d.amount) : "the payment"}: <strong style={{ color: w.tone }}>{w.text}</strong>
          </div>
        );
      })}

      {open && (
        <div onClick={() => !busy && setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px", width: "440px", maxWidth: "100%", padding: "24px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", fontFamily: "var(--font-jakarta)" }}>
            <h3 style={{ ...HEAD, fontSize: "18px", marginBottom: "4px" }}>Refund this order</h3>
            <p style={{ fontSize: "12.5px", color: "#7A7880", margin: "0 0 16px" }}>
              {money(left)} can still be refunded. The money goes back to the card the customer paid with.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
              {([[true, `Everything left (${money(left)})`], [false, "Part of it"]] as const).map(([value, label]) => (
                <button key={String(value)} type="button" onClick={() => setFull(value)}
                  style={{ padding: "10px", borderRadius: "9px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                           border: full === value ? "1.5px solid #1A1A1A" : "1px solid #E3E3E3",
                           background: full === value ? "#FAFAFA" : "#fff", color: "#1A1A1A" }}>
                  {label}
                </button>
              ))}
            </div>

            {!full && (
              <label style={{ display: "block", marginBottom: "14px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#4A4850" }}>Amount</span>
                <div style={{ display: "flex", alignItems: "center", border: "1px solid #E3E3E3", borderRadius: "8px", marginTop: "5px" }}>
                  <span style={{ padding: "0 4px 0 12px", color: "#9CA3AF" }}>$</span>
                  <input type="number" step="0.01" min="0.01" max={left} value={amount}
                    onChange={e => setAmount(e.target.value)}
                    style={{ ...INPUT, border: "none", paddingLeft: "2px" }} autoFocus />
                </div>
                {!valid && amount !== "" && (
                  <span style={{ fontSize: "11.5px", color: "#E8242A" }}>Between $0.01 and {money(left)}.</span>
                )}
              </label>
            )}

            <label style={{ display: "block", marginBottom: "14px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#4A4850" }}>Why</span>
              <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...INPUT, marginTop: "5px", background: "#fff" }}>
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>

            <label style={{ display: "block", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#4A4850" }}>Note for your records (optional)</span>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Wrong size sent"
                style={{ ...INPUT, marginTop: "5px" }} />
            </label>

            {error && (
              <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid #FECACA", borderRadius: "8px", padding: "9px 12px", fontSize: "12.5px", color: "#B91C1C", marginBottom: "14px" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button onClick={() => setOpen(false)} disabled={busy}
                style={{ padding: "9px 16px", border: "1px solid #E3E3E3", background: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={submit} disabled={busy || !valid}
                style={{ padding: "9px 18px", border: "none", background: "#E8242A", color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: busy || !valid ? "not-allowed" : "pointer", opacity: busy || !valid ? .6 : 1 }}>
                {busy ? "Refunding…" : `Refund ${valid ? money(asked) : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
