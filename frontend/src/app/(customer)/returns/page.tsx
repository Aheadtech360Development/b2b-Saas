"use client";

/**
 * Start a return or an exchange as a guest: the order number and the email it
 * was placed with (POST /storefront/returns/lookup, rate limited; a wrong
 * email and a made-up number get the same answer), then the form. The key the
 * lookup answers with opens this one order for 30 minutes, kept in memory.
 */
import { useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { PastReturns, RETURN_CSS, ReturnStart, type ReturnInfo, type ReturnRequest } from "@/components/storefront/ReturnPortal";

export default function GuestReturnsPage() {
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<(ReturnInfo & { token: string }) | null>(null);

  async function look() {
    if (!number.trim() || !email.trim()) return;
    setBusy(true); setError(null);
    try {
      setFound(await apiClient.post<ReturnInfo & { token: string }>("/api/v1/storefront/returns/lookup",
        { order_number: number.trim(), email: email.trim() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not find that order.");
    }
    setBusy(false);
  }

  async function submit(r: ReturnRequest): Promise<string> {
    const made = await apiClient.post<{ rma_number: string }>("/api/v1/storefront/returns", r,
      { headers: { "X-Return-Token": found!.token } });
    return made.rma_number;
  }

  return (
    <>
      <style>{`${RETURN_CSS}
        .rp-page { background: #F8F8F6; min-height: 70vh; padding: 64px 24px; }
        .rp-inner { max-width: 640px; margin: 0 auto; }
        .rp-h1 { font-family: 'Fraunces', serif; font-size: 36px; font-weight: 600; color: #1A1A1A; margin: 0 0 8px; line-height: 1.15; }
        .rp-lede { font-family: 'DM Sans', sans-serif; font-size: 15px; color: #6B6B6B; margin: 0 0 24px; }
        @media (max-width: 600px) { .rp-page { padding: 32px 16px; } .rp-h1 { font-size: 26px; } }
      `}</style>
      <div className="rp-page">
        <div className="rp-inner">
          <h1 className="rp-h1">Returns and exchanges</h1>
          <p className="rp-lede">
            {found ? `Order ${found.order_number}` : "Enter your order number and the email you used."}
          </p>
          {found ? (
            <>
              <PastReturns items={found.returns} />
              <ReturnStart info={found} onSubmit={submit} />
            </>
          ) : (
            <form className="rp-card" onSubmit={(e) => { e.preventDefault(); look(); }} data-return-lookup>
              {error && <div className="rp-err" role="alert">{error}</div>}
              <div style={{ marginBottom: "14px" }}>
                <label className="rp-label" htmlFor="rp-number">Order number</label>
                <input id="rp-number" className="rp-input" value={number} maxLength={50} onChange={(e) => setNumber(e.target.value)} />
              </div>
              <div style={{ marginBottom: "18px" }}>
                <label className="rp-label" htmlFor="rp-email">Email</label>
                <input id="rp-email" className="rp-input" type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button type="submit" className="rp-btn" disabled={busy || !number.trim() || !email.trim()}>
                {busy ? "Finding your order…" : "Find my order"}
              </button>
            </form>
          )}
          <p className="rp-note" style={{ textAlign: "center", marginTop: "18px" }}>
            Have an account? <Link href="/account/orders">Start from your orders</Link>
          </p>
        </div>
      </div>
    </>
  );
}
