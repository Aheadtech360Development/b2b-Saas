"use client";

/**
 * Plan and billing (design screen 3): the three plans, what changes on a
 * switch, the switch itself, the brand's billing and its Gang Sheet rate.
 *
 * A paying brand's switch is made in Stripe, in place and prorated, and the
 * plan follows from Stripe (backend BillingService.switch_plan). A brand that
 * pays nothing yet is simply moved; its card on file will start that plan.
 */
import { useState } from "react";
import { tell } from "@/lib/dialog";
import { apiClient } from "@/lib/api-client";
import { platformService } from "@/services/platform.service";
import { consoleApi, type PlanRow } from "../api";
import type { BrandTabProps } from "../BrandPage";
import { BillingPill, day, errorText, useLoad } from "../ui";

const WHOLESALE_TOOLS = "accounts and approval, tiers, matrix grid, Quick Buy, net terms, invoices";

function limit(n: number | null) {
  return n === null ? "Unlimited" : n.toLocaleString();
}

export function PlanTab({ brand, reload }: BrandTabProps) {
  const { data } = useLoad(() => consoleApi.plans(), []);
  const plans = data?.plans ?? [];
  const current = plans.find((p) => p.key === brand.plan);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = plans.find((p) => p.key === pick) ?? null;

  async function confirm(plan: PlanRow) {
    setBusy(true);
    try {
      const r = await platformService.updateTenant(brand.slug, { plan: plan.key });
      setPick(null);
      await reload();
      await tell(r.plan_billing === "switched"
        ? `${brand.name} is on ${plan.name}. Stripe now bills ${plan.price_display}, prorated from today.`
        : `${brand.name} is on ${plan.name}. Nothing is billed yet: the card on file will start this plan.`,
      { title: "Plan changed" });
    } catch (e) {
      await tell(errorText(e, "The plan could not be changed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pc-stack">
      <section className="pc-card">
        <div className="pc-card-head"><h2 className="pc-h2">Plan</h2>
          {!brand.plan_detail.known && <span className="pc-pill" data-tone="red" style={{ textTransform: "none" }}>
            On “{brand.plan}”, not a plan: treated as {brand.plan_detail.treated_as}</span>}
        </div>
        <div className="pc-panel-body">
          <div className="pc-plan-cards">
            {plans.map((p) => (
              <button key={p.key} type="button" className="pc-plan-card" data-on={pick === p.key ? "" : undefined}
                data-current={brand.plan === p.key ? "" : undefined}
                onClick={() => setPick(brand.plan === p.key ? null : p.key)}>
                <span className="pc-plan-name">{p.name}</span>
                <span className="pc-plan-price">{p.price_display}</span>
                <span className="pc-plan-meta">
                  {limit(p.limits.orders_per_month)} orders, {limit(p.limits.staff_accounts)} staff, {p.commission_display}
                </span>
              </button>
            ))}
          </div>

          {chosen && (
            <>
              <div className="pc-small-head" style={{ marginTop: 6 }}>What changes if you switch to {chosen.name}</div>
              <div className="pc-scroll-x">
                <table className="pc-table">
                  <thead><tr><th /><th>Now</th><th>After</th></tr></thead>
                  <tbody>
                    <Row label="Price" now={current?.price_display ?? brand.plan_detail.price_display} after={chosen.price_display} />
                    <Row label="Orders per month" now={current ? limit(current.limits.orders_per_month) : "—"} after={limit(chosen.limits.orders_per_month)} />
                    <Row label="Staff accounts" now={current ? limit(current.limits.staff_accounts) : "—"} after={limit(chosen.limits.staff_accounts)} />
                    <Row label="Gang Sheet commission"
                      now={brand.commission.display}
                      after={brand.commission.override_bps !== null ? `${brand.commission.display} (own rate stays)` : chosen.commission_display} />
                    <Row label="Wholesale tools"
                      now={current ? (current.features.includes("wholesale_accounts") ? "On" : "Off") : "—"}
                      after={chosen.features.includes("wholesale_accounts") ? `On: ${WHOLESALE_TOOLS}` : "Off"} />
                    <Row label="Buyer mobile app"
                      now={current ? (current.features.includes("mobile_app") ? "Included" : "Not included") : "—"}
                      after={chosen.features.includes("mobile_app") ? "Included" : "Not included"} />
                  </tbody>
                </table>
              </div>
              <div className="pc-note" data-tone="blue">
                {brand.paying
                  ? "Takes effect now. Stripe switches the subscription and prorates the difference on the next invoice."
                  : "Takes effect now. Nothing is billed yet; the card on file starts this plan."}
                {" "}Features the platform granted or removed for this brand stay as they are.
              </div>
              <div className="pc-row-actions">
                <button type="button" className="pc-btn" data-kind="primary" disabled={busy} onClick={() => void confirm(chosen)}>
                  {busy ? "Changing…" : "Confirm change"}
                </button>
                <button type="button" className="pc-btn" disabled={busy} onClick={() => setPick(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="pc-two">
        <Billing brand={brand} />
        <CommissionCard brand={brand} reload={reload} />
      </div>
    </div>
  );
}

function Row({ label, now, after }: { label: string; now: string; after: string }) {
  return <tr><td style={{ fontWeight: 600 }}>{label}</td><td>{now}</td><td style={{ color: now !== after ? "var(--pc-blue)" : undefined }}>{after}</td></tr>;
}

function Billing({ brand }: Pick<BrandTabProps, "brand">) {
  const [busy, setBusy] = useState(false);
  async function portal() {
    setBusy(true);
    try {
      const r = await apiClient.post<{ portal_url: string }>(`/api/v1/platform/tenants/${brand.slug}/billing/portal`);
      window.open(r.portal_url, "_blank", "noopener");
    } catch (e) {
      await tell(errorText(e, "Stripe's billing page could not be opened."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pc-card">
      <div className="pc-card-head"><h2 className="pc-h2">Billing</h2><BillingPill brand={brand} /></div>
      <div className="pc-panel-body">
        {brand.paying ? (
          <>
            <div className="pc-kv"><span>Current period ends</span><b>{day(brand.period_end) || "—"}</b></div>
            {brand.cancel_at_period_end && <div className="pc-note">Cancels at the end of the period.</div>}
          </>
        ) : (
          <div className="pc-hint">No Stripe subscription yet. The plan starts when the owner puts a card on file in Billing.</div>
        )}
        <button type="button" className="pc-btn" disabled={busy} onClick={() => void portal()}>
          {busy ? "Opening…" : "Open Stripe billing page"}
        </button>
        <div className="pc-hint">Stripe&apos;s own page for this brand: its card on file and its invoices.</div>
      </div>
    </section>
  );
}

function CommissionCard({ brand, reload }: Pick<BrandTabProps, "brand" | "reload">) {
  const c = brand.commission;
  const [value, setValue] = useState(c.override_bps !== null ? String(c.override_bps / 100) : "");
  const [busy, setBusy] = useState(false);
  async function save(bps: number | null) {
    setBusy(true);
    try {
      await platformService.setCommission(brand.slug, bps);
      await reload();
    } catch (e) {
      await tell(errorText(e, "The rate could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  const typed = value.trim() === "" ? null : Math.round(Number(value) * 100);
  const bad = typed !== null && (Number.isNaN(typed) || typed < 0 || typed > 1000);
  return (
    <section className="pc-card">
      <div className="pc-card-head"><h2 className="pc-h2">Gang Sheet commission</h2></div>
      <div className="pc-panel-body">
        <label className="pc-label" htmlFor="pc-commission">Override percent</label>
        <div className="pc-row-actions">
          <input id="pc-commission" className="pc-input" style={{ width: 120 }} inputMode="decimal" value={value}
            placeholder={`${(c.plan_bps / 100).toFixed(1)}`} onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="pc-btn" data-kind="primary" disabled={busy || bad} onClick={() => void save(typed)}>Save</button>
          {c.override_bps !== null && (
            <button type="button" className="pc-btn" disabled={busy} onClick={() => { setValue(""); void save(null); }}>Use plan rate</button>
          )}
        </div>
        <div className="pc-hint">
          {bad ? "Between 0% and 10%." : c.override_bps !== null
            ? `Charging ${c.display}, this brand's own rate. The plan's is ${(c.plan_bps / 100).toFixed(1)}%.`
            : `Charging ${c.display}, the plan rate. Leave blank to keep using it.`}
        </div>
      </div>
    </section>
  );
}
