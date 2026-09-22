/** Application-wide constants. */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const CDN_BASE_URL = process.env.NEXT_PUBLIC_CDN_BASE_URL ?? "";
export const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

/**
 * Admin screens switched off for now. Storefront design, menus and pages are
 * set up by our team for each client, so these editors are hidden from the
 * admin navigation. The routes and data are untouched — set a value to false
 * to bring its screen back.
 */
export const HIDDEN_ADMIN_SECTIONS = {
  storefront: true,
  menus: true,
  pages: true,
  // Product page layouts come from the theme now; the older per-product
  // template editor stays in the code but off the menu.
  productTemplates: true,
} as const;

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
