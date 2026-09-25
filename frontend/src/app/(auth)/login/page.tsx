// frontend/src/app/(auth)/login/page.tsx
"use client";

import { useBranding } from "@/components/providers/BrandingProvider";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type ReCAPTCHAType from "react-google-recaptcha";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { ApiClientError, setAccessToken } from "@/lib/api-client";
import { PasswordField } from "@/components/ui/PasswordField";

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
const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost";

export default function LoginPage() {
  const { support_phone, wholesale_signup } = useBranding();
  const supportPhone = (support_phone ?? "").trim();
  const router = useRouter();
  const { setAuth, isAuthenticated, isLoading: authIsLoading } = useAuthStore();
  const recaptchaRef = useRef<any>(null);

  useEffect(() => {
    if (!authIsLoading && isAuthenticated()) {
      router.replace("/account");
    }
  }, [authIsLoading, isAuthenticated, router]);

  // On the platform's own address this page is a shop owner signing in, not a
  // customer of a shop — so what it offers somebody without an account is a
  // shop of their own, not a wholesale application to a store that isn't here.
  // Read after mount: the server does not know the host the browser used.
  const [onPlatform, setOnPlatform] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    setOnPlatform(PLATFORM_DOMAIN !== "localhost"
      && (host === PLATFORM_DOMAIN || host === `www.${PLATFORM_DOMAIN}`));
  }, []);

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

    // One form, and it knows who signed in. The token says what somebody is —
    // the platform's, a brand's, or a brand's customer — so nobody is asked to
    // find the right page first, and nobody is bounced to a second address to
    // sign in all over again.
    if (fullProfile.is_platform_admin) router.push("/platform");
    else if (fullProfile.is_admin) router.push("/admin/dashboard");
    else router.push("/account");
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

  return (
    <div className="ui-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px" }}>
      <div className="ui-narrow" style={{ width: "100%" }}>
          <h1 className="ui-h1">Sign in</h1>
          <p className="ui-lede">
            {onPlatform
              ? "Your shop's console, or the platform's."
              : "Your account, your orders and your pricing."}
          </p>

          <div className="ui-card">
            {twoFaChallenge ? (
              <form onSubmit={handleVerify2fa}>
                <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 6px" }}>Two-factor verification</h2>
                <p className="ui-lede" style={{ fontSize: "14px", marginBottom: "18px" }}>Enter the 6-digit code from your authenticator app. You can also use a backup code.</p>
                {error && (
                  <div className="ui-alert ui-alert-bad">{error}</div>
                )}
                <input
                  autoFocus inputMode="text" autoComplete="one-time-code" value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value)} placeholder="123456"
                  className="ui-field ui-num" style={{ fontSize: "20px", letterSpacing: ".2em", textAlign: "center", marginBottom: "16px" }}
                />
                <button type="submit" disabled={isSubmitting || twoFaCode.trim().length < 6}
                  className="ui-btn ui-btn-block">
                  {isSubmitting ? "Verifying…" : "Verify"}
                </button>
                <button type="button" onClick={() => { setTwoFaChallenge(null); setTwoFaCode(""); setError(null); }}
                  className="ui-btn-quiet" style={{ width: "100%", marginTop: "12px" }}>
                  ← Back to sign in
                </button>
              </form>
            ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div className="ui-alert ui-alert-bad">{error}</div>
              )}

              {showResendActivation && (
                <div className="ui-alert ui-alert-note" style={{ marginBottom: "20px" }}>
                  {resendSent ? (
                    <p style={{ margin: 0 }}>Activation email sent — check your inbox.</p>
                  ) : (
                    <>
                      <p style={{ margin: "0 0 10px" }}>{"Didn't receive the activation email?"}</p>
                      <button
                        type="button"
                        onClick={handleResendActivation}
                        className="ui-btn" style={{ padding: "9px 18px", fontSize: "13.5px" }}
                      >
                        Resend activation email
                      </button>
                    </>
                  )}
                </div>
              )}

              {showPendingApproval && (
                <div className="ui-alert ui-alert-note" style={{ marginBottom: "20px" }}>
                  <p style={{ fontWeight: 700, margin: "0 0 6px" }}>Application under review</p>
                  <p style={{ margin: 0 }}>
                    Your wholesale application is currently being reviewed by our team. You will receive an email within 1–2 business days once a decision has been made.
                  </p>
                  {supportPhone && (
                    <p style={{ margin: "8px 0 0" }}>
                      Questions? Call <a href={`tel:${supportPhone.replace(/[^+\d]/g, "")}`} style={{ color: "inherit", fontWeight: 600 }}>{supportPhone}</a>
                    </p>
                  )}
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor="email"
                  className="ui-label"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="ui-field"
                />
              </div>

              <div style={{ marginBottom: "8px" }}>
                <label
                  htmlFor="password"
                  className="ui-label"
                >
                  Password
                </label>
                <PasswordField
                  id="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="ui-field"
                />
                <Link
                  href="/forgot-password"
                  className="ui-hint" style={{ color: "var(--brand-primary, var(--ui-ink))", fontWeight: 600, textDecoration: "none", display: "inline-block" }}
                >
                  Forgot your password?
                </Link>
              </div>

              <div style={{ marginBottom: "16px" }}></div>

              {/* reCAPTCHA — only shown when site key is configured */}
              {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && (
                <div className="recaptcha-wrap" style={{ marginBottom: "20px" }}>
                  <ReCAPTCHA
                    ref={recaptchaRef}
                    sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                    onChange={(token) => setRecaptchaToken(token)}
                    onExpired={() => setRecaptchaToken(null)}
                    theme="dark"
                  />
                  {!recaptchaToken && (
                    <p style={{ fontSize: "11px", color: "#666", marginTop: "6px" }}>Please complete the verification above to sign in.</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || (!!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !recaptchaToken)}
                className="ui-btn ui-btn-block"
                style={{ marginTop: "12px" }}
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
            )}

            {/* What is worth offering here depends on whose page this is. On
                the platform's own address: a shop of your own. On a wholesale
                shop: the application its buyers have to make before they can
                sign in. On a retail shop: nothing — its customers buy as
                guests, and an application would go to a screen its plan does
                not include. */}
            <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--ui-line)" }}>
              {(onPlatform || wholesale_signup) && (
                <>
                  <div style={{ position: "relative", textAlign: "center", marginBottom: "16px" }}>
                    <span style={{ fontSize: "12.5px", color: "var(--ui-muted)", background: "#fff", padding: "0 12px", position: "relative", zIndex: 1 }}>or</span>
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: "1px", background: "var(--ui-line)", zIndex: 0 }} />
                  </div>
                  <Link
                    href={onPlatform ? "/signup" : "/wholesale/register"}
                    className="ui-btn-ghost ui-btn-block"
                  >
                    {onPlatform ? "Start your own shop" : "Apply for a wholesale account"}
                  </Link>
                </>
              )}
              <p className="ui-hint" style={{ textAlign: "center", marginTop: (onPlatform || wholesale_signup) ? "16px" : "0" }}>
                {onPlatform
                  ? "A plan, your details, and your shop is open in a minute."
                  : wholesale_signup
                    ? "Wholesale pricing needs an approved account. You can still order as a guest at standard prices."
                    : "No account needed to place an order. Guests pay standard pricing."}
              </p>
            </div>
          </div>
        </div>
    </div>
  );
}
