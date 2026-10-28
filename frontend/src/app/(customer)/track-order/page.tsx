"use client";

/**
 * Track an order with its number and the email it was placed with.
 *
 * The lookup goes in a POST body (POST /storefront/track), rate limited by
 * the server, so the email is never in an address or a log; the answer is the
 * order's tracking page (components/storefront/OrderTracking), with every
 * parcel's timeline and no street address.
 */
import { useState } from "react";
import Link from "next/link";
import { TRACKING_CSS, TrackingLookup, TrackingView, type TrackingPage } from "@/components/storefront/OrderTracking";

export default function TrackOrderPage() {
  const [found, setFound] = useState<TrackingPage | null>(null);
  return (
    <>
      <style>{`${TRACKING_CSS}
        .to-page { background: #F8F8F6; min-height: 70vh; padding: 64px 24px; }
        .to-inner { max-width: 640px; margin: 0 auto; }
        .to-h1 { font-family: 'Fraunces', serif; font-size: 36px; font-weight: 600; color: #1A1A1A; margin: 0 0 8px; line-height: 1.15; }
        .to-sub { font-family: 'DM Sans', sans-serif; font-size: 15px; color: #6B6B6B; margin: 0 0 28px; }
        .to-back { text-align: center; font-family: 'DM Sans', sans-serif; font-size: 13px; }
        .to-back a, .to-back button { color: var(--brand-primary, #1C3557); font-weight: 500; text-decoration: none; background: none; border: none; cursor: pointer; font: inherit; }
        @media (max-width: 600px) { .to-page { padding: 32px 16px; } .to-h1 { font-size: 26px; } }
      `}</style>
      <div className="to-page">
        <div className="to-inner">
          <h1 className="to-h1">Track your order</h1>
          <p className="to-sub">Enter your order number and the email you used, and see where it is.</p>
          {found ? (
            <>
              <TrackingView data={found} />
              <p className="to-back"><button type="button" onClick={() => setFound(null)}>Track another order</button></p>
            </>
          ) : (
            <TrackingLookup onFound={setFound} />
          )}
          <p className="to-back"><Link href="/products">Keep shopping</Link></p>
        </div>
      </div>
    </>
  );
}
