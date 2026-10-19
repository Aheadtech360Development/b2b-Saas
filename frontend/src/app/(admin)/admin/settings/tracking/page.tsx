"use client";

/**
 * Tracking & Analytics — this store's own GA4, Pixel, Klaviyo and the rest.
 *
 * It used to sit at the very bottom of General & Email with no way in from the
 * sidebar, so nobody looking for it could find it.
 */
import { IntegrationsPanel } from "@/components/admin/IntegrationsPanel";
import { TrackingPanel } from "@/components/admin/TrackingPanel";
import { MarketingFrame } from "@/components/admin/marketing/MarketingFrame";

export default function TrackingSettingsPage() {
  return (
    <MarketingFrame active="tracking" title="Tracking"
      sub="Your own Google Analytics, Meta Pixel, Klaviyo and the rest. The data goes to your accounts only; orders also record the campaign that brought the buyer.">
      <div className="pc-card" style={{ padding: "24px" }}>
        <TrackingPanel />
      </div>

      {/* The secret half of tracking: a token, saved masked like any other
          connected account, never sent back to the browser. */}
      <div className="pc-card" style={{ padding: "24px", marginTop: "16px", display: "grid", gap: "16px" }} data-server-tracking>
        <div>
          <h2 className="pc-h2">Server-side tracking</h2>
          <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>
            Ad blockers and iPhones stop the browser pixel from seeing some of your sales. Connect
            Meta&apos;s Conversions API and every order is also sent from our server to your Meta Pixel
            above. Meta counts each sale once, even when both arrive. Save your Pixel ID first.
          </p>
        </div>
        <IntegrationsPanel category="tracking" />
      </div>
    </MarketingFrame>
  );
}
