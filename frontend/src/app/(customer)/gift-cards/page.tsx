"use client";

/**
 * Buy a gift card for someone (components/storefront/GiftCards). Shown when
 * the shop sells them (Marketing, Gift cards, Settings); otherwise it says
 * so, and still points to the balance check for cards already out.
 */
import Link from "next/link";
import { Gift } from "lucide-react";
import { GIFT_CSS, GiftCardBuy, useGiftCardOffer } from "@/components/storefront/GiftCards";

export default function GiftCardsPage() {
  const { offer, failed } = useGiftCardOffer();
  const selling = !!offer?.on_sale;
  return (
    <>
      <style>{GIFT_CSS}</style>
      <div className="gc-page">
        <div className="gc-inner">
          <div className="gc-hero">
            <span className="gc-badge" aria-hidden><Gift size={28} strokeWidth={1.8} /></span>
            <h1 className="gc-h1">Gift cards</h1>
            {selling ? (
              <p className="gc-sub">{offer!.message || "Send a gift card by email. They choose what they like."}</p>
            ) : offer || failed ? (
              <p className="gc-sub">This shop is not selling gift cards right now.</p>
            ) : null}
          </div>
          {selling ? <GiftCardBuy offer={offer!} /> : !(offer || failed) ? <div className="at-skel" style={{ height: "240px" }} /> : null}
          <p className="gc-foot">
            Have a gift card? <Link href="/gift-cards/balance">Check its balance</Link>
          </p>
        </div>
      </div>
    </>
  );
}
