"use client";

/**
 * Tracking & Analytics — this store's own GA4, Pixel, Klaviyo and the rest.
 *
 * It used to sit at the very bottom of General & Email with no way in from the
 * sidebar, so nobody looking for it could find it.
 */
import { TrackingPanel } from "@/components/admin/TrackingPanel";

export default function TrackingSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tracking &amp; Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect your own Google Analytics, Meta Pixel, Klaviyo and the rest. The data goes to
          your accounts — no other store on this platform can see your traffic. Orders also record
          which campaign brought the buyer, which you can filter and export from the Orders page.
        </p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg px-6 py-6">
        <TrackingPanel />
      </div>
    </div>
  );
}
