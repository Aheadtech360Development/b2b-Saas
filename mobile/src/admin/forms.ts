/**
 * What can be changed on a record, and where the change is sent.
 *
 * Declared rather than written out per screen, for the same reason the lists
 * are: a form differs from another form in its fields and its endpoint, and
 * in nothing else. Writing eight of them by hand would mean eight slightly
 * different answers to what happens when a save fails.
 *
 * Only fields the API will actually accept appear here. A field the server
 * ignores is worse than a missing one: it saves, says it saved, and changes
 * nothing.
 */

export type FieldKind = "text" | "multiline" | "number" | "money" | "switch" | "select";

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  /** For select. The first is what an unset value shows as. */
  options?: Array<{ label: string; value: string }>;
  hint?: string;
  placeholder?: string;
}

export interface Form {
  /** Where the current values are read from. */
  load: (id: string) => string;
  /** Where the change goes, and how. */
  method: "PATCH" | "PUT" | "POST";
  save: (id: string) => string;
  fields: Field[];
  /** Pulls the flat values out of whatever the GET returned. */
  read?: (raw: any) => Record<string, unknown>;
}

const STATUS = (...values: string[]) =>
  values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1), value: v }));

export const PRODUCT_FORM: Form = {
  load: (id) => `/api/v1/admin/products/${id}`,
  method: "PATCH",
  save: (id) => `/api/v1/admin/products/${id}`,
  fields: [
    { key: "name", label: "Name", kind: "text" },
    { key: "status", label: "Status", kind: "select", options: STATUS("draft", "active", "archived") },
    { key: "product_code", label: "Product code", kind: "text" },
    { key: "description", label: "Description", kind: "multiline" },
    { key: "moq", label: "Minimum order quantity", kind: "number", hint: "1 means no minimum." },
    { key: "vendor", label: "Vendor", kind: "text" },
    { key: "product_type", label: "Type", kind: "text" },
    { key: "fabric", label: "Fabric", kind: "text" },
    { key: "gender", label: "Gender", kind: "text" },
    { key: "weight", label: "Weight", kind: "text" },
    { key: "care_instructions", label: "Care instructions", kind: "multiline" },
    { key: "meta_title", label: "SEO title", kind: "text" },
    { key: "meta_description", label: "SEO description", kind: "multiline" },
  ],
};

export const COLLECTION_FORM: Form = {
  load: (id) => `/api/v1/admin/collections/${id}`,
  method: "PATCH",
  save: (id) => `/api/v1/admin/collections/${id}`,
  fields: [
    { key: "name", label: "Name", kind: "text" },
    { key: "slug", label: "Handle", kind: "text", hint: "The part that appears in the address." },
    { key: "description", label: "Description", kind: "multiline" },
    { key: "is_active", label: "Visible in the shop", kind: "switch" },
    { key: "position", label: "Position", kind: "number", hint: "Lower comes first." },
    { key: "seo_title", label: "SEO title", kind: "text" },
    { key: "seo_description", label: "SEO description", kind: "multiline" },
  ],
};

export const CUSTOMER_FORM: Form = {
  load: (id) => `/api/v1/admin/companies/${id}`,
  method: "PATCH",
  save: (id) => `/api/v1/admin/companies/${id}`,
  fields: [
    { key: "status", label: "Status", kind: "select", options: STATUS("active", "pending", "suspended") },
    {
      key: "tax_exempt", label: "Tax exempt", kind: "switch",
      hint: "No tax is charged on this company's orders.",
    },
    {
      key: "shipping_override_amount", label: "Shipping override", kind: "money",
      hint: "Leave empty to use the shipping tier.",
    },
    { key: "admin_notes", label: "Internal notes", kind: "multiline", hint: "The customer never sees this." },
  ],
};

export const DISCOUNT_FORM: Form = {
  load: (id) => `/api/v1/admin/discounts/${id}`,
  method: "PATCH",
  save: (id) => `/api/v1/admin/discounts/${id}`,
  fields: [
    {
      key: "discount_type", label: "Type", kind: "select",
      options: [
        { label: "Percentage", value: "percentage" },
        { label: "Fixed amount", value: "fixed_amount" },
      ],
    },
    { key: "discount_value", label: "Value", kind: "number" },
    { key: "minimum_order_amount", label: "Minimum order", kind: "money" },
    { key: "usage_limit_total", label: "Total uses allowed", kind: "number" },
    { key: "usage_limit_per_customer", label: "Uses per customer", kind: "number" },
    { key: "is_active", label: "Active", kind: "switch" },
  ],
};

