"use client";

/**
 * "Count stock" for one product: the switch behind products.track_inventory.
 *
 * On, each size sells only what it has, and none left is sold out. Off, the
 * product sells without a limit, as it always did when it had no stock record
 * (while the admin showed it as "0"). The product editor and the Inventory
 * screen both use this, so the two say the same thing and save it one way.
 */
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ask } from "@/lib/dialog";

export function TrackStockSwitch({
  productId, productName, tracked, disabled, onChange,
}: {
  productId: string;
  productName: string;
  tracked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function flip() {
    const next = !tracked;
    const sure = await ask(
      next
        ? `Count stock for ${productName}? Each size will sell only what you have. A size with no stock entered shows as sold out until you enter how many you have.`
        : `Stop counting stock for ${productName}? It will sell without a limit, even when a size is at 0.`,
      { ok: next ? "Count stock" : "Stop counting" },
    );
    if (!sure) return;
    setBusy(true);
    setError("");
    try {
      await apiClient.patch(`/api/v1/admin/products/${productId}`, { track_inventory: next });
      onChange(next);
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
      <button
        type="button"
        role="switch"
        aria-checked={tracked}
        aria-label={`Count stock for ${productName}`}
        onClick={flip}
        disabled={disabled || busy}
        style={{
          display: "inline-flex", alignItems: "center", gap: "8px", padding: "4px 0",
          background: "none", border: "none", cursor: disabled || busy ? "default" : "pointer",
          opacity: disabled || busy ? 0.6 : 1, fontSize: "13px", fontWeight: 600, color: "#2A2830",
        }}
      >
        <span
          aria-hidden
          style={{
            width: "34px", height: "20px", borderRadius: "999px", position: "relative", flexShrink: 0,
            background: tracked ? "var(--pc-blue, #1D5FD6)" : "#D1D5DB", transition: "background .15s",
          }}
        >
          <span
            style={{
              position: "absolute", top: "2px", left: tracked ? "16px" : "2px", width: "16px", height: "16px",
              borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transition: "left .15s",
            }}
          />
        </span>
        {busy ? "Saving…" : "Count stock"}
      </button>
      {error && <span role="alert" style={{ fontSize: "12px", color: "#B91C1C" }}>{error}</span>}
    </span>
  );
}

export default TrackStockSwitch;
