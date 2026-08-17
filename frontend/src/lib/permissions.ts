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

/** Can a role access (see) a section?
 *  When `scopes` is provided (a custom role), it's the source of truth; otherwise
 *  the fixed-role mapping applies. Mirrors backend can_access. */
export function hasScope(role: string | undefined | null, scope: Scope, scopes?: string[] | null): boolean {
  const r = role ?? "";
  if (r === "tenant_admin" || r === "platform_admin") return true;
  if (Array.isArray(scopes)) return scopes.includes(scope);
  return (ROLE_SCOPES[r] ?? []).includes(scope);
}

/** Read-only — hide/disable edit controls. Custom roles pass their read_only flag. */
export function isReadOnly(role: string | undefined | null, readOnly?: boolean | null): boolean {
  if (typeof readOnly === "boolean") return readOnly;
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
  tenant_custom: "Custom role",
  administrator: "Administrator",
  manager: "Manager",
  editor: "Editor",
  order_manager: "Order Manager",
  viewer: "Viewer",
  admin: "Administrator",
  staff: "Editor",
  customer: "Customer",
};
