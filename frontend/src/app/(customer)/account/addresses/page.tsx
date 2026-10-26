"use client";

/**
 * Account, Addresses: where the buyer's orders go. The form follows the
 * country (a US address asks for a state and a ZIP code and fills the city in
 * from it; a Canadian one a province and a postal code), offers only the
 * countries this shop sells to, and keeps an address already in another one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask } from "@/lib/dialog";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { useBranding } from "@/components/providers/BrandingProvider";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import { COUNTRIES, countryName } from "@/lib/countries";
import { AccountTabs } from "@/components/portal/AccountTabs";
import { Banner, Chip, Empty, Loading, Modal, PageHead } from "@/components/portal/ui";
import { regionRules } from "@/components/portal/regions";

interface Address {
  id: string;
  label: string | null;
  full_name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
}

const EMPTY_FORM = {
  label: "",
  full_name: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
  phone: "",
  is_default: false,
};

function AddressForm({ initial, editing, countries, onClose, onSaved }: {
  initial: typeof EMPTY_FORM;
  editing: string | null;
  countries: { code: string; name: string }[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rules = regionRules(form.country);

  const autofill = useCallback((a: { street: string; city: string; state: string; zipCode: string }) => {
    setForm((p) => ({ ...p, line1: a.street || p.line1, city: a.city || p.city, state: a.state || p.state, postal_code: a.zipCode || p.postal_code }));
  }, []);
  const streetRef = useAddressAutocomplete(autofill);

  // A US ZIP (or the first part of a Canadian postal code) fills in the city and region.
  async function lookUp(code: string, country: string) {
    const key = country === "CA" ? code.replace(/\s+/g, "").slice(0, 3) : code.trim();
    if (!["US", "CA"].includes(country) || (country === "US" ? key.length !== 5 : key.length !== 3)) return;
    try {
      const resp = await fetch(`https://api.zippopotam.us/${country.toLowerCase()}/${encodeURIComponent(key)}`);
      if (!resp.ok) return;
      const place = (await resp.json()).places?.[0];
      if (place) setForm((p) => ({ ...p, city: place["place name"] || p.city, state: place["state abbreviation"] || p.state }));
    } catch {
      // The buyer can still type them.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) await apiClient.patch(`/api/v1/account/addresses/${editing}`, form);
      else await apiClient.post("/api/v1/account/addresses", form);
      onSaved(editing ? "Address updated." : "Address added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The address could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal title={editing ? "Edit address" : "Add address"} onClose={onClose}
      foot={
        <>
          <button type="button" className="cp-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="address-form" className="cp-btn cp-btn-p" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save address" : "Add address"}
          </button>
        </>
      }>
      <form id="address-form" onSubmit={submit} className="cp-stack-sm" style={{ gap: 14 }}>
        {error && <Banner tone="bad">{error}</Banner>}
        <div className="cp-field">
          <label className="cp-label" htmlFor="a-country">Country</label>
          <select id="a-country" className="cp-select" value={form.country}
            onChange={(e) => setForm((p) => ({ ...p, country: e.target.value, state: "" }))} required>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <span className="cp-hint">The form changes to match the country.</span>
        </div>
        <div className="cp-grid2">
          <div className="cp-field">
            <label className="cp-label" htmlFor="a-label">Label</label>
            <input id="a-label" className="cp-input" placeholder="Warehouse, Office…" value={form.label} onChange={set("label")} />
          </div>
          <div className="cp-field">
            <label className="cp-label" htmlFor="a-name">Full name</label>
            <input id="a-name" className="cp-input" value={form.full_name} onChange={set("full_name")} autoComplete="name" />
          </div>
        </div>
        <div className="cp-field">
          <label className="cp-label" htmlFor="a-1">Address line 1</label>
          <input id="a-1" ref={streetRef} className="cp-input" placeholder="Street address" required value={form.line1} onChange={set("line1")} autoComplete="address-line1" />
        </div>
        <div className="cp-field">
          <label className="cp-label" htmlFor="a-2">Address line 2</label>
          <input id="a-2" className="cp-input" placeholder="Apartment, suite, unit (optional)" value={form.line2} onChange={set("line2")} autoComplete="address-line2" />
        </div>
        <div className="cp-grid3">
          <div className="cp-field">
            <label className="cp-label" htmlFor="a-postal">{rules.postal}</label>
            <input id="a-postal" className="cp-input" required maxLength={10} value={form.postal_code} autoComplete="postal-code"
              onChange={(e) => { const v = e.target.value; setForm((p) => ({ ...p, postal_code: v })); lookUp(v, form.country); }} />
          </div>
          <div className="cp-field">
            <label className="cp-label" htmlFor="a-city">City</label>
            <input id="a-city" className="cp-input" required value={form.city} onChange={set("city")} autoComplete="address-level2" />
          </div>
          <div className="cp-field">
            <label className="cp-label" htmlFor="a-region">{rules.region}</label>
            {rules.choices.length ? (
              <select id="a-region" className="cp-select" required value={form.state} onChange={set("state")}>
                <option value="">Choose</option>
                {form.state && !rules.choices.some(([c]) => c === form.state) && <option value={form.state}>{form.state}</option>}
                {rules.choices.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            ) : (
              <input id="a-region" className="cp-input" required value={form.state} onChange={set("state")} />
            )}
          </div>
        </div>
        {rules.postalHint && <span className="cp-hint">{rules.postalHint}</span>}
        <div className="cp-field">
          <label className="cp-label" htmlFor="a-phone">Phone</label>
          <input id="a-phone" className="cp-input" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
        <label className="cp-check">
          <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} />
          Use as my default ship-to address
        </label>
      </form>
    </Modal>
  );
}

export default function AddressBookPage() {
  const company = !!useAuthStore((s) => s.user?.company_id);
  return company ? <AddressBook /> : (
    <>
      <PageHead eyebrow="Account" title="Addresses" sub="Where we send your orders." />
      <AccountTabs />
      <div className="cp-card cp-pad cp-stack-sm" style={{ maxWidth: 640 }}>
        <h2 className="cp-h3">Your address is asked at checkout</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          A saved address book comes with a company account. For now, enter where each order goes when you check out.
        </p>
      </div>
    </>
  );
}

function AddressBook() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { ship_countries } = useBranding();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; form: typeof EMPTY_FORM } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const hasLoaded = useRef(false);

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    try {
      setAddresses(await apiClient.get<Address[]>("/api/v1/account/addresses"));
    } catch {
      setMessage({ tone: "bad", text: "Your addresses could not be loaded." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated() || hasLoaded.current) return;
    hasLoaded.current = true;
    loadAddresses();
  }, [isLoading, isAuthenticated, loadAddresses]);

  const sells = ship_countries?.length ? ship_countries : ["US", "CA"];
  const countriesFor = useMemo(() => (current: string) =>
    COUNTRIES.filter((c) => sells.includes(c.code) || c.code === current), [sells]);

  async function remove(a: Address) {
    if (!await ask(`Delete the address ${a.label || a.line1}?`, { ok: "Delete", danger: true })) return;
    try {
      await apiClient.delete(`/api/v1/account/addresses/${a.id}`);
      setMessage({ tone: "ok", text: "Address deleted." });
      await loadAddresses();
    } catch {
      setMessage({ tone: "bad", text: "That address could not be deleted." });
    }
  }

  async function makeDefault(a: Address) {
    try {
      await apiClient.patch(`/api/v1/account/addresses/${a.id}/set-default`, {});
      setMessage({ tone: "ok", text: "Default address updated." });
      await loadAddresses();
    } catch {
      setMessage({ tone: "bad", text: "The default address could not be changed." });
    }
  }

  return (
    <>
      <PageHead eyebrow="Account" title="Addresses" sub="Where we send your orders."
        actions={<button type="button" className="cp-btn cp-btn-p" onClick={() => { setMessage(null); setEditing({ id: null, form: { ...EMPTY_FORM, country: sells[0] ?? "US" } }); }}>+ Add address</button>} />
      <AccountTabs />
      {message && <div style={{ marginBottom: 16 }}><Banner tone={message.tone}>{message.text}</Banner></div>}
      {loading && addresses.length === 0 ? <Loading /> : addresses.length === 0 ? (
        <div className="cp-card"><Empty title="No addresses yet">Add one to check out faster.</Empty></div>
      ) : (
        <div className="cp-tiles" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {addresses.map((a) => (
            <article key={a.id} className="cp-card cp-pad cp-stack-sm" style={a.is_default ? { borderColor: "var(--cp-accent-line)", boxShadow: "inset 0 0 0 1px var(--cp-accent-line)" } : undefined}>
              <div className="cp-actions" style={{ justifyContent: "space-between" }}>
                <span className="cp-strong">{a.label || "Address"}</span>
                {a.is_default && <Chip tone="info">Default</Chip>}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                {a.full_name && <div>{a.full_name}</div>}
                <div>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</div>
                <div>{[a.city, a.state, a.postal_code].filter(Boolean).join(", ")}</div>
                <div>{countryName(a.country)}</div>
                {a.phone && <div className="cp-muted">{a.phone}</div>}
              </div>
              <div className="cp-actions">
                {!a.is_default && <button type="button" className="cp-btn cp-btn-sm" onClick={() => makeDefault(a)}>Make default</button>}
                <button type="button" className="cp-btn cp-btn-sm" onClick={() => {
                  setMessage(null);
                  setEditing({
                    id: a.id,
                    form: {
                      label: a.label || "", full_name: a.full_name || "", line1: a.line1, line2: a.line2 || "", city: a.city,
                      state: a.state, postal_code: a.postal_code, country: a.country, phone: a.phone || "", is_default: a.is_default,
                    },
                  });
                }}>Edit</button>
                <button type="button" className="cp-btn cp-btn-sm cp-btn-danger" onClick={() => remove(a)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <AddressForm
          initial={editing.form}
          editing={editing.id}
          countries={countriesFor(editing.form.country)}
          onClose={() => setEditing(null)}
          onSaved={async (text) => { setEditing(null); await loadAddresses(); setMessage({ tone: "ok", text }); }}
        />
      )}
    </>
  );
}
