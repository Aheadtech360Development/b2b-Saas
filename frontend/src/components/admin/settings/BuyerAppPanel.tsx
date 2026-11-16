"use client";

/** Settings → Buyer app: the shop's code, its QR square and how buyers get in (see the page). */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ask, tell } from "@/lib/dialog";

export type AppCard = {
  code: string | null;
  link: string | null;
  qr_svg: string | null;
  qr_png: string | null;
  app_store_url: string | null;
  play_store_url: string | null;
};

export function BuyerAppPanel() {
  const [card, setCard] = useState<AppCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCard(await apiClient.get<AppCard>("/api/v1/admin/storefront/shop-code"));
    } catch {
      setError("Could not load your code. Refresh the page to try again.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function copy(what: "code" | "link", value: string | null) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      await tell(`Copy this by hand: ${value}`, { title: "Could not copy" });
    }
  }

  async function newCode() {
    const yes = await ask(
      "Buyers already in the app keep working. Your old code and every printed QR square stop working for anyone new.",
      { title: "Make a new code?", ok: "Make a new code", danger: true },
    );
    if (!yes) return;
    setBusy(true);
    try {
      setCard(await apiClient.post<AppCard>("/api/v1/admin/storefront/shop-code/rotate", {}));
    } catch {
      await tell("Your code was not changed. Try again in a moment.", { title: "Could not make a new code" });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <section className="pc-card" style={{ padding: "20px" }}><p className="pc-sub-line" style={{ margin: 0 }}>{error}</p></section>;
  if (!card) return <section className="pc-card" style={{ padding: "20px" }}><p className="pc-sub-line" style={{ margin: 0 }}>Loading…</p></section>;

  const inStores = !!(card.app_store_url || card.play_store_url);
  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section className="pc-card">
        <div className="pc-card-head" style={{ display: "block" }}>
          <h2 className="pc-h2">Your shop code</h2>
          <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>
            Put it on invoices, cards and emails. A buyer types it in the app, or scans the QR square, to find your shop.
          </p>
        </div>
        <div style={{ padding: "20px", display: "flex", flexWrap: "wrap", gap: "28px", alignItems: "center" }}>
          <div style={{ display: "grid", gap: "12px", minWidth: "220px", flex: "1 1 260px" }}>
            <div data-testid="shop-code" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "34px", fontWeight: 700, letterSpacing: ".18em", color: "var(--pc-ink, #0C1E35)" }}>
              {card.code ?? "None"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button type="button" className="pc-btn" onClick={() => copy("code", card.code)}>{copied === "code" ? "Copied" : "Copy code"}</button>
              <button type="button" className="pc-btn" onClick={() => copy("link", card.link)}>{copied === "link" ? "Copied" : "Copy link"}</button>
              <button type="button" className="pc-btn" onClick={newCode} disabled={busy}>{busy ? "Making…" : "New code"}</button>
            </div>
            {card.link ? <p className="pc-sub-line" style={{ margin: 0, fontSize: "12.5px", overflowWrap: "anywhere" }}>{card.link}</p> : null}
          </div>
          {card.qr_svg ? (
            <div style={{ display: "grid", gap: "8px", justifyItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.qr_svg} alt={`QR square for shop code ${card.code}`} width={168} height={168} style={{ width: 168, height: 168 }} />
              {card.qr_png ? (
                <a className="pc-btn" href={card.qr_png} download={`shop-code-${(card.code ?? "").toLowerCase()}.png`}>Download QR</a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="pc-card">
        <div className="pc-card-head" style={{ display: "block" }}>
          <h2 className="pc-h2">How your buyers get in</h2>
        </div>
        <ol style={{ margin: 0, padding: "16px 20px 20px 40px", display: "grid", gap: "8px", fontSize: "14px", lineHeight: "21px" }}>
          <li>They get the PrintCoPilot app from the App Store or Google Play.</li>
          <li>Buyers who already have an account with you sign in with the same email and password.</li>
          <li>New wholesale buyers tap Apply, enter your code (or scan your QR square) and send you their application, which you approve as you do on your website.</li>
        </ol>
        {!inStores ? (
          <p className="pc-sub-line" data-testid="not-in-stores" style={{ margin: 0, padding: "0 20px 20px", fontSize: "13px" }}>
            The PrintCoPilot app is not in the App Store and Google Play yet. Your code and QR square are ready for when it is.
          </p>
        ) : (
          <p className="pc-sub-line" style={{ margin: 0, padding: "0 20px 20px", fontSize: "13px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
            {card.app_store_url ? <a href={card.app_store_url} target="_blank" rel="noreferrer">App Store</a> : null}
            {card.play_store_url ? <a href={card.play_store_url} target="_blank" rel="noreferrer">Google Play</a> : null}
          </p>
        )}
      </section>
    </div>
  );
}
