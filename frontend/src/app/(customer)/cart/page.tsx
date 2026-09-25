// frontend/src/app/(customer)/cart/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, sortSizes } from "@/lib/utils";
import { cartService } from "@/services/cart.service";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import type { Cart, CartItem } from "@/types/order.types";
import { ConfigurationDetail } from "@/components/shared/ConfigurationDetail";

// ── Color map (same as quick-order) ──────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
  White: "#FFFFFF", Black: "#111111", Navy: "#1e3a5f", Red: "var(--ui-bad)",
  Blue: "#1A5CFF", Royal: "#2251CC", "Royal Blue": "#2251CC",
  Grey: "#C9C6C0", Gray: "#C9C6C0", "Dark Grey": "#4b5563", "Dark Gray": "#4b5563",
  "Light Grey": "var(--ui-line)", "Light Gray": "var(--ui-line)", Charcoal: "#374151",
  "Sport Grey": "#C9C6C0", "Heather Grey": "#b0b7c3", "Athletic Heather": "#b0b7c3",
  Heather: "#b0b7c3", "Dark Heather": "#6b7280", Sand: "#c6a67f", Natural: "#f5f0e8",
  Tan: "#c9a96e", Brown: "#78350f", Maroon: "#7f1d1d", Burgundy: "#881337",
  Green: "#166534", Forest: "#1B4332", "Forest Green": "#14532d", "Kelly Green": "#15803d",
  Lime: "#65a30d", Yellow: "#eab308", Gold: "#f69d0b", Mustard: "#D4A843",
  Orange: "#ea580c", Purple: "#7c3aed", Pink: "#ffcfce", "Hot Pink": "#db2777",
  Coral: "#f87171", Teal: "#0cafcc", Turquoise: "#06b6d4", Mint: "#6ee7b7",
  Olive: "#4d7c0f", Cream: "#fef3c7", Ivory: "#fffff0", "Sky Blue": "#38bdf8",
  Lavender: "#a78bfa", "Light Blue": "#7DD3FC", "Stonewash Blue": "#5b8fa8",
  "Dark Navy": "#0f1f3d", Indigo: "#3730a3", Cardinal: "#7b1520", Crimson: "#9f0712",
  "Carolina Blue": "#56a0d3", "Columbia Blue": "#9bc4e2", Silver: "#c0c0c0",
  "Ash Grey": "#b2b2b2", Ash: "#b2b2b2", Stone: "#a8a29e", Mocha: "#7c5c48",
  Chocolate: "#5c3d2e", Caramel: "#b5651d", Camo: "#78866b", "Oatmeal Heather": "#D6CFC7",
  "Sports Grey": "#C4C4C4",
  "Charcoal Heather": "#4A4A4A",
  "Texas Orange": "#BF5700",
  "Baby Pink": "#F4C2C2",
  "Moss Green": "#305040",
  "Lime Green": "#32CD32",
  "Rust": "#B7410E",
  "Peach": "#FFDAB9",
  "Pacific Blue": "#1CA9C9",
  "Dust": "#ebdcc8",
  "Military Green": "#4B5320",
  "Neon Yellow": "#FFFF33",
  "Neon Orange": "#FF5F1F",
  "Denim": "#1560BD",
  "Salt & Pepper": "#8E8E8E",
  "Powder Blue": "#B0E0E6",
  "Pure Navy": "#373f53",
  "Sawana Brown": "#7d6c5b",
  "Decadent Chocolate": "#723638",
};
function colorHex(c: string) { return COLOR_MAP[c] ?? "#888888"; }
function isLight(hex: string) {
  return ["#FFFFFF", "#fffff0", "#fef3c7", "#f5f0e8", "var(--ui-line)", "#c6a67f"].includes(hex);
}

// ── Group by product ─────────────────────────────────────────────────────────
interface ProductGroup {
  productId: string;
  productName: string;
  sku: string;            // representative SKU (first item)
  items: CartItem[];
  totalUnits: number;
  totalPrice: number;
  unitPrice: number;
  colorGroups: { color: string; sizes: { size: string; qty: number }[]; units: number }[];
}

