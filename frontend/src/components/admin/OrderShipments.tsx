"use client";

/**
 * An order's parcels on the admin order page (Retail launch, package 2).
 *
 * Each parcel's courier, number and where it is, with its history. The
 * courier's own reports arrive by themselves (every 30 minutes, backend
 * services/tracking_poll); a courier that says nothing is set by hand here,
 * and the buyer's tracking page and the order list show the same thing.
 * A parcel shipped some other way can be added with its number.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Event { status: string; words: string; source: string; note: string | null; at: string }
interface Parcel {
  id: string; carrier: string | null; service: string | null; tracking_number: string; tracking_url: string | null;
  status: string; status_words: string; status_source: string; detail: string | null; events: Event[];
}
interface Payload { shipments: Parcel[]; statuses: { key: string; words: string }[] }

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function OrderShipments({ orderId, onChanged }: { orderId: string; onChanged?: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ tracking_number: "", carrier: "", tracking_url: "" });

  const load = useCallback(() => apiClient.get<Partial<Payload> | null>(`/api/v1/admin/orders/${orderId}/shipments`)
    .then((r) => setData({ shipments: r?.shipments ?? [], statuses: r?.statuses ?? [] }))
    .catch(() => setData({ shipments: [], statuses: [] })), [orderId]);
  useEffect(() => { void load(); }, [load]);

  async function move(p: Parcel, status: string) {
    if (!status || status === p.status) return;
    setBusy(p.id);
    setError(null);
    try {
      await apiClient.patch(`/api/v1/admin/shipments/${p.id}`, { status });
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not change it.");
    }
    setBusy(null);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tracking_number.trim()) return;
    setBusy("add");
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${orderId}/shipments`, {
        tracking_number: form.tracking_number.trim(), carrier: form.carrier.trim() || null,
        tracking_url: form.tracking_url.trim() || null,
      });
      setForm({ tracking_number: "", carrier: "", tracking_url: "" });
      setAdding(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not add it.");
    }
    setBusy(null);
  }

  if (!data) return null;
  return (
    <section className="pc-card pc-pad" aria-labelledby="parcels-title" data-parcels={data.shipments.length}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <h2 className="pc-h2" id="parcels-title" style={{ margin: 0 }}>Parcels</h2>
        <button type="button" className="pc-btn" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add a parcel"}</button>
      </div>
      <p className="pc-sub-line" style={{ fontSize: "13px", margin: "6px 0 12px" }}>
        Couriers report on their own. Where one says nothing, set it here: the buyer&apos;s tracking page shows the same.
      </p>
      {error && <div className="pc-note" data-tone="red" role="alert" style={{ marginBottom: "10px" }}>{error}</div>}
      {adding && (
        <form onSubmit={add} style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginBottom: "12px" }}>
          <input className="pc-input" placeholder="Tracking number" value={form.tracking_number} maxLength={255} required
            onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} aria-label="Tracking number" />
          <input className="pc-input" placeholder="Courier (USPS, UPS…)" value={form.carrier} maxLength={100}
            onChange={(e) => setForm({ ...form, carrier: e.target.value })} aria-label="Courier" />
          <input className="pc-input" placeholder="Tracking link (optional)" value={form.tracking_url} maxLength={1000}
            onChange={(e) => setForm({ ...form, tracking_url: e.target.value })} aria-label="Tracking link" />
          <button type="submit" className="pc-btn" data-kind="primary" disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add"}</button>
        </form>
      )}
      {data.shipments.length === 0 ? (
        <p className="pc-sub-line" style={{ fontSize: "13px", margin: 0 }}>No parcel yet. A label bought here, or a number added, appears as one.</p>
      ) : data.shipments.map((p) => (
        <div key={p.id} style={{ borderTop: "1px solid var(--pc-line)", padding: "12px 0" }} data-parcel={p.tracking_number}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{[p.carrier, p.service].filter(Boolean).join(" ") || "Courier not named"}</div>
              <div className="pc-mono" style={{ fontSize: "13px" }}>
                {p.tracking_url ? <a href={p.tracking_url} target="_blank" rel="noopener noreferrer" className="pc-link">{p.tracking_number}</a> : p.tracking_number}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
              <span className="pc-sub-line">Where it is</span>
              <select className="pc-input" style={{ width: "auto" }} value={p.status} disabled={busy === p.id}
                onChange={(e) => void move(p, e.target.value)} aria-label={`Where parcel ${p.tracking_number} is`}>
                {!data.statuses.some((s) => s.key === p.status) && <option value={p.status}>{p.status_words}</option>}
                {data.statuses.map((s) => <option key={s.key} value={s.key}>{s.words}</option>)}
              </select>
            </label>
          </div>
          {p.events.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: "12.5px", color: "var(--pc-muted)" }}>
              {p.events.slice().reverse().slice(0, 4).map((ev, i) => (
                <li key={i}>{when(ev.at)} · {ev.words}{ev.note ? `: ${ev.note}` : ""}{ev.source === "manual" ? " (set by the shop)" : ""}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
