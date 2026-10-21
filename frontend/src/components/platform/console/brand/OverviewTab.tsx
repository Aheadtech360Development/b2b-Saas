"use client";

/**
 * A brand at a glance (design screen 2): its plan, this month's usage, the
 * free trial and what can be done with it, its health, its name and address,
 * and its owner's way in.
 */
import { useState } from "react";
import { ask, askText, tell } from "@/lib/dialog";
import { platformService } from "@/services/platform.service";
import type { BrandTabProps } from "../BrandPage";
import { BillingPill, HealthPill, ago, day, errorText, ofLimit } from "../ui";

export function OverviewTab({ brand, reload, go }: BrandTabProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState(14);

  async function run(key: string, act: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await act();
      await reload();
      if (done) await tell(done);
    } catch (e) {
      await tell(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function rename() {
    const name = await askText("The brand's new name. The shop's own name follows while it is still the same.", brand.name,
      { title: "Rename the brand", ok: "Rename" });
    if (name === null || !name.trim() || name.trim() === brand.name) return;
    await run("rename", () => platformService.updateTenant(brand.slug, { name: name.trim() }));
  }

  async function newPassword() {
    if (!(await ask(`Set a new password for ${brand.owner?.email ?? "the owner"}? Their old one stops working.`,
      { title: "Set a new password", ok: "Set a new password" }))) return;
    setBusy("password");
    try {
      const r = await platformService.setAdminPassword(brand.slug);
      await tell(`${r.email} now signs in with the password ${r.password}. It is shown once: pass it on safely, it cannot be looked up again.`,
        { title: "The owner's new sign-in" });
    } catch (e) {
      await tell(errorText(e, "The password could not be set."));
    } finally {
      setBusy(null);
    }
  }

  const t = brand.trial;
  const p = brand.plan_detail;
  const c = brand.commission;
  const slugName = brand.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    <div className="pc-two">
      <div className="pc-stack">
        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Plan</h2><button type="button" className="pc-link" onClick={() => go("plan")}>Change plan</button></div>
          <div className="pc-panel-body">
            <div className="pc-kv"><span>{p.known ? p.name : `${p.name} (not a plan)`}</span><b>{p.price_display}</b></div>
            <div className="pc-kv"><span>Billing</span><BillingPill brand={brand} /></div>
            <div className="pc-kv"><span>Gang Sheet Builder commission</span>
              <b>{c.display}{c.override_bps !== null ? " (own rate)" : ""}</b></div>
            {p.limits_display && <div className="pc-hint">{p.limits_display}</div>}
          </div>
        </section>

        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Usage this month</h2></div>
          <div className="pc-panel-body">
            <div className="pc-kv"><span>Orders</span><b>{ofLimit(brand.orders_month, brand.limits.orders_per_month)}</b></div>
            <div className="pc-kv"><span>Staff accounts</span><b>{ofLimit(brand.staff, brand.limits.staff_accounts)}</b></div>
            <div className="pc-hint">The plan&apos;s limits are stated, not enforced: nothing stops a brand going over them.</div>
          </div>
        </section>

        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Free trial</h2></div>
          <div className="pc-panel-body">
            {brand.paying ? (
              <div className="pc-note" data-tone="green">Paying through Stripe, so there is no trial to run.</div>
            ) : t.on_trial ? (
              <div className="pc-kv"><span>Ends {day(t.ends_at)}</span><b>{t.days_left} day{t.days_left === 1 ? "" : "s"} left</b></div>
            ) : t.expired ? (
              <div className="pc-note">The trial ended {day(t.ends_at)}. Nothing is switched off; the brand has no card on file.</div>
            ) : (
              <div className="pc-note" data-tone="blue">No trial is running.</div>
            )}
            <div className="pc-hint">The brand sees the countdown at the top of its console and gets an email on each of the last three days.</div>
            {!brand.paying && (
              <div className="pc-row-actions">
                <input className="pc-input" type="number" min={1} max={365} value={days} aria-label="Days"
                  onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} style={{ width: 90 }} />
                <button type="button" className="pc-btn" disabled={busy !== null}
                  onClick={() => void run("restart", () => platformService.setTrial(brand.slug, days))}>
                  {t.on_trial || t.expired ? "Restart from today" : "Start"}
                </button>
                {(t.on_trial || t.expired) && (
                  <button type="button" className="pc-btn" disabled={busy !== null}
                    onClick={() => void run("extend", () => platformService.setTrial(brand.slug, days, true))}>
                    Extend by {days} days
                  </button>
                )}
                {t.on_trial && (
                  <button type="button" className="pc-btn" data-kind="danger" disabled={busy !== null}
                    onClick={() => void (async () => {
                      if (await ask("End the free trial now? Nothing is switched off; the countdown goes away.", { ok: "End it" })) {
                        await run("end", () => platformService.setTrial(brand.slug, 0));
                      }
                    })()}>End it</button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="pc-stack">
        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Health</h2><HealthPill health={brand.health} /></div>
          <div className="pc-panel-body">
            <div className="pc-kv"><span>Products</span><b>{brand.products}</b></div>
            <div className="pc-kv"><span>Orders</span><b>{brand.orders}</b></div>
            <div className="pc-kv"><span>Users</span><b>{brand.users}</b></div>
            <div className="pc-kv"><span>Payments connected</span><b>{brand.payments_connected ? "Yes" : "Not yet"}</b></div>
            <div className="pc-hint">Last activity {ago(brand.last_activity)}.</div>
          </div>
        </section>

        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Identity</h2><button type="button" className="pc-link" onClick={() => void rename()} disabled={busy !== null}>Rename</button></div>
          <div className="pc-panel-body">
            <div className="pc-kv"><span>Brand name</span><b>{brand.name}</b></div>
            <div className="pc-kv"><span>Store address</span><b>{brand.slug}</b></div>
            {slugName !== brand.slug.replace(/-/g, "") && (
              <div className="pc-note">The brand is called {brand.name} but its store address is {brand.slug}. Rename it if that is a typo, or move the address under Domain.</div>
            )}
            <div className="pc-kv"><span>Contact email</span><b>{brand.email}</b></div>
          </div>
        </section>

        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Owner login</h2></div>
          <div className="pc-panel-body">
            {brand.owner ? (
              <>
                <div className="pc-kv"><span>{brand.owner.name || "Owner"}</span><b>{brand.owner.email}</b></div>
                <div className="pc-kv"><span>Last sign-in</span><b>{brand.owner.last_login ? ago(brand.owner.last_login) : "Never"}</b></div>
                <div className="pc-kv"><span>2-step sign-in</span><b>{brand.owner.two_factor ? "On" : "Off"}</b></div>
                <button type="button" className="pc-btn" disabled={busy !== null} onClick={() => void newPassword()}>
                  {busy === "password" ? "Setting…" : "Set a new password"}
                </button>
              </>
            ) : (
              <div className="pc-note">This brand has no active owner account.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
