/**
 * How the cart and checkout look on a shop: its theme's fonts and corners
 * (the classic storefront's --brand-* variables, or the website builder's
 * --b-* ones), plus the few things the shop sets for them itself in Settings →
 * Cart and checkout: the main button's colour and words, and the order note.
 */
import { useBranding, type CartLookSettings } from "@/components/providers/BrandingProvider";

export const CART_DEFAULTS: CartLookSettings = {
  button_color: "",
  checkout_text: "Checkout",
  place_order_text: "Place order",
  show_order_note: true,
};

/** White or near-black, whichever reads on `hex`. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.45 ? "#111318" : "#fff";
}

export function cartLook(cart: Partial<CartLookSettings> | null | undefined) {
  const s = { ...CART_DEFAULTS, ...(cart ?? {}) };
  const own = /^#[0-9a-f]{6}$/i.test(s.button_color) ? s.button_color : "";
  return {
    settings: s,
    /** The main button's colour: the shop's pick, else its theme's. */
    button: own || "var(--b-primary, var(--brand-primary, #111318))",
    buttonInk: own ? inkOn(own) : "#fff",
    checkoutText: s.checkout_text || CART_DEFAULTS.checkout_text,
    placeOrderText: s.place_order_text || CART_DEFAULTS.place_order_text,
    showOrderNote: s.show_order_note !== false,
  };
}

export function useCartLook() {
  const branding = useBranding();
  return cartLook(branding.cart);
}

/** The theme's type and corners, for the cart and checkout's own stylesheet. */
export const THEME_CSS_VARS = `
  --ck-font-head: var(--b-font-heading, var(--brand-font-heading, inherit));
  --ck-font-body: var(--b-font-body, var(--brand-font-body, inherit));
  --ck-font-button: var(--b-font-button, var(--ck-font-body));
  --ck-radius: var(--brand-card-radius, 14px);
  --ck-btn-radius: var(--brand-btn-radius, 10px);
`;
