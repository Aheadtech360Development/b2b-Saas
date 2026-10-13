"use client";

/**
 * Tracking & Analytics — this store's own GA4, Pixel, Klaviyo and the rest.
 *
 * It used to sit at the very bottom of General & Email with no way in from the
 * sidebar, so nobody looking for it could find it.
 */
import { TrackingPanel } from "@/components/admin/TrackingPanel";
import { MarketingFrame } from "@/components/admin/marketing/MarketingFrame";

export default function TrackingSettingsPage() {
  return (
    <MarketingFrame active="tracking" title="Tracking"
      sub="Your own Google Analytics, Meta Pixel, Klaviyo and the rest. The data goes to your accounts only; orders also record the campaign that brought the buyer.">
      <div className="pc-card" style={{ padding: "24px" }}>
        <TrackingPanel />
      </div>
    </MarketingFrame>
  );
}
