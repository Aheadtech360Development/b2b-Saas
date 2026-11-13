/**
 * Buying from the shop: the catalogue, the cart, checkout and orders.
 *
 * The same endpoints the website's shop uses, signed in as the buyer, so the
 * prices are this buyer's (their tier, their discount group) and the cart is
 * the one they see on the website too. Field names are the server's; each
 * reader turns them into the app's own shape so a screen never guesses.
 */
import { call } from "@/api/client";

// ── Small readers ────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ── Catalogue ────────────────────────────────────────────────────────────────

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  /** The lowest price this buyer pays for any of its options. */
  fromPrice: number | null;
}

export interface Category { id: string; name: string; slug: string }

interface RawImage { url_thumbnail?: string; url_medium?: string; url_large?: string; is_primary?: boolean; position?: number }
interface RawVariant {
  id?: string; sku?: string; color?: string | null; color_hex?: string | null; size?: string | null;
  retail_price?: unknown; effective_price?: unknown; compare_price?: unknown; stock_quantity?: unknown; status?: string;
}
interface RawListItem {
  id?: string; slug?: string; name?: string; primary_image?: RawImage | null; variants?: RawVariant[];
}

const priceOf = (v: RawVariant): number | null => numOrNull(v.effective_price) ?? numOrNull(v.retail_price);

export async function products(opts: { q?: string; category?: string; page?: number } = {}):
  Promise<{ items: ProductCard[]; page: number; pages: number; total: number }> {
  const qs = new URLSearchParams({ page: String(opts.page ?? 1), page_size: "24" });
  if (opts.q?.trim()) qs.set("q", opts.q.trim());
  if (opts.category) qs.set("category", opts.category);
  const res = await call<{ items?: RawListItem[]; page?: number; pages?: number; total?: number }>(`/api/v1/products?${qs}`);
  const items = (res.items ?? []).map((p) => {
    const prices = (p.variants ?? []).filter((v) => v.status !== "discontinued" && v.status !== "archived")
      .map(priceOf).filter((n): n is number => n !== null);
    const img = p.primary_image;
    return {
      id: str(p.id), slug: str(p.slug), name: str(p.name),
      image: img ? (img.url_medium || img.url_large || img.url_thumbnail || null) : null,
      fromPrice: prices.length ? Math.min(...prices) : null,
    };
  });
  return { items, page: num(res.page) || 1, pages: num(res.pages) || 1, total: num(res.total) };
}

export async function categories(): Promise<Category[]> {
  const res = await call<Array<{ id?: string; name?: string; slug?: string; is_active?: boolean; children?: unknown[] }>>(
    "/api/v1/products/categories");
  return (Array.isArray(res) ? res : [])
    .filter((c) => c.is_active !== false && c.slug)
    .map((c) => ({ id: str(c.id), name: str(c.name), slug: str(c.slug) }));
}

export interface Variant {
  id: string;
  sku: string;
  color: string;
  colorHex: string | null;
  size: string;
  price: number | null;
  comparePrice: number | null;
  stock: number;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  /** Plain text: the description arrives as HTML. */
  description: string;
  images: string[];
  variants: Variant[];
  moq: number;
  /** Stock is counted: an option with none left cannot be bought. */
  tracksStock: boolean;
  /**
   * Why this product is bought on the website rather than here, or null.
   * The app orders products that are a colour and a size; products built from
   * options, gang sheets and designs need the website's builders.
   */
  websiteOnly: string | null;
}

/** HTML to readable text: paragraphs and line breaks kept, tags dropped. */
export function plainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function product(slug: string): Promise<ProductDetail> {
  const p = await call<{
    id?: string; slug?: string; name?: string; description?: string | null; moq?: unknown;
    images?: RawImage[]; variants?: RawVariant[]; pricing_mode?: string; gang_sheet_enabled?: boolean;
    track_inventory?: boolean;
  }>(`/api/v1/products/${encodeURIComponent(slug)}`);
  const images = [...(p.images ?? [])]
    .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || num(a.position) - num(b.position))
    .map((i) => i.url_large || i.url_medium || i.url_thumbnail || "")
    .filter(Boolean);
  const variants = (p.variants ?? [])
    .filter((v) => v.status !== "discontinued" && v.status !== "archived")
    .map((v) => ({
      id: str(v.id), sku: str(v.sku), color: str(v.color), colorHex: v.color_hex ?? null, size: str(v.size),
      price: priceOf(v), comparePrice: numOrNull(v.compare_price), stock: num(v.stock_quantity),
    }));
  let websiteOnly: string | null = null;
  if (p.gang_sheet_enabled) websiteOnly = "Gang sheets are built on the website.";
  else if (p.pricing_mode === "configurable") websiteOnly = "This product is put together from options on the website.";
  else if (!variants.length) websiteOnly = "This product has no options to order yet.";
  return {
    id: str(p.id), slug: str(p.slug) || slug, name: str(p.name), description: plainText(str(p.description)),
    images, variants, moq: Math.max(1, num(p.moq) || 1), tracksStock: p.track_inventory !== false, websiteOnly,
  };
}

