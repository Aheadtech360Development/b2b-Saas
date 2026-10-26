"use client";

/**
 * Account, Profile: who the buyer is and, on a company account, the company
 * and where it is billed. One Save for the page, shown as soon as something
 * changes. The promo-industry fields the old form asked for (fax, PPAC, PPAI,
 * ASI, employees, sales reps, how you heard) are not asked here any more; what
 * is stored for them stays as it is.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { useBranding } from "@/components/providers/BrandingProvider";
import { COUNTRIES } from "@/lib/countries";
import { AccountTabs } from "@/components/portal/AccountTabs";
import { Banner, Loading, PageHead } from "@/components/portal/ui";
import { regionRules } from "@/components/portal/regions";
import type { FullProfile } from "@/components/portal/data";

const BUSINESS_TYPES = ["Print shop", "Brand", "Retailer", "Corporate buyer", "Other"];

const COMPANY_FIELDS = [
  "name", "trading_name", "phone", "tax_id", "business_type", "company_email", "website",
  "address_line1", "address_line2", "city", "state_province", "postal_code", "country",
] as const;
type CompanyForm = Record<(typeof COMPANY_FIELDS)[number], string>;
interface UserForm { first_name: string; last_name: string; phone: string }

const blankCompany = () => Object.fromEntries(COMPANY_FIELDS.map((k) => [k, ""])) as CompanyForm;

export default function AccountProfilePage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { ship_countries } = useBranding();
  const [data, setData] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const hasLoaded = useRef(false);

  const [user, setUser] = useState<UserForm>({ first_name: "", last_name: "", phone: "" });
  const [company, setCompany] = useState<CompanyForm>(blankCompany());
  const [savedUser, setSavedUser] = useState<UserForm>(user);
  const [savedCompany, setSavedCompany] = useState<CompanyForm>(company);

  function load() {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      apiClient.get<FullProfile>("/api/v1/account/profile/full"),
      apiClient.get<{ phone: string | null }>("/api/v1/account/profile").catch(() => ({ phone: null })),
    ])
      .then(([d, me]) => {
        setData(d);
        const u = { first_name: d.web_user.first_name || "", last_name: d.web_user.last_name || "", phone: me.phone || "" };
        setUser(u);
        setSavedUser(u);
        const c = blankCompany();
        if (d.company) for (const k of COMPANY_FIELDS) c[k] = String((d.company as Record<string, unknown>)[k] ?? "");
        setCompany(c);
        setSavedCompany(c);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (isLoading || !isAuthenticated() || hasLoaded.current) return;
    hasLoaded.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const userDirty = JSON.stringify(user) !== JSON.stringify(savedUser);
  const companyDirty = !!data?.company && JSON.stringify(company) !== JSON.stringify(savedCompany);
  const dirty = userDirty || companyDirty;

  const countries = useMemo(() => {
    const sells = ship_countries?.length ? ship_countries : ["US", "CA"];
    return COUNTRIES.filter((c) => sells.includes(c.code) || c.code === company.country);
  }, [ship_countries, company.country]);
  const rules = regionRules(company.country || "US");
  const businessTypes = company.business_type && !BUSINESS_TYPES.includes(company.business_type)
    ? [company.business_type, ...BUSINESS_TYPES] : BUSINESS_TYPES;

  function discard() {
    setUser(savedUser);
    setCompany(savedCompany);
    setMessage(null);
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!user.first_name.trim() || !user.last_name.trim()) {
      setMessage({ tone: "bad", text: "First and last name are needed." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (userDirty) {
        await apiClient.patch("/api/v1/account/profile/user", {
          first_name: user.first_name.trim(), last_name: user.last_name.trim(), phone: user.phone.trim() || null,
        });
        setSavedUser(user);
        // The top bar shows the name too.
        const s = useAuthStore.getState();
        if (s.accessToken && s.user) s.setAuth(s.accessToken, { ...s.user, first_name: user.first_name.trim(), last_name: user.last_name.trim() });
      }
      if (companyDirty) {
        const changed = Object.fromEntries(COMPANY_FIELDS.filter((k) => company[k] !== savedCompany[k]).map((k) => [k, company[k].trim()]));
        await apiClient.patch("/api/v1/account/profile/company", changed);
        setSavedCompany(company);
      }
      setMessage({ tone: "ok", text: "Saved." });
    } catch {
      setMessage({ tone: "bad", text: "Your changes could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof CompanyForm>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setCompany((p) => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <PageHead eyebrow="Account" title="Account" sub="Your details, addresses and security." />
      <AccountTabs />
      {loading ? <Loading /> : loadError || !data ? (
        <Banner tone="bad" onRetry={load}>Your details could not be loaded.</Banner>
      ) : (
        <form onSubmit={save} className="cp-stack">
          {dirty && (
            <div className="cp-savebar" role="status">
              <span className="cp-grow">Unsaved changes</span>
              <button type="button" className="cp-btn cp-btn-sm" onClick={discard} disabled={saving}>Discard</button>
              <button type="submit" className="cp-btn cp-btn-sm cp-btn-p" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          )}
          {message && <Banner tone={message.tone}>{message.text}</Banner>}

          <section className="cp-card cp-pad cp-stack-sm" style={{ gap: 16 }} aria-labelledby="you">
            <h2 id="you" className="cp-h2">You</h2>
            <div className="cp-grid2">
              <div className="cp-field">
                <label className="cp-label" htmlFor="p-first">First name</label>
                <input id="p-first" className="cp-input" required value={user.first_name} autoComplete="given-name"
                  onChange={(e) => setUser((p) => ({ ...p, first_name: e.target.value }))} />
              </div>
              <div className="cp-field">
                <label className="cp-label" htmlFor="p-last">Last name</label>
                <input id="p-last" className="cp-input" required value={user.last_name} autoComplete="family-name"
                  onChange={(e) => setUser((p) => ({ ...p, last_name: e.target.value }))} />
              </div>
              <div className="cp-field">
                <label className="cp-label" htmlFor="p-email">Email</label>
                <input id="p-email" className="cp-input" value={data.web_user.email} disabled />
                <span className="cp-hint">Your sign-in. Ask the shop to change it.</span>
              </div>
              <div className="cp-field">
                <label className="cp-label" htmlFor="p-phone">Phone</label>
                <input id="p-phone" className="cp-input" type="tel" value={user.phone} autoComplete="tel"
                  onChange={(e) => setUser((p) => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
          </section>

          {data.company && (
            <>
              <section className="cp-card cp-pad cp-stack-sm" style={{ gap: 16 }} aria-labelledby="company">
                <div className="cp-card-head" style={{ marginBottom: 0 }}>
                  <h2 id="company" className="cp-h2">Company</h2>
                  <span className="cp-note">Account {data.company.account_number}</span>
                </div>
                <div className="cp-grid2">
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="c-name">Company name</label>
                    <input id="c-name" className="cp-input" value={company.name} onChange={set("name")} autoComplete="organization" />
                  </div>
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="c-trading">Trading name</label>
                    <input id="c-trading" className="cp-input" value={company.trading_name} onChange={set("trading_name")} />
                  </div>
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="c-phone">Phone</label>
                    <input id="c-phone" className="cp-input" type="tel" value={company.phone} onChange={set("phone")} />
                  </div>
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="c-email">Company email</label>
                    <input id="c-email" className="cp-input" type="email" value={company.company_email} onChange={set("company_email")} />
                  </div>
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="c-tax">Tax ID or VAT number</label>
                    <input id="c-tax" className="cp-input" value={company.tax_id} onChange={set("tax_id")} />
                  </div>
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="c-type">Business type</label>
                    <select id="c-type" className="cp-select" value={company.business_type} onChange={set("business_type")}>
                      <option value="">Choose one</option>
                      {businessTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="cp-field cp-span2">
                    <label className="cp-label" htmlFor="c-web">Website</label>
                    <input id="c-web" className="cp-input" inputMode="url" placeholder="https://" value={company.website} onChange={set("website")} />
                  </div>
                </div>
              </section>

              <section className="cp-card cp-pad cp-stack-sm" style={{ gap: 16 }} aria-labelledby="billing">
                <h2 id="billing" className="cp-h2">Billing address</h2>
                <div className="cp-grid2">
                  <div className="cp-field cp-span2">
                    <label className="cp-label" htmlFor="b-country">Country</label>
                    <select id="b-country" className="cp-select" value={company.country || "US"} onChange={set("country")}>
                      {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="cp-field cp-span2">
                    <label className="cp-label" htmlFor="b-1">Address line 1</label>
                    <input id="b-1" className="cp-input" value={company.address_line1} onChange={set("address_line1")} autoComplete="address-line1" />
                  </div>
                  <div className="cp-field cp-span2">
                    <label className="cp-label" htmlFor="b-2">Address line 2</label>
                    <input id="b-2" className="cp-input" value={company.address_line2} onChange={set("address_line2")} autoComplete="address-line2" />
                  </div>
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="b-city">City</label>
                    <input id="b-city" className="cp-input" value={company.city} onChange={set("city")} autoComplete="address-level2" />
                  </div>
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="b-region">{rules.region}</label>
                    {rules.choices.length ? (
                      <select id="b-region" className="cp-select" value={company.state_province} onChange={set("state_province")}>
                        <option value="">Choose</option>
                        {company.state_province && !rules.choices.some(([c]) => c === company.state_province) && (
                          <option value={company.state_province}>{company.state_province}</option>
                        )}
                        {rules.choices.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                      </select>
                    ) : (
                      <input id="b-region" className="cp-input" value={company.state_province} onChange={set("state_province")} />
                    )}
                  </div>
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="b-postal">{rules.postal}</label>
                    <input id="b-postal" className="cp-input" value={company.postal_code} onChange={set("postal_code")} autoComplete="postal-code" />
                  </div>
                </div>
              </section>
            </>
          )}

          {!dirty && (
            <div className="cp-actions" style={{ justifyContent: "flex-end" }}>
              <button type="submit" className="cp-btn cp-btn-p" disabled>Saved</button>
            </div>
          )}
        </form>
      )}
    </>
  );
}
