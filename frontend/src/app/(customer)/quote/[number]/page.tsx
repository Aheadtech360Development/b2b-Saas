"use client";

/**
 * A quote the shop sent: what it is for, what it costs, until when, and a way
 * to accept it (backend api/v1/quotes_public.py).
 *
 * It opens with the key the quote email's link carries (kept by this page's
 * layout as it opened), or for the signed-in customer it belongs to. Accepting
 * tells the shop, which turns it into the order; once it has, the page says
 * which order it became.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { orderKey } from "@/lib/orderThanks";

interface Quote {
  number: string; status: "sent" | "expired" | "accepted" | "ordered"; status_words: string;
  order_number: string | null; valid_until: string | null; accepted_at: string | null;
  items: { name: string; color: string | null; size: string | null; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number; shipping: number; tax: number; total: number;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
const offset = () => -new Date().getTimezoneOffset();
const NAVY = "#1B3A5C";

export default function QuotePage() {
  const { number } = useParams<{ number: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const headers = useCallback((): Record<string, string> => {
    const key = orderKey(number);
    return key ? { "X-Order-Key": key } : {};
  }, [number]);

  useEffect(() => {
    apiClient.get<Quote>(`/api/v1/quotes/${encodeURIComponent(number)}?utc_offset=${offset()}`, { headers: headers() })
      .then(setQuote)
      .catch(() => setMissing(true));
  }, [number, headers]);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      await apiClient.post(`/api/v1/quotes/${encodeURIComponent(number)}/accept?utc_offset=${offset()}`, {}, { headers: headers() });
      setQuote((q) => (q ? { ...q, status: "accepted", status_words: "Accepted", accepted_at: new Date().toISOString() } : q));
    } catch (e) {
      setError(e instanceof ApiClientError && e.message ? e.message : "The quote could not be accepted. Try again.");
    } finally { setBusy(false); }
  }

  if (missing) {
    return (
      <div style={{ maxWidth: 520, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <h1 style={{ color: NAVY, fontSize: 24, margin: "0 0 8px" }}>Quote {number}</h1>
        <p style={{ color: "#374151", fontSize: 14 }}>
          This quote opens from the link in the email it came with. Open that email and use its button, or sign in to the account it was sent to.
        </p>
        <a href={`/login?next=${encodeURIComponent(`/quote/${number}`)}`}
           style={{ display: "inline-block", marginTop: 12, background: NAVY, color: "#fff", padding: "11px 28px", borderRadius: 6, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
          Sign in
        </a>
      </div>
    );
  }
  if (!quote) return <div style={{ padding: 60, textAlign: "center", color: "#888", fontSize: 14 }}>Loading the quote…</div>;

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }} data-quote={quote.number}>
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "26px 26px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ color: NAVY, fontSize: 24, margin: 0 }}>Quote {quote.number}</h1>
            {quote.valid_until && quote.status !== "ordered" && (
              <p style={{ color: quote.status === "expired" ? "#B42318" : "#6b7280", fontSize: 14, margin: "6px 0 0" }}>
                {quote.status === "expired" ? `Expired on ${day(quote.valid_until)}` : `Valid until ${day(quote.valid_until)}`}
              </p>
            )}
          </div>
          <span style={{ background: quote.status === "expired" ? "#FEE4E2" : quote.status === "sent" ? "#EEF4FF" : "#DCFAE6",
                         color: quote.status === "expired" ? "#B42318" : quote.status === "sent" ? "#1D5FD6" : "#067647",
                         borderRadius: 12, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>{quote.status_words}</span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", margin: "22px 0 8px", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>
              <th style={{ textAlign: "left", padding: "8px 0", borderBottom: "2px solid #E5E7EB" }}>Item</th>
              <th style={{ textAlign: "center", padding: "8px 0", borderBottom: "2px solid #E5E7EB" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "8px 0", borderBottom: "2px solid #E5E7EB" }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((i, n) => (
              <tr key={n}>
                <td style={{ padding: "10px 0", borderBottom: "1px solid #F2F4F7" }}>
                  <b>{i.name}</b>
                  {(i.color || i.size) && <div style={{ color: "#6b7280", fontSize: 12 }}>{[i.color, i.size].filter(Boolean).join(" · ")}</div>}
                  <div style={{ color: "#6b7280", fontSize: 12 }}>{money(i.unit_price)} each</div>
                </td>
                <td style={{ textAlign: "center", padding: "10px 0", borderBottom: "1px solid #F2F4F7" }}>{i.quantity}</td>
                <td style={{ textAlign: "right", padding: "10px 0", borderBottom: "1px solid #F2F4F7", fontWeight: 600 }}>{money(i.line_total)}</td>
              </tr>
            ))}
            {quote.shipping > 0 && <tr><td colSpan={2} style={{ padding: "8px 0", color: "#6b7280" }}>Shipping</td><td style={{ textAlign: "right" }}>{money(quote.shipping)}</td></tr>}
            {quote.tax > 0 && <tr><td colSpan={2} style={{ padding: "8px 0", color: "#6b7280" }}>Tax</td><td style={{ textAlign: "right" }}>{money(quote.tax)}</td></tr>}
            <tr><td colSpan={2} style={{ padding: "12px 0 0", fontWeight: 700 }}>Total</td>
              <td style={{ textAlign: "right", padding: "12px 0 0", fontWeight: 800, fontSize: 18, color: NAVY }}>{money(quote.total)}</td></tr>
          </tbody>
        </table>

        {error && <p style={{ color: "#B42318", fontSize: 14 }}>{error}</p>}
        {quote.status === "sent" && (
          <div style={{ marginTop: 18 }}>
            <button type="button" onClick={accept} disabled={busy}
              style={{ background: NAVY, color: "#fff", border: 0, padding: "13px 34px", borderRadius: 6, fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer" }}>
              {busy ? "Accepting…" : "Accept this quote"}
            </button>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "10px 0 0" }}>The shop turns an accepted quote into your order and sends its invoice.</p>
          </div>
        )}
        {quote.status === "accepted" && (
          <p style={{ color: "#067647", fontSize: 14, marginTop: 18 }}>
            You accepted this quote{quote.accepted_at ? ` on ${day(quote.accepted_at)}` : ""}. The shop will turn it into your order and send the invoice.
          </p>
        )}
        {quote.status === "ordered" && (
          <p style={{ color: "#067647", fontSize: 14, marginTop: 18 }}>This quote is now order {quote.order_number}. Its invoice was emailed to you.</p>
        )}
        {quote.status === "expired" && (
          <p style={{ color: "#374151", fontSize: 14, marginTop: 18 }}>This quote has expired. Reply to the quote email to ask the shop for a new one.</p>
        )}
      </div>
    </div>
  );
}