// ── Cart ─────────────────────────────────────────────────────────────────────

export interface CartLine {
  id: string;
  /** The colour-and-size it is, for carrier rates; empty for gang sheets, designs, gift cards. */
  variantId: string;
  productName: string;
  productSlug: string;
  image: string | null;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Something stopping this line being ordered as it stands, in the shop's words. */
  problem: string | null;
  /** Lines the app cannot change the size of: gang sheets, designs, gift cards. */
  fixed: boolean;
}

export interface Cart {
  lines: CartLine[];
  subtotal: number;
  units: number;
  /** Why it cannot be ordered yet: minimums not met, a line with a problem. */
  blockers: string[];
  /** Shipping the shop's tiers give this cart, when it has tiers. */
  tierShipping: number | null;
}

interface RawCart {
  items?: Array<Record<string, unknown>>;
  subtotal?: unknown;
  total_units?: unknown;
  validation?: {
    is_valid?: boolean; mov_violation?: boolean; mov_required?: unknown; mov_current?: unknown;
    moq_violations?: Array<Record<string, unknown>>; estimated_shipping?: unknown; has_shipping_tier?: boolean;
  };
}

function cartFrom(raw: RawCart): Cart {
  const lines = (raw.items ?? []).map((i) => ({
    id: str(i.id), variantId: str(i.variant_id), productName: str(i.product_name), productSlug: str(i.product_slug),
    image: (i.product_image_url as string | null) ?? null, color: str(i.color), size: str(i.size),
    quantity: num(i.quantity), unitPrice: num(i.unit_price), lineTotal: num(i.line_total),
    problem: (i.problem as string | null) || null,
    fixed: !!i.item_type && i.item_type !== "variant",
  }));
  const v = raw.validation ?? {};
  const blockers: string[] = [];
  for (const m of v.moq_violations ?? []) {
    const name = str(m.product_name) || "A product";
    const needed = num(m.moq ?? m.required);
    blockers.push(needed ? `${name}: order at least ${needed} in all.` : `${name}: below its minimum order.`);
  }
  if (v.mov_violation) {
    blockers.push(`The shop's minimum order is ${money(num(v.mov_required))}.`);
  }
  for (const l of lines) if (l.problem) blockers.push(`${l.productName}: ${l.problem}`);
  return {
    lines, subtotal: num(raw.subtotal), units: num(raw.total_units), blockers,
    tierShipping: v.has_shipping_tier ? num(v.estimated_shipping) : null,
  };
}

export async function cart(): Promise<Cart> {
  return cartFrom(await call<RawCart>("/api/v1/cart"));
}

export async function addToCart(productId: string, variantId: string, quantity: number): Promise<Cart> {
  return cartFrom(await call<RawCart>("/api/v1/cart/add-matrix", {
    method: "POST", body: { product_id: productId, items: [{ variant_id: variantId, quantity }] },
  }));
}

export async function setQuantity(lineId: string, quantity: number): Promise<Cart> {
  return cartFrom(await call<RawCart>(`/api/v1/cart/items/${lineId}`, { method: "PATCH", body: { quantity } }));
}

