"use client";

/**
 * Which Stripe world the whole platform is in.
 *
 * Here rather than in a shop's own settings, because there is one key and it
 * is the platform's: a brand flipping this would put every other brand's
 * checkout into test mode with it.
 *
 * Switching is not cosmetic. Stripe keeps test and live entirely apart — a
 * customer, a price, a Connect account made in one does not exist in the
 * other — so the panel says what will stop working rather than letting
 * somebody find out at a checkout.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { platformService, type StripeMode } from "@/services/platform.service";

export function StripeModePanel() {
  const [state, setState] = useState<StripeMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    platformService.getStripeMode()
      .then(setState)
      .catch(() => setError("Could not read the payment mode."));
  }, []);

  useEffect(load, [load]);

  async function switchTo(mode: "live" | "test") {
    if (!state || mode === state.mode) return;
    const warning = mode === "live"
      ? "Switch to LIVE payments?\n\nReal cards will be charged from now on.\n\n" +
        "Shops that onboarded their Stripe account in test mode have no live " +
        "account yet — their card payments will refuse until they onboard again."
      : "Switch to TEST payments?\n\nNo real money will move.\n\n" +
        "Any live Connect account, subscription or saved card stops being " +
        "visible to the platform until you switch back.";
    if (!window.confirm(warning)) return;

    setBusy(true);
    setError(null);
    try {
      setState(await platformService.setStripeMode(mode));
    } catch (e) {
      setError(e instanceof ApiClientError && e.message ? e.message : "Could not switch mode.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  const live = state.mode === "live";

  return (
    <div style={S.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={S.head}>Payments</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
            <span style={{ ...S.badge, ...(live ? S.badgeLive : S.badgeTest) }}>
              {live ? "LIVE — real cards" : "TEST — nothing is charged"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => switchTo("test")}
            disabled={busy || !state.test_configured}
            title={state.test_configured ? "" : "No test key is set on the server."}
            style={{ ...S.btn, ...(live ? S.btnGhost : S.btnOn) }}
          >
            Test
          </button>
          <button
            onClick={() => switchTo("live")}
            disabled={busy || !state.live_configured}
            title={state.live_configured ? "" : "No live key is set on the server."}
            style={{ ...S.btn, ...(live ? S.btnOn : S.btnGhost) }}
          >
            Live
          </button>
        </div>
      </div>

      {state.mismatch && (
        <p style={{ ...S.note, color: "#B91C1C" }}>
          The key configured for {state.mode} mode is not a {state.mode} key. Check which key
          is in which variable on the server before taking any payment.
        </p>
      )}
      {!state.ready && (
        <p style={{ ...S.note, color: "#B45309" }}>
          No usable key for {state.mode} mode, so payments will refuse. Set it on the server.
        </p>
      )}
      {!state.live_configured && (
        <p style={S.note}>
          Live is unavailable until <code>STRIPE_SECRET_KEY</code> and{" "}
          <code>STRIPE_PUBLISHABLE_KEY</code> are set on the server.
        </p>
      )}
      {!state.test_configured && (
        <p style={S.note}>
          Test is unavailable until <code>STRIPE_SECRET_KEY_TEST</code> and{" "}
          <code>STRIPE_PUBLISHABLE_KEY_TEST</code> are set on the server.
        </p>
      )}
      {error && <p style={{ ...S.note, color: "#B91C1C" }}>{error}</p>}

      <p style={S.note}>
        Test and live are separate worlds in Stripe. Connect accounts, subscriptions and
        saved cards belong to one of them and are invisible from the other — switching does
        not move anything across.
      </p>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  card: { background: "#fff", border: "1px solid #E4E4E7", borderRadius: "14px", padding: "20px 22px", marginBottom: "22px" },
  head: { fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".06em" },
  badge: { fontSize: "12px", fontWeight: 700, padding: "4px 12px", borderRadius: "20px" },
  badgeLive: { background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" },
  badgeTest: { background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A" },
  btn: { padding: "8px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnOn: { background: "#18181B", color: "#fff", border: "1px solid #18181B" },
  btnGhost: { background: "#fff", color: "#52525B", border: "1px solid #E4E4E7" },
  note: { fontSize: "12.5px", color: "#6B7280", margin: "12px 0 0", lineHeight: 1.6 },
};

export default StripeModePanel;
