"use client";

import { IntegrationsPanel } from "@/components/admin/IntegrationsPanel";
import { DomainPanel } from "@/components/admin/DomainPanel";
import { ShopEmailPanel } from "@/components/admin/ShopEmailPanel";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";

/** The shop's email and its address on the web (they were on the general settings page). */
export default function DomainAndEmailPage() {
  return (
    <SettingsFrame active="domain" title="Domain and email" sub="Your shop's address on the web, and the email your customers hear from.">
      <div style={{ display: "grid", gap: "18px" }}>
        {/* Email: one address, and what a customer will see because of it. */}
        <section className="pc-card">
          <div className="pc-card-head" style={{ display: "block" }}>
            <h2 className="pc-h2">Email</h2>
            <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>
              Every email to your customers goes out under your store name. Put your shop&apos;s email here and their replies come back to you.
            </p>
          </div>
          <div style={{ padding: "20px", display: "grid", gap: "20px" }}>
            <ShopEmailPanel />
            {/* For the shop that wants more than one address: a sender name of
                its own, a separate reply address, or its own sending domain. */}
            <details style={{ borderTop: "1px solid var(--pc-line)", paddingTop: "16px" }}>
              <summary style={{ fontSize: "14px", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>More options</summary>
              <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: "8px 0 12px" }}>
                A different sender name, a separate reply address, or sending from an address on your own
                domain (needs a domain you have verified with Resend).
              </p>
              <IntegrationsPanel category="email" />
            </details>
          </div>
        </section>

        {/* The shop's own domain, once it has bought one. */}
        <section className="pc-card">
          <div className="pc-card-head" style={{ display: "block" }}>
            <h2 className="pc-h2">Your domain</h2>
            <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>
              Bought a domain of your own? Point it here and your whole shop answers there: same products, same orders, same customers.
            </p>
          </div>
          <div style={{ padding: "20px" }}>
            <DomainPanel />
          </div>
        </section>
      </div>
    </SettingsFrame>
  );
}
