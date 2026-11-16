"use client";

/**
 * Settings → Cart and checkout: the few things a shop sets for its cart and
 * checkout itself (services/cart_settings). Basic on purpose: fonts and
 * corners follow the shop's theme; the shop picks the main button's colour
 * (its theme colour unless it chooses another), the words on the cart's and
 * the checkout's main buttons, and whether buyers can leave an order note.
 * Offers in the cart are set up in Marketing → Upsells.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { cartLook, CART_DEFAULTS } from "@/lib/cartLook";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";
import type { CartLookSettings } from "@/components/providers/BrandingProvider";

export default function CartSettingsPage() {
  const [s, setS] = useState<CartLookSettings | null>(null);
  const [saved, setSaved] = useState<CartLookSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiClient.get<CartLookSettings>("/api/v1/admin/storefront/cart-settings")
      .then((r) => { const v = { ...CART_DEFAULTS, ...r }; setS(v); setSaved(v); })
      .catch(() => { setS({ ...CART_DEFAULTS }); setNote({ ok: false, text: "Your settings could not be loaded. Refresh the page to try again." }); });
  }, []);

  if (!s) {
    return (
      <SettingsFrame active="cart" title="Cart and checkout" sub="How your cart and checkout buttons look, and the order note.">
        <section className="pc-card" style={{ padding: 20 }}><p className="pc-sub-line" style={{ margin: 0 }}>Loading…</p></section>
      </SettingsFrame>
    );
  }

  const look = cartLook(s);
  const own = s.button_color !== "";
  const changed = JSON.stringify(s) !== JSON.stringify(saved);
  const set = <K extends keyof CartLookSettings>(k: K, v: CartLookSettings[K]) => { setS({ ...s, [k]: v }); setNote(null); };

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const r = await apiClient.put<CartLookSettings>("/api/v1/admin/storefront/cart-settings", s);
      const v = { ...CART_DEFAULTS, ...r };
      setS(v);
      setSaved(v);
      setNote({ ok: true, text: "Saved. Your cart and checkout show it now." });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Not saved. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsFrame active="cart" title="Cart and checkout" sub="How your cart and checkout buttons look, and the order note.">
      <div style={{ display: "grid", gap: 18 }}>
        <section className="pc-card">
          <div className="pc-card-head" style={{ display: "block" }}>
            <h2 className="pc-h2">Buttons</h2>
            <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>
              The cart and checkout use your theme&apos;s fonts. The main button takes your theme colour unless you pick another here.
            </p>
          </div>
          <div style={{ padding: 20, display: "grid", gap: 16, gridTemplateColumns: "minmax(0,1fr) 300px" }} className="cs-grid">
            <div style={{ display: "grid", gap: 16 }}>
              <div className="pc-formfield">
                <span className="pc-label">Button colour</span>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="radio" name="cs-colour" aria-label="My theme colour" checked={!own} onChange={() => set("button_color", "")} />
                  My theme colour
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="radio" name="cs-colour" aria-label="This colour" checked={own} onChange={() => set("button_color", own ? s.button_color : "#0F766E")} />
                  This colour
                  <input type="color" aria-label="Button colour" value={own ? s.button_color : "#0F766E"} disabled={!own}
                    onChange={(e) => set("button_color", e.target.value.toUpperCase())} style={{ width: 44, height: 32, padding: 0, border: 0, background: "none" }} />
                  {own ? <code style={{ fontSize: 13 }}>{s.button_color}</code> : null}
                </label>
              </div>
              <div className="pc-formfield">
                <label className="pc-label" htmlFor="cs-checkout">Cart button</label>
                <input id="cs-checkout" className="pc-input" value={s.checkout_text} maxLength={40}
                  onChange={(e) => set("checkout_text", e.target.value)} placeholder="Checkout" />
              </div>
              <div className="pc-formfield">
                <label className="pc-label" htmlFor="cs-place">Checkout button</label>
                <input id="cs-place" className="pc-input" value={s.place_order_text} maxLength={40}
                  onChange={(e) => set("place_order_text", e.target.value)} placeholder="Place order" />
                <span className="pc-sub-line" style={{ display: "block", fontSize: 12.5 }}>The order total is added after it, as in &ldquo;{look.placeOrderText}, $52.00&rdquo;.</span>
              </div>
            </div>
            <div aria-label="Preview" style={{ border: "1px solid var(--pc-line, #E3E6EA)", borderRadius: 14, padding: 18, background: "#FAFAFB", alignSelf: "start" }}>
              <div className="pc-sub-line" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Preview</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 14 }}><span>Total</span><span>$471.00</span></div>
              <div data-preview-button style={{ background: look.button, color: look.buttonInk, borderRadius: 10, height: 46, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                {look.checkoutText}
              </div>
              <div style={{ background: look.button, color: look.buttonInk, borderRadius: 10, height: 46, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginTop: 10 }}>
                {look.placeOrderText}, $521.86
              </div>
            </div>
          </div>
        </section>

        <section className="pc-card">
          <div style={{ padding: 20, display: "grid", gap: 10 }}>
            <div className="pc-switch-row">
              <span>
                <span style={{ fontWeight: 600 }}>Order note</span>
                <span className="pc-sub-line" style={{ display: "block", fontSize: 13 }}>Buyers can leave a note with their order. It shows on the order for you.</span>
              </span>
              <button type="button" className="pc-switch" role="switch" aria-label="Order note" aria-checked={s.show_order_note}
                data-on={s.show_order_note ? "" : undefined} onClick={() => set("show_order_note", !s.show_order_note)} />
            </div>
          </div>
        </section>

        <section className="pc-card">
          <div style={{ padding: 20 }}>
            <span style={{ fontWeight: 600 }}>Offers in the cart</span>
            <p className="pc-sub-line" style={{ margin: "4px 0 10px" }}>Suggest a product to add, at its price or a better one, when the cart is right for it.</p>
            <Link href="/admin/upsells" className="pc-btn">Set up upsells</Link>
          </div>
        </section>

        {note ? <p role={note.ok ? "status" : "alert"} style={{ margin: 0, fontWeight: 600, color: note.ok ? "var(--pc-ok, #15803D)" : "var(--pc-bad, #B42318)" }}>{note.text}</p> : null}
        <div>
          <button type="button" className="pc-btn" data-kind="primary" disabled={busy || !changed} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
      <style>{`@media (max-width: 760px) { .cs-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </SettingsFrame>
  );
}
