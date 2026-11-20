"use client";

/**
 * The shop's cart: its lines, quantities, prices, offers and the way to
 * checkout. The one cart: /cart draws it, and a visual-builder shop places
 * this same component inside its cart template (embedded), so there is never
 * a second copy of how a cart behaves.
 *
 * Laid out as the owner's "Store Cart and Checkout" design (2026-11-16), with
 * nothing on it that is not true for this shop and this cart:
 *   - the free-shipping bar only when the buyer's own shipping has a free
 *     line (services/upsells.free_shipping), never a made-up threshold;
 *   - "In stock" only on a product that counts its stock; a gang sheet says
 *     the shop checks its artwork, since it does (no buyer proof step exists);
 *   - offers are the shop's own (Marketing → Upsells), priced on the server;
 *   - the checkout button's colour and words are the shop's (Settings → Cart
 *     and checkout); fonts and corners come from its theme.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { cartService } from "@/services/cart.service";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { useCheckoutStore } from "@/stores/checkout.store";
import type { Cart, CartItem } from "@/types/order.types";
import {
  adoptGuestCart, guestLineTotal, isDesignLine, isGiftCardLine, type GuestLine as GuestCartEntry,
} from "@/lib/guestCart";
import { PointsLine } from "@/components/storefront/PointsLine";
import { trackCartViewed, trackLineAdd, trackLinesRemoved } from "@/lib/tracking";
import { ConfigurationDetail } from "@/components/shared/ConfigurationDetail";
import { THEME_CSS_VARS, useCartLook } from "@/lib/cartLook";

// ── Offers (services/upsells) ────────────────────────────────────────────────
export interface OfferVariant {
  variant_id: string;
  label: string;
  color: string | null;
  size: string | null;
  price: string;
  offer_price: string;
}
export interface Offer {
  offer_id: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  title: string;
  description: string | null;
  image_url: string | null;
  kind: "ready" | "build";
  discount: string | null;
  unlocks_free_shipping?: boolean;
  from_price?: string | null;
  variants: OfferVariant[];
}
interface FreeShipping { threshold: string; reached: boolean }
interface OffersResp { offers?: Offer[]; free_shipping?: FreeShipping | null; applying?: Record<string, string> }

interface AppliedCoupon {
  code: string;
  discount_type: string;
  discount_amount: number;
  final_total: number;
  message: string;
}

const GUEST_KEY = "af_guest_cart";

function readGuest(): GuestCartEntry[] {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || "[]"); } catch { return []; }
}
function writeGuest(entries: GuestCartEntry[]) {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(entries)); } catch { /* private mode */ }
  window.dispatchEvent(new Event("af_guest_cart_updated"));
}

/** A guest line that was saved without its photo gets one from the product.
 *  Looked up once per product and written back. */
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
    } catch { /* the product may be gone: the line still shows */ }
  }));
  if (!found.size) return;
  for (const entry of entries) {
    if (!entry.image_url && found.has(entry.slug)) entry.image_url = found.get(entry.slug) ?? null;
  }
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(entries)); } catch { /* private mode */ }
}

/** A guest offer line's price now: the offer's while the server says it still
 *  applies, its usual price once it does not (null = not asked yet). */
function guestUnit(e: GuestCartEntry, applying: Record<string, string> | null): number {
  if (e.upsell_offer_id && applying && !applying[e.variant_id] && e.regular_unit_price != null) {
    return e.regular_unit_price;
  }
  return e.unit_price;
}

