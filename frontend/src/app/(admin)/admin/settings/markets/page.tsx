"use client";

/**
 * Settings, Markets: where the shop sells.
 *
 * The address book has always offered two countries, the United States and
 * Canada. This is the shop's own say over the second: switched off, a customer
 * can no longer add a Canadian address (the server refuses one too), and the
 * checkout will not ship to one saved earlier. The United States is the home
 * market and stays on: guest checkout, the sales tax lookup and live carrier
 * rates are built on a US address.
 *
 * Currency, language and measurements are said, not chosen: every charge is in
 * US dollars and the storefront is in English, so a list to pick from would
 * offer a choice nothing could honour.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";

const TAX_WORDS: Record<string, string> = {
  auto: "Sales tax is worked out for you from the ZIP code of each United States address.",
  manual: "You charge your own tax rates, by region.",
  none: "No tax is added at checkout.",
};

export default function MarketsPage() {
  const [loading, setLoading] = useState(true);
  const [canada, setCanada] = useState(true);
  const [savedCanada, setSavedCanada] = useState(true);
  const [taxMode, setTaxMode] = useState("auto");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    apiClient.get<Record<string, string>>("/api/v1/admin/settings")
      .then((s) => {
        let on = true; // every shop sold to Canada before it could choose
        try {
          const listed = s?.markets ? JSON.parse(s.markets)?.countries : null;
          if (Array.isArray(listed)) on = listed.includes("CA");
        } catch { /* unreadable: as if never set */ }
        setCanada(on); setSavedCanada(on);
        const mode = String(s?.tax_mode ?? "auto").toLowerCase();
        setTaxMode(mode === "manual" || mode === "none" ? mode : "auto");
      })
      .catch(() => setFlash({ text: "The saved settings could not be loaded. Reload before changing anything.", bad: true }))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setFlash(null);
    try {
      await apiClient.patch("/api/v1/admin/settings", { markets: JSON.stringify({ countries: canada ? ["US", "CA"] : ["US"] }) });
      setSavedCanada(canada);
      setFlash({ text: canada ? "Saved. Customers can add a Canadian address again." : "Saved. Canada is off: no new Canadian addresses, and checkout will not ship to one saved before." });
    } catch (e) {
      setFlash({ text: e instanceof Error && e.message ? e.message : "The change could not be saved. Try again.", bad: true });
    }
    setSaving(false);
  }

  const dirty = canada !== savedCanada;

  return (
    <SettingsFrame active="markets" title="Markets" sub="Where you sell, in what currency, and how addresses look."
      actions={<button type="button" className="pc-btn" data-kind="primary" onClick={save} disabled={saving || loading || !dirty}>{saving ? "Saving…" : "Save"}</button>}>
      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status">
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}

      <div style={{ display: "grid", gap: "18px" }} data-markets aria-busy={loading}>
        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Countries you sell to</h2></div>
          <div>
            <div className="pc-set-row" data-country="US">
              <span>
                <span style={{ fontSize: "14.5px", fontWeight: 500, color: "var(--pc-ink)" }}>United States</span>
                <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>Home market. Always on: guest checkout, sales tax and live carrier rates use a US address.</div>
              </span>
              <button type="button" className="pc-switch" role="switch" aria-label="United States" aria-checked data-on="" disabled style={{ cursor: "not-allowed" }} />
            </div>
            <div className="pc-set-row" data-country="CA">
              <span>
                <span style={{ fontSize: "14.5px", fontWeight: 500, color: "var(--pc-ink)" }}>Canada</span>
                <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>Customers with an account can save a Canadian address and have orders shipped to it, at your standard rate.</div>
              </span>
              <button type="button" className="pc-switch" role="switch" aria-label="Canada" aria-checked={canada} data-on={canada ? "" : undefined}
                disabled={loading} onClick={() => setCanada(!canada)} />
            </div>
          </div>
        </section>

        <section className="pc-card" style={{ padding: "18px 20px" }}>
          <h2 className="pc-h2">Currency and language</h2>
          <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
            <div className="pc-kv"><span>Store currency</span><b>US dollar (USD)</b></div>
            <div className="pc-kv"><span>Language</span><b>English</b></div>
            <div className="pc-kv"><span>Measurements</span><b>Pounds and inches</b></div>
          </div>
          <p className="pc-sub-line" style={{ margin: "12px 0 0", fontSize: "12.5px" }}>Prices, charges and payouts are in US dollars, and the storefront is in English. These are the same for every shop today, so there is nothing to choose.</p>
        </section>

        <section className="pc-card" style={{ padding: "18px 20px" }}>
          <h2 className="pc-h2">Address format</h2>
          <p className="pc-sub-line" style={{ margin: "8px 0 0" }}>An address asks for a street, a city, a state or province, and a ZIP or postal code. Typing the code fills in the city and state for United States and Canadian addresses.</p>
        </section>

        <section className="pc-card" style={{ padding: "18px 20px" }} data-tax-mode={taxMode}>
          <h2 className="pc-h2">Tax by country</h2>
          <p className="pc-sub-line" style={{ margin: "8px 0 14px" }}>{TAX_WORDS[taxMode]} Change how under Taxes.</p>
          <Link href="/admin/settings/taxes" className="pc-btn">Open Taxes</Link>
        </section>
      </div>
    </SettingsFrame>
  );
}