function groupByProduct(items: CartItem[]): ProductGroup[] {
  const map = new Map<string, CartItem[]>();
  for (const item of items) {
    const pid = item.product_id;
    if (!pid) continue; // gang-sheet / non-variant lines aren't product-grouped
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(item);
  }

  return Array.from(map.entries()).map(([productId, grpItems]) => {
    const totalUnits = grpItems.reduce((s, i) => s + i.quantity, 0);
    const totalPrice = grpItems.reduce((s, i) => s + Number(i.line_total), 0);
    const unitPrice = grpItems[0] ? Number(grpItems[0].unit_price) : 0;

    // Group by color
    const colorMap = new Map<string, CartItem[]>();
    for (const item of grpItems) {
      const c = item.color ?? "Default";
      if (!colorMap.has(c)) colorMap.set(c, []);
      colorMap.get(c)!.push(item);
    }

    const colorGroups = Array.from(colorMap.entries()).map(([color, cItems]) => ({
      color,
      sizes: sortSizes(cItems.map(i => ({ size: i.size ?? "One Size", qty: i.quantity })), item => item.size),
      units: cItems.reduce((s, i) => s + i.quantity, 0),
    }));

    return {
      productId,
      productName: grpItems[0]?.product_name ?? "Unknown Product",
      sku: grpItems[0]?.sku?.split("-")[0] ?? grpItems[0]?.sku ?? "",
      items: grpItems,
      totalUnits,
      totalPrice,
      unitPrice,
      colorGroups,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
interface AppliedCoupon {
  code: string;
  discount_type: string;
  discount_amount: number;
  final_total: number;
  message: string;
}

import type { GuestLine as GuestCartEntry } from "@/lib/guestCart";

/** A guest line that was saved without its photo gets one from the product.
 *
 *  Every place that adds to the guest cart records the picture now, but a
 *  cart saved before that did not, and a shopper coming back to a row of grey
 *  boxes cannot tell which shirt is which. Looked up once per product and
 *  written back, so it costs nothing the next time. */
async function fillMissingImages(entries: GuestCartEntry[]): Promise<void> {
  const missing = [...new Set(entries.filter((e) => !e.image_url && e.slug).map((e) => e.slug))];
  if (!missing.length) return;
  const found = new Map<string, string>();
  await Promise.all(missing.map(async (slug) => {
    try {
      const p = await apiClient.get<{ images?: { url_medium?: string; url_large?: string }[] }>(
        `/api/v1/products/${encodeURIComponent(slug)}`, { skipAuth: true },
      );
      const url = p?.images?.[0]?.url_medium || p?.images?.[0]?.url_large;
      if (url) found.set(slug, url);
    } catch { /* the product may be gone — the line still shows */ }
  }));
  if (!found.size) return;
  for (const entry of entries) {
    if (!entry.image_url && found.has(entry.slug)) entry.image_url = found.get(entry.slug) ?? null;
  }
  try { localStorage.setItem("af_guest_cart", JSON.stringify(entries)); } catch { /* private mode */ }
}

function buildGuestCart(entries: GuestCartEntry[]): Cart {
  const items: CartItem[] = entries.map((e, i) => ({
    id: `guest-${i}`,
    variant_id: e.variant_id,
    product_id: e.product_id,
    product_name: e.product_name,
    product_slug: e.slug,
    product_image_url: e.image_url ?? null,
    sku: "",
    color: e.color,
    size: e.size,
    quantity: e.quantity,
    retail_price: String(e.unit_price),
    unit_price: String(e.unit_price),
    line_total: String(e.unit_price * e.quantity),
    moq: 1,
    moq_satisfied: true,
    stock_quantity: 999,
  }));
  const subtotal = items.reduce((s, i) => s + Number(i.line_total), 0);
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  return {
    items,
    subtotal: String(subtotal),
    item_count: items.length,
    total_units: totalUnits,
    discount_percent: "0",
    validation: {
      is_valid: items.length > 0,
      moq_violations: [],
      mov_violation: false,
      mov_required: "0",
      mov_current: String(subtotal),
      estimated_shipping: "9.99",
      has_shipping_tier: true,
    },
  };
}

export default function CartPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const [isGuest, setIsGuest] = useState(false);

  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [removingProductId, setRemovingProductId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("af_coupon");
    if (!saved) return;
    try {
      const parsed: AppliedCoupon = JSON.parse(saved);
      if (parsed.code) {
        setCouponInput(parsed.code);
        setAppliedCoupon(parsed);
      }
    } catch {
      setCouponInput(saved);
    }
  }, []);

  useEffect(() => {
    if (authIsLoading) return;
    if (!isAuthenticated) {
      // Guest: load from localStorage then fetch real shipping estimate
      setIsGuest(true);
      if (typeof window !== "undefined") {
        const loadGuestCart = async () => {
          try {
            const entries: GuestCartEntry[] = JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
            if (entries.length > 0) {
              await fillMissingImages(entries);
              const guestCart = buildGuestCart(entries);
              try {
                const totalUnits = entries.reduce((s, e) => s + e.quantity, 0);
                const subtotal = entries.reduce((s, e) => s + e.unit_price * e.quantity, 0);
                const est = await apiClient.get<{ estimated_shipping: number }>(
                  `/api/v1/guest/shipping-estimate?units=${totalUnits}&subtotal=${subtotal.toFixed(2)}`
                );
                guestCart.validation.estimated_shipping = String(est.estimated_shipping);
              } catch { /* keep buildGuestCart default */ }
              setCart(guestCart);
            } else {
              setCart(null);
            }
          } catch { setCart(null); }
          setIsLoading(false);
        };
        loadGuestCart();
      } else {
        setIsLoading(false);
      }
    } else {
      setIsGuest(false);
      cartService.getCart().then(setCart).catch(console.error).finally(() => setIsLoading(false));
    }
  }, [authIsLoading, isAuthenticated]);

  async function handleRemoveProduct(group: ProductGroup) {
    setRemovingProductId(group.productId);
    try {
      if (isGuest) {
        // Remove from localStorage guest cart
        const entries: GuestCartEntry[] = JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
        const updated = entries.filter(e => e.product_id !== group.productId);
        localStorage.setItem("af_guest_cart", JSON.stringify(updated));
        setCart(updated.length > 0 ? buildGuestCart(updated) : null);
        window.dispatchEvent(new Event("af_guest_cart_updated"));
      } else {
        let updated: Cart | null = null;
        for (const item of group.items) {
          updated = await cartService.removeItem(item.id);
        }
        if (updated) setCart(updated);
        else setCart(await cartService.getCart());
        window.dispatchEvent(new Event("cart_updated"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingProductId(null);
    }
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await cartService.saveTemplate(templateName.trim());
      setShowTemplateDialog(false);
      setTemplateName("");
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleApplyCoupon() {
    if (!couponInput.trim()) return;
    setApplyingCoupon(true);
    setCouponError(null);
    try {
      const data = await apiClient.post<{
        valid: boolean; message: string; code?: string;
        discount_type?: string; discount_amount?: number; final_total?: number;
      }>("/api/v1/discounts/validate", {
        code: couponInput.trim(),
        cart_total: subtotal,   // discount applies to subtotal only, not shipping
        customer_type: "wholesale",
      });
      if (data.valid) {
        const coupon: AppliedCoupon = {
          code: data.code!,
          discount_type: data.discount_type!,
          discount_amount: Number(data.discount_amount),
          final_total: Number(data.final_total),
          message: data.message,
        };
        setAppliedCoupon(coupon);
        if (typeof window !== "undefined") localStorage.setItem("af_coupon", JSON.stringify(coupon));
      } else {
        setCouponError(data.message || "Invalid discount code.");
        setAppliedCoupon(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to validate coupon.";
      setCouponError(msg);
    } finally {
      setApplyingCoupon(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError(null);
    if (typeof window !== "undefined") localStorage.removeItem("af_coupon");
  }

  function getCheckoutDisabledReason(): string | undefined {
    if (!cart || !cart.items || cart.items.length === 0) return "Cart is empty";
    if (isGuest) return undefined;
    if (!cart.validation) return undefined;
    const v = cart.validation;
    if (v.mov_violation) return `Minimum order value of ${formatCurrency(Number(v.mov_required))} not met`;
    return undefined;
  }

  async function handleRemoveItem(item: CartItem) {
    try {
      if (isGuest) {
        const entries: GuestCartEntry[] = JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
        const updated = entries.filter(e => e.variant_id !== item.variant_id);
        localStorage.setItem("af_guest_cart", JSON.stringify(updated));
        setCart(updated.length > 0 ? buildGuestCart(updated) : null);
        window.dispatchEvent(new Event("af_guest_cart_updated"));
      } else {
        const updated = await cartService.removeItem(item.id);
        if (updated) setCart(updated);
        else setCart(await cartService.getCart());
        window.dispatchEvent(new Event("cart_updated"));
      }
    } catch (err) { console.error(err); }
  }

  async function handleUpdateItemQty(item: CartItem, quantity: number) {
    if (quantity <= 0) { await handleRemoveItem(item); return; }
    try {
      if (isGuest) {
        const entries: GuestCartEntry[] = JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
        const idx = entries.findIndex(e => e.variant_id === item.variant_id);
        if (idx >= 0) entries[idx]!.quantity = quantity;
        localStorage.setItem("af_guest_cart", JSON.stringify(entries));
        setCart(buildGuestCart(entries));
        window.dispatchEvent(new Event("af_guest_cart_updated"));
      } else {
        const updated = await cartService.updateItem(item.id, quantity);
        if (updated) setCart(updated);
        window.dispatchEvent(new Event("cart_updated"));
      }
    } catch (err) { console.error(err); }
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--ui-paper)" }}>
        <p style={{ color: "#7A7880", fontSize: "14px" }}>Loading cart…</p>
      </div>
    );
  }

  const isEmpty = !cart || !cart.items || cart.items.length === 0;
  const disabledReason = getCheckoutDisabledReason();
  const isCheckoutEnabled = !disabledReason;
  const groups = cart ? groupByProduct(cart.items) : [];
  const subtotal = Number(cart?.subtotal ?? 0);
  const discountPercent = Number(cart?.discount_percent ?? 0);
  const hasShippingTier = cart?.validation?.has_shipping_tier ?? false;
  const estimatedShipping = Number(cart?.validation?.estimated_shipping ?? (isGuest ? 9.99 : 0));

  return (
    <div className="ui-page" style={{ padding: "40px 0 64px" }}>
      <div className="ui-wrap">

        <h1 className="ui-h1" style={{ marginBottom: "6px" }}>Your cart</h1>
        <p className="ui-lede" style={{ marginBottom: "28px" }}>
          {isEmpty
            ? "Nothing in it yet."
            : `${cart.items.length} ${cart.items.length === 1 ? "line" : "lines"} ready to order.`}
        </p>

        {isEmpty ? (
          /* An empty cart is a dead end unless it points somewhere. */
          <div className="ui-card" style={{ textAlign: "center", padding: "48px 28px", maxWidth: "460px" }}>
            <p style={{ fontSize: "15.5px", color: "var(--ui-muted)", margin: "0 0 22px" }}>
              Once you add something it will show up here, with its price and your total.
            </p>
            <Link href="/products" className="ui-btn">Browse the catalogue</Link>
          </div>
        ) : (
          <div className="cart-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: "32px", alignItems: "start" }}>

            {/* ── LEFT: the lines ──────────────────────────────────────────
                Rows, not a table. Seven columns meant a sideways scroll on a
                phone with a "← Scroll to see all →" label above it — the cart
                asking to be worked around. These reflow instead. */}
            <div>
              {cart?.validation?.mov_violation && (
                <div className="ui-alert ui-alert-bad">
                  <strong>Minimum order value not met.</strong>{" "}
                  Currently {formatCurrency(Number(cart.validation.mov_current))} of{" "}
                  {formatCurrency(Number(cart.validation.mov_required))}.
                </div>
              )}

              <div className="ui-card" style={{ padding: 0, overflow: "hidden" }}>
                {cart.items.map((item, i) => (
                  <div
                    key={item.id}
                    className="cart-line"
                    style={{ borderTop: i ? "1px solid var(--ui-line)" : "none", padding: "18px 20px" }}
                  >
                    <div style={{ width: "72px", height: "72px", border: "1px solid var(--ui-line)", borderRadius: "10px", flexShrink: 0, overflow: "hidden", background: "var(--ui-paper)" }}>
                      {item.product_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.product_image_url} alt={item.product_name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9C6C0" strokeWidth={1.5}><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z" /></svg>
                        </div>
                      )}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "15px", fontWeight: 600, lineHeight: 1.35 }}>{item.product_name}</div>
                      <div style={{ fontSize: "13px", color: "var(--ui-muted)", marginTop: "3px" }}>
                        {[item.color, item.size].filter(Boolean).join(" · ") || "—"}
                        {item.sku && (
                          <span className="ui-num" style={{ marginLeft: "8px", fontSize: "12px" }}>{item.sku}</span>
                        )}
                      </div>
                      <ConfigurationDetail configuration={item.configuration} compact />
                      <div style={{ fontSize: "13px", color: "var(--ui-muted)", marginTop: "6px" }}>
                        <span className="ui-num">{formatCurrency(Number(item.unit_price))}</span> each
                      </div>
                    </div>

                    <div className="cart-line-end">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => handleUpdateItemQty(item, parseInt(e.target.value, 10) || 1)}
                        aria-label={`Quantity for ${item.product_name}`}
                        className="cart-qty-input ui-field ui-num"
                        style={{ width: "68px", padding: "7px 8px", textAlign: "center", fontSize: "14px" }}
                      />
                      <div className="ui-num" style={{ fontSize: "15px", fontWeight: 700, minWidth: "88px", textAlign: "right" }}>
                        {formatCurrency(Number(item.line_total))}
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item)}
                        aria-label={`Remove ${item.product_name}`}
                        className="cart-remove-btn ui-btn-quiet"
                        style={{ fontSize: "20px", lineHeight: 1, padding: "0 2px" }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "16px" }}>
                <Link href="/products" className="ui-btn-quiet" style={{ textDecoration: "none" }}>
                  ← Keep shopping
                </Link>
              </div>
            </div>

            {/* ── RIGHT: Order summary ── */}
            <OrderSummary
              subtotal={subtotal}
              appliedCoupon={isGuest ? null : appliedCoupon}
              onRemoveCoupon={handleRemoveCoupon}
              couponInput={couponInput}
              onCouponInput={(v) => { setCouponInput(v); setCouponError(null); }}
              onApplyCoupon={handleApplyCoupon}
              applyingCoupon={applyingCoupon}
              couponError={couponError}
              isValid={isCheckoutEnabled}
              disabledReason={disabledReason}
              isGuest={isGuest}
              onCheckout={() => router.push("/checkout/address")}
            />
          </div>
        )}
      </div>

      {/* Save Template Dialog (functionality kept) */}
      {showTemplateDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", width: "100%", maxWidth: "380px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", letterSpacing: ".04em", color: "#2A2830", marginBottom: "16px" }}>Save as Template</h2>
            <input
              type="text"
              placeholder="Template name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
              autoFocus
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "16px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowTemplateDialog(false)} style={{ padding: "9px 16px", border: "1px solid #E2E0DA", borderRadius: "7px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#7A7880" }}>
                Cancel
              </button>
              <button onClick={handleSaveTemplate} disabled={savingTemplate || !templateName.trim()}
                style={{ padding: "9px 20px", background: "var(--brand-primary, var(--ui-ink))", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: !templateName.trim() ? "not-allowed" : "pointer", opacity: !templateName.trim() ? 0.4 : 1 }}>
                {savingTemplate ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .cart-qty-input:focus { outline: 1px solid var(--brand-primary, var(--ui-ink)) !important; }
        .cart-remove-btn:hover { color: var(--ui-ink) !important; }
        @media (max-width: 900px) {
          .cart-grid { display: block !important; }
        }
      `}</style>
    </div>
  );
}

// ── Order Summary sidebar component ──────────────────────────────────────────
function OrderSummary({
  subtotal, appliedCoupon, onRemoveCoupon, couponInput, onCouponInput, onApplyCoupon, applyingCoupon, couponError,
  isValid, disabledReason, isGuest, onCheckout,
}: {
  subtotal: number;
  appliedCoupon: AppliedCoupon | null;
  onRemoveCoupon: () => void;
  couponInput: string;
  onCouponInput: (v: string) => void;
  onApplyCoupon: () => void;
  applyingCoupon: boolean;
  couponError: string | null;
  isValid: boolean;
  disabledReason?: string;
  isGuest?: boolean;
  onCheckout: () => void;
}) {
  const couponDiscount = appliedCoupon?.discount_amount ?? 0;
  const total = subtotal - couponDiscount;
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--ui-muted)", marginBottom: "12px" };

  return (
    <div className="ui-card cart-summary">
      <div style={{ fontSize: "12.5px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ui-muted)", marginBottom: "16px" }}>
        Order summary
      </div>
      <div style={row}>
        <span>Subtotal</span>
        <span className="ui-num">{formatCurrency(subtotal)}</span>
      </div>
      <div style={row}>
        <span>Shipping</span>
        <span>Calculated at checkout</span>
      </div>
      <div style={row}>
        <span>Tax</span>
        <span>Calculated at checkout</span>
      </div>
      {/* The code field. The apply logic existed, but no field was ever
          rendered, so buyers had no way to enter a discount code. */}
      {!isGuest && !appliedCoupon && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={couponInput}
              onChange={(e) => onCouponInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onApplyCoupon(); }}
              placeholder="Discount code"
              aria-label="Discount code"
              className="ui-field"
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", fontSize: "14px" }}
            />
            <button
              onClick={onApplyCoupon}
              disabled={!couponInput.trim() || applyingCoupon}
              className="ui-btn-ghost"
              style={{ padding: "10px 16px", fontSize: "14px", opacity: couponInput.trim() ? 1 : .5 }}
            >
              {applyingCoupon ? "…" : "Apply"}
            </button>
          </div>
          {couponError && <p style={{ fontSize: "12px", color: "var(--ui-bad)", marginTop: "6px", fontFamily: "'DM Sans', sans-serif" }}>{couponError}</p>}
        </div>
      )}
      {appliedCoupon && (
        <div style={{ ...row, color: "var(--ui-ok)" }}>
          <span>
            Coupon ({appliedCoupon.code})
            <button onClick={onRemoveCoupon} style={{ marginLeft: "8px", fontSize: "10px", color: "var(--ui-bad)", background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}>✕</button>
          </span>
          <span>{appliedCoupon.discount_type === "free_shipping" ? "Free shipping" : `-${formatCurrency(couponDiscount)}`}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "17px", fontWeight: 700, paddingTop: "14px", borderTop: "1px solid var(--ui-line)", marginTop: "14px" }}>
        <span>Total</span>
        <span className="ui-num" style={{ fontSize: "20px" }}>{formatCurrency(total)}</span>
      </div>
      <button
        onClick={onCheckout}
        disabled={!isValid}
        title={disabledReason}
        className="ui-btn ui-btn-block"
        style={{ marginTop: "18px" }}
      >
        Checkout
      </button>
      {disabledReason && (
        <p className="ui-hint ui-hint-bad" style={{ textAlign: "center" }}>{disabledReason}</p>
      )}
    </div>
  );
}
