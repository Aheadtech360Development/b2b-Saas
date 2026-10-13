"use client";

/**
 * Settings, Payments and billing: the shop's plan, how it is paid by its
 * customers, and money that went back.
 *
 * Nothing on this screen is typed in here: the plans, their prices, limits and
 * commission come from the platform's own plan list (core/billing_plans.py),
 * the payout state from the shop's Stripe account, disputes and refunds from
 * its orders. So a plan change on the platform shows here without an edit.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";
import { CashOnDeliveryPanel } from "@/components/admin/CashOnDeliveryPanel";

// ── Types ─────────────────────────────────────────────────────────────────────
type Plan = {
  key: string;
  name: string;
  price_display: string;
  commission_display?: string;
  features: string[];
  limits: Record<string, number | null>;
  description: string;
};
type BillingData = {
  plan: string;
  plan_name: string | null;
  tenant_status: string;
  subscription: {
    status: string;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  plans: Plan[];
  trial?: { ends_at: string | null; on_trial: boolean; expired: boolean } | null;
};
type SyncResult = { card_on_file?: { started: boolean; reason?: string; status?: string; message?: string; trial_end?: number | null } | null };
type ConnectData = {
  connected: boolean;
  account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  ready_to_accept_payments: boolean;
};
type Dispute = {
  stripe_dispute_id: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  evidence_due_by: string | null;
  order_number: string | null;
  created_at: string;
  // How it ended, and when the money actually left and came back.
  outcome?: string | null;
  closed_at?: string | null;
  funds_withdrawn_at?: string | null;
  funds_reinstated_at?: string | null;
};
type Refund = {
  refund_id: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  source: string;
  by: string | null;
  at: string | null;
  order_number?: string | null;
  failure_reason?: string | null;
};

const money = (n: number, c = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c.toUpperCase() }).format(n);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
const words = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ");
const limit = (n: number | null | undefined) => (n == null ? "Unlimited" : n.toLocaleString("en-US"));
/** "$97/mo" as it reads in a sentence. */
const aMonth = (p: { price_display: string }) => p.price_display.replace("/mo", " a month");

/** A message with its links clickable.
 *
 *  Stripe's messages often end in the page that fixes the problem —
 *  "activate your accounts at https://…" — and as plain text that is an
 *  address to retype by hand off a screen. Only http(s) links are made
 *  clickable, and trailing punctuation is left out of the href so a URL at
 *  the end of a sentence still opens.
 */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!/^https?:\/\//.test(part)) return <span key={i}>{part}</span>;
        const href = part.replace(/[.,;:)\]]+$/, "");
        const tail = part.slice(href.length);
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", fontWeight: 600 }}>{href}</a>
            {tail}
          </span>
        );
      })}
    </>
  );
}

/** What the server said went wrong, when it said anything worth reading.
 *
 *  Stripe's own messages name the setting to change — Connect not enabled on
 *  the live account, a platform profile left unfinished. Replacing them with
 *  "try again" sent people to retry something that would never start working.
 */
function reason(e: unknown, fallback: string): string {
  return e instanceof ApiClientError && e.message ? e.message : fallback;
}

