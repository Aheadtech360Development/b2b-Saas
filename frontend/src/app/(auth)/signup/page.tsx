"use client";

/**
 * Sign a shop up.
 *
 * Two steps and then you are inside it: pick a plan, give your details, and
 * the shop exists at its own address with you signed into its admin. No
 * waiting for anyone to approve you, and no card at this step.
 *
 * Drawn in the marketing site's look (the design's Trial page): the auth
 * layout puts it in the site's frame on the platform's address, and this page
 * draws the plan cards and the form. What it does is unchanged.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { PasswordField } from "@/components/ui/PasswordField";
import { ReferralCapture, readReferralCookie } from "@/components/partners/ReferralCapture";
import TrialSidePanel from "@/components/marketing/TrialSidePanel";

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
    shop_name: "", slug: "", first_name: "", last_name: "", password: "", phone: "",
    // Typed into a "Start free trial" box on the marketing site, and carried here as ?email=.
    email: params.get("email") ?? "",
  });
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [checking, setChecking] = useState(false);
  const [slugFree, setSlugFree] = useState<null | { available: boolean; reason: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A partner's link leaves a cookie, and a valid click wins; without one, the
  // owner can type the partner's code (services/partners/referrals.py). The
  // field shows either way and a typed code goes with the cookie: a cookie can
  // outlive its click (the window was shortened), and then the code decides.
  const [refCookie, setRefCookie] = useState<string | null>(null);
  const [refCode, setRefCode] = useState("");
  const [refOk, setRefOk] = useState<null | boolean>(null);

  useEffect(() => {
    setRefCookie(readReferralCookie());
  }, []);

  useEffect(() => {
    const code = refCode.trim();
    if (!code) { setRefOk(null); return; }
    const t = window.setTimeout(() => {
      apiClient.get<{ valid: boolean }>(`/api/v1/partners/codes/${encodeURIComponent(code)}`, { skipAuth: true })
        .then((r) => setRefOk(r.valid)).catch(() => setRefOk(null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [refCode]);

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
        referral_cookie: refCookie,
        referral_code: refCode.trim() || null,
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
      <ReferralCapture onCaptured={setRefCookie} />
      <div className="su">
        {step === 1 && (
          <section className="su-wrap">
            <p className="su-eyebrow">Free trial · 14 days on every plan</p>
            <h1>Choose your plan</h1>
            <p className="su-lede">
              A flat monthly plan, plus a percentage on Gang Sheet Builder orders only.
              Change tier whenever your volume does.
            </p>
            <div className="su-plans">
              {plans.map((p) => {
                const [amount, per] = p.price_display.split("/");
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => { setPlan(p.key); setStep(2); }}
                    className={`su-plan${p.key === "wholesale" ? " su-plan-pop" : ""}${plan === p.key ? " su-plan-on" : ""}`}
                  >
                    {p.key === "wholesale" && <span className="su-plan-badge">Most popular</span>}
                    <span className="su-plan-name">{p.name}</span>
                    <span className="su-plan-desc">{p.description}</span>
                    <span className="su-plan-price">
                      {amount}
                      <span className="su-plan-per">{per === "mo" ? " per month" : per ? ` / ${per}` : ""}</span>
                    </span>
                    <span className="su-plan-rate">{p.commission_display} on Gang Sheet Builder orders</span>
                    <ul>
                      {p.highlights.slice(0, 4).map((h) => <li key={h}>{h}</li>)}
                    </ul>
                    <span className="su-plan-limits">{p.limits_display}</span>
                    <span className="su-plan-go">Start with {p.name}</span>
                  </button>
                );
              })}
            </div>
            {!plans.length && !error && <p className="su-lede">Loading plans…</p>}
            {error && <p className="su-error">{error}</p>}
            <p className="su-note">
              Not sure which fits? <Link href="/pricing#compare">Compare every feature</Link> or{" "}
              <Link href="/demo">book a demo</Link>.
            </p>
          </section>
        )}

        {step === 2 && (
          <section className="su-wrap su-split">
            <div className="su-main">
              <button type="button" className="su-back" onClick={() => setStep(1)}>← Plans</button>
              <p className="su-eyebrow">Free trial</p>
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
                  <span className={`su-hint${slugFree && !slugFree.available ? " su-hint-bad" : ""}${slugFree?.available ? " su-hint-ok" : ""}`}>
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

                <label>Work email
                  <input type="email" value={form.email} required autoComplete="email"
                    placeholder="you@yourshop.com"
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  <span className="su-hint">Where we send your shop&apos;s details. This is your sign-in too.</span>
                </label>

                <label><span>Phone <span className="su-opt">(optional)</span></span>
                  <input type="tel" value={form.phone} autoComplete="tel"
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>

                {refCookie ? (
                  <p className="su-hint">Referred by a PrintCoPilot partner ({refCookie.split(".")[0]}).</p>
                ) : null}
                <label><span>Partner code <span className="su-opt">(optional)</span></span>
                  <input value={refCode} maxLength={20} autoComplete="off" spellCheck={false}
                    onChange={(e) => setRefCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
                  <span className={`su-hint${refOk === false ? " su-hint-bad" : ""}${refOk === true ? " su-hint-ok" : ""}`}>
                    {refOk === true ? "Code found." : refOk === false ? "That code is not active. You can leave it empty."
                      : "If a partner sent you, type their code."}
                  </span>
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
                  14 days. No card needed. By creating a shop you agree to the{" "}
                  <Link href="/terms">Terms</Link> and <Link href="/privacy-policy">Privacy Policy</Link>.
                </p>
              </form>
            </div>

            {/* The design's "What you can try" box, from its Trial page. */}
            <TrialSidePanel />
          </section>
        )}
      </div>
    </>
  );
}

