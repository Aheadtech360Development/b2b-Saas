// frontend/src/app/(auth)/login/page.tsx
"use client";

/**
 * Sign in (design screen 1: Buyer sign in).
 *
 * One form for everybody, and the token says who signed in — the platform's,
 * a brand's owner or staff, or a brand's buyer — so nobody is asked to find the
 * right page first. On a shop the card wears the shop's logo and colour; on
 * printcopilot.co, PrintCoPilot's (AuthPage decides from the address).
 */
import { useBranding } from "@/components/providers/BrandingProvider";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type ReCAPTCHAType from "react-google-recaptcha";
import { useAuthStore } from "@/stores/auth.store";
import { adoptGuestCart } from "@/lib/guestCart";
import { authService } from "@/services/auth.service";
import { ApiClientError, setAccessToken } from "@/lib/api-client";
import { nextFromLocation } from "@/lib/safeNext";
import { PasswordField } from "@/components/ui/PasswordField";
import { AuthPage, ui, useAuthWhere } from "@/components/auth/AuthPage";

const ReCAPTCHA = dynamic(() => import("react-google-recaptcha"), {
  ssr: false,
}) as typeof ReCAPTCHAType;

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LoginPage() {
  const { support_phone, wholesale_signup } = useBranding();
  const supportPhone = (support_phone ?? "").trim();
  const router = useRouter();
  const { setAuth, isAuthenticated, isLoading: authIsLoading } = useAuthStore();
  const recaptchaRef = useRef<any>(null);

  // Where the buyer was before being asked to sign in (?next=, or ?redirect=
  // from older links): a builder with their design, an invoice, the checkout.
  // It used to be ignored, and everybody landed on their account page.
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => setNext(nextFromLocation()), []);

  useEffect(() => {
    if (!authIsLoading && isAuthenticated()) {
      router.replace(nextFromLocation() ?? "/account");
    }
  }, [authIsLoading, isAuthenticated, router]);

  // On the platform's own address this page is a shop owner signing in, not a
  // customer of a shop — so what it offers somebody without an account is a
  // shop of their own, not a wholesale application to a store that isn't here.
  const { platform: onPlatform } = useAuthWhere();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResendActivation, setShowResendActivation] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [showPendingApproval, setShowPendingApproval] = useState(false);
  const [twoFaChallenge, setTwoFaChallenge] = useState<string | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");

  // Shared post-authentication step (used by password login and 2FA completion).
  async function completeLogin(accessToken: string) {
    setAccessToken(accessToken);
    const profile = await authService.getProfile();
    const payload = decodeJwtPayload(accessToken);
    const fullProfile = {
      ...profile,
      is_admin: !!payload.is_admin,
      is_platform_admin: !!payload.is_platform_admin,
      role: (payload.role as string) || undefined,
      tenant_id: (payload.tenant_id as string | null) ?? null,
      account_type: (payload.account_type as string) || "wholesale",
      company_id: (payload.company_id as string | null) ?? null,
    };
    setAuth(accessToken, fullProfile);
    // A shopper's guest cart comes with them into their account.
    if (!fullProfile.is_admin && !fullProfile.is_platform_admin) {
      try { await adoptGuestCart(); } catch { /* the cart page tries again */ }
    }

    // One form, and it knows who signed in. The token says what somebody is —
    // the platform's, a brand's, or a brand's customer — so nobody is asked to
    // find the right page first, and nobody is bounced to a second address to
    // sign in all over again.
    if (fullProfile.is_platform_admin) router.push("/platform");
    else if (fullProfile.is_admin) router.push("/admin/dashboard");
    else router.push(nextFromLocation() ?? "/account");
  }

  async function handleVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    if (!twoFaChallenge) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const tokens = await authService.verify2fa(twoFaChallenge, twoFaCode.trim());
      await completeLogin(tokens.access_token);
    } catch (err) {
      setError(err instanceof ApiClientError ? (err.message || "Incorrect code.") : "Incorrect code. Try again.");
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !recaptchaToken) {
      setError("Please complete the reCAPTCHA verification.");
      return;
    }
    setIsSubmitting(true);

    try {
      const tokens = await authService.login({ email, password });
      // 2FA-enabled account → password was correct, now ask for the code.
      if (tokens.requires_2fa && tokens.challenge_token) {
        setTwoFaChallenge(tokens.challenge_token);
        setIsSubmitting(false);
        return;
      }
      await completeLogin(tokens.access_token);
    } catch (err) {
      recaptchaRef.current?.reset();
      setRecaptchaToken(null);
      if (err instanceof ApiClientError) {
        if (err.code === "ACCOUNT_SUSPENDED") {
          setError("Your account has been suspended. Please contact support.");
        } else if (err.code === "ACCOUNT_NOT_ACTIVATED") {
          setError("Your account is not yet activated. Check your email for the activation link.");
          setShowResendActivation(true);
        } else if (err.code === "ACCOUNT_PENDING_APPROVAL") {
          setError(null);
          setShowPendingApproval(true);
        } else if (err.status === 429) {
          // Too many tries. Saying "wrong password" here is what makes someone
          // keep trying, which is what keeps them locked out.
          setError("Too many attempts. Wait about 15 minutes and try again.");
        } else if (err.status >= 500) {
          setError("The server had a problem signing you in. Try again in a moment.");
        } else if (err.status === 401 || err.code === "UNAUTHORIZED") {
          setError(err.message || "Invalid email or password. Please try again.");
        } else {
          // Anything else is not a wrong password, and saying it is sends
          // people looking in the wrong place.
          setError(err.message || "Could not sign you in. Please try again.");
        }
      } else {
        setError("Could not reach the server. Check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendActivation() {
    setResendSent(false);
    try {
      await fetch(`${API_BASE}/api/v1/resend-activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendSent(true);
    } catch {
      // non-fatal
    }
  }

  if (twoFaChallenge) {
    return (
      <AuthPage title="Two-step sign-in" sub="Enter the six digits from your authenticator app, or one of your backup codes.">
        <form onSubmit={handleVerify2fa}>
          {error && <div className={ui.error} role="alert">{error}</div>}
          <div className={ui.field}>
            <label htmlFor="code" className={ui.label}>Six digit code</label>
            <input
              id="code" autoFocus inputMode="text" autoComplete="one-time-code" value={twoFaCode}
              onChange={(e) => setTwoFaCode(e.target.value)} placeholder="000000"
              className={`${ui.input} ${ui.code}`}
            />
          </div>
          <button type="submit" disabled={isSubmitting || twoFaCode.trim().length < 6}
            className={`${ui.btn} ${ui.primary} ${ui.block}`}>
            {isSubmitting ? "Checking…" : "Verify"}
          </button>
          <p className={ui.foot}>
            <button type="button" className={ui.link}
              onClick={() => { setTwoFaChallenge(null); setTwoFaCode(""); setError(null); }}>
              ← Back to sign in
            </button>
          </p>
        </form>
      </AuthPage>
    );
  }

  // What is worth offering somebody without an account depends on whose page
  // this is. On the platform's own address: a shop of their own. On a shop: an
  // account made in a moment (and the way back, for a buyer sent here mid-order:
  // an application to approve is no way to finish an order), and on a shop that
  // sells wholesale accounts, the application too.
  const createHref = next ? `/create-account?next=${encodeURIComponent(next)}` : "/create-account?next=/account";

  return (
    <AuthPage title="Sign in" sub="Welcome back.">
      <form onSubmit={handleSubmit}>
        {error && <div className={ui.error} role="alert">{error}</div>}

        {showResendActivation && (
          <div className={ui.notice}>
            {resendSent ? (
              "Activation email sent. Check your inbox."
            ) : (
              <>
                {"Didn't receive the activation email? "}
                <button type="button" onClick={handleResendActivation} className={ui.link}>
                  Send it again
                </button>
              </>
            )}
          </div>
        )}

        {showPendingApproval && (
          <div className={ui.notice}>
            <strong>Your application is in review.</strong> We email you when it is approved, usually within 1 to 2 business days.
            {supportPhone && (
              <> Questions? Call <a href={`tel:${supportPhone.replace(/[^+\d]/g, "")}`}>{supportPhone}</a>.</>
            )}
          </div>
        )}

        <div className={ui.field}>
          <label htmlFor="email" className={ui.label}>Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={ui.input}
          />
        </div>

        <div className={ui.field}>
          <label htmlFor="password" className={ui.label}>Password</label>
          <PasswordField
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={ui.input}
          />
        </div>

        <div>
          <Link href="/forgot-password" className={`${ui.link} ${ui.small}`}>Forgot your password?</Link>
        </div>

        {/* reCAPTCHA — only shown when site key is configured */}
        {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && (
          <div className="recaptcha-wrap">
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
              onChange={(token) => setRecaptchaToken(token)}
              onExpired={() => setRecaptchaToken(null)}
            />
            {!recaptchaToken && (
              <p className={ui.hint}>Please complete the check above to sign in.</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || (!!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !recaptchaToken)}
          className={`${ui.btn} ${ui.primary} ${ui.block}`}
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>

        {onPlatform ? (
          <p className={ui.foot}>
            New to PrintCoPilot? <Link href="/signup" className={ui.link}>Start your 14 day free trial</Link>.
          </p>
        ) : (
          <p className={ui.foot}>
            New here? <Link href={createHref} className={ui.link}>Create an account</Link>.
            {wholesale_signup && !next && (
              <> Or <Link href="/wholesale/register" className={ui.link}>apply for a wholesale account</Link>.</>
            )}
          </p>
        )}
      </form>
    </AuthPage>
  );
}
