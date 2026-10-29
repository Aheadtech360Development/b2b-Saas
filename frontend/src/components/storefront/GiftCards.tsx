"use client";

/**
 * The shop's gift cards, for buyers (api/v1/gift_cards.py, Retail launch
 * package 3): buy one for someone (/gift-cards), and check what is left on
 * one (/gift-cards/balance).
 *
 * Buying adds a line to the cart: the account's (POST /cart/gift-card) or
 * this browser's guest cart. The code is made when the order is paid and
 * emailed to the recipient; nobody else ever sees it.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { addToGuestCart, giftCardLine } from "@/lib/guestCart";
import { trackLineAdd } from "@/lib/tracking";

export interface GiftCardOffer {
  on_sale: boolean;
  accepted: boolean;
  amounts: number[];
  custom: boolean;
  custom_min: number;
  custom_max: number;
  expiry_months: number;
  message: string;
  message_max: number;
}

export const GIFT_CSS = `
  .gc-page { background: #F8F8F6; min-height: 70vh; padding: 64px 24px; }
  .gc-inner { max-width: 640px; margin: 0 auto; }
  .gc-h1 { font-family: 'Fraunces', serif; font-size: 36px; font-weight: 600; color: #1A1A1A; margin: 0 0 8px; line-height: 1.15; }
  .gc-sub { font-family: 'DM Sans', sans-serif; font-size: 15px; color: #6B6B6B; margin: 0 0 28px; line-height: 1.6; }
  .gc-card { background: #fff; border: 1px solid #E8E6E1; padding: 26px; font-family: 'DM Sans', sans-serif; }
  .gc-label { display: block; font-size: 12px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: #1A1A1A; margin: 0 0 8px; }
  .gc-input { width: 100%; padding: 12px 14px; border: 1px solid #DCD9D3; font-size: 15px; font-family: inherit; box-sizing: border-box; background: #fff; color: #1A1A1A; outline: none; }
  .gc-input:focus { border-color: var(--brand-primary, #1C3557); }
  .gc-amounts { display: flex; flex-wrap: wrap; gap: 10px; }
  .gc-amount { min-width: 84px; padding: 12px 16px; border: 1.5px solid #DCD9D3; background: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; color: #1A1A1A; }
  .gc-amount[aria-pressed="true"] { border-color: var(--brand-primary, #1C3557); background: #F3F5F8; }
  .gc-row { margin-bottom: 18px; }
  .gc-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .gc-btn { width: 100%; padding: 15px; border: none; background: var(--brand-primary, #1C3557); color: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
  .gc-btn:disabled { opacity: .6; cursor: not-allowed; }
  .gc-err { margin: 0 0 14px; padding: 10px 14px; background: rgba(232,36,42,.07); border: 1px solid rgba(232,36,42,.25); color: #B42318; font-size: 13.5px; font-weight: 600; }
  .gc-ok { margin: 0 0 14px; padding: 12px 14px; background: rgba(5,150,105,.07); border: 1px solid rgba(5,150,105,.25); color: #065F46; font-size: 14px; }
  .gc-note { font-size: 13px; color: #6B6B6B; margin-top: 12px; line-height: 1.55; }
  .gc-foot { text-align: center; font-family: 'DM Sans', sans-serif; font-size: 13.5px; margin-top: 18px; }
  .gc-foot a { color: var(--brand-primary, #1C3557); font-weight: 500; text-decoration: none; }
  .gc-balance { font-size: 34px; font-weight: 700; color: #1A1A1A; margin: 4px 0; }
  @media (max-width: 600px) { .gc-page { padding: 32px 16px; } .gc-h1 { font-size: 26px; } .gc-two { grid-template-columns: 1fr; } .gc-card { padding: 18px; } }
`;

const money = (n: number) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const EMAIL = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[A-Za-z]{2,}$/;

export function useGiftCardOffer(): { offer: GiftCardOffer | null; failed: boolean } {
  const [offer, setOffer] = useState<GiftCardOffer | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    apiClient.get<GiftCardOffer>("/api/v1/storefront/gift-cards").then(setOffer).catch(() => setFailed(true));
  }, []);
  return { offer, failed };
}

export function GiftCardBuy({ offer }: { offer: GiftCardOffer }) {
  const { isAuthenticated } = useAuthStore();
  const [amount, setAmount] = useState<number | null>(offer.amounts[0] ?? null);
  const [custom, setCustom] = useState("");
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const value = amount ?? (custom.trim() ? Number(custom) : NaN);

  async function add() {
    setError(null);
    if (!Number.isFinite(value) || value <= 0) { setError("Choose an amount."); return; }
    if (amount == null && offer.custom && (value < offer.custom_min || value > offer.custom_max)) {
      setError(`Choose an amount between ${money(offer.custom_min)} and ${money(offer.custom_max)}.`); return;
    }
    if (!EMAIL.test(toEmail.trim())) { setError("Enter the email address the gift card should go to."); return; }
    const details = {
      amount: Math.round(value * 100) / 100,
      recipient_email: toEmail.trim(),
      recipient_name: toName.trim() || null,
      message: message.trim() || null,
      sender_name: fromName.trim() || null,
    };
    setBusy(true);
    try {
      if (isAuthenticated()) {
        await apiClient.post("/api/v1/cart/gift-card", details);
        window.dispatchEvent(new Event("cart_updated"));
      } else {
        addToGuestCart(giftCardLine(details));
      }
      // Told to the shop's analytics like any other add to cart; one id for
      // every gift card, never who it is for.
      trackLineAdd({ variant_id: "gift-card", product_name: "Gift card", sku: "GIFT-CARD",
                     unit_price: details.amount, quantity: 1, item_type: "gift_card" });
      setAdded(true);
      setToName(""); setToEmail(""); setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The gift card could not be added. Try again.");
    }
    setBusy(false);
  }

  if (added) {
    return (
      <div className="gc-card" data-gift-added>
        <div className="gc-ok">Added to your cart. The code is emailed to them when you pay.</div>
        <div className="gc-two">
          <button type="button" className="gc-btn" onClick={() => setAdded(false)} style={{ background: "#fff", color: "#1A1A1A", border: "1px solid #DCD9D3" }}>
            Send another
          </button>
          <Link href="/cart" className="gc-btn" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>Go to cart</Link>
        </div>
      </div>
    );
  }

  return (
    <form className="gc-card" onSubmit={(e) => { e.preventDefault(); add(); }} data-gift-buy>
      {error && <div className="gc-err" role="alert">{error}</div>}
      <div className="gc-row">
        <span className="gc-label">Amount</span>
        <div className="gc-amounts" role="group" aria-label="Amount">
          {offer.amounts.map((a) => (
            <button key={a} type="button" className="gc-amount" aria-pressed={amount === a}
              onClick={() => { setAmount(a); setCustom(""); }}>{money(a)}</button>
          ))}
        </div>
        {offer.custom && (
          <div style={{ marginTop: "12px" }}>
            <input className="gc-input" type="number" inputMode="decimal" min={offer.custom_min} max={offer.custom_max} step="1"
              value={custom} placeholder={`Another amount, ${money(offer.custom_min)} to ${money(offer.custom_max)}`}
              aria-label="Another amount" onFocus={() => setAmount(null)} onChange={(e) => { setAmount(null); setCustom(e.target.value); }} />
          </div>
        )}
      </div>
      <div className="gc-row gc-two">
        <div>
          <label className="gc-label" htmlFor="gc-to-name">Their name</label>
          <input id="gc-to-name" className="gc-input" value={toName} maxLength={120} onChange={(e) => setToName(e.target.value)} />
        </div>
        <div>
          <label className="gc-label" htmlFor="gc-to-email">Their email</label>
          <input id="gc-to-email" className="gc-input" type="email" value={toEmail} maxLength={254} required onChange={(e) => setToEmail(e.target.value)} />
        </div>
      </div>
      <div className="gc-row">
        <label className="gc-label" htmlFor="gc-from">From</label>
        <input id="gc-from" className="gc-input" value={fromName} maxLength={120} placeholder="Your name, as they will see it" onChange={(e) => setFromName(e.target.value)} />
      </div>
      <div className="gc-row">
        <label className="gc-label" htmlFor="gc-message">Message</label>
        <textarea id="gc-message" className="gc-input" rows={3} maxLength={offer.message_max || 500} value={message}
          placeholder="Optional" onChange={(e) => setMessage(e.target.value)} style={{ resize: "vertical" }} />
      </div>
      <button type="submit" className="gc-btn" disabled={busy}>
        {busy ? "Adding…" : `Add ${Number.isFinite(value) && value > 0 ? money(value) : ""} gift card to cart`}
      </button>
      <p className="gc-note">
        The code is emailed to them when your order is paid. It works at checkout here
        {offer.expiry_months ? ` for ${Math.round(offer.expiry_months / 12)} years` : " and never expires"}, and whatever they do not spend stays on the card.
      </p>
    </form>
  );
}

export function GiftCardBalance() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ masked: string; balance: number; expires_at: string | null; problem: string | null } | null>(null);

  async function check() {
    if (!code.trim()) return;
    setBusy(true); setError(null); setFound(null);
    try {
      const r = await apiClient.post<{ masked: string; balance: number; expires_at: string | null; problem: string | null }>(
        "/api/v1/storefront/gift-cards/balance", { code: code.trim() });
      setFound(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That gift card code isn't valid. Check it and try again.");
    }
    setBusy(false);
  }

  return (
    <form className="gc-card" onSubmit={(e) => { e.preventDefault(); check(); }} data-gift-balance>
      {error && <div className="gc-err" role="alert">{error}</div>}
      {found && (
        <div className="gc-ok" data-balance-found>
          <div>Gift card {found.masked}</div>
          <div className="gc-balance">{money(found.balance)}</div>
          <div>{found.problem ?? (found.expires_at ? `Use it by ${new Date(found.expires_at).toLocaleDateString()}.` : "It never expires.")}</div>
        </div>
      )}
      <div className="gc-row">
        <label className="gc-label" htmlFor="gc-code">Gift card code</label>
        <input id="gc-code" className="gc-input" value={code} maxLength={40} autoComplete="off" spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX" onChange={(e) => setCode(e.target.value)} style={{ letterSpacing: ".06em", textTransform: "uppercase" }} />
      </div>
      <button type="submit" className="gc-btn" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Check balance"}</button>
    </form>
  );
}
