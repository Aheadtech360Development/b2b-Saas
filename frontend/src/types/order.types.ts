import type { Address } from "./user.types";

/** Cart item — matches backend CartItemOut schema. */
export interface CartItem {
  id: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  product_slug?: string;
  product_image_url?: string | null;
  sku: string;
  color: string | null;
  size: string | null;
  quantity: number;
  retail_price?: string;
  unit_price: string;
  line_total: string;
  moq: number;
  moq_satisfied: boolean;
  stock_quantity: number;
}

/** Cart validation result — matches backend CartValidation schema. */
export interface CartValidation {
  is_valid: boolean;
  moq_violations: { variant_id: string; sku: string; required: number; current: number }[];
  mov_violation: boolean;
  mov_required: string;
  mov_current: string;
  estimated_shipping: string;
  has_shipping_tier: boolean;
}

/** Cart response — matches backend CartResponse schema. */
export interface Cart {
  items: CartItem[];
  subtotal: string;
  item_count: number;
  total_units: number;
  validation: CartValidation;
  discount_percent: string;
}

/** Matrix add request (variant_id → quantity). */
export interface MatrixAddRequest {
  items: { variant_id: string; quantity: number }[];
}

/** Order status values. */
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

/** Payment status values. */
export type PaymentStatus = "unpaid" | "pending" | "paid" | "refunded" | "failed";

/** Order list item (dashboard). */
export interface OrderListItem {
  id: string;
  order_number: string;
  po_number: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total: string;
  item_count: number;
  created_at: string;
  company_name: string;
}

/** Full order detail. */
export interface OrderDetail extends OrderListItem {
  subtotal: string;
  shipping_cost: string;
  tax_amount: string;
  shipping_address: Address | null;
  shipping_address_snapshot: Record<string, unknown> | null;
  tracking_number: string | null;
  carrier: string | null;
  notes: string | null;
  items: OrderItemDetail[];
  qb_sync_status: "pending" | "synced" | "failed" | "skipped";
}

/** Order line item. */
export interface OrderItemDetail {
  id: string;
  variant_id: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
}

/** Order template. */
export interface OrderTemplate {
  id: string;
  name: string;
  item_count: number;
  created_at: string;
  items: { sku: string; quantity: number }[];
}

/** Checkout state steps. */
export type CheckoutStep = "address" | "details" | "payment" | "review";
