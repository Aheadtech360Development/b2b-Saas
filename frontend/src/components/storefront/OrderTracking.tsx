"use client";

/**
 * The buyer's order tracking (Retail launch, package 2): one order, a timeline
 * per parcel (Paid, Packed, Shipped, Out for delivery, Delivered), the courier,
 * the tracking number and the courier's own link. Where it goes is shown as
 * city and postcode only (the server sends no more: services/tracking_page).
 *
 * Two ways in: the order number with the email it was placed with
 * (`TrackingLookup`, rate limited by the server), or the link in the shop's
 * emails / the buyer's own account (`/track/<number>`).
 */
import { useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface TrackStep { key: string; label: string; done: boolean }

export interface TrackParcel {
  id: string;
  carrier: string | null;
  service: string | null;
  tracking_number: string;
  tracking_url: string | null;
  status: string;
  status_words: string;
  detail: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  steps: TrackStep[];
}

export interface TrackingPage {
  order_number: string;
  placed_at: string | null;
  status: string;
  status_words: string;
  paid: boolean;
  ship_to: { city: string; state: string; postal_code: string; country: string } | null;
  steps: TrackStep[];
  shipments: TrackParcel[];
  message: string | null;
}

export const TRACKING_CSS = `
.trk { font-family: 'DM Sans', sans-serif; color: #1A1A1A; }
.trk-card { background: #fff; border: 1px solid #E2E2DE; padding: 24px; margin-bottom: 20px; }
.trk-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
.trk-num { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #6B6B6B; }
.trk-status { font-size: 22px; font-weight: 600; }
.trk-meta { font-size: 13px; color: #6B6B6B; margin: 0 0 18px; }
.trk-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.trk-step { font-size: 12px; color: #9E9E9E; border-top: 4px solid #E2E2DE; padding-top: 8px; }
.trk-step[data-done="true"] { color: #1A1A1A; border-top-color: var(--brand-primary, #1C3557); font-weight: 600; }
.trk-parcel { border-top: 1px solid #E2E2DE; padding-top: 16px; margin-top: 16px; }
.trk-row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; padding: 6px 0; flex-wrap: wrap; }
.trk-row span:first-child { color: #6B6B6B; }
.trk-mono { font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
.trk-link { color: var(--brand-primary, #1C3557); font-weight: 600; text-decoration: none; }
.trk-link:hover { text-decoration: underline; }
.trk-note { background: #F8F8F6; border-left: 3px solid var(--brand-primary, #1C3557); padding: 12px 14px; font-size: 14px; margin-bottom: 20px; }
.trk-lbl { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 7px; }
.trk-inp { width: 100%; border: 1px solid #E2E2DE; padding: 11px 14px; font-size: 14px; box-sizing: border-box; font-family: inherit; }
.trk-inp:focus { outline: none; border-color: var(--brand-primary, #1C3557); }
.trk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.trk-btn { background: var(--brand-primary, #1C3557); color: #fff; border: none; padding: 12px 28px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.trk-btn:disabled { opacity: .5; cursor: not-allowed; }
.trk-error { background: #fff5f5; border: 1px solid #fed7d7; color: #c53030; padding: 14px; font-size: 14px; margin-top: 14px; }
@media (max-width: 600px) {
  .trk-card { padding: 18px 14px; }
  .trk-grid { grid-template-columns: 1fr; }
  .trk-steps { grid-template-columns: 1fr; }
  .trk-btn { width: 100%; }
}
`;

function day(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Steps({ steps }: { steps: TrackStep[] }) {
  return (
    <ol className="trk-steps" aria-label="Where your order is">
      {steps.map((s) => (
        <li key={s.key} className="trk-step" data-done={s.done ? "true" : "false"}>
          {s.label}{s.done ? <span className="sr-only"> (done)</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function TrackingView({ data }: { data: TrackingPage }) {
  const place = data.ship_to ? [data.ship_to.city, [data.ship_to.state, data.ship_to.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ") : null;
  const placed = day(data.placed_at);
  return (
    <div className="trk" data-tracking={data.order_number}>
      {data.message ? <div className="trk-note">{data.message}</div> : null}
      <section className="trk-card">
        <div className="trk-head">
          <span className="trk-status">{data.status_words}</span>
          <span className="trk-num">Order {data.order_number}</span>
        </div>
        <p className="trk-meta">
          {[placed ? `Placed ${placed}` : null, place ? `Going to ${place}` : null].filter(Boolean).join(" · ")}
        </p>
        {data.shipments.length === 0 ? <Steps steps={data.steps} /> : null}
        {data.shipments.map((p, i) => (
          <div key={p.id} className={data.shipments.length > 1 || i > 0 ? "trk-parcel" : undefined} data-parcel={p.tracking_number}>
            {data.shipments.length > 1 ? <p className="trk-meta" style={{ marginBottom: 10 }}>Parcel {i + 1} of {data.shipments.length}</p> : null}
            <Steps steps={p.steps} />
            <div style={{ marginTop: 14 }}>
              <div className="trk-row"><span>Status</span><span>{p.status_words}{p.detail ? `: ${p.detail}` : ""}</span></div>
              {p.carrier ? <div className="trk-row"><span>Courier</span><span>{[p.carrier, p.service].filter(Boolean).join(" ")}</span></div> : null}
              <div className="trk-row"><span>Tracking number</span><span className="trk-mono">{p.tracking_number}</span></div>
              {p.delivered_at ? <div className="trk-row"><span>Delivered</span><span>{day(p.delivered_at)}</span></div> : null}
              {p.tracking_url ? (
                <div className="trk-row"><span /><a className="trk-link" href={p.tracking_url} target="_blank" rel="noopener noreferrer">
                  Follow it on the courier&apos;s site</a></div>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Order number + the email it was placed with. */
export function TrackingLookup({ initialNumber = "", onFound }: { initialNumber?: string; onFound: (p: TrackingPage) => void }) {
  const [number, setNumber] = useState(initialNumber);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function look(e: React.FormEvent) {
    e.preventDefault();
    if (!number.trim() || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onFound(await apiClient.post<TrackingPage>("/api/v1/storefront/track",
        { order_number: number.trim(), email: email.trim() }, { skipAuth: true }));
    } catch (err) {
      setError((err as { message?: string })?.message || "We could not find that order.");
    }
    setBusy(false);
  }

  return (
    <form className="trk-card trk" onSubmit={look} data-tracking-lookup>
      <div className="trk-grid">
        <label>
          <span className="trk-lbl">Order number</span>
          <input className="trk-inp" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={50} required
            autoComplete="off" />
        </label>
        <label>
          <span className="trk-lbl">Email used for the order</span>
          <input className="trk-inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255}
            required autoComplete="email" />
        </label>
      </div>
      <button className="trk-btn" type="submit" disabled={busy}>{busy ? "Looking…" : "Track order"}</button>
      {error ? <div className="trk-error" role="alert">{error}</div> : null}
    </form>
  );
}
