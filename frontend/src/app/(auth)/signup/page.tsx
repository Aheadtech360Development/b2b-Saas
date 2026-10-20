"use client";

/**
 * Start a shop (design screen 6: Owner signup).
 *
 * An email and a password, and nothing else here: the shop is made on the next
 * screen, the first setup step, once it has a name — so its address comes
 * from the business's name. This page only checks that the email is not
 * already an owner's (that person signs in instead), and carries the details
 * across in the tab's memory (lib/pendingSignup).
 *
 * The plan the owner picked on the pricing page comes along as ?plan=, an
 * email typed into a "Start free trial" box as ?email=, and a partner's link
 * as its cookie; a partner's code can be typed here too.
 */
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { PasswordField } from "@/components/ui/PasswordField";
import { ReferralCapture, readReferralCookie } from "@/components/partners/ReferralCapture";
import { AuthPage, ui, useOnlyOn } from "@/components/auth/AuthPage";
import { holdSignup, readSignup } from "@/lib/pendingSignup";
import { PASSWORD_HINT, PASSWORD_MIN, passwordTooShort } from "@/lib/passwordRule";

interface Plan {
  key: string;
  name: string;
}

export default function SignupPage() {
  return (
    <Suspense fallback={<AuthPage title="Start your 14 day free trial"><p className={ui.foot}>Loading…</p></AuthPage>}>
      <Signup />
    </Suspense>
  );
}

function Signup() {
  const params = useSearchParams();
  const router = useRouter();
  const held = readSignup();
  // Starting a store is printcopilot.co's; on a shop's address this is one of
  // its buyers, whose door is an account with the shop.
  const elsewhere = useOnlyOn("platform", "/create-account?next=/account");

  const [email, setEmail] = useState(held?.email ?? params.get("email") ?? "");
  const [password, setPassword] = useState(held?.password ?? "");
  const plan = params.get("plan") ?? held?.plan ?? null;
  const [planName, setPlanName] = useState<string | null>(null);

  // A partner's link leaves a cookie, and a valid click wins; without one, the
  // owner can type the partner's code (services/partners/referrals.py). The
  // way to type one is always there, cookie or not: a cookie can outlive its
  // click, and then the typed code decides.
  const [refCookie, setRefCookie] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(Boolean(held?.referralCode));
  const [refCode, setRefCode] = useState(held?.referralCode ?? "");
  const [refOk, setRefOk] = useState<null | boolean>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  useEffect(() => {
    setRefCookie(readReferralCookie());
  }, []);

  useEffect(() => {
    if (!plan) return;
    apiClient.get<{ plans: Plan[] }>("/api/v1/signup/plans", { skipAuth: true })
      .then((r) => setPlanName(r.plans?.find((p) => p.key === plan)?.name ?? null))
      .catch(() => setPlanName(null));
  }, [plan]);

  useEffect(() => {
    const code = refCode.trim();
    if (!code) { setRefOk(null); return; }
    const t = window.setTimeout(() => {
      apiClient.get<{ valid: boolean }>(`/api/v1/partners/codes/${encodeURIComponent(code)}`, { skipAuth: true })
        .then((r) => setRefOk(r.valid)).catch(() => setRefOk(null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [refCode]);

  const short = passwordTooShort(password);
  const canSubmit = email.trim().length > 3 && password.length >= PASSWORD_MIN && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // An owner already: they sign in, they do not start a second shop by accident.
      await apiClient.post("/api/v1/signup/check", { email: email.trim() }, { skipAuth: true });
      holdSignup({
        email: email.trim(),
        password,
        plan,
        referralCookie: refCookie,
        referralCode: refCode.trim() || null,
      });
      router.push("/onboarding");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setError(<>That email already has an account with us. <Link href="/login">Sign in instead</Link>.</>);
      } else if (err instanceof ApiClientError && err.status === 429) {
        setError("A few too many tries just now. Wait a little and try again.");
      } else if (err instanceof ApiClientError && err.status === 422) {
        setError("That email does not look right. Check it and try again.");
      } else {
        setError(err instanceof ApiClientError && err.message ? err.message : "Could not start your store. Please try again.");
      }
      setBusy(false);
    }
  }

  if (elsewhere) return null;

  return (
    <>
      <ReferralCapture onCaptured={setRefCookie} />
      <AuthPage title="Start your 14 day free trial" sub="No card needed. Cancel any time.">
        <form onSubmit={submit}>
          <div className={ui.field}>
            <label htmlFor="email" className={ui.label}>Work email</label>
            <input id="email" type="email" required autoFocus autoComplete="email" value={email}
              placeholder="you@yourshop.com" onChange={(e) => setEmail(e.target.value)} className={ui.input} />
          </div>

          <div className={ui.field}>
            <label htmlFor="password" className={ui.label}>Password</label>
            <PasswordField id="password" required minLength={PASSWORD_MIN} autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} className={ui.input} />
            <p className={`${ui.hint} ${short ? ui.hintBad : ""}`}>{PASSWORD_HINT}</p>
          </div>

          {refCookie && (
            <p className={ui.hint}>Referred by a PrintCoPilot partner ({refCookie.split(".")[0]}).</p>
          )}
          {codeOpen ? (
            <div className={ui.field}>
              <label htmlFor="partner_code" className={ui.label}>
                Partner code <span className={ui.optional}>(optional)</span>
              </label>
              <input id="partner_code" value={refCode} maxLength={20} autoComplete="off" spellCheck={false}
                onChange={(e) => setRefCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                className={ui.input} />
              <p className={`${ui.hint} ${refOk === false ? ui.hintBad : ""} ${refOk === true ? ui.hintOk : ""}`}>
                {refOk === true ? "Code found." : refOk === false ? "That code is not active. You can leave it empty."
                  : "If a partner sent you, type their code."}
              </p>
            </div>
          ) : (
            <p className={ui.foot}>
              <button type="button" className={ui.link} onClick={() => setCodeOpen(true)}>Have a partner code?</button>
            </p>
          )}

          {error && <div className={ui.error} role="alert">{error}</div>}

          <button type="submit" disabled={!canSubmit} className={`${ui.btn} ${ui.primary} ${ui.block} ${ui.tall}`}>
            {busy ? "One moment…" : "Create my store"}
          </button>

          <p className={ui.foot}>
            Already selling with us? <Link href="/login" className={ui.link}>Sign in</Link>
          </p>
          <p className={ui.foot}>
            {planName ? <>Your trial is on the {planName} plan. You can change plans any time. </> : null}
            By creating a store you agree to the <Link href="/terms" className={ui.link}>Terms</Link> and{" "}
            <Link href="/privacy-policy" className={ui.link}>Privacy Policy</Link>.
          </p>
        </form>
      </AuthPage>
    </>
  );
}
