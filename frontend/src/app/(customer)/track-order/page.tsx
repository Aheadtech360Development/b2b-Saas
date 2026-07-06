// frontend/src/app/(customer)/track-order/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  pending:    { label: "Order Received", bg: "#fef3c7", color: "#92400e" },
  confirmed:  { label: "Confirmed",      bg: "#d1fae5", color: "#065f46" },
  processing: { label: "Processing",     bg: "#dbeafe", color: "#1e40af" },
  shipped:    { label: "Shipped",        bg: "#ede9fe", color: "#5b21b6" },
  delivered:  { label: "Delivered",      bg: "#d1fae5", color: "#065f46" },
  cancelled:  { label: "Cancelled",      bg: "#fee2e2", color: "#991b1b" },
  refunded:   { label: "Refunded",       bg: "#f3f4f6", color: "#374151" },
};

interface TrackingItem {
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface TrackingResult {
  order_number: string;
  status: string;
  payment_status: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
  guest_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  courier_service: string | null;
  items: TrackingItem[];
}

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim() || !email.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiClient.get<TrackingResult>(
        `/api/v1/guest/orders/${encodeURIComponent(orderNumber.trim())}?email=${encodeURIComponent(email.trim())}`
      );
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Order not found. Please check your order number and email.");
    } finally {
      setLoading(false);
    }
  }

  const statusInfo = result
    ? (STATUS_LABELS[result.status] ?? { label: result.status, bg: "#f3f4f6", color: "#374151" })
    : null;

  return (
    <>
      <style>{`
        .to-page { background: #F8F8F6; min-height: 70vh; padding: 64px 24px; font-family: 'DM Sans', sans-serif; }
        .to-inner { max-width: 600px; margin: 0 auto; }

        .to-h1 { font-family: 'Fraunces', serif; font-size: 36px; font-weight: 600; color: #1A1A1A; margin: 0 0 8px; line-height: 1.15; }
        .to-sub { font-size: 15px; color: #6B6B6B; margin: 0 0 32px; }

        .to-card { background: #FFFFFF; border: 1px solid #E2E2DE; padding: 28px; margin-bottom: 28px; }

        .to-lbl { display: block; font-size: 12px; font-family: 'DM Sans', sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #1A1A1A; margin-bottom: 7px; }
        .to-inp { width: 100%; border: 1px solid #E2E2DE; padding: 11px 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; background: #FFFFFF; color: #1A1A1A; border-radius: 0; outline: none; box-sizing: border-box; transition: border-color 0.15s; }
        .to-inp:focus { border-color: #1C3557; }

        .to-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }

        .to-btn { background: #1C3557; color: #FFFFFF; border: none; padding: 12px 28px; font-size: 14px; font-family: 'DM Sans', sans-serif; font-weight: 500; cursor: pointer; margin-top: 8px; transition: opacity 0.15s; }
        .to-btn:hover:not(:disabled) { opacity: 0.88; }
        .to-btn:disabled { background: #E2E2DE; color: #9E9E9E; cursor: not-allowed; }

        .to-sec-title { font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #1A1A1A; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #E2E2DE; }

        .to-detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E2E2DE; font-family: 'DM Sans', sans-serif; font-size: 14px; align-items: center; }
        .to-detail-row:last-child { border-bottom: none; }
        .to-detail-lbl { color: #6B6B6B; }
        .to-detail-val { color: #1A1A1A; font-weight: 500; }

        .to-mono { font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
        .to-track-mono { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #1C3557; }

        .to-track-link { color: #1C3557; text-decoration: none; font-weight: 500; }
        .to-track-link:hover { text-decoration: underline; }

        .to-error { background: #fff5f5; border: 1px solid #fed7d7; padding: 16px; font-size: 14px; font-family: 'DM Sans', sans-serif; color: #c53030; margin-top: 16px; margin-bottom: 28px; }

        .to-back { text-align: center; margin-top: 8px; }
        .to-back a { font-size: 13px; color: #1C3557; font-weight: 500; text-decoration: none; font-family: 'DM Sans', sans-serif; }
        .to-back a:hover { text-decoration: underline; }

        @media (max-width: 600px) {
          .to-page { padding: 32px 16px; }
          .to-h1 { font-size: 26px; }
          .to-card { padding: 20px 16px; }
          .to-row { grid-template-columns: 1fr; }
          .to-btn { width: 100%; }
        }
      `}</style>

      <div className="to-page">
        <div className="to-inner">

          {/* Page header */}
          <h1 className="to-h1">Track Your Order</h1>
          <p className="to-sub">Enter your order number to get the latest status.</p>

          {/* Lookup form */}
          <div className="to-card">
            <form onSubmit={handleTrack}>
              <div className="to-row">
                <div>
                  <label className="to-lbl">Order Number</label>
                  <input
                    className="to-inp"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    placeholder="AF-000123"
                    required
                  />
                </div>
                <div>
                  <label className="to-lbl">Email Address</label>
                  <input
                    type="email"
                    className="to-inp"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="to-btn"
                disabled={loading || !orderNumber.trim() || !email.trim()}
              >
                {loading ? "Searching…" : "Track Order"}
              </button>
            </form>
          </div>

          {/* Error */}
          {error && <div className="to-error">{error}</div>}

          {/* Result */}
          {result && statusInfo && (
            <div className="to-card" style={{ marginBottom: 28 }}>

              {/* Order summary section */}
              <div className="to-sec-title">Order Summary</div>

              <div className="to-detail-row">
                <span className="to-detail-lbl">Order Number</span>
                <span className={`to-detail-val to-mono`}>{result.order_number}</span>
              </div>

              <div className="to-detail-row">
                <span className="to-detail-lbl">Status</span>
                <span style={{
                  background: statusInfo.bg,
                  color: statusInfo.color,
                  padding: "3px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {statusInfo.label}
                </span>
              </div>

              <div className="to-detail-row">
                <span className="to-detail-lbl">Placed</span>
                <span className="to-detail-val">
                  {new Date(result.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>

              <div className="to-detail-row">
                <span className="to-detail-lbl">Payment</span>
                <span className="to-detail-val" style={{ textTransform: "capitalize" }}>{result.payment_status}</span>
              </div>

              {/* Shipping section */}
              {result.tracking_number && (
                <>
                  <div className="to-sec-title" style={{ marginTop: 24 }}>Shipping</div>

                  {result.carrier && (
                    <div className="to-detail-row">
                      <span className="to-detail-lbl">Carrier</span>
                      <span className="to-detail-val">
                        {result.carrier.toUpperCase()}{result.courier_service ? ` — ${result.courier_service}` : ""}
                      </span>
                    </div>
                  )}

                  <div className="to-detail-row">
                    <span className="to-detail-lbl">Tracking #</span>
                    <span className="to-track-mono">{result.tracking_number}</span>
                  </div>

                  {result.tracking_url && (
                    <div className="to-detail-row">
                      <span className="to-detail-lbl">Track Package</span>
                      <a
                        href={result.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        className="to-track-link"
                      >
                        View Tracking →
                      </a>
                    </div>
                  )}
                </>
              )}

              {/* Items section */}
              <div className="to-sec-title" style={{ marginTop: 24 }}>Items</div>

              {result.items.map((item, idx) => (
                <div key={idx} className="to-detail-row" style={{ alignItems: "flex-start" }}>
                  <div style={{ color: "#6B6B6B", fontSize: 14 }}>
                    <span style={{ color: "#1A1A1A", fontWeight: 500 }}>{item.product_name}</span>
                    {(item.color || item.size) && (
                      <span style={{ marginLeft: 6 }}>{[item.color, item.size].filter(Boolean).join(" / ")}</span>
                    )}
                    <span style={{ marginLeft: 6 }}>× {item.quantity}</span>
                  </div>
                  <span className="to-detail-val">{formatCurrency(item.line_total)}</span>
                </div>
              ))}

              {/* Totals section */}
              <div className="to-sec-title" style={{ marginTop: 24 }}>Order Total</div>

              <div className="to-detail-row">
                <span className="to-detail-lbl">Subtotal</span>
                <span className="to-detail-val">{formatCurrency(result.subtotal)}</span>
              </div>

              <div className="to-detail-row">
                <span className="to-detail-lbl">Shipping</span>
                <span className="to-detail-val" style={{ color: result.shipping_cost === 0 ? "#065f46" : "#1A1A1A" }}>
                  {result.shipping_cost === 0 ? "FREE" : formatCurrency(result.shipping_cost)}
                </span>
              </div>

              <div className="to-detail-row" style={{ borderBottom: "none" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>Total</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1C3557", fontFamily: "'DM Sans', sans-serif" }}>
                  {formatCurrency(result.total)}
                </span>
              </div>

            </div>
          )}

          {/* Back to shopping */}
          <div className="to-back">
            <Link href="/products">← Continue Shopping</Link>
          </div>

        </div>
      </div>
    </>
  );
}