export function buildGuestCart(entries: GuestCartEntry[], applying: Record<string, string> | null = null): Cart {
  const items: CartItem[] = entries.map((e, i) => {
    const unit = guestUnit(e, applying);
    const offered = !!e.upsell_offer_id && (!applying || !!applying[e.variant_id]);
    return {
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
      retail_price: String(unit),
      unit_price: String(unit),
      line_total: String(e.upsell_offer_id ? unit * e.quantity : guestLineTotal(e)),
      ...(offered && e.regular_unit_price != null && e.regular_unit_price !== unit
        ? { upsell_offer_id: e.upsell_offer_id, regular_unit_price: e.regular_unit_price } : {}),
      // A set quantity ("500 flyers") reads "500 for $120.00" and is changed
      // on the product page, as on an account's cart.
      ...(e.quantity_from_option ? { configuration: { quantity_from_option: true } } : {}),
      // A gift card: one card, emailed; its quantity is not changed here.
      ...(e.gift_card ? { item_type: "gift_card", configuration: { gift_card: e.gift_card } } : {}),
      // A design from the t-shirt designer: its sizes are changed in the designer.
      ...(e.tshirt_design_id ? {
        item_type: "tshirt_design", sku: e.design?.reference ?? "",
        configuration: { tshirt_design: e.design ?? { id: e.tshirt_design_id, reference: "" } },
      } : {}),
      ...(e.gang_sheet_order_id ? { item_type: "gang_sheet" } : {}),
      moq: 1,
      moq_satisfied: true,
      stock_quantity: 999,
    };
  });
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
      estimated_shipping: "0",
      has_shipping_tier: false,
    },
  };
}

/** What the line is, in a few words under its name. */
function lineDetail(item: CartItem): string | null {
  if (isGiftCardLine(item)) return `Emailed to ${item.configuration?.gift_card?.recipient_email ?? "the recipient"} when you pay`;
  if (isDesignLine(item)) return `Your design, ${item.quantity} ${item.quantity === 1 ? "piece" : "pieces"}`;
  if (item.item_type === "gang_sheet") return "Built in the gang sheet builder";
  if (item.color && item.size) return `${item.color}, size ${item.size}`;
  return [item.color, item.size].filter(Boolean).join(", ") || null;
}

/** A line whose quantity is set elsewhere (the designer, the product page). */
function fixedQuantity(item: CartItem): boolean {
  return !!item.configuration?.quantity_from_option || isGiftCardLine(item) || isDesignLine(item) || item.item_type === "gang_sheet";
}

