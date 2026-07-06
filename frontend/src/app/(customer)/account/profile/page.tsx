"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

const PRIMARY_BUSINESS_OPTIONS = [
  "Please Select One...",
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

const ANNUAL_VOLUME_OPTIONS = [
  "Please Select One...",
  "Under $10,000",
  "$10,000 - $50,000",
  "$50,000 - $100,000",
  "$100,000 - $250,000",
  "$250,000 - $500,000",
  "$500,000 - $1,000,000",
  "Over $1,000,000",
];

const EMPLOYEE_OPTIONS = [
  "Please Select One...",
  "1 – 5",
  "6 – 10",
  "11 – 25",
  "26 – 50",
  "51 – 100",
  "100+",
];

const SALES_REP_OPTIONS = [
  "Please Select One...",
  "0",
  "1 – 2",
  "3 – 5",
  "6 – 10",
  "10+",
];

const HOW_HEARD_OPTIONS = [
  "Please Select One...",
  "Google Search",
  "Social Media",
  "Trade Show",
  "Referral from Another Business",
  "Email Campaign",
  "Industry Publication",
  "Other",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface ProfileData {
  web_user: {
    first_name: string;
    last_name: string;
    email: string;
  };
  company: {
    account_number: string;
    name: string;
    trading_name: string | null;
    phone: string | null;
    fax: string | null;
    website: string | null;
    tax_id: string | null;
    tax_id_expiry: string | null;
    business_type: string | null;
    secondary_business: string | null;
    estimated_annual_volume: string | null;
    ppac_number: string | null;
    ppai_number: string | null;
    asi_number: string | null;
    // Registration fields
    company_email: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state_province: string | null;
    postal_code: string | null;
    country: string | null;
    how_heard: string | null;
    num_employees: string | null;
    num_sales_reps: string | null;
  } | null;
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const readonlyCls =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed";

export default function AccountProfilePage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const hasLoaded = useRef(false);

  const [userForm, setUserForm] = useState({ first_name: "", last_name: "" });
  const [companyForm, setCompanyForm] = useState({
    name: "",
    trading_name: "",
    phone: "",
    fax: "",
    website: "",
    tax_id: "",
    tax_id_expiry: "",
    business_type: "",
    secondary_business: "",
    estimated_annual_volume: "",
    ppac_number: "",
    ppai_number: "",
    asi_number: "",
    // Registration fields
    company_email: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state_province: "",
    postal_code: "",
    country: "",
    how_heard: "",
    num_employees: "",
    num_sales_reps: "",
  });

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    apiClient.get<ProfileData>("/api/v1/account/profile/full")
      .then((d) => {
        setData(d);
        setUserForm({ first_name: d.web_user.first_name || "", last_name: d.web_user.last_name || "" });
        if (d.company) {
          setCompanyForm({
            name: d.company.name || "",
            trading_name: d.company.trading_name || "",
            phone: d.company.phone || "",
            fax: d.company.fax || "",
            website: d.company.website || "",
            tax_id: d.company.tax_id || "",
            tax_id_expiry: d.company.tax_id_expiry || "",
            business_type: d.company.business_type || "",
            secondary_business: d.company.secondary_business || "",
            estimated_annual_volume: d.company.estimated_annual_volume || "",
            ppac_number: d.company.ppac_number || "",
            ppai_number: d.company.ppai_number || "",
            asi_number: d.company.asi_number || "",
            // Registration fields
            company_email: d.company.company_email || "",
            address_line1: d.company.address_line1 || "",
            address_line2: d.company.address_line2 || "",
            city: d.company.city || "",
            state_province: d.company.state_province || "",
            postal_code: d.company.postal_code || "",
            country: d.company.country || "",
            how_heard: d.company.how_heard || "",
            num_employees: d.company.num_employees || "",
            num_sales_reps: d.company.num_sales_reps || "",
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isLoading]);

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.patch("/api/v1/account/profile/user", userForm);
      setMessage({ type: "success", text: "User profile updated successfully!" });
    } catch {
      setMessage({ type: "error", text: "Failed to update user profile." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.patch("/api/v1/account/profile/company", companyForm);
      setMessage({ type: "success", text: "Company profile updated successfully!" });
    } catch {
      setMessage({ type: "error", text: "Failed to update company profile." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Account Profile</h1>

      {message && (
        <div
          className={`px-4 py-3 rounded-md text-sm font-medium ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Web User Profile ─────────────────────────────────────────────── */}
      <form onSubmit={handleSaveUser} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3">
          Web User Profile
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First Name" required>
            <input
              type="text"
              value={userForm.first_name}
              onChange={(e) => setUserForm((p) => ({ ...p, first_name: e.target.value }))}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Last Name" required>
            <input
              type="text"
              value={userForm.last_name}
              onChange={(e) => setUserForm((p) => ({ ...p, last_name: e.target.value }))}
              className={inputCls}
              required
            />
          </Field>
        </div>

        <Field label="Email Address">
          <input type="email" value={data?.web_user.email || ""} readOnly className={readonlyCls} />
        </Field>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save User Profile"}
          </button>
        </div>
      </form>

      {/* ── Company Profile ───────────────────────────────────────────────── */}
      {data?.company && (
        <form onSubmit={handleSaveCompany} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3">
            Customer Account Profile
          </h2>

          <Field label="Account Number">
            <input
              type="text"
              value={data.company.account_number || ""}
              readOnly
              className={`${readonlyCls} font-mono`}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Company Name" required>
              <input
                type="text"
                value={companyForm.name}
                onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))}
                className={inputCls}
                required
              />
            </Field>
            <Field label="Trading Name">
              <input
                type="text"
                value={companyForm.trading_name}
                onChange={(e) => setCompanyForm((p) => ({ ...p, trading_name: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone">
              <input
                type="tel"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Fax">
              <input
                type="tel"
                value={companyForm.fax}
                onChange={(e) => setCompanyForm((p) => ({ ...p, fax: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tax ID #">
              <input
                type="text"
                value={companyForm.tax_id}
                onChange={(e) => setCompanyForm((p) => ({ ...p, tax_id: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Tax ID Expiry">
              <input
                type="text"
                placeholder="MM/YYYY"
                value={companyForm.tax_id_expiry}
                onChange={(e) => setCompanyForm((p) => ({ ...p, tax_id_expiry: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Primary Business">
            <select
              value={companyForm.business_type}
              onChange={(e) => setCompanyForm((p) => ({ ...p, business_type: e.target.value }))}
              className={inputCls}
            >
              {PRIMARY_BUSINESS_OPTIONS.map((opt) => (
                <option key={opt} value={opt === "Please Select One..." ? "" : opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Secondary Business">
            <select
              value={companyForm.secondary_business}
              onChange={(e) => setCompanyForm((p) => ({ ...p, secondary_business: e.target.value }))}
              className={inputCls}
            >
              {PRIMARY_BUSINESS_OPTIONS.map((opt) => (
                <option key={opt} value={opt === "Please Select One..." ? "" : opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Estimated Annual Volume">
            <select
              value={companyForm.estimated_annual_volume}
              onChange={(e) =>
                setCompanyForm((p) => ({ ...p, estimated_annual_volume: e.target.value }))
              }
              className={inputCls}
            >
              {ANNUAL_VOLUME_OPTIONS.map((opt) => (
                <option key={opt} value={opt === "Please Select One..." ? "" : opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Website">
            <input
              type="url"
              placeholder="https://example.com"
              value={companyForm.website}
              onChange={(e) => setCompanyForm((p) => ({ ...p, website: e.target.value }))}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="PPAC #">
              <input
                type="text"
                value={companyForm.ppac_number}
                onChange={(e) => setCompanyForm((p) => ({ ...p, ppac_number: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="PPAI #">
              <input
                type="text"
                value={companyForm.ppai_number}
                onChange={(e) => setCompanyForm((p) => ({ ...p, ppai_number: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="ASI #">
              <input
                type="text"
                value={companyForm.asi_number}
                onChange={(e) => setCompanyForm((p) => ({ ...p, asi_number: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Address & Registration Info */}
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Address &amp; Registration</h3>

            <Field label="Company Email">
              <input
                type="email"
                value={companyForm.company_email}
                onChange={(e) => setCompanyForm((p) => ({ ...p, company_email: e.target.value }))}
                className={inputCls}
                placeholder="orders@yourcompany.com"
              />
            </Field>

            <div className="mt-3">
              <Field label="Address Line 1">
                <input
                  type="text"
                  value={companyForm.address_line1}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, address_line1: e.target.value }))}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Address Line 2">
                <input
                  type="text"
                  value={companyForm.address_line2}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, address_line2: e.target.value }))}
                  className={inputCls}
                  placeholder="Suite, Unit, etc."
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <Field label="City">
                <input
                  type="text"
                  value={companyForm.city}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, city: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="State / Province">
                <select
                  value={companyForm.state_province}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, state_province: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Select State</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <Field label="Postal Code">
                <input
                  type="text"
                  value={companyForm.postal_code}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, postal_code: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Country">
                <select
                  value={companyForm.country}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, country: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Select Country</option>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <Field label="Number of Employees">
                <select
                  value={companyForm.num_employees}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, num_employees: e.target.value }))}
                  className={inputCls}
                >
                  {EMPLOYEE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt === "Please Select One..." ? "" : opt}>{opt}</option>
                  ))}
                </select>
              </Field>
              <Field label="Number of Sales Reps">
                <select
                  value={companyForm.num_sales_reps}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, num_sales_reps: e.target.value }))}
                  className={inputCls}
                >
                  {SALES_REP_OPTIONS.map((opt) => (
                    <option key={opt} value={opt === "Please Select One..." ? "" : opt}>{opt}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="How Did You Hear About Us">
                <select
                  value={companyForm.how_heard}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, how_heard: e.target.value }))}
                  className={inputCls}
                >
                  {HOW_HEARD_OPTIONS.map((opt) => (
                    <option key={opt} value={opt === "Please Select One..." ? "" : opt}>{opt}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Company Profile"}
            </button>
          </div>
        </form>
      )}

    </div>
  );
}
