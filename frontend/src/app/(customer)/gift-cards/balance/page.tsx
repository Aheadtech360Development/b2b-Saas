"use client";

/**
 * What is left on a gift card. The code goes in a POST body, never in an
 * address; wrong codes are counted per visitor by the server, and an unknown
 * code and a disabled one get the same answer.
 */
import Link from "next/link";
import { GIFT_CSS, GiftCardBalance } from "@/components/storefront/GiftCards";

export default function GiftCardBalancePage() {
  return (
    <>
      <style>{GIFT_CSS}</style>
      <div className="gc-page">
        <div className="gc-inner">
          <h1 className="gc-h1">Gift card balance</h1>
          <p className="gc-sub">Enter the code from your gift card email to see what is left on it.</p>
          <GiftCardBalance />
          <p className="gc-foot"><Link href="/products">Start shopping</Link></p>
        </div>
      </div>
    </>
  );
}
