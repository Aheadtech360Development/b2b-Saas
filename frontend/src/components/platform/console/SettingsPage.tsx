"use client";

/**
 * Platform settings (design screen 18), as far as the platform has settings
 * today: which Stripe world every shop's checkout is in. The design's other
 * sections (admins and roles, defaults, email templates, announcements, legal
 * pages) are new features waiting for a yes.
 */
import { StripeModePanel } from "@/components/platform/StripeModePanel";
import { PageHead } from "./ui";

export function SettingsPage() {
  return (
    <div>
      <PageHead eyebrow="Settings" title="Platform settings" lede="What is true for every brand at once." />
      <section className="pc-card">
        <div className="pc-card-head"><h2 className="pc-h2">Payments</h2></div>
        <div className="pc-pad">
          <StripeModePanel />
        </div>
      </section>
    </div>
  );
}
