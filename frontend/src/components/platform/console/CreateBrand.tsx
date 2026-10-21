"use client";

/**
 * Create brand (design screen 7), on one page: the brand, its plan and free
 * trial, and its owner. The shop it makes is the same as one that signs
 * itself up: a real plan, the free period, the owner's setup steps, and a
 * note to the platform inbox to add its address in Vercel.
 *
 * The owner's password is typed here and passed on, as the console always
 * did; the design's emailed invite is a new feature still waiting for a yes.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { platformService } from "@/services/platform.service";
import { consoleApi } from "./api";
import { PageHead, errorText, useLoad } from "./ui";

const ZONES = [
  ["America/New_York", "Eastern (New York)"], ["America/Chicago", "Central (Chicago)"],
  ["America/Denver", "Mountain (Denver)"], ["America/Phoenix", "Arizona (Phoenix)"],
  ["America/Los_Angeles", "Pacific (Los Angeles)"], ["America/Anchorage", "Alaska (Anchorage)"],
  ["Pacific/Honolulu", "Hawaii (Honolulu)"],
];

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

export function CreateBrand() {
  const router = useRouter();
  const { data } = useLoad(() => consoleApi.plans(), []);
  const plans = data?.plans ?? [];
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [zone, setZone] = useState("America/Chicago");
  const [plan, setPlan] = useState("starter");
  const [trialDays, setTrialDays] = useState(14);
  const [commission, setCommission] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = slugTouched ? slug : slugify(name);
  const chosen = plans.find((p) => p.key === plan);
  const bps = commission.trim() === "" ? null : Math.round(Number(commission) * 100);
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!name.trim()) out.push("the brand's name");
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(address)) out.push("a store address of 3 or more letters, numbers or hyphens");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) out.push("a contact email");
    if (!/^\S+@\S+\.\S+$/.test(ownerEmail.trim())) out.push("the owner's email");
    if (password.length < 8) out.push("an owner password of 8 characters or more");
    if (bps !== null && (Number.isNaN(bps) || bps < 0 || bps > 1000)) out.push("a commission between 0% and 10%");
    return out;
  }, [name, address, email, ownerEmail, password, bps]);

  async function create() {
    if (problems.length) {
      setError(`Still needed: ${problems.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await platformService.createTenant({
        slug: address, name: name.trim(), email: email.trim(), plan,
        admin_email: ownerEmail.trim(), admin_password: password,
        admin_first_name: first.trim() || "Owner", admin_last_name: last.trim(),
        trial_days: trialDays, commission_bps: bps, timezone: zone,
      });
      router.push(`/platform/brands/${r.slug}/ready`);
    } catch (e) {
      setError(errorText(e, "The brand could not be created."));
      setBusy(false);
    }
  }

  return (
    <div>
      <Link href="/platform" className="pc-back"><ArrowLeft size={16} /> Brands</Link>
      <PageHead eyebrow="Brands" title="Create brand" lede="One page: brand, plan and trial, owner. No second step, no leftover plan." />
      <div className="pc-cols" style={{ marginTop: 0 }}>
        <div className="pc-stack">
          <section className="pc-card">
            <div className="pc-card-head"><h2 className="pc-h2">Brand</h2></div>
            <div className="pc-panel-body">
              <div className="pc-form2">
                <div className="pc-wide"><label className="pc-label" htmlFor="cb-name">Brand name</label>
                  <input id="cb-name" className="pc-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><label className="pc-label" htmlFor="cb-slug">Store address</label>
                  <input id="cb-slug" className="pc-input pc-mono" value={address}
                    onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
                  <div className="pc-hint">Becomes the store URL: {address || "your-brand"}.printcopilot.co</div></div>
                <div><label className="pc-label" htmlFor="cb-email">Contact email</label>
                  <input id="cb-email" className="pc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><label className="pc-label" htmlFor="cb-zone">Time zone</label>
                  <select id="cb-zone" className="pc-input" value={zone} onChange={(e) => setZone(e.target.value)}>
                    {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                <div><span className="pc-label">Currency</span>
                  <div className="pc-input" style={{ display: "flex", alignItems: "center", color: "var(--pc-muted)" }}>US dollar (USD)</div></div>
              </div>
            </div>
          </section>

          <section className="pc-card">
            <div className="pc-card-head"><h2 className="pc-h2">Plan and trial</h2></div>
            <div className="pc-panel-body">
              <div className="pc-plan-cards">
                {plans.map((p) => (
                  <button key={p.key} type="button" className="pc-plan-card" data-on={plan === p.key ? "" : undefined} onClick={() => setPlan(p.key)}>
                    <span className="pc-plan-name">{p.name}</span>
                    <span className="pc-plan-price">{p.price_display}</span>
                    <span className="pc-plan-meta">{p.limits.orders_per_month === null ? "Unlimited" : p.limits.orders_per_month.toLocaleString()} orders,{" "}
                      {p.limits.staff_accounts === null ? "unlimited" : p.limits.staff_accounts} staff, {p.commission_display}</span>
                  </button>
                ))}
              </div>
              <div className="pc-form2">
                <div><label className="pc-label" htmlFor="cb-trial">Free trial (days)</label>
                  <input id="cb-trial" className="pc-input" type="number" min={0} max={365} value={trialDays}
                    onChange={(e) => setTrialDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} />
                  <div className="pc-hint">0 starts none.</div></div>
                <div><label className="pc-label" htmlFor="cb-commission">Commission override (%)</label>
                  <input id="cb-commission" className="pc-input" inputMode="decimal" value={commission}
                    placeholder={chosen ? chosen.commission_display.replace("%", "") : ""} onChange={(e) => setCommission(e.target.value)} />
                  <div className="pc-hint">Blank uses the plan rate.</div></div>
              </div>
            </div>
          </section>

          <section className="pc-card">
            <div className="pc-card-head"><h2 className="pc-h2">Owner</h2></div>
            <div className="pc-panel-body">
              <div className="pc-form2">
                <div><label className="pc-label" htmlFor="cb-first">First name</label>
                  <input id="cb-first" className="pc-input" value={first} onChange={(e) => setFirst(e.target.value)} /></div>
                <div><label className="pc-label" htmlFor="cb-last">Last name</label>
                  <input id="cb-last" className="pc-input" value={last} onChange={(e) => setLast(e.target.value)} /></div>
                <div><label className="pc-label" htmlFor="cb-owner">Owner email</label>
                  <input id="cb-owner" className="pc-input" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} /></div>
                <div><label className="pc-label" htmlFor="cb-pass">Owner password</label>
                  <input id="cb-pass" className="pc-input" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <div className="pc-hint">8 characters or more. Pass it on safely; they can change it in their admin.</div></div>
              </div>
            </div>
          </section>
        </div>

        <aside className="pc-panel">
          <div className="pc-panel-head"><div className="pc-h2">Summary</div></div>
          <div className="pc-panel-body">
            <div className="pc-kv"><span>Brand</span><b>{name.trim() || "—"}</b></div>
            <div className="pc-kv"><span>Plan</span><b>{chosen ? `${chosen.name}, ${chosen.price_display}` : plan}</b></div>
            <div className="pc-kv"><span>Trial</span><b>{trialDays ? `${trialDays} days` : "None"}</b></div>
            <div className="pc-kv"><span>Owner</span><b>{ownerEmail.trim() || "—"}</b></div>
            {error && <div className="pc-note" data-tone="red">{error}</div>}
            <button type="button" className="pc-btn" data-kind="primary" data-block="" disabled={busy} onClick={() => void create()}>
              {busy ? "Creating…" : "Create brand"}
            </button>
            <Link href="/platform" className="pc-btn" data-block="">Cancel</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
