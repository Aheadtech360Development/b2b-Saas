"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { apiClient } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────
type Plan = {
  key: string;
  name: string;
  price_display: string;
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
};
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

function Badge({ tone, children }: { tone: "green" | "yellow" | "red" | "gray"; children: React.ReactNode }) {
  const map = {
    green: "bg-green-100 text-green-800",
    yellow: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-gray-100 text-gray-700",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[tone]}`}>{children}</span>;
}

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

  // Handle Stripe redirects (?status=success|cancelled|return|refresh) then load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    (async () => {
      if (status === "success") {
        // Webhook-independent fallback so the plan activates immediately.
        try { await apiClient.post("/api/v1/admin/billing/sync"); } catch { /* ignore */ }
        setToast({ type: "success", text: "Subscription active — thank you!" });
      }
      else if (status === "cancelled") setToast({ type: "info", text: "Checkout cancelled." });
      else if (status === "return") {
        // Back from Connect onboarding — pull the latest readiness from Stripe.
        try { await apiClient.post("/api/v1/admin/connect/refresh"); } catch { /* ignore */ }
        setToast({ type: "info", text: "Payout setup updated." });
      } else if (status === "refresh") {
        setToast({ type: "info", text: "Onboarding link expired — click Set up payouts again." });
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
      const msg = e instanceof ApiClientError && e.message
        ? e.message
        : "Could not start checkout. Try again.";
      setToast({ type: "error", text: msg });
      setBusy(null);
    }
  }
  async function openPortal() {
    setBusy("portal");
    try {
      const r = await apiClient.post<{ portal_url: string }>("/api/v1/admin/billing/portal");
      window.location.href = r.portal_url;
    } catch {
      setToast({ type: "error", text: "Could not open billing portal." });
      setBusy(null);
    }
  }
  async function setupPayouts() {
    setBusy("connect");
    try {
      const r = await apiClient.post<{ onboarding_url: string }>("/api/v1/admin/connect/onboard");
      window.location.href = r.onboarding_url;
    } catch {
      setToast({ type: "error", text: "Could not reach the payment provider. Try again." });
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
    } catch {
      setToast({ type: "error", text: "Could not refresh status. Try again." });
    } finally {
      setBusy(null);
    }
  }
  async function openDashboard() {
    setBusy("dashboard");
    try {
      const r = await apiClient.post<{ dashboard_url: string }>("/api/v1/admin/connect/dashboard");
      window.open(r.dashboard_url, "_blank");
    } catch {
      setToast({ type: "error", text: "Could not open payouts dashboard." });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div style={{ padding: "26px" }}>{[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}</div>;

  const currentPlan = billing?.plan;
  const subActive = billing?.subscription?.status === "active" || billing?.subscription?.status === "trialing";

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing &amp; Payouts</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your subscription and get paid by your customers.</p>
      </div>

      {toast && (
        <div className={`rounded-lg border p-3 text-sm ${
          toast.type === "success" ? "bg-green-50 border-green-200 text-green-800"
          : toast.type === "error" ? "bg-red-50 border-red-200 text-red-800"
          : "bg-blue-50 border-blue-200 text-blue-800"}`}>
          {toast.text}
        </div>
      )}

      {/* ── Payouts (Stripe Connect) ─────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Payment Account</h2>
            <p className="text-xs text-gray-500 mt-0.5">Accept card payments from your customers and get paid to your bank.</p>
          </div>
          {connect?.ready_to_accept_payments
            ? <Badge tone="green">Active</Badge>
            : connect?.connected
              ? <Badge tone="yellow">Setup incomplete</Badge>
              : <Badge tone="gray">Not connected</Badge>}
        </div>
        <div className="px-6 py-5">
          <p className="text-[11px] text-gray-400 mb-3">Payments are processed securely by Stripe.</p>
          {connect?.ready_to_accept_payments ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <span className="text-sm text-gray-700">✅ Charges enabled</span>
                <span className="text-sm text-gray-700">{connect.payouts_enabled ? "✅ Payouts enabled" : "⏳ Payouts pending"}</span>
              </div>
              <button onClick={openDashboard} disabled={busy === "dashboard"}
                className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                {busy === "dashboard" ? "Opening…" : "Open payouts dashboard →"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {connect?.connected
                  ? "You've started setup but haven't finished. Complete onboarding to start accepting payments."
                  : "Connect your payment account so your store can accept card payments. Money and payouts land directly with you."}
              </p>
              <div className="flex items-center gap-3">
                <button onClick={setupPayouts} disabled={busy === "connect"}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {busy === "connect" ? "Redirecting…" : connect?.connected ? "Finish payment account setup →" : "Connect payment account →"}
                </button>
                {connect?.connected && (
                  <button onClick={refreshStatus} disabled={busy === "refresh"}
                    className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {busy === "refresh" ? "Checking…" : "Refresh status"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Subscription (platform billing) ──────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Your Plan</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {subActive ? `Currently on ${billing?.plan_name ?? currentPlan}.` : "Choose a plan to unlock your storefront features."}
            </p>
          </div>
          {subActive
            ? <Badge tone="green">Active</Badge>
            : billing?.subscription?.status === "past_due"
              ? <Badge tone="red">Payment failed</Badge>
              : <Badge tone="gray">No active plan</Badge>}
        </div>

        <div className="px-6 py-6 grid gap-4 sm:grid-cols-3">
          {billing?.plans.map((p) => {
            const isCurrent = subActive && currentPlan === p.key;
            return (
              <div key={p.key} className={`rounded-xl border p-5 flex flex-col ${isCurrent ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  {isCurrent && <Badge tone="green">Current</Badge>}
                </div>
                <div className="mt-2 text-2xl font-bold text-gray-900">{p.price_display}</div>
                <p className="mt-1 text-xs text-gray-500">{p.description}</p>
                <ul className="mt-3 space-y-1 text-xs text-gray-600 flex-1">
                  {p.features.map((f) => (
                    <li key={f}>✓ {f.replace(/_/g, " ")}</li>
                  ))}
                </ul>
                <button
                  onClick={() => subscribe(p.key)}
                  disabled={isCurrent || busy === p.key}
                  className={`mt-4 px-4 py-2 rounded-lg text-sm font-medium ${
                    isCurrent ? "bg-gray-100 text-gray-400 cursor-default"
                    : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"}`}>
                  {isCurrent ? "Current plan" : busy === p.key ? "Redirecting…" : subActive ? "Switch to this" : "Subscribe"}
                </button>
              </div>
            );
          })}
        </div>

        {subActive && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {billing?.subscription?.cancel_at_period_end ? "Your plan will cancel at the end of the period." : "Manage your card or cancel anytime."}
            </span>
            <button onClick={openPortal} disabled={busy === "portal"}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          </div>
        )}
      </section>

      {/* ── Disputes / chargebacks ───────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Disputes &amp; Chargebacks</h2>
          <p className="text-xs text-gray-500 mt-0.5">When a customer disputes a payment with their bank. Respond from your payouts dashboard before the date shown, or the bank decides without your side.</p>
        </div>
        {disputes.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">No disputes. 🎉</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Order</th>
                  <th className="text-left px-6 py-3 font-medium">Amount</th>
                  <th className="text-left px-6 py-3 font-medium">Reason</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-left px-6 py-3 font-medium">Respond by</th>
                  <th className="text-left px-6 py-3 font-medium">Money</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {disputes.map((d) => (
                  <tr key={d.stripe_dispute_id}>
                    <td className="px-6 py-3 text-gray-900">{d.order_number ?? "—"}</td>
                    <td className="px-6 py-3">{money(d.amount, d.currency)}</td>
                    <td className="px-6 py-3 text-gray-600">{d.reason?.replace(/_/g, " ")}</td>
                    <td className="px-6 py-3">
                      <Badge tone={(d.outcome ?? d.status) === "won" ? "green" : (d.outcome ?? d.status) === "lost" ? "red" : (d.outcome ?? d.status) === "warning_closed" ? "gray" : "yellow"}>
                        {(d.outcome ?? d.status)?.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {d.outcome ? "—" : d.evidence_due_by ? new Date(d.evidence_due_by).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-600 text-xs">
                      {d.funds_reinstated_at
                        ? `Returned ${new Date(d.funds_reinstated_at).toLocaleDateString()}`
                        : d.funds_withdrawn_at
                          ? `Withdrawn ${new Date(d.funds_withdrawn_at).toLocaleDateString()}`
                          : "Not yet withdrawn"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Refunds ──────────────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Refunds</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Every refund on your orders — issued here or in your payouts dashboard.
            </p>
          </div>
          {refunds && refunds.total > 0 && (
            <span className="text-sm text-gray-700">{money(refunds.refunded_total)} refunded</span>
          )}
        </div>
        {!refunds || refunds.items.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">No refunds yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Order</th>
                  <th className="text-left px-6 py-3 font-medium">Amount</th>
                  <th className="text-left px-6 py-3 font-medium">Reason</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-left px-6 py-3 font-medium">By</th>
                  <th className="text-left px-6 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {refunds.items.map((r) => (
                  <tr key={r.refund_id}>
                    <td className="px-6 py-3 text-gray-900">
                      {r.order_number ? <a href={`/admin/orders/${r.order_number}`} className="underline">{r.order_number}</a> : "—"}
                    </td>
                    <td className="px-6 py-3">{money(r.amount, r.currency)}</td>
                    <td className="px-6 py-3 text-gray-600">{r.reason?.replace(/_/g, " ") ?? "—"}</td>
                    <td className="px-6 py-3">
                      <Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" || r.status === "canceled" ? "red" : "yellow"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{r.by ?? (r.source === "stripe" ? "Payouts dashboard" : "Staff")}</td>
                    <td className="px-6 py-3 text-gray-600">{r.at ? new Date(r.at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
