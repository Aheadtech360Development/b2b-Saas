"use client";

/**
 * Markets: where the shop sells, in what currency, and how addresses look.
 *
 * Today that is one market. Checkout takes United States addresses, every
 * charge and payout is in US dollars, the storefront is in English, and tax
 * is worked out for US addresses. So this screen says what is so, and its
 * switches for other countries stay off until checkout can serve them: a
 * switch that saved a choice nothing reads would be a promise the shop
 * could not keep to a buyer.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";

const COUNTRIES: { name: string; sub: ReactNode; on: boolean }[] = [
  { name: "United States", sub: "Home market", on: true },
  { name: "Canada", sub: "Not available yet", on: false },
  { name: "Everywhere else", sub: "Not available yet", on: false },
];

export default function MarketsPage() {
  return (
    <SettingsFrame active="markets" title="Markets" sub="Where you sell, in what currency, and how addresses look.">
      <div style={{ display: "grid", gap: "18px" }} data-markets>
        <div className="pc-note" data-tone="blue">
          Your shop sells in the United States, in US dollars. Selling to other countries, in other currencies or in another language is not available yet, so there is nothing to change here for now.
        </div>

        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Countries you sell to</h2></div>
          <div>
            {COUNTRIES.map((c) => (
              <div key={c.name} className="pc-set-row" data-country={c.name}>
                <span>
                  <span style={{ fontSize: "14.5px", fontWeight: 500, color: "var(--pc-ink)" }}>{c.name}</span>
                  <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{c.sub}</div>
                </span>
                <button type="button" className="pc-switch" role="switch" aria-label={c.name} aria-checked={c.on} data-on={c.on ? "" : undefined} disabled
                  title={c.on ? "Your home market is always on" : "Checkout takes United States addresses only for now"} style={{ opacity: c.on ? 1 : 0.55, cursor: "not-allowed" }} />
              </div>
            ))}
          </div>
        </section>

        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Currency and language</h2></div>
          <div className="pc-form3" style={{ padding: "18px 20px" }}>
            <div>
              <label className="pc-label" htmlFor="mk-currency">Store currency</label>
              <select id="mk-currency" className="pc-input" value="usd" disabled onChange={() => {}}><option value="usd">US dollar (USD)</option></select>
              <div className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px" }}>Prices, charges and payouts</div>
            </div>
            <div>
              <label className="pc-label" htmlFor="mk-language">Language</label>
              <select id="mk-language" className="pc-input" value="en" disabled onChange={() => {}}><option value="en">English</option></select>
            </div>
            <div>
              <label className="pc-label" htmlFor="mk-units">Measurements</label>
              <select id="mk-units" className="pc-input" value="imperial" disabled onChange={() => {}}><option value="imperial">Pounds and inches</option></select>
              <div className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px" }}>Weights and sizes in admin and on the storefront</div>
            </div>
          </div>
        </section>

        <section className="pc-card" style={{ padding: "18px 20px" }}>
          <h2 className="pc-h2">Address format</h2>
          <p className="pc-sub-line" style={{ margin: "8px 0 0" }}>Checkout asks for a United States address: street, city, state and ZIP code.</p>
        </section>

        <section className="pc-card" style={{ padding: "18px 20px" }}>
          <h2 className="pc-h2">Tax by country</h2>
          <p className="pc-sub-line" style={{ margin: "8px 0 14px" }}>Sales tax is worked out for United States addresses. Choose how, and set your own rates, under Taxes.</p>
          <Link href="/admin/settings/taxes" className="pc-btn">Open Taxes</Link>
        </section>
      </div>
    </SettingsFrame>
  );
}
