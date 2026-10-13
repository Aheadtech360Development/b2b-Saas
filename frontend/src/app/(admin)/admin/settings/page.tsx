"use client";

import { StoreNamePanel } from "@/components/admin/StoreNamePanel";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";

// "General Settings" used to sit here: a minimum order value, a guest pricing
// mode, a low-stock threshold and a notification email. Nothing read any of the
// four, and they were one value shared by every shop on the platform, so a
// brand typing its own changed it for all of them. The shop's email and domain
// are their own screen now (Settings, Domain and email).

export default function AdminSettingsPage() {
  return (
    <SettingsFrame active="store" title="Store details" sub="What your shop is called, everywhere a customer sees it.">
      {/* The one setting a customer sees on every page and in every email. */}
      <section className="pc-card">
        <div className="pc-card-head" style={{ display: "block" }}>
          <h2 className="pc-h2">Store name</h2>
          <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>The name your customers see. Change it here if your shop has been renamed.</p>
        </div>
        <div style={{ padding: "20px" }}>
          <StoreNamePanel />
        </div>
      </section>
    </SettingsFrame>
  );
}
