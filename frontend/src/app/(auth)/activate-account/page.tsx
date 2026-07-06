"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { setAccessToken } from "@/lib/api-client";

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

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E2E0DA",
  borderRadius: "6px",
  padding: "10px 14px",
  fontSize: "14px",
  color: "#2A2830",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".07em",
  color: "#7A7880",
  marginBottom: "6px",
};

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: "var(--font-bebas)",
  fontSize: "16px",
  letterSpacing: ".06em",
  color: "#2A2830",
  marginBottom: "20px",
  paddingBottom: "10px",
  borderBottom: "1px solid #E2E0DA",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "16px",
};

const req = <span style={{ color: "#E8242A" }}>*</span>;

const PRIMARY_BUSINESS_OPTIONS = [
  "Screen Printer",
  "Embroiderer",
  "Promotional Products Distributor",
  "Retailer",
  "Online Retailer",
  "Corporate Buyer",
  "Athletic Team Dealer",
  "Boutique",
  "Decorator",
  "Other",
];

const HEAR_ABOUT_OPTIONS = [
  "Google Search",
  "Social Media",
  "Trade Show",
  "Referral from Another Business",
  "Email Campaign",
  "Industry Publication",
  "Other",
];

const EMPLOYEE_OPTIONS = ["1 – 5", "6 – 10", "11 – 25", "26 – 50", "51 – 100", "100+"];
const SALES_REP_OPTIONS = ["0", "1 – 2", "3 – 5", "6 – 10", "10+"];

// ── Token-expired resend form ─────────────────────────────────────────────────

function TokenExpiredView({ prefillEmail }: { prefillEmail?: string }) {
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    if (!email) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/v1/resend-activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F3EF", fontFamily: "var(--font-jakarta)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ maxWidth: "440px", width: "100%", textAlign: "center" }}>
        <div style={{ background: "#1B3A5C", padding: "24px 32px", borderRadius: "12px 12px 0 0", borderBottom: "3px solid #E8242A", marginBottom: "0" }}>
          <span style={{ fontSize: "26px", fontWeight: 900, color: "#fff", letterSpacing: "-.5px" }}>AF</span>
          <span style={{ color: "rgba(255,255,255,.55)", fontSize: "13px", marginLeft: "8px", letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 600 }}>APPARELS</span>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "40px 36px" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#FFF3CD", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#1B3A5C", marginBottom: "12px" }}>Activation Link Expired</h2>
          <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "28px", lineHeight: 1.6 }}>
            Your activation link has expired. Enter your email below and we'll send you a new one.
          </p>
          {sent ? (
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
              <p style={{ color: "#166534", fontWeight: 700, margin: "0 0 4px" }}>Activation link sent!</p>
              <p style={{ color: "#16a34a", fontSize: "13px", margin: 0 }}>Check your inbox and spam folder.</p>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ ...inputStyle, marginBottom: "12px" }}
              />
              <button
                onClick={handleResend}
                disabled={loading || !email}
                style={{ width: "100%", background: loading || !email ? "#ccc" : "#1B3A5C", color: "#fff", padding: "12px", fontSize: "14px", fontWeight: 700, borderRadius: "6px", border: "none", cursor: loading || !email ? "not-allowed" : "pointer" }}
              >
                {loading ? "Sending…" : "Resend Activation Link"}
              </button>
            </>
          )}
          <p style={{ marginTop: "20px", fontSize: "13px", color: "#aaa" }}>
            <Link href="/login" style={{ color: "#1A5CFF", fontWeight: 600, textDecoration: "none" }}>Back to Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Success view ──────────────────────────────────────────────────────────────

function SuccessView({ firstName }: { firstName: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F3EF", fontFamily: "var(--font-jakarta)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>
        <div style={{ background: "#1B3A5C", padding: "24px 32px", borderRadius: "12px 12px 0 0", borderBottom: "3px solid #E8242A" }}>
          <span style={{ fontSize: "26px", fontWeight: 900, color: "#fff", letterSpacing: "-.5px" }}>AF</span>
          <span style={{ color: "rgba(255,255,255,.55)", fontSize: "13px", marginLeft: "8px", letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 600 }}>APPARELS</span>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "40px 36px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#1B3A5C", marginBottom: "12px" }}>Application Submitted!</h2>
          <p style={{ fontSize: "15px", color: "#374151", marginBottom: "12px", lineHeight: 1.6 }}>
            Thank you, <strong>{firstName}</strong>! Your account application has been received.
          </p>
          <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "28px", lineHeight: 1.6 }}>
            We review applications within 1–2 business days. You'll receive an email once your account is approved.
          </p>
          <div style={{ background: "#F9F8F4", borderRadius: "8px", padding: "16px", marginBottom: "28px", fontSize: "13px", color: "#6b7280" }}>
            Questions? Call <a href="tel:+14693679753" style={{ color: "#1B3A5C", fontWeight: 700, textDecoration: "none" }}>+1 (469) 367-9753</a> or email <a href="mailto:info@afblanks.com" style={{ color: "#1B3A5C", textDecoration: "none" }}>info@afblanks.com</a>
          </div>
          <Link
            href="/"
            style={{ display: "inline-block", background: "#E8242A", color: "#fff", padding: "12px 28px", borderRadius: "6px", fontWeight: 700, textDecoration: "none", fontSize: "14px" }}
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

