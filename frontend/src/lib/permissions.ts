/**
 * Frontend RBAC — mirrors backend app/core/permissions.py.
 * Used to hide admin sections the current role can't access (UX only; the
 * backend is the real gate).
 */
export type Scope =
  | "products" | "orders" | "customers" | "storefront" | "media" | "content"
  | "inventory" | "discounts" | "staff" | "settings" | "analytics";

const ALL: Scope[] = [
  "products", "orders", "customers", "storefront", "media", "content",
  "inventory", "discounts", "staff", "settings", "analytics",
];

// Operational sections (everything except staff-management + settings).
const OPERATIONAL: Scope[] = [
  "products", "orders", "customers", "storefront", "media", "content",
  "inventory", "discounts", "analytics",
];

const ROLE_SCOPES: Record<string, Scope[]> = {
  platform_admin: ALL,
  tenant_admin: ALL,
  tenant_manager: OPERATIONAL,
  tenant_editor: ["products", "storefront", "media", "content", "analytics"],
  tenant_fulfillment: ["orders", "customers", "inventory", "discounts", "analytics"],
  tenant_viewer: OPERATIONAL, // sees operational sections, but read-only
};

/** Can a role access (see) a section? */
export function hasScope(role: string | undefined | null, scope: Scope): boolean {
  const r = role ?? "";
  if (r === "tenant_admin" || r === "platform_admin") return true;
  return (ROLE_SCOPES[r] ?? []).includes(scope);
}

/** Read-only role — hide/disable edit controls. */
export function isReadOnly(role: string | undefined | null): boolean {
  return role === "tenant_viewer";
}

/** The 5 assignable roles (for the Users page dropdown). value = API role. */
export const ASSIGNABLE_ROLES: { value: string; label: string; desc: string }[] = [
  { value: "administrator", label: "Administrator", desc: "Full access to everything" },
  { value: "manager", label: "Manager", desc: "Everything except staff & settings" },
  { value: "editor", label: "Editor", desc: "Products, Storefront, Media, Content" },
  { value: "order_manager", label: "Order Manager", desc: "Orders, Customers, Inventory, Discounts" },
  { value: "viewer", label: "Viewer", desc: "Read-only — can view, not edit" },
];

/** DB role -> friendly label. */
export const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Administrator",
  tenant_manager: "Manager",
  tenant_editor: "Editor",
  tenant_fulfillment: "Order Manager",
  tenant_viewer: "Viewer",
  administrator: "Administrator",
  manager: "Manager",
  editor: "Editor",
  order_manager: "Order Manager",
  viewer: "Viewer",
  admin: "Administrator",
  staff: "Editor",
  customer: "Customer",
};
