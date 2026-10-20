"use client";

/**
 * Apply for a wholesale account (design screens 4 and 5: Wholesale application,
 * Application received).
 *
 * Four boxes — the company, who to talk to, where it is, and a little about
 * the business — and then the shop reviews it (Customers, Applications). The
 * account is made with the application, so the buyer also sets a password
 * here: it is how they sign in, and the server will not make an account
 * without one. Once sent, the same card says what happens next.
 */
import { useBranding } from "@/components/providers/BrandingProvider";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type ReCAPTCHAType from "react-google-recaptcha";
import { authService } from "@/services/auth.service";
import { trackSignUp } from "@/lib/tracking";
import { ApiClientError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { COUNTRIES, countryName } from "@/lib/countries";
import { PASSWORD_HINT, PASSWORD_MIN, passwordTooShort } from "@/lib/passwordRule";
import { PasswordField } from "@/components/ui/PasswordField";
import { AuthPage, ui, useOnlyOn } from "@/components/auth/AuthPage";

const ReCAPTCHA = dynamic(() => import("react-google-recaptcha"), {
  ssr: false,
}) as typeof ReCAPTCHAType;

const BUSINESS_TYPES = ["Print shop", "Brand", "Retailer", "Distributor", "Other"];

const MONTHLY_VOLUME = [
  "Under $1,000",
  "$1,000 to $5,000",
  "$5,000 to $25,000",
  "$25,000 to $100,000",
  "Over $100,000",
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

// reCAPTCHA renders only when a site key is configured. With no key the widget
// throws "Missing required parameters: sitekey" and takes the whole page down, so
// when it is absent we skip the widget and don't gate submission on a token.
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

export default function WholesaleRegisterPage() {
  // Only a shop that sells wholesale accounts has anything to apply to. On a
  // retail shop the plan does not include the approval screen this would land
  // on, so the form is not offered at all — an application nobody can read is
  // worse than no application.
  const { wholesale_signup } = useBranding();
  // An application is made to one shop, on its address; printcopilot.co has
  // none to apply to.
  const elsewhere = useOnlyOn("shop", "/signup");
  if (elsewhere) return null;
  if (wholesale_signup === false) return <NoWholesaleHere />;
  return <WholesaleRegisterForm />;
}

function NoWholesaleHere() {
  return (
    <AuthPage
      title="No account needed"
      sub="This shop sells to everyone at the same prices, so there is no wholesale application to make. Add what you need to the cart and check out; you get an order confirmation and a way to track it."
    >
      <Link href="/products" className={`${ui.btn} ${ui.primary} ${ui.block}`}>Browse the catalogue</Link>
    </AuthPage>
  );
}

function Received({ company, email }: { company: string; email: string }) {
  return (
    <AuthPage
      title="We got your application"
      sub={<><strong>{company}</strong> is in review. We email you at <strong>{email}</strong> when it is approved.</>}
    >
      <ol className={ui.steps}>
        <li className={ui.step}><span className={`${ui.dot} ${ui.dotOn}`} aria-hidden />Application sent</li>
        <li className={ui.step}><span className={ui.dot} aria-hidden />In review</li>
        <li className={ui.step}><span className={ui.dot} aria-hidden />Approved, tier and terms set</li>
      </ol>
      <Link href="/" className={`${ui.btn} ${ui.secondary} ${ui.block}`}>Back to the store</Link>
    </AuthPage>
  );
}

function WholesaleRegisterForm() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authIsLoading } = useAuthStore();
  const recaptchaRef = useRef<any>(null);
  const captchaEnabled = RECAPTCHA_SITE_KEY.length > 0;
  const [sent, setSent] = useState<{ company: string; email: string } | null>(null);

  useEffect(() => {
    if (!authIsLoading && isAuthenticated() && !sent) {
      router.replace("/account");
    }
  }, [authIsLoading, isAuthenticated, router, sent]);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    trading_name: "",
    business_type: "",
    tax_id: "",
    website: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    country: "US",
    address1: "",
    city: "",
    state: "",
    postal_code: "",
    expected_monthly_volume: "",
    how_heard: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const short = passwordTooShort(form.password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (captchaEnabled && !recaptchaToken) {
      setError("Please complete the reCAPTCHA verification.");
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.registerWholesale({
        company_name: form.company_name.trim(),
        trading_name: form.trading_name.trim() || undefined,
        business_type: form.business_type,
        tax_id: form.tax_id.trim() || undefined,
        website: form.website.trim() || undefined,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        address_line1: form.address1.trim() || undefined,
        city: form.city.trim() || undefined,
        state_province: form.state.trim() || undefined,
        postal_code: form.postal_code.trim() || undefined,
        country: form.country ? countryName(form.country) : undefined,
        expected_monthly_volume: form.expected_monthly_volume || undefined,
        how_heard: form.how_heard || undefined,
      });
      trackSignUp("wholesale");
      recaptchaRef.current?.reset();
      setRecaptchaToken(null);
      setSent({ company: form.company_name.trim(), email: form.email.trim() });
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "CONFLICT" || err.status === 409) {
          setError("An account with this email already exists. Please sign in.");
        } else {
          setError(err.message || "Could not send the application. Please try again.");
        }
      } else {
        setError("Could not reach the server. Check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) return <Received company={sent.company} email={sent.email} />;

  return (
    <AuthPage
      size="wide"
      title="Apply for a wholesale account"
      sub="Tier pricing, net terms and quick ordering. We review applications within 1 to 2 business days."
    >
      <form onSubmit={handleSubmit}>
        <section className={ui.section} aria-labelledby="ws-company">
          <h2 className={ui.sectionTitle} id="ws-company">Company</h2>
          <div className={ui.row3}>
            <div className={ui.field}>
              <label htmlFor="company_name" className={ui.label}>Company name</label>
              <input id="company_name" required autoComplete="organization" value={form.company_name}
                onChange={set("company_name")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="trading_name" className={ui.label}>Trading name</label>
              <input id="trading_name" placeholder="Optional" value={form.trading_name}
                onChange={set("trading_name")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="business_type" className={ui.label}>Business type</label>
              <select id="business_type" required value={form.business_type} onChange={set("business_type")} className={ui.input}>
                <option value="">Choose one</option>
                {BUSINESS_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="tax_id" className={ui.label}>Tax ID or VAT number</label>
              <input id="tax_id" value={form.tax_id} onChange={set("tax_id")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="website" className={ui.label}>Website</label>
              <input id="website" inputMode="url" placeholder="https://" autoComplete="url" value={form.website}
                onChange={set("website")} className={ui.input} />
            </div>
          </div>
        </section>

        <section className={ui.section} aria-labelledby="ws-contact">
          <h2 className={ui.sectionTitle} id="ws-contact">Contact</h2>
          <div className={ui.row3}>
            <div className={ui.field}>
              <label htmlFor="first_name" className={ui.label}>First name</label>
              <input id="first_name" required autoComplete="given-name" value={form.first_name}
                onChange={set("first_name")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="last_name" className={ui.label}>Last name</label>
              <input id="last_name" required autoComplete="family-name" value={form.last_name}
                onChange={set("last_name")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="email" className={ui.label}>Email</label>
              <input id="email" type="email" required autoComplete="email" value={form.email}
                onChange={set("email")} className={ui.input} />
            </div>
          </div>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="phone" className={ui.label}>Phone</label>
              <input id="phone" type="tel" autoComplete="tel" placeholder="With country code" value={form.phone}
                onChange={set("phone")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="password" className={ui.label}>Password</label>
              <PasswordField id="password" required minLength={PASSWORD_MIN} autoComplete="new-password"
                value={form.password} onChange={set("password")} className={ui.input} />
              <p className={`${ui.hint} ${short ? ui.hintBad : ""}`}>For signing in. {PASSWORD_HINT}</p>
            </div>
          </div>
        </section>

        <section className={ui.section} aria-labelledby="ws-address">
          <h2 className={ui.sectionTitle} id="ws-address">Business address</h2>
          <div className={ui.row3}>
            <div className={ui.field}>
              <label htmlFor="country" className={ui.label}>Country</label>
              <select id="country" value={form.country} onChange={set("country")} className={ui.input} autoComplete="country">
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="address1" className={ui.label}>Address line 1</label>
              <input id="address1" autoComplete="address-line1" value={form.address1}
                onChange={set("address1")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="city" className={ui.label}>City</label>
              <input id="city" autoComplete="address-level2" value={form.city}
                onChange={set("city")} className={ui.input} />
            </div>
          </div>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="state" className={ui.label}>Region</label>
              <input id="state" autoComplete="address-level1" placeholder="State or province" value={form.state}
                onChange={set("state")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="postal_code" className={ui.label}>Postal code</label>
              <input id="postal_code" autoComplete="postal-code" value={form.postal_code}
                onChange={set("postal_code")} className={ui.input} />
            </div>
          </div>
        </section>

        <section className={ui.section} aria-labelledby="ws-about">
          <h2 className={ui.sectionTitle} id="ws-about">About your business</h2>
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="expected_monthly_volume" className={ui.label}>Expected monthly volume</label>
              <select id="expected_monthly_volume" value={form.expected_monthly_volume}
                onChange={set("expected_monthly_volume")} className={ui.input}>
                <option value="">Choose a range</option>
                {MONTHLY_VOLUME.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="how_heard" className={ui.label}>How did you hear about us</label>
              <select id="how_heard" value={form.how_heard} onChange={set("how_heard")} className={ui.input}>
                <option value="">Choose one</option>
                {HEAR_ABOUT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* reCAPTCHA — only when a site key is configured */}
        {captchaEnabled && (
          <div className="recaptcha-wrap">
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={RECAPTCHA_SITE_KEY}
              onChange={(token) => setRecaptchaToken(token)}
              onExpired={() => setRecaptchaToken(null)}
            />
          </div>
        )}

        {error && <div className={ui.error} role="alert">{error}</div>}

        <div>
          <button
            type="submit"
            disabled={isSubmitting || short || (captchaEnabled && !recaptchaToken)}
            className={`${ui.btn} ${ui.primary} ${ui.tall}`}
          >
            {isSubmitting ? "Sending your application…" : "Submit application"}
          </button>
        </div>

        <p className={ui.foot}>
          Wholesale accounts are for business-to-business orders. By applying you confirm your business
          holds a valid resale certificate or its equivalent. Already have an account?{" "}
          <Link href="/login" className={ui.link}>Sign in</Link>
        </p>
      </form>
    </AuthPage>
  );
}
