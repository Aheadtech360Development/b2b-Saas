"use client";

/**
 * The buyer's order tracking page, on or off, and the shop's short message on
 * it (Settings → Shipping and pickup). On by default. Off, buyers are told to
 * contact the shop, and the shipped / delivered emails link to the courier as
 * before.
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Conf { enabled: boolean; message: string }
const MAX = 300;

export function TrackingPageCard() {
  const [conf, setConf] = useState<Conf | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiClient.get<Conf>("/api/v1/admin/tracking/settings")
      .then((c) => { setConf(c); setMessage(c.message || ""); })
      .catch(() => setConf(null));
  }, []);

  async function save(changes: Partial<Conf>) {
    setBusy(true);
    setNote(null);
    try {
      const c = await apiClient.put<Conf>("/api/v1/admin/tracking/settings", changes);
      setConf(c);
      setMessage(c.message || "");
      setNote({ ok: true, text: "Saved." });
    } catch (e) {
      setNote({ ok: false, text: (e as { message?: string })?.message || "Could not save." });
    }
    setBusy(false);
  }

  if (!conf) return null;
  return (
    <section className="pc-card" style={{ padding: "18px 20px" }} data-card="tracking-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <h2 className="pc-h2" style={{ margin: 0 }}>Order tracking page</h2>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
          <input type="checkbox" checked={conf.enabled} disabled={busy} onChange={(e) => void save({ enabled: e.target.checked })}
            aria-label="Show the order tracking page" />
          {conf.enabled ? "On" : "Off"}
        </label>
      </div>
      <p className="pc-sub-line" style={{ margin: "6px 0 12px" }}>
        Buyers follow their order at <span className="pc-mono">/track-order</span> with its number and email, or from the
        link in your shipped and delivered emails: every parcel, its courier and where it is. Their street address is never shown.
      </p>
      <label>
        <span className="pc-label">A short message on the page (optional)</span>
        <textarea className="pc-input" rows={2} maxLength={MAX} value={message} disabled={busy || !conf.enabled}
          onChange={(e) => setMessage(e.target.value)} placeholder="Orders ship Monday to Friday. Questions? Reply to your order email." />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
        <button type="button" className="pc-btn" disabled={busy || !conf.enabled || message === (conf.message || "")}
          onClick={() => void save({ message })}>Save message</button>
        {note && <span style={{ fontSize: "12.5px", color: note.ok ? "var(--pc-green, #0F7B3F)" : "var(--pc-red, #B91C1C)" }}>{note.text}</span>}
      </div>
    </section>
  );
}
