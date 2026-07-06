"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type ReCAPTCHAType from "react-google-recaptcha";
import { authService } from "@/services/auth.service";
import { ApiClientError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

const ReCAPTCHA = dynamic(() => import("react-google-recaptcha"), {
  ssr: false,
}) as typeof ReCAPTCHAType;

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

const EMPLOYEE_OPTIONS = [
  "1 – 5",
  "6 – 10",
  "11 – 25",
  "26 – 50",
  "51 – 100",
  "100+",
];

const SALES_REP_OPTIONS = [
  "0",
  "1 – 2",
  "3 – 5",
  "6 – 10",
  "10+",
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E2E2DE",
  padding: "11px 14px",
  fontSize: "14px",
  color: "#1A1A1A",
  background: "#fff",
  outline: "none",
  transition: "border-color .2s",
  boxSizing: "border-box",
  fontFamily: "'DM Sans', sans-serif",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  color: "#1A1A1A",
  marginBottom: "6px",
  fontFamily: "'DM Sans', sans-serif",
};

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "#1C3557",
  marginBottom: "16px",
  paddingBottom: "10px",
  borderBottom: "1px solid #1C3557",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "16px",
};

const req = <span style={{ color: "#E8242A" }}>*</span>;

export default function WholesaleRegisterPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authIsLoading } = useAuthStore();
  const recaptchaRef = useRef<any>(null);

  useEffect(() => {
    if (!authIsLoading && isAuthenticated()) {
      router.replace("/account");
    }
  }, [authIsLoading, isAuthenticated, router]);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    // Company Information
    company_name: "",
    website: "",
    company_email: "",
    address1: "",
    address2: "",
    postal_code: "",
    country: "",
    city: "",
    state: "",
    resale_number: "",
    ppai_number: "",
    asi_number: "",
    phone: "",
    fax: "",
    // Contact Information
    first_name: "",
    last_name: "",
    title: "",
    email: "",
    // Business Information
    primary_business: "",
    secondary_business: "",
    how_heard: "",
    num_employees: "",
    num_sales_reps: "",
    // Web Account Information
    password: "",
    confirm_password: "",
    password_hint: "",
    // Communication
    promo_emails: false,
    // Terms
    terms_accepted: false,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    if (!form.terms_accepted) {
      setError("You must accept the terms and conditions.");
      return;
    }
    if (!recaptchaToken) {
      setError("Please complete the reCAPTCHA verification.");
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.registerWholesale({
        company_name: form.company_name,
        business_type: form.primary_business,
        tax_id: form.resale_number || undefined,
        website: form.website || undefined,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        fax: form.fax || undefined,
        company_email: form.company_email || undefined,
        address_line1: form.address1 || undefined,
        address_line2: form.address2 || undefined,
        city: form.city || undefined,
        state_province: form.state || undefined,
        postal_code: form.postal_code || undefined,
        country: form.country || undefined,
        ppai_number: form.ppai_number || undefined,
        asi_number: form.asi_number || undefined,
        secondary_business: form.secondary_business || undefined,
        how_heard: form.how_heard || undefined,
        num_employees: form.num_employees || undefined,
        num_sales_reps: form.num_sales_reps || undefined,
      });
      recaptchaRef.current?.reset();
      setRecaptchaToken(null);
      router.push("/wholesale/pending");
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "CONFLICT") {
          setError("An account with this email already exists. Please log in.");
        } else {
          setError(err.message);
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8F8F6", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Page header */}
      <div className="register-header" style={{ maxWidth: "760px", margin: "0 auto", padding: "56px 24px 0", textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "38px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.2, marginBottom: "12px" }}>
          Apply for a Wholesale Account
        </h1>
        <p className="register-sub" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B", maxWidth: "460px", margin: "0 auto 40px" }}>
          Apply once. Get lower prices, better terms, and faster fulfillment.
        </p>
      </div>

      {/* Content */}
      <div className="register-content-wrap" style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 24px 64px" }}>

        {/* Form card */}
        <div className="register-form-card" style={{ background: "#fff", border: "1px solid #E2E2DE", padding: "40px" }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ background: "#FFF0F0", border: "1px solid #fcc", borderRadius: "6px", padding: "12px 16px", fontSize: "13px", color: "#c0392b", marginBottom: "24px" }}>
                {error}
              </div>
            )}

            {/* ── Company Information ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Company Information</h3>
              <div className="register-form-row" style={gridStyle}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="company_name" style={labelStyle}>Company Name {req}</label>
                  <input id="company_name" name="company_name" type="text" required value={form.company_name} onChange={handleChange} style={inputStyle} placeholder="Your Company LLC" />
                </div>

                <div>
                  <label htmlFor="website" style={labelStyle}>Website <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="website" name="website" type="text" value={form.website} onChange={handleChange} placeholder="https://yourcompany.com" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="company_email" style={labelStyle}>Company Email {req}</label>
                  <input id="company_email" name="company_email" type="email" required value={form.company_email} onChange={handleChange} placeholder="info@yourcompany.com" style={inputStyle} />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="address1" style={labelStyle}>Address 1 {req}</label>
                  <input id="address1" name="address1" type="text" required value={form.address1} onChange={handleChange} placeholder="Street address" style={inputStyle} />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="address2" style={labelStyle}>Address 2 <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="address2" name="address2" type="text" value={form.address2} onChange={handleChange} placeholder="Suite, unit, building…" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="postal_code" style={labelStyle}>Postal / Zip Code {req}</label>
                  <input id="postal_code" name="postal_code" type="text" required value={form.postal_code} onChange={handleChange} placeholder="75001" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="country" style={labelStyle}>Country {req}</label>
                  <input id="country" name="country" type="text" required value={form.country} onChange={handleChange} placeholder="United States" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="city" style={labelStyle}>City {req}</label>
                  <input id="city" name="city" type="text" required value={form.city} onChange={handleChange} style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="state" style={labelStyle}>Province / State {req}</label>
                  <input id="state" name="state" type="text" required value={form.state} onChange={handleChange} placeholder="TX" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="resale_number" style={labelStyle}>RESALE # {req}</label>
                  <input id="resale_number" name="resale_number" type="text" required value={form.resale_number} onChange={handleChange} style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="ppai_number" style={labelStyle}>PPAI # <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="ppai_number" name="ppai_number" type="text" value={form.ppai_number} onChange={handleChange} style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="asi_number" style={labelStyle}>ASI # <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="asi_number" name="asi_number" type="text" value={form.asi_number} onChange={handleChange} style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="phone" style={labelStyle}>Phone {req}</label>
                  <input id="phone" name="phone" type="tel" required value={form.phone} onChange={handleChange} placeholder="(214) 000-0000" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="fax" style={labelStyle}>Fax <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="fax" name="fax" type="tel" value={form.fax} onChange={handleChange} placeholder="(214) 000-0000" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ── Contact Information ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Contact Information</h3>
              <div className="register-form-row" style={gridStyle}>
                <div>
                  <label htmlFor="first_name" style={labelStyle}>First Name {req}</label>
                  <input id="first_name" name="first_name" type="text" required value={form.first_name} onChange={handleChange} style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="last_name" style={labelStyle}>Last Name {req}</label>
                  <input id="last_name" name="last_name" type="text" required value={form.last_name} onChange={handleChange} style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="title" style={labelStyle}>Title <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="title" name="title" type="text" value={form.title} onChange={handleChange} placeholder="e.g. Owner, Manager" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="email" style={labelStyle}>Direct Email Address {req}</label>
                  <input id="email" name="email" type="email" required value={form.email} onChange={handleChange} placeholder="you@company.com" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ── Business Information ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Business Information</h3>
              <div className="register-form-row" style={gridStyle}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="primary_business" style={labelStyle}>What is your primary business activity? {req}</label>
                  <select id="primary_business" name="primary_business" required value={form.primary_business} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {PRIMARY_BUSINESS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="secondary_business" style={labelStyle}>What is your secondary business activity?</label>
                  <select id="secondary_business" name="secondary_business" value={form.secondary_business} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {PRIMARY_BUSINESS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="how_heard" style={labelStyle}>How did you hear about us?</label>
                  <select id="how_heard" name="how_heard" value={form.how_heard} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {HEAR_ABOUT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="num_employees" style={labelStyle}>Number of employees in your location:</label>
                  <select id="num_employees" name="num_employees" value={form.num_employees} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {EMPLOYEE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="num_sales_reps" style={labelStyle}>Number of outside sales reps:</label>
                  <select id="num_sales_reps" name="num_sales_reps" value={form.num_sales_reps} onChange={handleChange} style={inputStyle}>
                    <option value="">Select…</option>
                    {SALES_REP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Web Account Information ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Web Account Information</h3>
              <div className="register-form-row" style={gridStyle}>
                <div>
                  <label htmlFor="password" style={labelStyle}>Password {req}</label>
                  <input id="password" name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} placeholder="Min. 8 characters" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="confirm_password" style={labelStyle}>Confirm Password {req}</label>
                  <input id="confirm_password" name="confirm_password" type="password" required minLength={8} value={form.confirm_password} onChange={handleChange} placeholder="Re-enter password" style={inputStyle} />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="password_hint" style={labelStyle}>Password Hint <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input id="password_hint" name="password_hint" type="text" value={form.password_hint} onChange={handleChange} placeholder="A hint to help you remember your password" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ── Communication Preferences ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Communication Preferences</h3>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="promo_emails"
                  checked={form.promo_emails}
                  onChange={handleChange}
                  style={{ marginTop: "2px", accentColor: "#1A5CFF", width: "16px", height: "16px", flexShrink: 0 }}
                />
                <span style={{ fontSize: "14px", color: "#2A2830", lineHeight: 1.5 }}>
                  I would like to receive promotional emails, product updates, and exclusive offers from AF Apparels.
                </span>
              </label>
            </div>

            {/* ── Terms and Conditions ── */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={sectionHeadStyle}>Terms and Conditions</h3>
              <p style={{ fontSize: "13px", color: "#4A4850", lineHeight: 1.65, marginBottom: "14px" }}>
                By proceeding I acknowledge that I have read and agree to the following terms and conditions:
              </p>
              <div style={{ background: "#F8F8F6", border: "1px solid #E2E2DE", padding: "14px 16px", fontSize: "12px", color: "#6B6B6B", lineHeight: 1.7, marginBottom: "18px", maxHeight: "100px", overflowY: "auto", fontFamily: "'DM Sans', sans-serif" }}>
                AF Apparels wholesale accounts are strictly for business-to-business transactions. By submitting this application you confirm that your business holds a valid resale certificate or equivalent tax exemption document. All pricing, product availability, and terms are subject to change. Accounts may be suspended for misuse. We reserve the right to approve or deny any application at our sole discretion.
              </div>

              {/* reCAPTCHA */}
              <div className="recaptcha-wrap" style={{ marginBottom: "16px" }}>
                <ReCAPTCHA
                  ref={recaptchaRef}
                  sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? ""}
                  onChange={(token) => setRecaptchaToken(token)}
                  onExpired={() => setRecaptchaToken(null)}
                />
                {!recaptchaToken && (
                  <p style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>Please complete the verification above to submit.</p>
                )}
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="terms_accepted"
                  checked={form.terms_accepted}
                  onChange={handleChange}
                  style={{ marginTop: "2px", accentColor: "#1A5CFF", width: "16px", height: "16px", flexShrink: 0 }}
                />
                <span style={{ fontSize: "13px", color: "#2A2830", lineHeight: 1.5 }}>
                  I have read and agree to the terms and conditions above. {req}
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !recaptchaToken}
              style={{
                width: "100%",
                background: (isSubmitting || !recaptchaToken) ? "#9ca3af" : "#1C3557",
                color: "#fff",
                padding: "16px",
                fontSize: "15px",
                fontWeight: 500,
                border: "none",
                cursor: (isSubmitting || !recaptchaToken) ? "not-allowed" : "pointer",
                transition: "all .2s",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {isSubmitting ? "Submitting Application…" : "Submit Application →"}
            </button>

            <p style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", marginTop: "16px" }}>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "#1C3557", fontWeight: 500, textDecoration: "none" }}>
                Sign in →
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
