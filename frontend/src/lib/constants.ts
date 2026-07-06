/** Application-wide constants. */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const CDN_BASE_URL = process.env.NEXT_PUBLIC_CDN_BASE_URL ?? "";
export const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

/** Pagination */
export const DEFAULT_PAGE_SIZE = 24;
export const ADMIN_PAGE_SIZE = 50;

/** Image size keys mapped to pixel widths */
export const IMAGE_SIZES = {
  thumbnail: 150,
  medium: 400,
  large: 800,
} as const;

/** Cart */
export const CART_DEBOUNCE_MS = 300;

/** Checkout steps */
export const CHECKOUT_STEPS = ["address", "details", "payment", "review"] as const;

/** Order status display labels */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Payment status display labels */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Failed",
};
