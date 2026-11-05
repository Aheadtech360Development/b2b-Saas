"use client";

/**
 * Plans and limits (design screen 10): the plans side by side, as the
 * product defines them, and any brand on a key that is not a plan, with the
 * fix. Brands read their plan from here, never from their own settings.
 *
 * Each plan's monthly price is set here (backend services/plan_prices). A new
 * price is what new sign-ups and plan changes pay, on the website's pricing
 * pages within a minute; brands already paying keep the price they started on.
 */
import { useState } from "react";
import { ask, tell } from "@/lib/dialog";
import { priceText } from "@/lib/planPrices";
import { platformService } from "@/services/platform.service";
import { consoleApi, type PlanRow } from "./api";
import { Failed, Loading, PageHead, errorText, useLoad } from "./ui";

function limit(n: number | null) {
  return n === null ? "Unlimited" : n.toLocaleString();
}

const MIN_CENTS = 100;          // $1, as the backend allows
const MAX_CENTS = 1_000_000;    // $10,000 a month

/** "97", or "97.50" when it has cents: the price as it is typed. */
function typedOf(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** What was typed, in cents; null when it is not a price. */
export function centsOf(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents >= MIN_CENTS && cents <= MAX_CENTS ? cents : null;
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
      {plans.data && <PricesCard plans={plans.data.plans} onSaved={plans.reload} />}
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
        Limits are stated on the pricing page and here; they are not enforced. Prices are set above; changing a limit is a release, not a setting.
        Each brand&apos;s own switches are on the brand&apos;s Features tab.
      </p>
    </div>
  );
}

function PricesCard({ plans, onSaved }: { plans: PlanRow[]; onSaved: () => Promise<void> | void }) {
  // Only what was typed over; every other box shows the price in force.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const textOf = (p: PlanRow) => typed[p.key] ?? typedOf(p.amount_cents);
  const bad = plans.filter((p) => centsOf(textOf(p)) === null);
  const changes = plans.flatMap((p) => {
    const cents = centsOf(textOf(p));
    return cents !== null && cents !== p.amount_cents ? [{ plan: p, cents }] : [];
  });

  async function save() {
    const lines = changes.map(({ plan, cents }) => `${plan.name}: ${priceText(plan.amount_cents)} to ${priceText(cents)} a month.`);
    const ok = await ask(
      `${lines.join(" ")} New sign-ups and plan changes pay the new price, and the website's pricing pages show it within a minute. ` +
      "Brands already paying keep the price they are on.",
      { title: "Change plan prices?", ok: "Change prices" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await consoleApi.setPlanPrices(Object.fromEntries(changes.map(({ plan, cents }) => [plan.key, cents])));
      setTyped({});
      await onSaved();
      const waiting = Object.entries(r.stripe).filter(([, s]) => s !== "ready")
        .map(([key]) => plans.find((p) => p.key === key)?.name ?? key);
      await tell(waiting.length
        ? `Saved. Stripe did not answer for ${waiting.join(", ")}: its new price is made there at the next sign-up or plan change.`
        : "Saved. Stripe has the new prices.", { title: "Prices changed" });
    } catch (e) {
      await tell(errorText(e, "The prices could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pc-card" style={{ marginBottom: 18 }}>
      <div className="pc-card-head"><h2 className="pc-h2">Monthly prices</h2></div>
      <div className="pc-panel-body">
        <div className="pc-row-actions" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          {plans.map((p) => {
            const wrong = centsOf(textOf(p)) === null;
            const fallback = p.default_amount_cents ?? null;
            return (
              <div key={p.key} style={{ display: "grid", gap: 4 }}>
                <label className="pc-label" htmlFor={`pc-price-${p.key}`}>{p.name}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span aria-hidden="true">$</span>
                  <input id={`pc-price-${p.key}`} className="pc-input" style={{ width: 110 }} inputMode="decimal"
                    value={textOf(p)} aria-invalid={wrong || undefined} disabled={busy}
                    onChange={(e) => setTyped((t) => ({ ...t, [p.key]: e.target.value }))} />
                </div>
                <span className="pc-hint" style={wrong ? { color: "var(--pc-red)" } : undefined}>
                  {wrong ? "Between $1 and $10,000"
                    : fallback !== null && fallback !== p.amount_cents ? `Default ${priceText(fallback)}` : "a month"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="pc-row-actions">
          <button type="button" className="pc-btn" data-kind="primary" disabled={busy || bad.length > 0 || changes.length === 0}
            onClick={() => void save()}>
            {busy ? "Saving…" : "Save prices"}
          </button>
          {Object.keys(typed).length > 0 && (
            <button type="button" className="pc-btn" disabled={busy} onClick={() => setTyped({})}>Undo</button>
          )}
        </div>
        <div className="pc-hint">
          New sign-ups and plan changes pay the price shown here, and the website&apos;s pricing pages follow it.
          Brands already paying keep the price they started on until they change plan.
        </div>
      </div>
    </section>
  );
}