const pill = (label: string, tone: string) => <span className="pc-pill" data-tone={tone || undefined} style={{ textTransform: "none" }}>{label}</span>;

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [connect, setConnect] = useState<ConnectData | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [refunds, setRefunds] = useState<{ items: Refund[]; total: number; refunded_total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, c, d, r] = await Promise.allSettled([
        apiClient.get<BillingData>("/api/v1/admin/billing"),
        apiClient.get<ConnectData>("/api/v1/admin/connect"),
        apiClient.get<Dispute[]>("/api/v1/admin/disputes"),
        apiClient.get<{ items: Refund[]; total: number; refunded_total: number }>("/api/v1/admin/refunds?page_size=50"),
      ]);
      if (b.status === "fulfilled") setBilling(b.value);
      if (c.status === "fulfilled") setConnect(c.value);
      if (d.status === "fulfilled") setDisputes(d.value || []);
      if (r.status === "fulfilled") setRefunds(r.value);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle Stripe redirects (?status=success|portal|cancelled|return|refresh) then load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    (async () => {
      if (status === "success") {
        // Webhook-independent fallback so the plan activates immediately.
        try { await apiClient.post("/api/v1/admin/billing/sync"); } catch { /* ignore */ }
        setToast({ type: "success", text: "Subscription active. Thank you!" });
      }
      else if (status === "portal") {
        // Back from Manage billing: a card put on file there starts the plan.
        try {
          const r = await apiClient.post<SyncResult>("/api/v1/admin/billing/sync");
          const c = r?.card_on_file;
          if (c?.started && c.trial_end) setToast({ type: "success", text: `Your card is on file. Your plan starts when the trial ends, on ${new Date(c.trial_end * 1000).toLocaleDateString()}, and is charged to it every month.` });
          else if (c?.started) setToast({ type: "success", text: "Your plan has started on your card. It is charged every month." });
          else if (c?.reason === "card_declined") setToast({ type: "error", text: `Your card was declined: ${c.message ?? "try another card"}. Choose a plan below to pay another way.` });
        } catch { /* ignore */ }
      }
      else if (status === "cancelled") setToast({ type: "info", text: "Checkout cancelled." });
      else if (status === "return") {
        // Back from Connect onboarding — pull the latest readiness from Stripe.
        try { await apiClient.post("/api/v1/admin/connect/refresh"); } catch { /* ignore */ }
        setToast({ type: "info", text: "Payout setup updated." });
      } else if (status === "refresh") {
        setToast({ type: "info", text: "Onboarding link expired. Click Set up payouts again." });
      }
      if (status) window.history.replaceState({}, "", "/admin/billing");
      await load();
    })();
  }, [load]);

  async function subscribe(plan: string) {
    setBusy(plan);
    try {
      const r = await apiClient.post<{ checkout_url?: string; switched?: boolean }>("/api/v1/admin/billing/checkout", { plan });
      if (r.switched) {
        // Plan changed in place (proration) — no redirect needed.
        setToast({ type: "success", text: "Your plan has been updated." });
        await load();
        setBusy(null);
        return;
      }
      if (r.checkout_url) { window.location.href = r.checkout_url; return; }
      setBusy(null);
    } catch (e) {
      // What the server actually said. "Try again" sent people round the same
      // loop when the answer was a missing key or the wrong Stripe mode —
      // neither of which trying again fixes.
      setToast({ type: "error", text: reason(e, "Could not start checkout. Try again.") });
      setBusy(null);
    }
  }
  async function openPortal() {
    setBusy("portal");
    try {
      const r = await apiClient.post<{ portal_url: string }>("/api/v1/admin/billing/portal");
      window.location.href = r.portal_url;
    } catch (e) {
      setToast({ type: "error", text: reason(e, "Could not open billing portal.") });
      setBusy(null);
    }
  }
  async function setupPayouts() {
    setBusy("connect");
    try {
      const r = await apiClient.post<{ onboarding_url: string }>("/api/v1/admin/connect/onboard");
      window.location.href = r.onboarding_url;
    } catch (e) {
      setToast({ type: "error", text: reason(e, "Could not reach the payment provider. Try again.") });
      setBusy(null);
    }
  }
  async function refreshStatus() {
    // Pull the latest readiness from Stripe — self-heal a stale status when the
    // account.updated webhook didn't reach us (e.g. local dev without the CLI).
    setBusy("refresh");
    try {
      await apiClient.post("/api/v1/admin/connect/refresh");
      await load();
      setToast({ type: "success", text: "Payout status updated." });
    } catch (e) {
      setToast({ type: "error", text: reason(e, "Could not refresh status. Try again.") });
    } finally {
      setBusy(null);
    }
  }
  async function openDashboard() {
    setBusy("dashboard");
    try {
      const r = await apiClient.post<{ dashboard_url: string }>("/api/v1/admin/connect/dashboard");
      window.open(r.dashboard_url, "_blank");
    } catch (e) {
      setToast({ type: "error", text: reason(e, "Could not open payouts dashboard.") });
    } finally {
      setBusy(null);
    }
  }

  const currentPlan = billing?.plan;
  const sub = billing?.subscription;
  // Active only when Stripe has a subscription for it: a status left on the
  // record with nothing in Stripe behind it showed a plan nobody was paying for.
  const subActive = !!sub?.stripe_subscription_id && (sub?.status === "active" || sub?.status === "trialing");
  const plans = billing?.plans ?? [];
  const mine = plans.find((p) => p.key === currentPlan);
  const planName = billing?.plan_name ?? mine?.name ?? currentPlan ?? "your plan";
  const trial = billing?.trial;

  /** Where the shop stands with its plan, in one sentence each. */
  function standing(): { text: string; tone: string } {
    if (subActive && sub?.status === "trialing" && trial?.ends_at)
      return { text: `${planName} starts when your trial ends, on ${day(trial.ends_at)}, charged to your card${mine ? ` at ${aMonth(mine)}` : ""}.`, tone: "blue" };
    if (subActive && sub?.cancel_at_period_end)
      return { text: `You are on ${planName}. It is set to cancel${sub.current_period_end ? ` on ${day(sub.current_period_end)}` : " at the end of the period"}.`, tone: "" };
    if (subActive)
      return { text: `You are on ${planName}.${sub?.current_period_end ? ` Your card is charged next on ${day(sub.current_period_end)}.` : ""}`, tone: "blue" };
    if (sub?.status === "past_due")
      return { text: "Your last payment failed. Update your card under Manage billing to keep your shop open.", tone: "red" };
    if (trial?.on_trial && trial.ends_at)
      return { text: `You are on ${planName}. Free trial ends ${day(trial.ends_at)}. Put a card on file under Manage billing and ${planName}${mine ? ` (${aMonth(mine)})` : ""} starts that day, or choose a plan above to start now.`, tone: "blue" };
    if (trial?.expired)
      return { text: "Your free trial has ended. Choose a plan to keep your shop open.", tone: "red" };
    return { text: "Choose a plan to unlock your storefront features.", tone: "" };
  }

  const rows: [string, (p: Plan) => ReactNode][] = [
    ["Price", (p) => p.price_display.replace("/", " /")],
    ["Orders a month", (p) => limit(p.limits?.orders_per_month)],
    ["Staff", (p) => limit(p.limits?.staff_accounts)],
    ["Custom domains", (p) => limit(p.limits?.custom_domains)],
    ["Gang Sheet commission", (p) => p.commission_display ?? ""],
    ["Wholesale accounts, tiers and net terms", (p) => (p.features.includes("wholesale_accounts") ? "Included" : "Not included")],
    ["Mobile app", (p) => (p.features.includes("mobile_app") ? "Included" : "Paid add-on")],
  ];
  const state = standing();

  return (
    <SettingsFrame active="billing" title="Payments and billing" sub="Your plan, your payouts and what changes between plans."
      actions={<button type="button" className="pc-btn" onClick={openPortal} disabled={busy === "portal" || loading}>{busy === "portal" ? "Opening…" : "Manage billing"}</button>}>
      {toast && (
        <div className="pc-flash" data-bad={toast.type === "error" ? "" : undefined} role="status">
          <span><Linkified text={toast.text} /></span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setToast(null)} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}

      {loading ? (
        <div className="pc-card" style={{ padding: "24px" }} aria-busy>{[70, 92, 58].map((w, i) => (<div key={i} className="at-skel" style={{ height: "16px", width: `${w}%`, marginBottom: "12px", borderRadius: "6px" }} />))}</div>
      ) : (
        <div style={{ display: "grid", gap: "18px" }} data-billing>
          {/* ── The plans, side by side, from the platform's own plan list ───── */}
          <section className="pc-card" data-card="plans">
            <div className="pc-card-head"><h2 className="pc-h2">Plans</h2>
              {subActive ? pill("Active", "green") : sub?.status === "past_due" ? pill("Payment failed", "red") : pill("No active plan", "")}</div>
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "620px" }}>
                <thead>
                  <tr>
                    <th />
                    {plans.map((p) => <th key={p.key} data-plan={p.key}>{p.name}{subActive && currentPlan === p.key ? <span style={{ marginLeft: "8px" }}>{pill("Current", "green")}</span> : null}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ fontWeight: 600 }}>{label}</td>
                      {plans.map((p) => <td key={p.key}>{value(p)}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <td />
                    {plans.map((p) => {
                      const isCurrent = subActive && currentPlan === p.key;
                      return (
                        <td key={p.key}>
                          {isCurrent
                            ? <span style={{ color: "var(--pc-muted)", fontSize: "13.5px" }}>Your plan</span>
                            : <button type="button" className="pc-btn" data-kind={subActive ? undefined : "primary"} disabled={busy === p.key} onClick={() => subscribe(p.key)} style={{ height: "38px" }}>
                                {busy === p.key ? "Redirecting…" : subActive ? `Switch to ${p.name}` : `Choose ${p.name}`}
                              </button>}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ padding: "14px 20px 18px" }}>
              <div className="pc-note" data-tone={state.tone || undefined} data-plan-standing>{state.text}</div>
            </div>
          </section>

          {/* ── Payouts (the shop's own Stripe account) ──────────────────────── */}
          <section className="pc-card" style={{ padding: "18px 20px" }} data-card="payouts">
            <h2 className="pc-h2">Payouts</h2>
            <p className="pc-sub-line" style={{ margin: "6px 0 12px" }}>Card payments from your customers land in your own account and are paid out to your bank. Payments are processed securely by Stripe.</p>
            {connect?.ready_to_accept_payments ? (
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                {pill("Active", "green")}
                {pill("Charges enabled", "green")}
                {connect.payouts_enabled ? pill("Payouts enabled", "green") : pill("Payouts pending", "amber")}
                <button type="button" className="pc-inline" onClick={openDashboard} disabled={busy === "dashboard"}>{busy === "dashboard" ? "Opening…" : "Open payouts dashboard"}</button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {connect?.connected ? pill("Setup incomplete", "amber") : pill("Not connected", "")}
                  <span className="pc-sub-line" style={{ fontSize: "13.5px" }}>
                    {connect?.connected
                      ? "You started setup but have not finished. Finish it to take card payments."
                      : "Connect a payment account so your store can take card payments. The money and the payouts are yours."}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" className="pc-btn" data-kind="primary" onClick={setupPayouts} disabled={busy === "connect"}>
                    {busy === "connect" ? "Redirecting…" : connect?.connected ? "Finish payment account setup" : "Connect payment account"}
                  </button>
                  {connect?.connected && (
                    <button type="button" className="pc-btn" onClick={refreshStatus} disabled={busy === "refresh"}>{busy === "refresh" ? "Checking…" : "Refresh status"}</button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Cash on delivery: a second way to be paid, if the shop wants it ─ */}
          <CashOnDeliveryPanel />

          {/* ── Disputes and refunds ─────────────────────────────────────────── */}
          <section className="pc-card" data-card="disputes">
            <div className="pc-card-head" style={{ display: "block" }}>
              <h2 className="pc-h2">Disputes and refunds</h2>
              <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>A dispute is a customer contesting a payment with their bank: answer from your payouts dashboard before the date shown, or the bank decides without your side. Refunds are issued from each order.</p>
            </div>
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "640px" }} data-table="disputes">
                <thead><tr><th>Dispute on order</th><th className="pc-num">Amount</th><th>Reason</th><th>Status</th><th>Answer by</th><th>Money</th></tr></thead>
                <tbody>
                  {disputes.length === 0 && <tr><td colSpan={6} className="pc-empty">No disputes.</td></tr>}
                  {disputes.map((d) => {
                    const end = d.outcome ?? d.status;
                    return (
                      <tr key={d.stripe_dispute_id}>
                        <td style={{ fontWeight: 600 }}>{d.order_number ?? "Not linked"}</td>
                        <td className="pc-num">{money(d.amount, d.currency)}</td>
                        <td>{words(d.reason)}</td>
                        <td>{pill(words(end), end === "won" ? "green" : end === "lost" ? "red" : end === "warning_closed" ? "" : "amber")}</td>
                        <td>{d.outcome ? "Closed" : d.evidence_due_by ? new Date(d.evidence_due_by).toLocaleDateString() : "No date"}</td>
                        <td>{d.funds_reinstated_at ? `Returned ${new Date(d.funds_reinstated_at).toLocaleDateString()}`
                          : d.funds_withdrawn_at ? `Withdrawn ${new Date(d.funds_withdrawn_at).toLocaleDateString()}` : "Not yet withdrawn"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pc-scroll-x" style={{ borderTop: "1px solid var(--pc-line)" }}>
              <table className="pc-table" style={{ minWidth: "640px" }} data-table="refunds">
                <thead><tr><th>Refund on order</th><th className="pc-num">Amount</th><th>Reason</th><th>Status</th><th>By</th><th>Date</th></tr></thead>
                <tbody>
                  {(!refunds || refunds.items.length === 0) && <tr><td colSpan={6} className="pc-empty">No refunds yet.</td></tr>}
                  {refunds?.items.map((r) => (
                    <tr key={r.refund_id}>
                      <td style={{ fontWeight: 600 }}>{r.order_number ? <a href={`/admin/orders/${r.order_number}`} className="pc-inline">{r.order_number}</a> : "Not linked"}</td>
                      <td className="pc-num">{money(r.amount, r.currency)}</td>
                      <td>{words(r.reason) || "None given"}</td>
                      <td>{pill(r.status, r.status === "succeeded" ? "green" : r.status === "failed" || r.status === "canceled" ? "red" : "amber")}</td>
                      <td>{r.by ?? (r.source === "stripe" ? "Payouts dashboard" : "Staff")}</td>
                      <td>{r.at ? new Date(r.at).toLocaleDateString() : "No date"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {refunds && refunds.total > 0 && (
              <div className="pc-table-foot"><span>{refunds.total} {refunds.total === 1 ? "refund" : "refunds"}</span><span>{money(refunds.refunded_total)} refunded in all</span></div>
            )}
          </section>
        </div>
      )}
    </SettingsFrame>
  );
}
