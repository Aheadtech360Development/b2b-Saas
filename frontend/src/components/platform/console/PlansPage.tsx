"use client";

/**
 * Plans and limits (design screen 10): the three plans side by side, as the
 * product defines them, and any brand on a key that is not a plan, with the
 * fix. Brands read their plan from here, never from their own settings.
 */
import { useState } from "react";
import { tell } from "@/lib/dialog";
import { platformService } from "@/services/platform.service";
import { consoleApi, type PlanRow } from "./api";
import { Failed, Loading, PageHead, errorText, useLoad } from "./ui";

function limit(n: number | null) {
  return n === null ? "Unlimited" : n.toLocaleString();
}

const ROWS: [string, (p: PlanRow) => string][] = [
  ["Price", (p) => p.price_display],
  ["Orders per month", (p) => limit(p.limits.orders_per_month)],
  ["Staff accounts", (p) => limit(p.limits.staff_accounts)],
  ["Custom domains", (p) => limit(p.limits.custom_domains)],
  ["Gang Sheet commission", (p) => p.commission_display],
  ["Free trial", () => "14 days"],
  ["Wholesale tools", (p) => (p.features.includes("wholesale_accounts") ? "On" : "Off")],
  ["Buyer mobile app", (p) => (p.features.includes("mobile_app") ? "Included" : "Not included")],
];

export function PlansPage() {
  const plans = useLoad(() => consoleApi.plans(), []);
  const brands = useLoad(() => consoleApi.brands(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const orphans = (brands.data?.items ?? []).filter((b) => !b.plan_detail.known);

  async function fix(slug: string) {
    setBusy(slug);
    try {
      await platformService.updateTenant(slug, { plan: "starter" });
      await brands.reload();
    } catch (e) {
      await tell(errorText(e, "The plan could not be changed."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHead eyebrow="Plans" title="Plans and limits" lede="Defined once, in the product. Brands read their plan from here, never from their own settings." />
      {orphans.length > 0 && (
        <div className="pc-note" data-tone="red" style={{ marginBottom: 18 }}>
          {orphans.map((b) => (
            <div key={b.slug} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span><b>{b.name}</b> is on “{b.plan}”, which is not a plan. It is treated as {b.plan_detail.treated_as}.</span>
              <button type="button" className="pc-btn" disabled={busy === b.slug} onClick={() => void fix(b.slug)}>
                {busy === b.slug ? "Moving…" : "Move to Starter"}
              </button>
            </div>
          ))}
        </div>
      )}
      {plans.error && <Failed message={plans.error} onRetry={plans.reload} />}
      {plans.loading && !plans.data ? <Loading what="Loading plans" /> : null}
      {plans.data && (
        <div className="pc-card pc-scroll-x">
          <table className="pc-table" style={{ minWidth: 640 }}>
            <thead><tr><th />{plans.data.plans.map((p) => <th key={p.key}>{p.name}</th>)}</tr></thead>
            <tbody>
              {ROWS.map(([label, get]) => (
                <tr key={label}><td style={{ fontWeight: 600 }}>{label}</td>{plans.data!.plans.map((p) => <td key={p.key}>{get(p)}</td>)}</tr>
              ))}
              <tr><td style={{ fontWeight: 600 }}>Brands on it</td>{plans.data.plans.map((p) => (
                <td key={p.key}>{(brands.data?.items ?? []).filter((b) => b.plan === p.key).length}</td>))}</tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="pc-hint" style={{ marginTop: 12 }}>
        Wholesale tools: accounts and approval, customer tiers, matrix grid, Quick Buy, net terms, invoices.
        Limits are stated on the pricing page and here; they are not enforced. Changing a price or a limit is a release, not a setting:
        the public pricing page, sign-up and Stripe follow the same definition. Each brand&apos;s own switches are on the brand&apos;s Features tab.
      </p>
    </div>
  );
}