export async function removeLine(lineId: string): Promise<Cart> {
  return cartFrom(await call<RawCart>(`/api/v1/cart/items/${lineId}`, { method: "DELETE" }));
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export interface Address {
  id: string | null;
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

export async function addresses(): Promise<Address[]> {
  const res = await call<Array<Record<string, unknown>>>("/api/v1/account/addresses");
  return (Array.isArray(res) ? res : []).map((a) => ({
    id: str(a.id), fullName: str(a.full_name), line1: str(a.line1), line2: str(a.line2), city: str(a.city),
    state: str(a.state), zip: str(a.postal_code), country: str(a.country) || "US", phone: str(a.phone),
    isDefault: !!a.is_default,
  }));
}

export interface ShopRules {
  /** Will Call: the buyer collects the order. Offered unless the shop switched it off. */
  pickup: boolean;
  pickupWhere: string;
}

export async function shopRules(): Promise<ShopRules> {
  try {
    const b = await call<{ pickup_enabled?: boolean; pickup_address?: string | null; pickup_name?: string | null }>(
      "/api/v1/storefront/branding");
    return {
      pickup: b.pickup_enabled !== false,
      pickupWhere: [b.pickup_name, b.pickup_address].filter(Boolean).join(", "),
    };
  } catch {
    return { pickup: false, pickupWhere: "" };
  }
}

export interface PaymentOptions { card: boolean; cod: boolean }

export async function paymentOptions(): Promise<PaymentOptions> {
  const r = await call<{ card?: boolean; cod?: boolean }>("/api/v1/checkout/payment-options");
  return { card: r.card !== false, cod: !!r.cod };
}

/** "flat", "store_default", "tier", "live_shippo" … what decides this buyer's shipping. */
export async function shippingType(): Promise<string> {
  try {
    const r = await call<{ shipping_type?: string }>("/api/v1/shipping/shipping-type");
    return r.shipping_type || "store_default";
  } catch {
    return "store_default";
  }
}

export interface LiveRate { id: string; carrier: string; service: string; cost: number; days: number | null }

export async function liveRates(to: { zip: string; state: string; city: string }, items: Array<{ variant_id: string; quantity: number }>):
  Promise<LiveRate[]> {
  const r = await call<{ rates?: Array<Record<string, unknown>>; error?: string }>("/api/v1/shipping/live-rates", {
    method: "POST", body: { to_zip: to.zip, to_state: to.state, to_city: to.city || undefined, cart_items: items },
  });
  return (r.rates ?? []).map((x) => ({
    id: str(x.rate_id), carrier: str(x.carrier), service: str(x.service), cost: num(x.cost),
    days: numOrNull(x.estimated_days ?? x.days),
  }));
}

export interface Tax { amount: number; rate: number; region: string | null }

export async function tax(subtotal: number, zip: string, state: string, discount: number): Promise<Tax> {
  const r = await call<{ tax_rate?: unknown; tax_amount?: unknown; region?: string | null }>("/api/v1/tax/calculate", {
    method: "POST", body: { subtotal, zip_code: zip, state: state.toUpperCase(), discount },
  });
  return { amount: num(r.tax_amount), rate: num(r.tax_rate), region: r.region ?? null };
}

export interface Coupon { code: string; type: string; amount: number; message: string }

export async function checkCoupon(code: string, subtotal: number): Promise<Coupon> {
  const r = await call<{ valid?: boolean; message?: string; code?: string; discount_type?: string; discount_amount?: unknown }>(
    "/api/v1/discounts/validate",
    { method: "POST", body: { code: code.trim(), cart_total: subtotal, customer_type: "wholesale" } },
  );
  if (!r.valid) throw new Error(r.message || "That code does not work.");
  return { code: str(r.code) || code.trim(), type: str(r.discount_type), amount: num(r.discount_amount), message: str(r.message) };
}

/** What a checkout sends, the same fields the website sends. */
export interface CheckoutFields {
  address: Address;
  /** As the website offers: standard shipping, or Will Call pickup when the shop has it. */
  shippingMethod: "standard" | "will_call";
  shippingCost: number;
  liveRate: LiveRate | null;
  couponCode: string | null;
  tax: Tax | null;
  notes: string;
  poNumber: string;
}

export interface CardIntent {
  clientSecret: string;
  paymentIntentId: string;
  accountId: string;
  publishableKey: string;
  amount: number;
  orderTotal: number;
}

/** The card payment for this cart, priced by the server as the order will be. */
export async function cardIntent(f: CheckoutFields): Promise<CardIntent> {
  const r = await call<Record<string, unknown>>("/api/v1/checkout/intent", {
    method: "POST",
    body: {
      shipping_method: f.shippingMethod,
      shipping_cost: f.shippingCost > 0 ? f.shippingCost : undefined,
      discount_code: f.couponCode || undefined,
      payment_method: "card",
      to_state: f.shippingMethod === "will_call" ? undefined : f.address.state || undefined,
      to_zip: f.shippingMethod === "will_call" ? undefined : f.address.zip || undefined,
    },
  });
  return {
    clientSecret: str(r.client_secret), paymentIntentId: str(r.payment_intent_id),
    accountId: str(r.connected_account_id), publishableKey: str(r.publishable_key),
    amount: num(r.amount), orderTotal: num(r.order_total),
  };
}

export interface PlacedOrder { id: string; number: string; total: number; paymentStatus: string }

/** Place the order: after a card payment (its id), or cash on delivery. */
export async function placeOrder(f: CheckoutFields, payment: { method: "card"; intentId: string } | { method: "cod" },
  attemptKey: string): Promise<PlacedOrder> {
  const a = f.address;
  const body: Record<string, unknown> = {
    idempotency_key: attemptKey,
    shipping_method: f.shippingMethod,
    po_number: f.poNumber.trim() || undefined,
    order_notes: f.notes.trim() || undefined,
    discount_code: f.couponCode || undefined,
    tax_amount: f.tax && f.tax.amount > 0 ? f.tax.amount : undefined,
    tax_rate: f.tax?.rate || undefined,
    tax_region: f.tax?.region || undefined,
    shipping_cost: f.shippingCost > 0 ? f.shippingCost : undefined,
    payment_method: payment.method,
    ...(payment.method === "card" ? { payment_intent_id: payment.intentId } : {}),
    ...(f.liveRate && f.shippingMethod === "standard"
      ? { shipping_rate_id: f.liveRate.id, shipping_carrier: f.liveRate.carrier, shipping_service: f.liveRate.service }
      : {}),
  };
  if (a.id) body.address_id = a.id;
  body.shipping_address = {
    label: "Shipping", full_name: a.fullName || undefined, line1: a.line1, line2: a.line2 || undefined,
    city: a.city, state: a.state, postal_code: a.zip, country: a.country || "US", phone: a.phone || undefined,
  };
  const r = await call<Record<string, unknown>>("/api/v1/checkout/confirm", { method: "POST", body });
  return { id: str(r.id), number: str(r.order_number), total: num(r.total), paymentStatus: str(r.payment_status) };
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface OrderLine { name: string; sku: string; color: string; size: string; quantity: number; unitPrice: number; lineTotal: number }

export interface OrderDetail {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  placedAt: string;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  balanceDue: number;
  trackingNumber: string;
  trackingUrl: string;
  carrier: string;
  lines: OrderLine[];
}

export async function order(numberOrId: string): Promise<OrderDetail> {
  const o = await call<Record<string, unknown>>(`/api/v1/orders/${encodeURIComponent(numberOrId)}`);
  const discounts = Array.isArray(o.discounts) ? (o.discounts as Array<Record<string, unknown>>) : [];
  return {
    id: str(o.id), number: str(o.order_number), status: str(o.status), paymentStatus: str(o.payment_status),
    placedAt: str(o.created_at), subtotal: num(o.subtotal), shipping: num(o.shipping_cost), tax: num(o.tax_amount),
    discount: discounts.reduce((s, d) => s + num(d.amount ?? d.discount_amount), 0),
    total: num(o.total), balanceDue: num(o.balance_due),
    trackingNumber: str(o.tracking_number), trackingUrl: str(o.tracking_url), carrier: str(o.courier ?? o.carrier),
    lines: (Array.isArray(o.items) ? (o.items as Array<Record<string, unknown>>) : []).map((i) => ({
      name: str(i.product_name), sku: str(i.sku), color: str(i.color), size: str(i.size),
      quantity: num(i.quantity), unitPrice: num(i.unit_price), lineTotal: num(i.line_total),
    })),
  };
}

// ── Shared ───────────────────────────────────────────────────────────────────

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The shop's website, for what is ordered there. */
export function shopWebsite(tenantSlug: string | null, path = "/"): string | null {
  if (!tenantSlug) return null;
  return `https://${tenantSlug}.printcopilot.co${path}`;
}
