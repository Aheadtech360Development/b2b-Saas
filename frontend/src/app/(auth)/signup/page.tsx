"use client";

/**
 * Sign a shop up.
 *
 * Two steps and then you are inside it: pick a plan, give your details, and
 * the shop exists at its own address with you signed into its admin. No trial
 * and no waiting for anyone to approve you — the card is the next screen.
 *
 * The same sober look as the platform's page: this is the first thing a
 * customer of ours touches, and it should look like the product, not like a
 * form bolted onto it.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { PasswordField } from "@/components/ui/PasswordField";

interface Plan {
  key: string;
  name: string;
  price_display: string;
  commission_display: string;
  description: string;
  highlights: string[];
  limits_display: string;
}

interface SignupOut {
  slug: string;
  access_token: string;
  next: string;
}

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost";

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

export default function SignupPage() {
  const params = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plan, setPlan] = useState(params.get("plan") ?? "");
  const [step, setStep] = useState<1 | 2>(params.get("plan") ? 2 : 1);

  const [form, setForm] = useState({
    shop_name: "", slug: "", first_name: "", last_name: "", email: "", password: "", phone: "",
  });
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [checking, setChecking] = useState(false);
  const [slugFree, setSlugFree] = useState<null | { available: boolean; reason: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ plans: Plan[] }>("/api/v1/signup/plans", { skipAuth: true })
      .then((r) => setPlans(r.plans ?? []))
      .catch(() => setError("Couldn't load the plans. Please refresh."));
  }, []);

  // The address follows the shop's name until somebody edits it themselves.
  const address = useMemo(
    () => (touchedSlug ? slugify(form.slug) : slugify(form.shop_name)),
    [touchedSlug, form.slug, form.shop_name],
  );

  useEffect(() => {
    if (!address || address.length < 3) { setSlugFree(null); return; }
    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(() => {
      apiClient.get<{ available: boolean; reason: string }>(
        `/api/v1/signup/availability?slug=${encodeURIComponent(address)}`, { skipAuth: true },
      )
        .then((r) => { if (!cancelled) setSlugFree(r); })
        .catch(() => { if (!cancelled) setSlugFree(null); })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); setChecking(false); window.clearTimeout(timer); };
  }, [address]);

  const chosen = plans.find((p) => p.key === plan) ?? null;
  const weak = form.password.length > 0 && form.password.length < 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await apiClient.post<SignupOut>("/api/v1/signup", {
        plan,
        shop_name: form.shop_name.trim(),
        slug: address,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
      }, { skipAuth: true });

      // Straight into their own shop, already signed in. The token is handed
      // over in the fragment — the same way the platform console enters a
      // brand — because the shop is on a different host and a token in the
      // query string ends up in logs.
      const handover = `#session=${encodeURIComponent(out.access_token)}`;
      const onPlatformDomain = PLATFORM_DOMAIN !== "localhost"
        && window.location.hostname.endsWith(PLATFORM_DOMAIN);
      window.location.href = onPlatformDomain
        ? `${window.location.protocol}//${out.slug}.${PLATFORM_DOMAIN}${out.next}${handover}`
        : `${window.location.origin}${out.next}?tenant=${out.slug}${handover}`;
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.message
          ? err.message
          : "Couldn't create your shop. Please try again.",
      );
      setBusy(false);
    }
  }

  const canSubmit =
    plan && form.shop_name.trim().length > 1 && form.first_name.trim() &&
    form.email.trim() && form.password.length >= 8 && slugFree?.available === true && !busy;

  return (
    <>
      <style>{CSS}</style>
      <div className="su">
        <header className="su-top">
          <Link href="/" className="su-logo"><span className="su-mark" aria-hidden />PrintCopilot</Link>
          <span className="su-top-right">
            Already have a shop? <Link href="/login">Sign in</Link>
          </span>
        </header>

        {step === 1 && (
          <main className="su-wrap">
            <h1>Choose your plan</h1>
            <p className="su-lede">
              A flat monthly plan, plus a percentage on Gang Sheet Builder orders only.
              Change tier whenever your volume does.
            </p>
            <div className="su-plans">
              {plans.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { setPlan(p.key); setStep(2); }}
                  className={`su-plan${plan === p.key ? " su-plan-on" : ""}`}
                >
                  <span className="su-plan-name">{p.name}</span>
                  <span className="su-plan-price">{p.price_display}</span>
                  <span className="su-plan-rate">{p.commission_display} on Gang Sheet Builder orders</span>
                  <span className="su-plan-desc">{p.description}</span>
                  <ul>
                    {p.highlights.slice(0, 4).map((h) => <li key={h}>{h}</li>)}
                  </ul>
                  <span className="su-plan-limits">{p.limits_display}</span>
                  <span className="su-plan-go">Choose {p.name} →</span>
                </button>
              ))}
            </div>
            {!plans.length && !error && <p className="su-lede">Loading plans…</p>}
            {error && <p className="su-error">{error}</p>}
          </main>
        )}

        {step === 2 && (
          <main className="su-wrap su-narrow">
            <button type="button" className="su-back" onClick={() => setStep(1)}>← Plans</button>
            <h1>Create your shop</h1>
            {chosen && (
              <p className="su-lede">
                <strong>{chosen.name}</strong> — {chosen.price_display}, {chosen.commission_display} on
                Gang Sheet Builder orders. No card needed now — you add it from Billing
                when you are ready.
              </p>
            )}

            <form onSubmit={submit} className="su-form">
              <label>Shop name
                <input value={form.shop_name} required autoFocus autoComplete="organization"
                  placeholder="Interflow Printing"
                  onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
              </label>

              <label>Shop address
                <span className="su-addr">
                  <input value={address}
                    onChange={(e) => { setTouchedSlug(true); setForm({ ...form, slug: e.target.value }); }} />
                  <span className="su-addr-suffix">.{PLATFORM_DOMAIN}</span>
                </span>
                <span className={`su-hint${slugFree && !slugFree.available ? " su-hint-bad" : ""}`}>
                  {checking ? "Checking…"
                    : slugFree?.available ? "Available"
                    : slugFree ? slugFree.reason
                    : "You can connect your own domain later."}
                </span>
              </label>

              <div className="su-row">
                <label>First name
                  <input value={form.first_name} required autoComplete="given-name"
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </label>
                <label>Last name
                  <input value={form.last_name} autoComplete="family-name"
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </label>
              </div>

              <label>Email
                <input type="email" value={form.email} required autoComplete="email"
                  placeholder="you@yourshop.com"
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <span className="su-hint">Where we send your shop&apos;s details. This is your sign-in too.</span>
              </label>

              <label>Phone <span className="su-opt">(optional)</span>
                <input type="tel" value={form.phone} autoComplete="tel"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>

              <label>Password
                <PasswordField wrapperClassName="su-pw" value={form.password} required
                  minLength={8} autoComplete="new-password"
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <span className={`su-hint${weak ? " su-hint-bad" : ""}`}>
                  {weak ? "A little longer — 8 characters at least."
                        : "This is how you sign in. Keep it somewhere safe."}
                </span>
              </label>

              {error && <p className="su-error">{error}</p>}

              <button type="submit" disabled={!canSubmit} className="su-submit">
                {busy ? "Creating your shop…" : "Create my shop"}
              </button>
              <p className="su-fine">
                By creating a shop you agree to our <Link href="/policies/terms">Terms</Link> and{" "}
                <Link href="/policies/privacy">Privacy Policy</Link>.
              </p>
            </form>
          </main>
        )}
      </div>
    </>
  );
}

const CSS = `
.su{--ink:#111318;--muted:#5A5F68;--paper:#FAFAF9;--line:#E7E5E2;--brass:#B8912B;--bad:#B42318;--ok:#16A34A;
  min-height:100vh;background:var(--paper);color:var(--ink);font-family:"DM Sans",system-ui,sans-serif;}
.su *{box-sizing:border-box;}
.su-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px;
  border-bottom:1px solid var(--line);background:#fff;flex-wrap:wrap;}
.su-logo{display:flex;align-items:center;gap:9px;font-weight:700;font-size:17px;color:var(--ink);text-decoration:none;letter-spacing:-.02em;}
.su-mark{width:21px;height:21px;border-radius:5px;background:var(--ink);display:block;}
.su-top-right{font-size:14px;color:var(--muted);}
.su-top-right a{color:var(--ink);font-weight:600;}
.su-wrap{max-width:1000px;margin:0 auto;padding:48px 24px 72px;}
.su-narrow{max-width:520px;}
.su h1{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0 0 10px;}
.su-lede{color:var(--muted);font-size:15.5px;margin:0 0 30px;line-height:1.65;}
.su-back{background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;padding:0 0 14px;font-family:inherit;}

.su-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start;}
.su-plan{text-align:left;display:flex;flex-direction:column;gap:5px;background:#fff;border:1px solid var(--line);
  border-radius:14px;padding:22px 20px;cursor:pointer;font-family:inherit;color:inherit;}
.su-plan:hover{border-color:var(--ink);}
.su-plan-on{border:1.5px solid var(--brass);}
.su-plan-name{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);}
.su-plan-price{font-size:32px;font-weight:600;letter-spacing:-.02em;font-family:"IBM Plex Mono",monospace;}
.su-plan-rate{font-size:13px;color:var(--muted);}
.su-plan-desc{font-size:14px;color:var(--muted);margin:8px 0 2px;}
.su-plan ul{list-style:none;padding:0;margin:10px 0 0;border-top:1px solid var(--line);padding-top:12px;}
.su-plan li{font-size:13.5px;color:var(--muted);padding-left:19px;position:relative;margin-bottom:7px;line-height:1.5;}
.su-plan li::before{content:"✓";position:absolute;left:0;color:var(--ok);font-weight:700;}
.su-plan-limits{font-size:12.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:11px;margin-top:6px;}
.su-plan-go{font-size:14px;font-weight:700;margin-top:12px;}

.su-form{display:flex;flex-direction:column;gap:16px;}
.su-form label{display:flex;flex-direction:column;gap:6px;font-size:13.5px;font-weight:700;}
.su-form input{padding:11px 13px;font-size:15px;border:1px solid var(--line);border-radius:9px;background:#fff;
  font-family:inherit;color:inherit;font-weight:400;width:100%;}
.su-pw button:hover{background:#F1EFEB;color:var(--ink);}
.su-form input:focus{outline:2px solid var(--ink);outline-offset:-1px;}
.su-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.su-opt{font-weight:400;color:var(--muted);}
.su-addr{display:flex;align-items:stretch;}
.su-addr input{border-radius:9px 0 0 9px;flex:1;min-width:0;}
.su-addr-suffix{display:flex;align-items:center;padding:0 12px;font-size:14px;color:var(--muted);
  border:1px solid var(--line);border-left:0;border-radius:0 9px 9px 0;background:#F4F3F0;white-space:nowrap;font-weight:400;}
.su-hint{font-size:12.5px;color:var(--muted);font-weight:400;}
.su-hint-bad{color:var(--bad);}
.su-error{color:var(--bad);font-size:14px;margin:0;}
.su-submit{margin-top:6px;padding:14px;border:none;border-radius:9px;background:var(--ink);color:#fff;
  font-size:15.5px;font-weight:700;cursor:pointer;font-family:inherit;}
.su-submit:disabled{background:#C9C6C0;cursor:default;}
.su-fine{font-size:12.5px;color:var(--muted);margin:0;line-height:1.6;}
.su-fine a{color:var(--ink);}

@media (max-width:860px){
  .su-plans{grid-template-columns:1fr;}
  .su-row{grid-template-columns:1fr;}
  .su h1{font-size:25px;}
}
`;
