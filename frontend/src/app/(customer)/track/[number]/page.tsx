"use client";

/**
 * /track/<order number>: the order's tracking page from the link in the
 * shop's emails (the order's key, kept by the layout) or for its signed-in
 * buyer. Anyone else is asked for the email the order was placed with.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PackageSearch } from "lucide-react";

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
      <style>{TRACKING_CSS}</style>
      <div className="trk-page">
        <div className="trk-inner">
          <div className="trk-hero">
            <span className="trk-badge" aria-hidden><PackageSearch size={28} strokeWidth={1.8} /></span>
            <h1 className="trk-h1">Track your order</h1>
          </div>
          {data ? <TrackingView data={data} /> : ask ? (
            <>
              <p className="trk-sub" style={{ textAlign: "center", marginBottom: 20 }}>Enter the email you used for order {number} to see where it is.</p>
              <TrackingLookup initialNumber={number} onFound={setData} />
            </>
          ) : (
            <p className="trk-sub" style={{ textAlign: "center" }} aria-busy>Finding your order&hellip;</p>
          )}
          <p className="trk-back"><Link href="/products">Keep shopping</Link></p>
        </div>
      </div>
    </>
  );
}
