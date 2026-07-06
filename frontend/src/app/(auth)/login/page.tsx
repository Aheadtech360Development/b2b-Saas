// frontend/src/app/(auth)/login/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type ReCAPTCHAType from "react-google-recaptcha";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { ApiClientError, setAccessToken } from "@/lib/api-client";

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
  const router = useRouter();
  const { setAuth, isAuthenticated, isLoading: authIsLoading } = useAuthStore();
  const recaptchaRef = useRef<any>(null);

  useEffect(() => {
    if (!authIsLoading && isAuthenticated()) {
      router.replace("/account");
    }
  }, [authIsLoading, isAuthenticated, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResendActivation, setShowResendActivation] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [showPendingApproval, setShowPendingApproval] = useState(false);

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

      // Set token in memory BEFORE calling getProfile so the request is authenticated
      setAccessToken(tokens.access_token);

      const profile = await authService.getProfile();

      // JWT payload contains is_admin, is_platform_admin, role, tenant_id as claims
      const payload = decodeJwtPayload(tokens.access_token);
      const fullProfile = {
        ...profile,
        is_admin: !!payload.is_admin,
        is_platform_admin: !!payload.is_platform_admin,
        role: (payload.role as string) || undefined,
        tenant_id: (payload.tenant_id as string | null) ?? null,
        account_type: (payload.account_type as string) || "wholesale",
      };

      setAuth(tokens.access_token, fullProfile);

      if (fullProfile.is_platform_admin) {
        // Super admin → platform dashboard (manage all brands)
        router.push("/platform");
      } else if (fullProfile.is_admin) {
        // Brand admin → their own store admin panel
        router.push("/admin/dashboard");
      } else {
        router.push("/account");
      }
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
        } else if (err.code === "UNAUTHORIZED") {
          setError(err.message || "Invalid email or password. Please try again.");
        } else {
          setError("Invalid email or password. Please try again.");
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
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
    <div style={{ minHeight: "70vh", background: "#F8F8F6", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
      {/* Main */}
      <div style={{ width: "100%", maxWidth: "400px" }}>
          {/* Heading */}
          <div style={{ marginBottom: "28px" }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "34px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.15, marginBottom: "0" }}>
              Log In
            </h1>
          </div>

          {/* Card */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E2DE", padding: "36px" }}>
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{ background: "#fff0f0", border: "1px solid #fcc", padding: "12px 14px", fontSize: "13px", color: "#cc0000", marginBottom: "12px", fontFamily: "'DM Sans', sans-serif" }}>
                  {error}
                </div>
              )}

              {showResendActivation && (
                <div style={{ marginBottom: "20px", padding: "14px 16px", background: "rgba(255,248,225,.06)", border: "1px solid rgba(255,224,130,.25)", borderRadius: "8px" }}>
                  {resendSent ? (
                    <p style={{ fontSize: "13px", color: "#86efac", margin: 0 }}>
                      Activation email sent! Check your inbox.
                    </p>
                  ) : (
                    <>
                      <p style={{ fontSize: "13px", color: "#d3d0d0", margin: "0 0 10px" }}>
                        {"Didn't receive the activation email?"}
                      </p>
                      <button
                        type="button"
                        onClick={handleResendActivation}
                        style={{ background: "#1B3A5C", color: "#fff", border: "none", padding: "9px 18px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}
                      >
                        Resend Activation Email
                      </button>
                    </>
                  )}
                </div>
              )}

              {showPendingApproval && (
                <div style={{ marginBottom: "20px", padding: "16px", background: "rgba(26,92,255,.08)", border: "1px solid rgba(26,92,255,.3)", borderRadius: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#93c5fd", margin: "0 0 6px" }}>
                    Application Under Review
                  </p>
                  <p style={{ fontSize: "13px", color: "#d3d0d0", margin: 0, lineHeight: 1.5 }}>
                    Your wholesale application is currently being reviewed by our team. You will receive an email within 1–2 business days once a decision has been made.
                  </p>
                  <p style={{ fontSize: "12px", color: "#7A7880", margin: "8px 0 0" }}>
                    Questions? Call <a href="tel:+14693679753" style={{ color: "#93c5fd", textDecoration: "none" }}>+1 (469) 367-9753</a>
                  </p>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor="email"
                  style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".05em", color: "#1A1A1A", marginBottom: "6px" }}
                >
                  Email *
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={{
                    width: "100%",
                    background: "#fff",
                    border: "1px solid #E2E2DE",
                    padding: "11px 14px",
                    fontSize: "14px",
                    color: "#1A1A1A",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color .2s",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                />
              </div>

              <div style={{ marginBottom: "8px" }}>
                <label
                  htmlFor="password"
                  style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".05em", color: "#1A1A1A", marginBottom: "6px" }}
                >
                  Password *
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  style={{
                    width: "100%",
                    background: "#fff",
                    border: "1px solid #E2E2DE",
                    padding: "11px 14px",
                    fontSize: "14px",
                    color: "#1A1A1A",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color .2s",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                />
                <Link
                  href="/forgot-password"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#1C3557", textDecoration: "none", display: "inline-block", marginTop: "6px" }}
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
                style={{
                  width: "100%",
                  background: (isSubmitting || (!!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !recaptchaToken)) ? "#9ca3af" : "#1C3557",
                  color: "#fff",
                  padding: "14px",
                  fontSize: "14px",
                  fontWeight: 500,
                  border: "none",
                  cursor: (isSubmitting || !recaptchaToken) ? "not-allowed" : "pointer",
                  transition: "background .2s",
                  fontFamily: "'DM Sans', sans-serif",
                  marginTop: "8px",
                }}
              >
                {isSubmitting ? "Signing in…" : "Log In →"}
              </button>
            </form>

            <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #E2E2DE" }}>
              <div style={{ position: "relative", textAlign: "center", marginBottom: "16px" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", background: "#FFFFFF", padding: "0 12px", position: "relative", zIndex: 1 }}>or</span>
                <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: "1px", background: "#E2E2DE", zIndex: 0 }} />
              </div>
              <Link
                href="/wholesale/register"
                style={{ display: "block", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 500, color: "#1C3557", border: "1px solid #1C3557", padding: "14px", textDecoration: "none", transition: "all .15s" }}
              >
                Create a Wholesale Account →
              </Link>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", textAlign: "center", marginTop: "16px" }}>
                No account needed to place an order. Guests pay standard pricing.
              </p>
            </div>
          </div>
        </div>
    </div>
  );
}
