"use client";

/**
 * The code this shop hands its buyers for the mobile app.
 *
 * One app serves every brand, so a buyer's first question is which shop they
 * are looking at. Six characters answers it — read off an invoice, said over
 * the phone, or scanned.
 *
 * Not the shop's own name: that can be guessed from the company, and a trade
 * catalogue with trade prices in it should not open for anyone who can spell
 * it.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export function ShopCodePanel() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient
      .get<{ code: string | null }>("/api/v1/admin/storefront/shop-code")
      .then((r) => setCode(r.code))
      .catch(() => setError("Could not read this shop's code."));
  }, []);

  useEffect(load, [load]);

  async function rotate() {
    if (!window.confirm(
      "Issue a new code?\n\nThe old one stops working straight away. Buyers already " +
      "using the app are unaffected — it remembers the shop, not the code.",
    )) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiClient.post<{ code: string }>("/api/v1/admin/storefront/shop-code/rotate");
      setCode(r.code);
    } catch {
      setError("Could not issue a new code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — the code is on screen to read off anyway.
    }
  }

  // Drawn by a public service from the code alone: no image to store, and it
  // changes by itself the moment the code does.
  const qr = code
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(code)}`
    : null;

  return (
    <div style={{ display: "flex", gap: "28px", flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div className="ui-label">Your shop code</div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span
            className="ui-num"
            style={{
              fontSize: "30px", fontWeight: 700, letterSpacing: ".16em",
              background: "var(--ui-paper)", border: "1px solid var(--ui-line)",
              borderRadius: "10px", padding: "10px 16px",
            }}
          >
            {code ?? "······"}
          </span>
          <button onClick={copy} disabled={!code} className="ui-btn-ghost" style={{ padding: "10px 16px", fontSize: "14px" }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="ui-hint" style={{ marginTop: "12px", lineHeight: 1.65 }}>
          Give this to your buyers. They enter it once in the app and it remembers
          your shop from then on — your name, your colours, your catalogue.
        </p>

        {error && <p className="ui-hint ui-hint-bad">{error}</p>}

        <button
          onClick={rotate}
          disabled={busy || !code}
          className="ui-btn-quiet"
          style={{ marginTop: "10px" }}
        >
          {busy ? "Issuing…" : "Issue a new code"}
        </button>
        <p className="ui-hint" style={{ marginTop: "2px" }}>
          Use this if the code has reached people it should not have. Buyers already
          using the app keep working.
        </p>
      </div>

      {qr && (
        <div style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`QR code for shop code ${code}`}
            width={220}
            height={220}
            style={{ border: "1px solid var(--ui-line)", borderRadius: "12px", background: "#fff" }}
          />
          <p className="ui-hint" style={{ marginTop: "8px" }}>Scan to open this shop</p>
        </div>
      )}
    </div>
  );
}

export default ShopCodePanel;