const CSS = `
.ck{${THEME_CSS_VARS} font-family:var(--ck-font-body);color:var(--ui-ink,#111318)}
.ck-crumbs{display:flex;gap:8px;font-size:14px;color:var(--ui-muted,#5A6472);margin-bottom:10px}
.ck-crumbs b{color:var(--ui-ink,#111318);font-weight:600}
.ck h1{font-family:var(--ck-font-head);font-size:40px;line-height:1.1;margin:0 0 24px;font-weight:700;letter-spacing:-.01em}
.ck-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:32px;align-items:start}
.ck-card{background:#fff;border:1px solid var(--ui-line,#E3E6EA);border-radius:var(--ck-radius);padding:22px 24px}
.ck-col{display:grid;gap:20px;min-width:0}
.ck-free p{margin:0 0 12px;font-weight:600;font-size:16px}
.ck-bar{height:8px;border-radius:99px;background:var(--ui-line,#E3E6EA);overflow:hidden}
.ck-bar i{display:block;height:100%;border-radius:99px;background:var(--ck-btn)}
.ck-lines{padding:0}
.ck-line{display:grid;grid-template-columns:112px minmax(0,1fr) auto;gap:20px;padding:24px;border-top:1px solid var(--ui-line,#E3E6EA)}
.ck-line:first-child{border-top:0}
.ck-pic{width:112px;height:112px;border-radius:12px;background:var(--ui-paper,#F4F5F7);border:1px solid var(--ui-line,#E3E6EA);overflow:hidden;display:flex;align-items:center;justify-content:center}
.ck-pic img{width:100%;height:100%;object-fit:contain}
.ck-name{font-family:var(--ck-font-head);font-size:19px;font-weight:700;line-height:1.3;margin:0}
.ck-sub{font-size:14.5px;color:var(--ui-muted,#5A6472);margin-top:4px;line-height:1.5}
.ck-badge{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:3px 10px;border-radius:99px;font-size:13px;font-weight:600}
.ck-ok{background:#DCFCE7;color:#166534}.ck-warn{background:#FEF3C7;color:#92400E}.ck-info{background:#E0F2FE;color:#075985}
.ck-acts{display:flex;gap:16px;margin-top:12px;flex-wrap:wrap}
.ck-acts a,.ck-acts button{font-size:14px;color:var(--ui-ink,#111318);text-decoration:underline;text-underline-offset:3px;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
.ck-end{display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;gap:16px}
.ck-qty{display:inline-flex;align-items:center;border:1px solid var(--ui-line,#D5D9DF);border-radius:10px;height:46px}
.ck-qty button{width:40px;height:44px;border:0;background:none;font-size:20px;cursor:pointer;color:var(--ui-ink,#111318)}
.ck-qty span{min-width:30px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
.ck-fixed{font-size:14px;color:var(--ui-muted,#5A6472)}
.ck-price{font-size:21px;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.ck-was{display:block;font-size:13.5px;font-weight:500;color:var(--ui-muted,#5A6472);text-decoration:line-through}
.ck-offer{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:18px;align-items:center}
.ck-offer .ck-pic{width:72px;height:72px}
.ck-offer h3{margin:0;font-family:var(--ck-font-head);font-size:17px;font-weight:600}
.ck-offer select{margin-top:8px;max-width:100%;padding:7px 10px;border:1px solid var(--ui-line,#D5D9DF);border-radius:8px;font:inherit;font-size:14px;background:#fff}
.ck-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:52px;padding:0 22px;border-radius:var(--ck-btn-radius);font-family:var(--ck-font-button);font-weight:700;font-size:16.5px;cursor:pointer;text-decoration:none;border:1px solid transparent;width:100%;box-sizing:border-box}
.ck-btn-main{background:var(--ck-btn);color:var(--ck-btn-ink)}
.ck-btn-main[disabled]{opacity:.5;cursor:not-allowed}
.ck-btn-ghost{background:#fff;color:var(--ui-ink,#111318);border-color:var(--ui-line,#D5D9DF)}
.ck-btn-sm{height:44px;width:auto;font-size:15px;padding:0 18px}
.ck-note label{display:block;font-size:14.5px;font-weight:600;margin-bottom:8px}
.ck-note textarea{width:100%;box-sizing:border-box;min-height:84px;padding:12px 14px;border:1px solid var(--ui-line,#D5D9DF);border-radius:10px;font:inherit;font-size:15px;resize:vertical}
.ck-sum h2{font-family:var(--ck-font-head);font-size:23px;margin:0 0 16px;font-weight:700}
.ck-row{display:flex;justify-content:space-between;gap:12px;font-size:16px;margin-bottom:12px}
.ck-row span:last-child{font-variant-numeric:tabular-nums}
.ck-muted{color:var(--ui-muted,#5A6472)}
.ck-code{display:flex;gap:10px;margin:18px 0 6px}
.ck-code input{flex:1;min-width:0;height:48px;padding:0 14px;border:1px solid var(--ui-line,#D5D9DF);border-radius:10px;font:inherit;font-size:15.5px}
.ck-total{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid var(--ui-line,#E3E6EA);margin-top:16px;padding-top:20px;font-weight:600;font-size:17px}
.ck-total b{font-size:30px;font-variant-numeric:tabular-nums}
.ck-total small{font-size:13px;font-weight:500;color:var(--ui-muted,#5A6472);margin-left:4px}
.ck-btns{display:grid;gap:12px;margin-top:22px}
.ck-trust{display:grid;gap:12px;margin-top:22px;font-size:14.5px;color:var(--ui-muted,#5A6472)}
.ck-trust div{display:flex;gap:10px;align-items:flex-start}
.ck-hint{font-size:13px;text-align:center;color:var(--ui-muted,#5A6472);margin:8px 0 0}
.ck-bad{color:var(--ui-bad,#B42318)}
.ck-alert{border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;border-radius:12px;padding:12px 16px;font-size:14.5px}
.ck-notice{border:1px solid var(--ui-line,#E3E6EA);background:#fff;border-radius:12px;padding:12px 16px;font-size:14.5px;color:var(--ui-muted,#5A6472)}
.ck-sticky{display:none}
@media (max-width:900px){
  .ck h1{font-size:30px;margin-bottom:16px}
  .ck-grid{grid-template-columns:minmax(0,1fr)}
  .ck-crumbs{display:none}
  .ck-card{padding:18px 16px}
  .ck-lines{padding:0}
  .ck-line{grid-template-columns:76px minmax(0,1fr);gap:14px;padding:18px 16px}
  .ck-pic{width:76px;height:76px}
  .ck-name{font-size:17px}
  .ck-end{grid-column:2;flex-direction:row;align-items:center;justify-content:space-between}
  .ck-offer{grid-template-columns:56px minmax(0,1fr);gap:12px}
  .ck-offer > :last-child{grid-column:1/-1;width:100%}
  .ck-offer .ck-pic{width:56px;height:56px}
  .ck:not(.ck-in) .ck-sum .ck-checkout{display:none}
  .ck-sticky{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;gap:14px;align-items:center;justify-content:space-between;background:#fff;border-top:1px solid var(--ui-line,#E3E6EA);padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
  .ck-sticky .ck-btn{width:auto;flex:1;max-width:260px}
  .ck-sticky small{display:block;font-size:13px;color:var(--ui-muted,#5A6472)}
  .ck-sticky b{font-size:22px;font-variant-numeric:tabular-nums}
  .ck-pad{height:84px}
}
`;

