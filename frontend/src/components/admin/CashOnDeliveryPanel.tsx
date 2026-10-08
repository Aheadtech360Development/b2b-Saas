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
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-cod-panel>
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">Cash on delivery</h2>
          <p className="text-xs text-gray-500 mt-0.5">Let a customer place an order now and pay in cash when it arrives.</p>
        </div>
        <button
          type="button" role="switch" aria-checked={on} aria-label="Cash on delivery"
          onClick={toggle} disabled={loading || busy || readOnly}
          className="shrink-0 disabled:opacity-50"
          style={{
            width: "46px", height: "26px", borderRadius: "999px", border: "none", padding: "3px",
            background: on ? "#16A34A" : "#D1D5DB", cursor: loading || busy || readOnly ? "not-allowed" : "pointer",
            display: "inline-flex", justifyContent: on ? "flex-end" : "flex-start", transition: "background .15s",
          }}
        >
          <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
        </button>
      </div>
      <div className="px-6 py-4 space-y-2">
        <p className="text-sm text-gray-600">
          {on
            ? "Checkout offers it beside the card. An order paid this way arrives as unpaid: collect the cash when you deliver, then press Mark as Paid on the order."
            : "Checkout offers the card only. Turn this on if you deliver or hand over orders yourself and take cash."}
        </p>
        {note && <p className={`text-sm ${note.ok ? "text-green-700" : "text-red-700"}`}>{note.text}</p>}
      </div>
    </section>
  );
}

export default CashOnDeliveryPanel;