const CHECK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230B66E4' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\")";

// The design's tokens: navy #0C1E35, blue #0B66E4, text #3A4A5E, muted #5A6A7E,
// borders #D5DCE6 / #E3E8EF, the light band #F6F8FB; Outfit for headings, Inter for the rest.
const CSS = `
.su{--navy:#0C1E35;--blue:#0B66E4;--blue-hover:#0A5CD0;--text:#3A4A5E;--muted:#5A6A7E;--line:#D5DCE6;--soft:#E3E8EF;
  --band:#F6F8FB;--bad:#B42318;--ok:#0E6B38;
  background:var(--band);color:var(--text);font-family:"Inter",system-ui,sans-serif;}
.su *{box-sizing:border-box;}
.su-wrap{max-width:1200px;margin:0 auto;padding:72px 32px 96px;}
.su h1{font-family:"Outfit","Inter",system-ui,sans-serif;font-weight:600;letter-spacing:-.02em;
  font-size:44px;line-height:48px;color:var(--navy);margin:12px 0 0;}
.su-eyebrow{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin:0;}
.su-lede{margin:16px 0 32px;font-size:18px;line-height:28px;color:var(--text);max-width:640px;}
.su-lede strong{color:var(--navy);}
.su-back{background:none;border:none;color:var(--muted);font-size:15px;font-weight:500;cursor:pointer;padding:0 0 20px;font-family:inherit;}
.su-back:hover{color:var(--blue);}
.su a{color:var(--blue);font-weight:600;text-decoration:none;}
.su a:hover{text-decoration:underline;}

.su-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;align-items:stretch;margin-top:8px;}
.su-plan{position:relative;text-align:left;display:flex;flex-direction:column;background:#fff;border:1px solid var(--soft);
  border-radius:16px;padding:32px;cursor:pointer;font-family:inherit;color:inherit;
  transition:border-color .15s,box-shadow .15s,transform .15s;}
.su-plan:hover{border-color:var(--blue);box-shadow:0 24px 60px rgba(12,30,53,.08);}
.su-plan:focus-visible{outline:2px solid #0E72FB;outline-offset:2px;}
.su-plan-pop{border:2px solid #0E72FB;box-shadow:0 24px 60px rgba(14,114,251,.14);}
.su-plan-on{border-color:var(--blue);}
.su-plan-badge{position:absolute;top:-14px;left:32px;padding:5px 12px;border-radius:999px;background:var(--blue);
  color:#fff;font-size:12px;font-weight:600;line-height:16px;}
.su-plan-name{font-family:"Outfit","Inter",system-ui,sans-serif;font-weight:600;letter-spacing:-.02em;font-size:24px;line-height:30px;color:var(--navy);}
.su-plan-desc{margin-top:8px;font-size:15px;line-height:22px;color:var(--muted);}
.su-plan-price{margin-top:20px;font-family:"Outfit","Inter",system-ui,sans-serif;font-weight:600;letter-spacing:-.02em;
  font-size:48px;line-height:52px;color:var(--navy);}
.su-plan-per{font-family:"Inter",system-ui,sans-serif;font-size:16px;font-weight:400;letter-spacing:0;color:var(--muted);}
.su-plan-rate{margin-top:8px;font-size:14px;line-height:20px;font-weight:600;color:var(--navy);}
.su-plan ul{list-style:none;padding:20px 0 0;margin:20px 0 0;border-top:1px solid var(--soft);display:flex;flex-direction:column;gap:12px;}
.su-plan li{font-size:15px;line-height:22px;color:var(--navy);padding-left:30px;position:relative;}
.su-plan li::before{content:"";position:absolute;left:0;top:1px;width:20px;height:20px;border-radius:999px;
  background:#EAF3FF ${CHECK} center/12px no-repeat;}
.su-plan-limits{margin-top:20px;padding-top:16px;border-top:1px solid var(--soft);font-size:14px;line-height:20px;color:var(--muted);}
/* Looks like the design's button; the whole card is the button. */
.su-plan-limits{margin-bottom:28px;}
.su-plan-go{margin-top:auto;display:flex;align-items:center;justify-content:center;min-height:48px;
  border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--navy);font-size:15px;font-weight:600;}
.su-plan:hover .su-plan-go{background:var(--band);}
.su-plan-pop .su-plan-go{background:var(--blue);border-color:var(--blue);color:#fff;}
.su-plan-pop:hover .su-plan-go{background:var(--blue-hover);}
.su-note{margin:32px 0 0;font-size:15px;color:var(--text);}
.su-error{color:var(--bad);font-size:14px;margin:0;}

.su-split{display:flex;flex-wrap:wrap;gap:48px;align-items:stretch;}
.su-main{flex:1 1 440px;min-width:0;}
.su-form{margin-top:0;background:#fff;border:1px solid var(--soft);border-radius:16px;padding:32px;
  box-shadow:0 24px 60px rgba(12,30,53,.08);display:flex;flex-direction:column;gap:16px;}
.su-form label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;color:var(--navy);}
.su-form input{min-height:48px;padding:0 14px;font-size:16px;border:1px solid var(--line);border-radius:8px;background:#fff;
  font-family:inherit;color:var(--navy);font-weight:400;width:100%;}
.su-form input:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(11,102,228,.15);}
.su-pw button:hover{background:var(--band);color:var(--navy);}
.su-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.su-opt{font-weight:400;color:var(--muted);}
.su-addr{display:flex;align-items:stretch;}
.su-addr input{border-radius:8px 0 0 8px;flex:1;min-width:0;}
.su-addr-suffix{display:flex;align-items:center;padding:0 14px;font-size:15px;color:var(--muted);
  border:1px solid var(--line);border-left:0;border-radius:0 8px 8px 0;background:var(--band);white-space:nowrap;font-weight:400;}
.su-hint{font-size:13px;line-height:18px;color:var(--muted);font-weight:400;}
.su-hint-bad{color:var(--bad);}
.su-hint-ok{color:var(--ok);font-weight:600;}
.su-submit{margin-top:4px;min-height:56px;border:none;border-radius:8px;background:var(--blue);color:#fff;
  font-size:17px;font-weight:600;cursor:pointer;font-family:inherit;}
.su-submit:hover:not(:disabled){background:var(--blue-hover);}
.su-submit:disabled{background:#A9C6F2;cursor:default;}
.su-fine{font-size:13px;line-height:18px;color:var(--muted);margin:0;text-align:center;}


@media (max-width:960px){
  .su-plans{grid-template-columns:1fr;max-width:520px;}
}
@media (max-width:760px){
  .su-wrap{padding:48px 16px 64px;}
  .su h1{font-size:36px !important;line-height:40px !important;}
  .su-row{grid-template-columns:1fr;}
  .su-form{padding:24px 20px;}
}
`;