export const ORDER_FORM: Form = {
  load: (id) => `/api/v1/admin/orders/${id}`,
  method: "PATCH",
  save: (id) => `/api/v1/admin/orders/${id}`,
  fields: [
    // The PO number is the buyer's, set when they ordered; the server does not
    // take a change to it, so it is not offered here.
    { key: "order_notes", label: "Notes", kind: "multiline" },
    { key: "tracking_number", label: "Tracking number", kind: "text" },
    { key: "courier", label: "Courier", kind: "text", placeholder: "UPS, FedEx, USPS" },
    { key: "courier_service", label: "Service", kind: "text", placeholder: "Ground, 2 Day" },
  ],
};

/**
 * The shop's own settings.
 *
 * A flat key-value dictionary on both sides, so there is no record id: the
 * same path loads and saves. Only the keys the server's own allow-list
 * accepts are here.
 */
export const SETTINGS_FORM: Form = {
  load: () => "/api/v1/admin/settings",
  method: "PATCH",
  save: () => "/api/v1/admin/settings",
  fields: [
    { key: "notification_email", label: "Notification email", kind: "text",
      hint: "Where new orders and applications are announced." },
    { key: "mov", label: "Minimum order value", kind: "money" },
    { key: "moq", label: "Minimum order quantity", kind: "number" },
    { key: "low_stock_threshold", label: "Low stock warning at", kind: "number" },
    {
      key: "guest_pricing_mode", label: "Guest pricing", kind: "select",
      options: [
        { label: "Retail", value: "retail" },
        { label: "Wholesale", value: "wholesale" },
        { label: "Hidden", value: "hidden" },
      ],
    },
  ],
};

export const TAX_SETTINGS_FORM: Form = {
  load: () => "/api/v1/admin/settings",
  method: "PATCH",
  save: () => "/api/v1/admin/settings",
  fields: [
    {
      key: "tax_mode", label: "How tax is worked out", kind: "select",
      options: [
        { label: "Automatic, by address", value: "auto" },
        { label: "One rate I set", value: "manual" },
        { label: "No tax", value: "none" },
      ],
    },
    { key: "tax_rate", label: "Rate, as a percentage", kind: "number",
      hint: "Used only when the rate is set by hand." },
  ],
};

export const SHIPPING_SETTINGS_FORM: Form = {
  load: () => "/api/v1/admin/settings",
  method: "PATCH",
  save: () => "/api/v1/admin/settings",
  fields: [
    { key: "standard_shipping", label: "Standard shipping charge", kind: "money" },
    { key: "standard_shipping_method", label: "Method shown at checkout", kind: "text" },
    { key: "shippo_api_key", label: "Shippo API key", kind: "text",
      hint: "Labels are bought with this key, so they bill your own account. Leave empty to keep the one already saved." },
  ],
};

/** Which sections can be edited, and with what. */
export const FORMS: Record<string, Form> = {
  products: PRODUCT_FORM,
  collections: COLLECTION_FORM,
  customers: CUSTOMER_FORM,
  discounts: DISCOUNT_FORM,
  orders: ORDER_FORM,
  drafts: ORDER_FORM,
  "settings-general": SETTINGS_FORM,
  "settings-taxes": TAX_SETTINGS_FORM,
  "settings-shipping": SHIPPING_SETTINGS_FORM,
};

/**
 * Only what changed.
 *
 * A PATCH carrying every field would write back values nobody touched, which
 * on a record two people are editing means the other one's change is undone
 * by somebody who never saw it.
 */
export function changedOnly(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = after[key];
    const b = before[key];
    // An empty string for a field that was empty is not a change; an empty
    // string for one that had a value is a deliberate clearing.
    const same = a === b || (a === "" && (b === null || b === undefined || b === ""));
    if (!same) out[key] = a;
  }
  return out;
}

/** The form's value for a field, in the shape the input wants. */
export function valueOf(field: Field, raw: unknown): string | boolean {
  if (field.kind === "switch") return raw === true;
  if (raw === null || raw === undefined) return "";
  return String(raw);
}

/** The API's value for a field, back from what the input holds. */
export function apiValue(field: Field, value: string | boolean): unknown {
  if (field.kind === "switch") return value === true;
  const text = String(value).trim();
  if (text === "") return null;
  if (field.kind === "number" || field.kind === "money") {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return text;
}
