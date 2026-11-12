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
import { PackageSearch } from "lucide-react";
import { TRACKING_CSS, TrackingLookup, TrackingView, type TrackingPage } from "@/components/storefront/OrderTracking";

export default function TrackOrderPage() {
  const [found, setFound] = useState<TrackingPage | null>(null);
  return (
    <>
      <style>{TRACKING_CSS}</style>
      <div className="trk-page">
        <div className="trk-inner">
          <div className="trk-hero">
            <span className="trk-badge" aria-hidden><PackageSearch size={28} strokeWidth={1.8} /></span>
            <h1 className="trk-h1">Track your order</h1>
            <p className="trk-sub">Enter your order number and the email you used, and see where it is.</p>
          </div>
          {found ? (
            <>
              <TrackingView data={found} />
              <p className="trk-back"><button type="button" onClick={() => setFound(null)}>Track another order</button></p>
            </>
          ) : (
            <TrackingLookup onFound={setFound} />
          )}
          <p className="trk-back"><Link href="/products">Keep shopping</Link></p>
        </div>
      </div>
    </>
  );
}
