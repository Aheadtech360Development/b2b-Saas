"use client";

/**
 * Cash on delivery, on or off.
 *
 * A shop that turns this on offers its customers a second way to pay at
 * checkout: place the order now, pay in cash when it arrives. The order comes
 * in as unpaid, and the shop marks it paid on the order page once the cash is
 * in hand. Off until the shop says so — not every shop delivers by hand.
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";

const isOn = (v: unknown) => ["true", "1", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());

export function CashOnDeliveryPanel() {
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role, user?.read_only);

  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiClient.get<Record<string, string>>("/api/v1/admin/settings")
      .then((r) => setOn(isOn((r as Record<string, unknown>)?.cod_enabled)))
      .catch(() => setNote({ ok: false, text: "Could not read this setting." }))
      .finally(() => setLoading(false));
  }, []);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setNote(null);
    try {
      await apiClient.patch("/api/v1/admin/settings", { cod_enabled: next ? "true" : "false" });
      setOn(next);
      setNote({
        ok: true,
        text: next
          ? "On. Your customers can now choose Cash on delivery at checkout."
          : "Off. Checkout no longer offers Cash on delivery.",
      });
    } catch (e) {
      setNote({ ok: false, text: (e as { message?: string })?.message || "Could not save it. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pc-card" style={{ padding: "18px 20px" }} data-cod-panel>
      <div className="pc-switch-row" style={{ alignItems: "center" }}>
        <span>
          <h2 className="pc-h2">Cash on delivery</h2>
          <div className="pc-sub-line" style={{ fontWeight: 400, marginTop: "4px" }}>Let a customer place an order now and pay in cash when it arrives.</div>
        </span>
        <button type="button" className="pc-switch" role="switch" aria-checked={on} aria-label="Cash on delivery" data-on={on ? "" : undefined}
          onClick={toggle} disabled={loading || busy || readOnly} style={{ cursor: loading || busy || readOnly ? "not-allowed" : undefined, opacity: readOnly ? 0.55 : undefined }} />
      </div>
      <p className="pc-sub-line" style={{ margin: "12px 0 0" }}>
        {on
          ? "Checkout offers it beside the card. An order paid this way arrives as unpaid: collect the cash when you deliver, then press Mark as Paid on the order."
          : "Checkout offers the card only. Turn this on if you deliver or hand over orders yourself and take cash."}
      </p>
      {note && <div className="pc-note" data-tone={note.ok ? "green" : "red"} role="status" style={{ marginTop: "12px" }}>{note.text}</div>}
    </section>
  );
}

export default CashOnDeliveryPanel;
