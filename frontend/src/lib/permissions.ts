/**
 * Frontend RBAC — mirrors backend app/core/permissions.py.
 * Used to hide admin sections the current role can't access (UX only; the
 * backend is the real gate).
 */
export type Scope =
  | "products" | "collections" | "orders" | "customers" | "storefront" | "media"
  | "content" | "inventory" | "discounts" | "staff" | "settings" | "analytics"
  | "billing" | "payouts" | "audit";

const ALL: Scope[] = [
  "products", "collections", "orders", "customers", "storefront", "media", "content",
  "inventory", "discounts", "staff", "settings", "analytics", "billing", "payouts", "audit",
];

// Operational sections (everything except staff-management, settings and money).
const OPERATIONAL: Scope[] = [
  "products", "collections", "orders", "customers", "storefront", "media", "content",
  "inventory", "discounts", "analytics",
];

const ROLE_SCOPES: Record<string, Scope[]> = {
  platform_admin: ALL,
  tenant_admin: ALL,
  tenant_manager: OPERATIONAL,
  tenant_editor: ["products", "collections", "storefront", "media", "content", "analytics"],
  tenant_fulfillment: ["orders", "customers", "inventory", "discounts", "analytics"],
  tenant_viewer: OPERATIONAL, // sees operational sections, but read-only
};

/** A custom role's permissions: the older plain list of sections, or the
 *  current {section: "read" | "write"}. Both mean "can open these". */
export type ScopeSet = string[] | Record<string, string>;

/** Can a role access (see) a section?
 *  When `scopes` is provided (a custom role), it's the source of truth; otherwise
 *  the fixed-role mapping applies. Mirrors backend can_access.
 *
 *  Accepts both shapes. Roles saved by the current screen arrive as a map, and
 *  treating a map as "no scopes" hid every section from everyone on one. */
export function hasScope(role: string | undefined | null, scope: Scope, scopes?: ScopeSet | null): boolean {
  const r = role ?? "";
  if (r === "tenant_admin" || r === "platform_admin") return true;
  if (Array.isArray(scopes)) return scopes.includes(scope);
  if (scopes && typeof scopes === "object") return scope in scopes;
  return (ROLE_SCOPES[r] ?? []).includes(scope);
}

/** May this role change things in a section, not just look? */
export function canWrite(role: string | undefined | null, scope: Scope, scopes?: ScopeSet | null, readOnly?: boolean | null): boolean {
  const r = role ?? "";
  if (r === "tenant_admin" || r === "platform_admin") return true;
  if (readOnly) return false;
  if (scopes && !Array.isArray(scopes) && typeof scopes === "object") return scopes[scope] === "write";
  if (Array.isArray(scopes)) return scopes.includes(scope);
  if (r === "tenant_viewer") return false;
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