export default function CartView({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const look = useCartLook();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const { orderNotes, setOrderNotes } = useCheckoutStore();
  const [isGuest, setIsGuest] = useState(false);
  const [adoptDropped, setAdoptDropped] = useState<string[]>([]);

  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [freeShipping, setFreeShipping] = useState<FreeShipping | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [cardOk, setCardOk] = useState(true);

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
    apiClient.get<{ card?: boolean }>("/api/v1/checkout/payment-options", { skipAuth: true })
      .then((r) => setCardOk(r.card !== false))
      .catch(() => setCardOk(true));
  }, []);

  /** The offers for this cart, and the free-shipping line: from the account's
   *  cart on the server, or (a guest) from the lines sent with the question,
   *  which also says which offer lines keep their offer price. */
  const loadOffers = useCallback(async (guest: boolean) => {
    try {
      if (guest) {
        const entries = readGuest();
        if (!entries.length) { setOffers([]); setFreeShipping(null); return; }
        const r = await apiClient.post<OffersResp>("/api/v1/storefront/upsells", {
          lines: entries.map((e) => ({
            key: e.variant_id, product_id: e.product_id || null, quantity: e.quantity,
            line_total: e.upsell_offer_id ? (e.regular_unit_price ?? e.unit_price) * e.quantity : guestLineTotal(e),
            offer_id: e.upsell_offer_id ?? null,
          })),
        }, { skipAuth: true });
        setOffers(r?.offers ?? []);
        setFreeShipping(r?.free_shipping ?? null);
        setCart(buildGuestCart(entries, r?.applying ?? {}));
      } else {
        const r = await apiClient.get<OffersResp>("/api/v1/cart/upsells");
        setOffers(r?.offers ?? []);
        setFreeShipping(r?.free_shipping ?? null);
      }
    } catch {
      // A shop without the feature, or a moment's trouble: the cart still works.
      setOffers([]);
      setFreeShipping(null);
    }
  }, []);

  useEffect(() => {
    if (authIsLoading) return;
    if (!isAuthenticated) {
      setIsGuest(true);
      if (typeof window === "undefined") { setIsLoading(false); return; }
      (async () => {
        try {
          const entries = readGuest();
          if (entries.length > 0) {
            await fillMissingImages(entries);
            const guestCart = buildGuestCart(entries);
            setCart(guestCart);
            trackCartViewed(guestCart.items);
            void loadOffers(true);
          } else {
            setCart(null);
          }
        } catch { setCart(null); }
        setIsLoading(false);
      })();
    } else {
      setIsGuest(false);
      // Lines chosen before signing in are moved into this account first, so
      // the cart shows everything the shopper picked.
      adoptGuestCart()
        .then((r) => { if (r.dropped.length) setAdoptDropped(r.dropped.map((l) => l.product_name)); })
        .catch(() => {})
        .finally(() => {
          cartService.getCart()
            .then((c) => { setCart(c); trackCartViewed(c.items); void loadOffers(false); })
            .catch(console.error)
            .finally(() => setIsLoading(false));
        });
    }
  }, [authIsLoading, isAuthenticated, loadOffers]);

  async function afterChange(updated: Cart | null) {
    setCart(updated && updated.items.length ? updated : null);
    void loadOffers(isGuest);
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
        setCouponError(data.message || "That code isn't valid.");
        setAppliedCoupon(null);
      }
    } catch (err: unknown) {
      setCouponError(err instanceof Error ? err.message : "Could not check that code.");
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
    if (!cart || !cart.items || cart.items.length === 0) return "Your cart is empty";
    if (isGuest) return undefined;
    // A line that can't be ordered as it stands (a design whose product left
    // the designer, or whose blanks ran out): the server refuses it too.
    const stuck = cart.items.find((i) => i.problem);
    if (stuck) return `Fix ${stuck.product_name} first: ${stuck.problem}`;
    const v = cart.validation;
    if (v?.mov_violation) return `The minimum order is ${formatCurrency(Number(v.mov_required))}`;
    return undefined;
  }

  function guestIndex(item: CartItem): number {
    return Number(String(item.id).replace("guest-", ""));
  }

  async function handleRemoveItem(item: CartItem) {
    try {
      if (isGuest) {
        const entries = readGuest().filter((_, i) => i !== guestIndex(item));
        writeGuest(entries);
        await afterChange(entries.length ? buildGuestCart(entries) : null);
      } else {
        const updated = await cartService.removeItem(item.id);
        window.dispatchEvent(new Event("cart_updated"));
        await afterChange(updated ?? await cartService.getCart());
      }
      trackLinesRemoved([item]);
    } catch (err) { console.error(err); }
  }

  async function handleUpdateItemQty(item: CartItem, quantity: number) {
    if (quantity <= 0) { await handleRemoveItem(item); return; }
    try {
      if (isGuest) {
        const entries = readGuest();
        const idx = guestIndex(item);
        if (entries[idx]) entries[idx]!.quantity = quantity;
        writeGuest(entries);
        await afterChange(buildGuestCart(entries));
      } else {
        const updated = await cartService.updateItem(item.id, quantity);
        window.dispatchEvent(new Event("cart_updated"));
        if (updated) await afterChange(updated);
      }
      // More of a line is an add, fewer is a removal, each by the difference.
      const change = quantity - item.quantity;
      if (change > 0) trackLineAdd({ ...item, quantity: change });
      else if (change < 0) trackLinesRemoved([{ ...item, quantity: -change }]);
    } catch (err) { console.error(err); }
  }

  async function addOffer(offer: Offer, variantId: string) {
    const v = offer.variants.find((x) => x.variant_id === variantId) ?? offer.variants[0];
    if (!v) return;
    setAdding(offer.offer_id);
    setOfferError(null);
    try {
      if (isGuest) {
        const entries = readGuest();
        entries.push({
          variant_id: v.variant_id, quantity: 1, product_id: offer.product_id, product_name: offer.product_name,
          slug: offer.product_slug, color: v.color, size: v.size, image_url: offer.image_url,
          unit_price: Number(v.offer_price), regular_unit_price: Number(v.price), upsell_offer_id: offer.offer_id,
        });
        writeGuest(entries);
        setCart(buildGuestCart(entries));
        await loadOffers(true);
      } else {
        const updated = await apiClient.post<Cart>("/api/v1/cart/add-upsell", { offer_id: offer.offer_id, variant_id: v.variant_id, quantity: 1 });
        window.dispatchEvent(new Event("cart_updated"));
        await afterChange(updated);
      }
      trackLineAdd({
        id: offer.offer_id, variant_id: v.variant_id, product_id: offer.product_id, product_name: offer.product_name,
        product_slug: offer.product_slug, sku: "", color: v.color, size: v.size, quantity: 1,
        unit_price: v.offer_price, line_total: v.offer_price, retail_price: v.price, moq: 1, moq_satisfied: true, stock_quantity: 1,
      } as CartItem);
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : "That could not be added. Try again.");
    } finally {
      setAdding(null);
    }
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: embedded ? "200px" : "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--ui-muted)", fontSize: "14px" }}>Loading cart…</p>
      </div>
    );
  }

  const isEmpty = !cart || !cart.items || cart.items.length === 0;
  const disabledReason = getCheckoutDisabledReason();
  const subtotal = Number(cart?.subtotal ?? 0);
  const couponDiscount = !isGuest && appliedCoupon && appliedCoupon.discount_type !== "free_shipping" ? appliedCoupon.discount_amount : 0;
  const total = Math.max(0, subtotal - couponDiscount);
  // "3 items" for three lines, as the design counts them (24 tees are one item).
  const units = cart?.items.length ?? 0;
  const threshold = freeShipping ? Number(freeShipping.threshold) : 0;
  const away = freeShipping ? Math.max(0, threshold - subtotal) : 0;
  const vars = { "--ck-btn": look.button, "--ck-btn-ink": look.buttonInk } as React.CSSProperties;

  const goCheckout = () => {
    // A first order opens an account. Everything after it is just shopping,
    // but the shop needs somebody it can reach about a print job, and a buyer
    // needs somewhere to find it again.
    if (isGuest) {
      router.push(`/create-account?next=${encodeURIComponent("/cart")}`);
      return;
    }
    router.push("/checkout");
  };
  const checkoutLabel = isGuest ? "Create an account to check out" : look.checkoutText;

  return (
    <div className={`ck${embedded ? " ck-in" : " ui-page"}`} style={{ ...vars, ...(embedded ? {} : { padding: "36px 0 72px" }) }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className={embedded ? undefined : "ui-wrap"}>
        {!embedded && (
          <>
            <nav className="ck-crumbs" aria-label="Checkout steps">
              <b>Cart</b><span>/</span><span>Checkout</span><span>/</span><span>Confirmation</span>
            </nav>
            <h1>Your cart</h1>
          </>
        )}

        {isEmpty ? (
          /* An empty cart is a dead end unless it points somewhere. */
          <div className="ck-card" style={{ textAlign: "center", padding: "48px 28px", maxWidth: "460px" }}>
            <p className="ck-muted" style={{ fontSize: "15.5px", margin: "0 0 22px" }}>
              Nothing in it yet. Once you add something it shows here, with its price and your total.
            </p>
            <Link href="/products" className="ck-btn ck-btn-main" style={{ width: "auto" }}>Browse the shop</Link>
          </div>
        ) : (
          <div className="ck-grid">
            <div className="ck-col">
              {adoptDropped.length > 0 && (
                <div className="ck-notice" role="status">
                  {adoptDropped.length === 1 ? "One item" : `${adoptDropped.length} items`} from before you signed in could not be added,
                  because {adoptDropped.length === 1 ? "it is" : "they are"} no longer available: {adoptDropped.join(", ")}.
                </div>
              )}
              {cart?.validation?.mov_violation && (
                <div className="ck-alert" role="alert">
                  <b>The minimum order is {formatCurrency(Number(cart.validation.mov_required))}.</b>{" "}
                  Your cart is {formatCurrency(Number(cart.validation.mov_current))}.
                </div>
              )}

              {freeShipping && (
                <div className="ck-card ck-free" data-free-shipping>
                  <p>{freeShipping.reached || away <= 0
                    ? "Your order ships free"
                    : <>You&apos;re {formatCurrency(away)} away from free shipping</>}</p>
                  <div className="ck-bar" role="progressbar" aria-valuemin={0} aria-valuemax={threshold}
                    aria-valuenow={Math.min(subtotal, threshold)} aria-label="Toward free shipping">
                    <i style={{ width: `${freeShipping.reached || away <= 0 || threshold <= 0 ? 100 : Math.min(100, (subtotal / threshold) * 100)}%` }} />
                  </div>
                </div>
              )}

              <div className="ck-card ck-lines">
                {cart!.items.map((item) => {
                  const detail = lineDetail(item);
                  const regular = item.regular_unit_price != null ? Number(item.regular_unit_price) : null;
                  const left = Number(item.stock_quantity ?? 0);
                  return (
                    <div key={item.id} className="ck-line" data-cart-line>
                      <div className="ck-pic">
                        {item.product_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product_image_url} alt={item.product_name}
                            onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        ) : (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9C6C0" strokeWidth={1.5} aria-hidden="true"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z" /></svg>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p className="ck-name">{item.product_name}</p>
                        {detail && <div className="ck-sub">{detail}</div>}
                        {item.configuration?.quantity_from_option && (
                          <div className="ck-sub">{Number(item.quantity).toLocaleString()} for {formatCurrency(Number(item.line_total))}</div>
                        )}
                        <ConfigurationDetail configuration={item.configuration} compact />
                        {item.upsell_offer_id && regular != null && (
                          <span className="ck-badge ck-ok" data-offer-badge>Offer price</span>
                        )}
                        {!item.upsell_offer_id && item.tracks_stock && left >= item.quantity && (
                          <span className="ck-badge ck-ok">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                            In stock
                          </span>
                        )}
                        {item.tracks_stock && left > 0 && left < item.quantity && (
                          <span className="ck-badge ck-warn">Only {left} left</span>
                        )}
                        {item.item_type === "gang_sheet" && (
                          <span className="ck-badge ck-info">The shop checks your artwork before printing</span>
                        )}
                        {item.problem && <p className="ck-sub ck-bad" role="alert" data-line-problem>{item.problem}</p>}
                        <div className="ck-acts">
                          {isDesignLine(item) && item.configuration?.tshirt_design?.id && (
                            <Link href={`/design?design=${encodeURIComponent(item.configuration.tshirt_design.id)}`} data-edit-design>
                              Edit design
                            </Link>
                          )}
                          <button type="button" onClick={() => handleRemoveItem(item)} aria-label={`Remove ${item.product_name}`}>Remove</button>
                        </div>
                      </div>
                      <div className="ck-end">
                        {fixedQuantity(item) ? (
                          <span className="ck-fixed" aria-label={`Quantity for ${item.product_name}`}
                            title={isDesignLine(item) ? "Change the sizes and quantities in the designer" : "Set on the product's page"}>
                            Qty {item.quantity}
                          </span>
                        ) : (
                          <div className="ck-qty" role="group" aria-label={`Quantity for ${item.product_name}`}>
                            <button type="button" aria-label="One fewer" onClick={() => handleUpdateItemQty(item, item.quantity - 1)}>−</button>
                            <span>{item.quantity}</span>
                            <button type="button" aria-label="One more" onClick={() => handleUpdateItemQty(item, item.quantity + 1)}>+</button>
                          </div>
                        )}
                        <div className="ck-price">
                          {item.upsell_offer_id && regular != null && regular > Number(item.unit_price) && (
                            <span className="ck-was">{formatCurrency(regular * item.quantity)}</span>
                          )}
                          {formatCurrency(Number(item.line_total))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {offers.map((offer) => (
                <OfferCard key={offer.offer_id} offer={offer} busy={adding === offer.offer_id} onAdd={(v) => addOffer(offer, v)} />
              ))}
              {offerError && <p className="ck-sub ck-bad" role="alert">{offerError}</p>}

              {look.showOrderNote && (
                <div className="ck-card ck-note">
                  <label htmlFor="ck-order-note">Order note (optional)</label>
                  <textarea id="ck-order-note" value={orderNotes} maxLength={1000}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Anything we should know about colors, deadline or packing?" />
                </div>
              )}
            </div>

            <aside>
              <div className="ck-card ck-sum">
                <h2>Order summary</h2>
                <div className="ck-row"><span>Subtotal ({units} {units === 1 ? "item" : "items"})</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="ck-row"><span>Shipping</span><span className="ck-muted">Calculated at checkout</span></div>
                <div className="ck-row"><span>Estimated tax</span><span className="ck-muted">Calculated at checkout</span></div>
                {!isGuest && !appliedCoupon && (
                  <>
                    <div className="ck-code">
                      <input value={couponInput} placeholder="Discount code" aria-label="Discount code"
                        onChange={(e) => { setCouponInput(e.target.value); setCouponError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleApplyCoupon(); }} />
                      <button type="button" className="ck-btn ck-btn-ghost ck-btn-sm" onClick={handleApplyCoupon}
                        disabled={!couponInput.trim() || applyingCoupon}>
                        {applyingCoupon ? "…" : "Apply"}
                      </button>
                    </div>
                    {couponError && <p className="ck-sub ck-bad" style={{ marginTop: 0 }}>{couponError}</p>}
                  </>
                )}
                {appliedCoupon && !isGuest && (
                  <div className="ck-row" style={{ color: "var(--ui-ok, #15803D)", marginTop: "12px" }}>
                    <span>
                      Code {appliedCoupon.code}{" "}
                      <button type="button" onClick={handleRemoveCoupon} aria-label="Remove the code"
                        style={{ border: 0, background: "none", color: "var(--ui-bad, #B42318)", cursor: "pointer", fontWeight: 700 }}>✕</button>
                    </span>
                    <span>{appliedCoupon.discount_type === "free_shipping" ? "Free shipping" : `-${formatCurrency(couponDiscount)}`}</span>
                  </div>
                )}
                <div className="ck-total"><span>Total</span><span><b>{formatCurrency(total)}</b><small>USD</small></span></div>
                <div className="ck-btns">
                  <button type="button" className="ck-btn ck-btn-main ck-checkout" onClick={goCheckout} disabled={!!disabledReason}
                    title={disabledReason} data-checkout>
                    {checkoutLabel}
                  </button>
                  <Link href="/products" className="ck-btn ck-btn-ghost">Continue shopping</Link>
                </div>
                {isGuest && <p className="ck-hint">First order only. After that you just sign in.</p>}
                {disabledReason && <p className="ck-hint ck-bad">{disabledReason}</p>}
                {!isGuest ? <PointsLine signedIn={isAuthenticated} /> : null}
              </div>
              {cardOk && (
                <div className="ck-trust">
                  <div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>
                    <span>Secure card payment. We never store your card details.</span>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {!isEmpty && !embedded && (
        <>
          <div className="ck-pad" />
          <div className="ck-sticky">
            <div><small>Total</small><b>{formatCurrency(total)}</b></div>
            <button type="button" className="ck-btn ck-btn-main" onClick={goCheckout} disabled={!!disabledReason}>{checkoutLabel}</button>
          </div>
        </>
      )}
    </div>
  );
}

function OfferCard({ offer, busy, onAdd }: { offer: Offer; busy: boolean; onAdd: (variantId: string) => void }) {
  const [variantId, setVariantId] = useState(offer.variants[0]?.variant_id ?? "");
  const v = offer.variants.find((x) => x.variant_id === variantId) ?? offer.variants[0];
  const price = v ? Number(v.offer_price) : offer.from_price ? Number(offer.from_price) : null;
  const was = v && Number(v.price) > Number(v.offer_price) ? Number(v.price) : null;
  const words = [
    price != null ? (offer.kind === "build" && offer.from_price ? `From ${formatCurrency(price)}` : formatCurrency(price)) : null,
    offer.unlocks_free_shipping ? "unlocks free shipping" : offer.discount,
  ].filter(Boolean).join(", ");
  return (
    <div className="ck-card ck-offer" data-upsell={offer.offer_id}>
      <div className="ck-pic">
        {offer.image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={offer.image_url} alt="" />
          : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <h3>{offer.title}</h3>
        <div className="ck-sub" style={{ marginTop: "4px" }}>
          {was != null && <span style={{ textDecoration: "line-through", marginRight: "6px" }}>{formatCurrency(was)}</span>}
          {words}
        </div>
        {offer.description && <div className="ck-sub">{offer.description}</div>}
        {offer.kind === "ready" && offer.variants.length > 1 && (
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} aria-label={`Choose ${offer.product_name}`}>
            {offer.variants.map((o) => <option key={o.variant_id} value={o.variant_id}>{o.label}</option>)}
          </select>
        )}
      </div>
      {offer.kind === "ready" ? (
        <button type="button" className="ck-btn ck-btn-ghost ck-btn-sm" disabled={busy || !v} onClick={() => onAdd(variantId)}>
          {busy ? "Adding…" : "Add to cart"}
        </button>
      ) : (
        <Link href={`/products/${encodeURIComponent(offer.product_slug)}`} className="ck-btn ck-btn-ghost ck-btn-sm">
          See options
        </Link>
      )}
    </div>
  );
}
