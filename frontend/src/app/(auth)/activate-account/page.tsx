"use client";

/**
 * Complete an account after a guest order (the link in the order email).
 *
 * Drawn in the sign-in screens' card (components/auth/AuthPage), so it wears
 * the shop's own logo, name and colour. It used to carry another company's
 * name in its header ("AF APPARELS") on every shop's page.
 */
import { PasswordField } from "@/components/ui/PasswordField";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { setAccessToken } from "@/lib/api-client";
import { PASSWORD_HINT, PASSWORD_MIN, passwordTooShort } from "@/lib/passwordRule";
import { AuthPage, ui } from "@/components/auth/AuthPage";

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

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
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
    <AuthPage title="This link has expired" sub="Enter your email and we will send you a new one.">
      {sent ? (
        <p className={ui.notice} role="status">A new link is on its way. Check your inbox and spam folder.</p>
      ) : (
        <form onSubmit={handleResend}>
          <div className={ui.field}>
            <label htmlFor="resend-email" className={ui.label}>Email</label>
            <input id="resend-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" className={ui.input} />
          </div>
          <button type="submit" disabled={loading || !email} className={`${ui.btn} ${ui.primary} ${ui.block}`}>
            {loading ? "Sending…" : "Send a new link"}
          </button>
        </form>
      )}
      <p className={ui.foot}><Link href="/login" className={ui.link}>← Back to sign in</Link></p>
    </AuthPage>
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
    if (form.password.length < PASSWORD_MIN) { setError(`Password must be at least ${PASSWORD_MIN} characters.`); return; }

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
    return <AuthPage title="Complete your account"><p className={ui.foot}>Checking your link…</p></AuthPage>;
  }

  if (tokenState === "expired") return <TokenExpiredView prefillEmail={prefill?.email} />;
  if (tokenState === "invalid") {
    return (
      <AuthPage title="This link does not work" sub="It may have been used already, or it is not complete.">
        <Link href="/login" className={`${ui.btn} ${ui.primary} ${ui.block}`}>Go to sign in</Link>
      </AuthPage>
    );
  }

  const short = passwordTooShort(form.password);
  const mismatch = form.confirm_password.length > 0 && form.confirm_password !== form.password;

  return (
    <AuthPage
      size="wide"
      title="Complete your account"
      sub="You ordered with us as a guest. Add your business details and a password to track orders and reorder."
    >
      <form onSubmit={handleSubmit}>
        {prefill && <p className={ui.notice}>Completing the account for <strong>{prefill.email}</strong>.</p>}

        <section className={ui.section} aria-labelledby="act-you">
          <h2 className={ui.sectionTitle} id="act-you">You</h2>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="first_name" className={ui.label}>First name</label>
              <input id="first_name" name="first_name" required autoComplete="given-name" value={form.first_name} onChange={handleChange} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="last_name" className={ui.label}>Last name</label>
              <input id="last_name" name="last_name" required autoComplete="family-name" value={form.last_name} onChange={handleChange} className={ui.input} />
            </div>
          </div>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="act-email" className={ui.label}>Email</label>
              <input id="act-email" type="email" value={prefill?.email ?? ""} disabled className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="phone" className={ui.label}>Phone</label>
              <input id="phone" name="phone" type="tel" required autoComplete="tel" value={form.phone} onChange={handleChange} className={ui.input} />
            </div>
          </div>
        </section>

        <section className={ui.section} aria-labelledby="act-business">
          <h2 className={ui.sectionTitle} id="act-business">Business</h2>
          <div className={ui.field}>
            <label htmlFor="company_name" className={ui.label}>Company name</label>
            <input id="company_name" name="company_name" required autoComplete="organization" value={form.company_name} onChange={handleChange} className={ui.input} />
          </div>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="business_type" className={ui.label}>Primary business</label>
              <select id="business_type" name="business_type" required value={form.business_type} onChange={handleChange} className={ui.input}>
                <option value="">Choose one</option>
                {PRIMARY_BUSINESS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="secondary_business" className={ui.label}>Secondary business <span className={ui.optional}>(optional)</span></label>
              <select id="secondary_business" name="secondary_business" value={form.secondary_business} onChange={handleChange} className={ui.input}>
                <option value="">Choose one</option>
                {PRIMARY_BUSINESS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className={ui.row3}>
            <div className={ui.field}>
              <label htmlFor="website" className={ui.label}>Website <span className={ui.optional}>(optional)</span></label>
              <input id="website" name="website" inputMode="url" placeholder="https://" value={form.website} onChange={handleChange} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="tax_id" className={ui.label}>Tax ID or resale # <span className={ui.optional}>(optional)</span></label>
              <input id="tax_id" name="tax_id" value={form.tax_id} onChange={handleChange} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="company_email" className={ui.label}>Company email <span className={ui.optional}>(optional)</span></label>
              <input id="company_email" name="company_email" type="email" value={form.company_email} onChange={handleChange} className={ui.input} />
            </div>
          </div>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="num_employees" className={ui.label}>Employees</label>
              <select id="num_employees" name="num_employees" value={form.num_employees} onChange={handleChange} className={ui.input}>
                <option value="">Choose one</option>
                {EMPLOYEE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="num_sales_reps" className={ui.label}>Outside sales reps</label>
              <select id="num_sales_reps" name="num_sales_reps" value={form.num_sales_reps} onChange={handleChange} className={ui.input}>
                <option value="">Choose one</option>
                {SALES_REP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className={ui.section} aria-labelledby="act-address">
          <h2 className={ui.sectionTitle} id="act-address">Business address</h2>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="address_line1" className={ui.label}>Street address</label>
              <input id="address_line1" name="address_line1" required autoComplete="address-line1" value={form.address_line1} onChange={handleChange} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="address_line2" className={ui.label}>Suite or unit <span className={ui.optional}>(optional)</span></label>
              <input id="address_line2" name="address_line2" autoComplete="address-line2" value={form.address_line2} onChange={handleChange} className={ui.input} />
            </div>
          </div>
          <div className={ui.row3}>
            <div className={ui.field}>
              <label htmlFor="city" className={ui.label}>City</label>
              <input id="city" name="city" required autoComplete="address-level2" value={form.city} onChange={handleChange} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="state_province" className={ui.label}>State</label>
              <input id="state_province" name="state_province" required autoComplete="address-level1" value={form.state_province} onChange={handleChange} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="postal_code" className={ui.label}>ZIP code</label>
              <input id="postal_code" name="postal_code" required autoComplete="postal-code" value={form.postal_code} onChange={handleChange} className={ui.input} />
            </div>
          </div>
          <div className={ui.field}>
            <label htmlFor="country" className={ui.label}>Country</label>
            <input id="country" name="country" autoComplete="country-name" value={form.country} onChange={handleChange} className={ui.input} />
          </div>
        </section>

        <section className={ui.section} aria-labelledby="act-account">
          <h2 className={ui.sectionTitle} id="act-account">Sign-in</h2>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="password" className={ui.label}>Password</label>
              <PasswordField id="password" name="password" required minLength={PASSWORD_MIN} autoComplete="new-password" value={form.password} onChange={handleChange} className={ui.input} />
              <p className={`${ui.hint} ${short ? ui.hintBad : ""}`}>{PASSWORD_HINT}</p>
            </div>
            <div className={ui.field}>
              <label htmlFor="confirm_password" className={ui.label}>Confirm password</label>
              <PasswordField id="confirm_password" name="confirm_password" required minLength={PASSWORD_MIN} autoComplete="new-password" value={form.confirm_password} onChange={handleChange} className={ui.input} />
              {mismatch && <p className={`${ui.hint} ${ui.hintBad}`}>These two do not match yet.</p>}
            </div>
          </div>
          <div className={ui.field}>
            <label htmlFor="how_heard" className={ui.label}>How did you hear about us?</label>
            <select id="how_heard" name="how_heard" value={form.how_heard} onChange={handleChange} className={ui.input}>
              <option value="">Choose one</option>
              {HEAR_ABOUT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </section>

        {error && <div className={ui.error} role="alert">{error}</div>}

        <div>
          <button type="submit" disabled={isSubmitting} className={`${ui.btn} ${ui.primary} ${ui.tall}`}>
            {isSubmitting ? "Saving…" : "Complete my account"}
          </button>
        </div>

        <p className={ui.foot}>
          Already have an account? <Link href="/login" className={ui.link}>Sign in</Link>
        </p>
      </form>
    </AuthPage>
  );
}

export default function ActivateAccountPage() {
  return (
    <Suspense fallback={<AuthPage title="Complete your account"><p className={ui.foot}>Loading…</p></AuthPage>}>
      <ActivateAccountContent />
    </Suspense>
  );
}
