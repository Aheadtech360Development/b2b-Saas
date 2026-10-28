"use client";

/**
 * /track/<order number>: the order's tracking page from the link in the
 * shop's emails (the order's key, kept by the layout) or for its signed-in
 * buyer. Anyone else is asked for the email the order was placed with.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { TRACKING_CSS, TrackingLookup, TrackingView, type TrackingPage } from "@/components/storefront/OrderTracking";
import { apiClient } from "@/lib/api-client";
import { orderKey } from "@/lib/orderThanks";

export default function TrackOneOrderPage() {
  const params = useParams<{ number: string }>();
  const number = decodeURIComponent(params?.number ?? "");
  const [data, setData] = useState<TrackingPage | null>(null);
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    if (!number) return;
    const key = orderKey(number);
    apiClient.get<TrackingPage>(`/api/v1/storefront/track/${encodeURIComponent(number)}`,
      key ? { headers: { "X-Order-Key": key } } : undefined)
      .then(setData)
      .catch(() => setAsk(true));
  }, [number]);

  return (
    <>
      <style>{`${TRACKING_CSS}
        .tk-page { background: #F8F8F6; min-height: 70vh; padding: 56px 24px; }
        .tk-inner { max-width: 640px; margin: 0 auto; }
        .tk-h1 { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; color: #1A1A1A; margin: 0 0 20px; }
        .tk-sub { font-family: 'DM Sans', sans-serif; font-size: 15px; color: #6B6B6B; margin: -8px 0 22px; }
        .tk-back { text-align: center; font-family: 'DM Sans', sans-serif; font-size: 13px; }
        .tk-back a { color: var(--brand-primary, #1C3557); font-weight: 500; text-decoration: none; }
        @media (max-width: 600px) { .tk-page { padding: 32px 16px; } .tk-h1 { font-size: 24px; } }
      `}</style>
      <div className="tk-page">
        <div className="tk-inner">
          <h1 className="tk-h1">Track your order</h1>
          {data ? <TrackingView data={data} /> : ask ? (
            <>
              <p className="tk-sub">Enter the email you used for order {number} to see where it is.</p>
              <TrackingLookup initialNumber={number} onFound={setData} />
            </>
          ) : (
            <p className="tk-sub" aria-busy>Finding your order&hellip;</p>
          )}
          <p className="tk-back"><Link href="/products">Keep shopping</Link></p>
        </div>
      </div>
    </>
  );
}