type TokenInfo = { first_name: string; last_name: string; email: string };

function ActivateAccountContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [tokenState, setTokenState] = useState<"loading" | "valid" | "invalid" | "expired">("loading");
  const [prefill, setPrefill] = useState<TokenInfo | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    company_name: "",
    business_type: "",
    website: "",
    tax_id: "",
    company_email: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state_province: "",
    postal_code: "",
    country: "United States",
    password: "",
    confirm_password: "",
    how_heard: "",
    secondary_business: "",
    num_employees: "",
    num_sales_reps: "",
  });

  // Validate token on mount
  useEffect(() => {
    if (!token) { setTokenState("invalid"); return; }
    fetch(`${API_BASE}/api/v1/validate-activation-token?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setTokenState(data.detail === "TOKEN_EXPIRED" ? "expired" : "invalid");
        } else {
          setPrefill(data);
          setForm((p) => ({ ...p, first_name: data.first_name, last_name: data.last_name, company_email: data.email }));
          setTokenState("valid");
        }
      })
      .catch(() => setTokenState("invalid"));
  }, [token]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm_password) { setError("Passwords do not match."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/activate-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      const data = await res.json();

      if (!res.ok) {
        const detail = data.detail || data.error?.message || "Submission failed";
        if (detail === "TOKEN_EXPIRED") { setTokenState("expired"); return; }
        setError(detail);
        return;
      }

      // Activation returns JWT — log in directly
      setAccessToken(data.access_token);
      const profile = await authService.getProfile();
      const jwtPayload = decodeJwtPayload(data.access_token);
      const fullProfile = { ...profile, is_admin: false, account_type: (jwtPayload.account_type as string) || "retail" };
      setAuth(data.access_token, fullProfile);
      router.push("/account/orders");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (tokenState === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F3EF" }}>
        <p style={{ color: "#6b7280", fontSize: "15px" }}>Validating link…</p>
      </div>
    );
  }

  if (tokenState === "expired") return <TokenExpiredView prefillEmail={prefill?.email} />;
  if (tokenState === "invalid") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F3EF", fontFamily: "var(--font-jakarta)" }}>
        <div style={{ textAlign: "center", maxWidth: "400px" }}>
          <p style={{ color: "#E8242A", fontWeight: 700, fontSize: "16px", marginBottom: "12px" }}>Invalid activation link.</p>
          <p style={{ color: "#6b7280", marginBottom: "20px", fontSize: "14px" }}>This link may have already been used or is not valid.</p>
          <Link href="/login" style={{ color: "#1A5CFF", fontWeight: 700, textDecoration: "none" }}>Back to Login</Link>
        </div>
      </div>
    );
  }

  if (submitted) return <SuccessView firstName={submittedName} />;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F3EF", fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ background: "#1B3A5C", padding: "28px 32px", textAlign: "center", borderBottom: "3px solid #E8242A" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "28px", fontWeight: 900, color: "#fff", letterSpacing: "-.5px" }}>AF</span>
          <span style={{ color: "rgba(255,255,255,.55)", fontSize: "13px", marginLeft: "8px", letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 600 }}>APPARELS</span>
        </Link>
        <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "clamp(26px,3vw,40px)", color: "#fff", letterSpacing: ".02em", lineHeight: 1, marginTop: "16px", marginBottom: "8px" }}>
          Complete Your Account
        </h1>
        <p style={{ fontSize: "14px", color: "#d3d0d0", maxWidth: "460px", margin: "0 auto" }}>
          You placed an order with us — complete your business profile to unlock wholesale pricing.
        </p>
      </div>

      {/* Form area */}
      <div style={{ maxWidth: "840px", margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px", padding: "40px" }}>
          {/* Pre-filled email notice */}
          {prefill && (
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "8px", padding: "12px 16px", marginBottom: "28px", fontSize: "13px", color: "#1e40af" }}>
              Completing account for <strong>{prefill.email}</strong>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ background: "#FFF0F0", border: "1px solid #fcc", borderRadius: "6px", padding: "12px 16px", fontSize: "13px", color: "#c0392b", marginBottom: "24px" }}>
                {error}
              </div>
            )}

            {/* ── Personal Information ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Personal Information</h3>
              <div style={gridStyle}>
                <div>
                  <label htmlFor="first_name" style={labelStyle}>First Name {req}</label>
                  <input id="first_name" name="first_name" type="text" required value={form.first_name} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="last_name" style={labelStyle}>Last Name {req}</label>
                  <input id="last_name" name="last_name" type="text" required value={form.last_name} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={prefill?.email ?? ""} disabled style={{ ...inputStyle, background: "#F9F8F4", color: "#9ca3af" }} />
                </div>
                <div>
                  <label htmlFor="phone" style={labelStyle}>Phone Number {req}</label>
                  <input id="phone" name="phone" type="tel" required value={form.phone} onChange={handleChange} placeholder="(214) 000-0000" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ── Business Information ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Business Information</h3>
              <div style={gridStyle}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="company_name" style={labelStyle}>Company Name {req}</label>
                  <input id="company_name" name="company_name" type="text" required value={form.company_name} onChange={handleChange} placeholder="Your Company LLC" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="business_type" style={labelStyle}>Primary Business {req}</label>
                  <select id="business_type" name="business_type" required value={form.business_type} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {PRIMARY_BUSINESS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="secondary_business" style={labelStyle}>Secondary Business <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <select id="secondary_business" name="secondary_business" value={form.secondary_business} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {PRIMARY_BUSINESS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="website" style={labelStyle}>Website <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="website" name="website" type="text" value={form.website} onChange={handleChange} placeholder="https://yourcompany.com" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="tax_id" style={labelStyle}>Tax ID / Resale # <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="tax_id" name="tax_id" type="text" value={form.tax_id} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="company_email" style={labelStyle}>Company Email <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="company_email" name="company_email" type="email" value={form.company_email} onChange={handleChange} placeholder="info@yourcompany.com" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="num_employees" style={labelStyle}>Employees</label>
                  <select id="num_employees" name="num_employees" value={form.num_employees} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {EMPLOYEE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="num_sales_reps" style={labelStyle}>Outside Sales Reps</label>
                  <select id="num_sales_reps" name="num_sales_reps" value={form.num_sales_reps} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {SALES_REP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Business Address ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Business Address</h3>
              <div style={gridStyle}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="address_line1" style={labelStyle}>Street Address {req}</label>
                  <input id="address_line1" name="address_line1" type="text" required value={form.address_line1} onChange={handleChange} placeholder="123 Main St" style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="address_line2" style={labelStyle}>Suite / Unit <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="address_line2" name="address_line2" type="text" value={form.address_line2} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="city" style={labelStyle}>City {req}</label>
                  <input id="city" name="city" type="text" required value={form.city} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="state_province" style={labelStyle}>State {req}</label>
                  <input id="state_province" name="state_province" type="text" required value={form.state_province} onChange={handleChange} placeholder="TX" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="postal_code" style={labelStyle}>ZIP Code {req}</label>
                  <input id="postal_code" name="postal_code" type="text" required value={form.postal_code} onChange={handleChange} placeholder="75001" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="country" style={labelStyle}>Country</label>
                  <input id="country" name="country" type="text" value={form.country} onChange={handleChange} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ── Account Setup ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Account Setup</h3>
              <div style={gridStyle}>
                <div>
                  <label htmlFor="password" style={labelStyle}>Password {req}</label>
                  <input id="password" name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} placeholder="Min. 8 characters" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="confirm_password" style={labelStyle}>Confirm Password {req}</label>
                  <input id="confirm_password" name="confirm_password" type="password" required minLength={8} value={form.confirm_password} onChange={handleChange} placeholder="Re-enter password" style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="how_heard" style={labelStyle}>How did you hear about us?</label>
                  <select id="how_heard" name="how_heard" value={form.how_heard} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {HEAR_ABOUT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                background: isSubmitting ? "#ccc" : "#E8242A",
                color: "#fff",
                padding: "14px",
                fontSize: "14px",
                fontWeight: 700,
                borderRadius: "6px",
                border: "none",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                letterSpacing: ".04em",
                textTransform: "uppercase",
              }}
            >
              {isSubmitting ? "Submitting Application…" : "Submit Application →"}
            </button>

            <p style={{ textAlign: "center", fontSize: "13px", color: "#7A7880", marginTop: "16px" }}>
              Already approved?{" "}
              <Link href="/login" style={{ color: "#1A5CFF", fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ActivateAccountPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F3EF" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    }>
      <ActivateAccountContent />
    </Suspense>
  );
}
