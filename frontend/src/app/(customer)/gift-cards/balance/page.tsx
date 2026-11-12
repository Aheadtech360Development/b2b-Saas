"use client";

/**
 * What is left on a gift card. The code goes in a POST body, never in an
 * address; wrong codes are counted per visitor by the server, and an unknown
 * code and a disabled one get the same answer.
 */
import Link from "next/link";
import { Gift } from "lucide-react";
import { GIFT_CSS, GiftCardBalance } from "@/components/storefront/GiftCards";

export default function GiftCardBalancePage() {
  return (
    <>
      <style>{GIFT_CSS}</style>
      <div className="gc-page">
        <div className="gc-inner">
          <div className="gc-hero">
            <span className="gc-badge" aria-hidden><Gift size={28} strokeWidth={1.8} /></span>
            <h1 className="gc-h1">Gift card balance</h1>
            <p className="gc-sub">Enter the code from your gift card email to see what is left on it.</p>
          </div>
          <GiftCardBalance />
          <p className="gc-foot"><Link href="/products">Start shopping</Link></p>
        </div>
      </div>
    </>
  );
}
