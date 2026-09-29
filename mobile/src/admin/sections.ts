/**
 * Everything the shop's own people can reach, in the order the website puts it.
 *
 * Each entry says where its list comes from and how to read one row, so a
 * section is a few lines rather than a screen. The row readers are forgiving
 * on purpose: these endpoints were written for one caller each and spell the
 * same idea several ways, and a missing key should cost a line of a card, not
 * the screen.
 */

export interface Row {
  id: string;
  title: string;
  subtitle?: string;
  amount?: number;
  /** Small coloured labels: status, payment, and so on. */
  pills?: string[];
  meta?: Array<{ label: string; value: string }>;
  /** A picture where the record has one. A list of shirts without them is a
   *  list of words. */
  image?: string | null;
  /** The one label that belongs at the end of the title line, as a status
   *  does, rather than below with the rest. */
  badge?: string;
  /** Said in red under the subtitle: out of stock, overdue, refused. */
  warn?: string;
  /** What the rows are grouped under, where grouping helps. A date, usually. */
  group?: string;
}

/** One chip above a list. The query it adds is the server's own filter, so
 *  the count and the paging stay true rather than filtering a loaded page. */
export interface Filter {
  label: string;
  query: string;
}

/** One block of a detail screen: a heading, and either fields or lines. */
export interface DetailBlock {
  title: string;
  rows?: Array<{ label: string; value: string }>;
  lines?: Array<{ title: string; sub?: string; qty?: number; amount?: number }>;
  text?: string;
  /** Pictures, shown across rather than listed. A product without them is a
   *  row of words where a shop expects to recognise its own stock. */
  images?: string[];
  /** Small labels in a row: tags, categories, colours. */
  tags?: string[];
}

export interface Detail {
  /** Where the one record comes from. */
  path: (id: string) => string;
  render: (raw: any) => DetailBlock[];
}

export interface Section {
  key: string;
  label: string;
  group: string;
  /** Absent for a screen that is not a list, such as the dashboard. */
  path?: string;
  /** Where the array sits in the response. */
  pick?: (body: any) => any[];
  row?: (raw: any) => Row;
  search?: boolean;
  /** Said instead of an empty screen. */
  empty?: string;
  /** Honest about the ones a phone is the wrong shape for. */
  desktopOnly?: string;
  /** Opening a row, for the sections that have a record behind it. */
  detail?: Detail;
  /** Chips above the list. The first is always everything. */
  filters?: Filter[];
  /** Whether search goes to the server. For a paged list it has to, or it
   *  only ever searches the page already loaded. */
  serverSearch?: boolean;
}

const num = (v: unknown): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

const str = (v: unknown): string =>
  typeof v === "string" && v.trim() ? v.trim() : "";

const date = (v: unknown): string => {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/** The common shapes: {items}, {results}, a bare array, or {data}. */
const items = (b: any): any[] =>
  Array.isArray(b) ? b : (b?.items ?? b?.results ?? b?.data ?? b?.orders ?? b?.rows ?? []);

/** A day heading, the way a list of orders wants it: Today, Yesterday, then
 *  the date. Grouping by the raw timestamp would make a heading per order. */
const dayOf = (v: unknown): string => {
  const raw = str(v);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "long", day: "numeric",
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
};

/** The picture a record carries, whichever field holds it. */
const image = (raw: any): string | null => {
  const img = raw?.primary_image ?? (Array.isArray(raw?.images) ? raw.images[0] : null);
  return str(img?.url_thumbnail) || str(img?.url_medium) || str(raw?.image_url) || null;
};

const pills = (...values: unknown[]): string[] =>
  values.map(str).filter(Boolean);

export const SECTIONS: Section[] = [
  {
    key: "dashboard", label: "Command Center", group: "Workspace",
  },

  // ── Sales ──────────────────────────────────────────────────────────────────
  {
    key: "orders", label: "All Orders", group: "Sales",
    path: "/api/v1/admin/orders", pick: items, search: true, serverSearch: true,
    empty: "No orders yet.",
    filters: [
      { label: "All", query: "" },
      { label: "Unpaid", query: "payment_status=unpaid" },
      { label: "Pending", query: "status=pending" },
      { label: "Processing", query: "status=processing" },
      { label: "Shipped", query: "status=shipped" },
      { label: "Cancelled", query: "status=cancelled" },
    ],
    row: (o) => {
      const count = num(o.item_count);
      return {
        id: str(o.id),
        title: `#${str(o.order_number) || "Order"}`,
        subtitle: [
          str(o.company_name) || str(o.guest_name) || str(o.guest_email) || "Guest",
          `${count} ${count === 1 ? "item" : "items"}`,
        ].join(" · "),
        amount: num(o.total),
        badge: str(o.status),
        pills: pills(o.payment_status),
        group: dayOf(o.created_at),
        meta: [{ label: "Tracking", value: str(o.tracking_number) }],
      };
    },
  },
  {
    key: "drafts", label: "Drafts", group: "Sales",
    path: "/api/v1/admin/orders?status=draft", pick: items, search: true,
    empty: "No draft orders.",
    row: (o) => ({
      id: str(o.id),
      title: str(o.order_number) || "Draft",
      subtitle: str(o.company_name) || "No customer yet",
      amount: num(o.total),
      pills: pills(o.status),
      meta: [{ label: "Created", value: date(o.created_at) }],
    }),
  },
  {
    key: "abandoned", label: "Abandoned carts", group: "Sales",
    path: "/api/v1/admin/abandoned-carts", pick: items,
    empty: "No abandoned carts.",
    row: (c) => ({
      id: str(c.id),
      title: str(c.email) || str(c.company_name) || "Cart",
      subtitle: `${num(c.item_count ?? c.items)} items`,
      amount: num(c.total ?? c.cart_total),
      meta: [{ label: "Last seen", value: date(c.updated_at ?? c.created_at) }],
    }),
  },
  {
    key: "returns", label: "Returns", group: "Sales",
    path: "/api/v1/admin/rma", pick: items,
    empty: "No returns.",
    row: (r) => ({
      id: str(r.id),
      title: str(r.rma_number) || "Return",
      subtitle: str(r.company_name) || str(r.order_number),
      amount: num(r.refund_amount ?? r.total),
      pills: pills(r.status),
      meta: [{ label: "Raised", value: date(r.created_at) }],
    }),
  },
  {
    key: "purchase-orders", label: "Purchase Orders", group: "Sales",
    path: "/api/v1/admin/purchase-orders/", pick: items,
    empty: "No purchase orders.",
    row: (p) => ({
      id: str(p.id),
      title: str(p.po_number) || "PO",
      subtitle: str(p.manufacturer_name) || str(p.supplier_name) || str(p.vendor),
      amount: num(p.total ?? p.total_cost),
      pills: pills(p.status),
      meta: [{ label: "Created", value: date(p.created_at) }],
    }),
  },

  // ── Catalogue ──────────────────────────────────────────────────────────────
  {
    key: "products", label: "All Products", group: "Catalogue",
    path: "/api/v1/admin/products", pick: items, search: true, serverSearch: true,
    empty: "No products yet.",
    filters: [
      { label: "All", query: "" },
      { label: "Active", query: "status=active" },
      { label: "Draft", query: "status=draft" },
      { label: "Archived", query: "status=archived" },
    ],
    row: (p) => {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const stock = variants.reduce((sum: number, v: any) => sum + num(v.stock_quantity), 0);
      const out = variants.filter((v: any) => num(v.stock_quantity) <= 0).length;
      return {
        id: str(p.id),
        title: str(p.name) || "Product",
        image: image(p),
        // What a shop checks a product list for: how many it can sell and how
        // many ways. The price belongs on the record, not in a scan.
        subtitle: [
          `${stock} available`,
          variants.length
            ? `${variants.length} ${variants.length === 1 ? "variant" : "variants"}`
            : "",
        ].filter(Boolean).join(" · "),
        warn: out > 0 && out < variants.length ? "some out of stock"
          : out > 0 && out === variants.length ? "out of stock" : undefined,
        badge: str(p.status),
      };
    },
  },
  {
    key: "collections", label: "Collections", group: "Catalogue",
    path: "/api/v1/admin/collections", pick: items,
    empty: "No collections.",
    row: (c) => ({
      id: str(c.id),
      title: str(c.name) || "Collection",
      subtitle: str(c.slug),
      meta: [{ label: "Products", value: String(num(c.product_count)) }],
    }),
  },
  {
    key: "reviews", label: "Reviews", group: "Catalogue",
    path: "/api/v1/admin/reviews", pick: items,
    empty: "No reviews.",
    row: (r) => ({
      id: str(r.id),
      title: str(r.title) || str(r.author_name) || "Review",
      subtitle: str(r.product_name),
      pills: pills(r.status, r.rating ? `${num(r.rating)}/5` : ""),
      meta: [{ label: "Left", value: date(r.created_at) }],
    }),
  },
  {
    key: "inventory", label: "Inventory", group: "Catalogue",
    path: "/api/v1/admin/inventory", pick: items, search: true,
    empty: "Nothing in inventory.",
    row: (i) => ({
      id: str(i.id ?? i.variant_id ?? i.sku),
      title: str(i.sku) || str(i.name) || "Item",
      subtitle: str(i.product_name) || str(i.name),
      meta: [
        { label: "On hand", value: String(num(i.quantity ?? i.on_hand)) },
        { label: "Reserved", value: String(num(i.reserved)) },
      ],
    }),
  },
  {
    key: "suppliers", label: "Suppliers", group: "Catalogue",
    path: "/api/v1/admin/suppliers", pick: items,
    empty: "No suppliers connected.",
    row: (s) => ({
      id: str(s.id ?? s.key ?? s.code),
      title: str(s.name) || str(s.key) || "Supplier",
      subtitle: str(s.account_number) || str(s.description),
      pills: pills(s.status ?? (s.connected ? "connected" : "")),
    }),
  },
  {
    key: "gang-sheets", label: "Gang Sheets", group: "Catalogue",
    path: "/api/v1/admin/gang-sheets/orders", pick: items,
    empty: "No gang sheet jobs waiting.",
    row: (g) => ({
      id: str(g.id ?? g.order_id),
      title: str(g.order_number) || "Job",
      subtitle: str(g.contact_name) || str(g.customer_name) || "Guest",
      amount: num(g.total),
      pills: pills(g.status),
      meta: [{ label: "Submitted", value: date(g.created_at) }],
    }),
  },

  // ── Buyers ─────────────────────────────────────────────────────────────────
  {
    key: "customers", label: "All Customers", group: "Buyers",
    path: "/api/v1/admin/companies", pick: items, search: true, serverSearch: true,
    empty: "No customers yet.",
    filters: [
      { label: "All", query: "" },
      { label: "Active", query: "status=active" },
      { label: "Pending", query: "status=pending" },
      { label: "Suspended", query: "status=suspended" },
    ],
    row: (c) => ({
      id: str(c.id),
      title: str(c.name) || "Customer",
      subtitle: str(c.company_email) || str(c.email),
      pills: pills(c.status, c.tax_exempt ? "tax exempt" : ""),
      meta: [
        { label: "Orders", value: String(num(c.order_count)) },
        { label: "Joined", value: date(c.created_at) },
      ],
    }),
  },
  {
    key: "applications", label: "Applications", group: "Buyers",
    path: "/api/v1/admin/wholesale-applications", pick: items,
    empty: "No applications waiting.",
    filters: [
      { label: "All", query: "" },
      { label: "Pending", query: "status=pending" },
      { label: "Approved", query: "status=approved" },
      { label: "Rejected", query: "status=rejected" },
    ],
    row: (a) => ({
      id: str(a.id),
      title: str(a.company_name) || "Application",
      subtitle: `${str(a.first_name)} ${str(a.last_name)}`.trim() || str(a.email),
      pills: pills(a.status),
      meta: [
        { label: "Email", value: str(a.email) },
        { label: "Business", value: str(a.business_type) },
        { label: "Applied", value: date(a.created_at) },
      ],
    }),
  },
  {
    key: "segments", label: "Segments", group: "Buyers",
    path: "/api/v1/admin/segments", pick: items,
    empty: "No segments.",
    row: (s) => ({
      id: str(s.id),
      title: str(s.name) || "Segment",
      subtitle: str(s.description),
      meta: [{ label: "Customers", value: String(num(s.customer_count ?? s.count)) }],
    }),
  },
  {
    key: "messages", label: "Messages", group: "Buyers",
    path: "/api/v1/admin/contact-submissions", pick: items,
    empty: "No messages.",
    row: (m) => ({
      id: str(m.id),
      title: str(m.name) || str(m.email) || "Message",
      subtitle: str(m.subject) || str(m.message).slice(0, 80),
      pills: pills(m.status),
      meta: [{ label: "Received", value: date(m.created_at) }],
    }),
  },

  // ── Marketing ──────────────────────────────────────────────────────────────
  {
    key: "discounts", label: "Discounts", group: "Marketing",
    path: "/api/v1/admin/discounts", pick: items,
    empty: "No discount codes.",
    row: (d) => ({
      id: str(d.id),
      title: str(d.code) || "Discount",
      subtitle: str(d.description) || str(d.discount_type),
      pills: pills(d.is_active === false ? "inactive" : "active"),
      meta: [
        { label: "Value", value: str(d.value ?? d.amount) },
        { label: "Used", value: String(num(d.usage_count ?? d.times_used)) },
      ],
    }),
  },
  {
    key: "discount-groups", label: "Discount Groups", group: "Marketing",
    path: "/api/v1/admin/discount-groups", pick: items,
    empty: "No discount groups.",
    row: (g) => ({
      id: str(g.id),
      title: str(g.name) || "Group",
      subtitle: str(g.customer_tag),
      meta: [{ label: "Discount", value: `${num(g.discount_percent)}%` }],
    }),
  },

  // ── Admin ──────────────────────────────────────────────────────────────────
  {
    key: "users", label: "Users", group: "Admin",
    path: "/api/v1/admin/users", pick: items,
    empty: "No staff users.",
    row: (u) => ({
      id: str(u.id),
      title: `${str(u.first_name)} ${str(u.last_name)}`.trim() || str(u.email),
      subtitle: str(u.email),
      pills: pills(u.role, u.is_active === false ? "inactive" : ""),
    }),
  },
  {
    key: "audit-log", label: "Audit Log", group: "Admin",
    path: "/api/v1/admin/audit-log", pick: items,
    empty: "Nothing recorded yet.",
    row: (a) => ({
      id: str(a.id),
      title: `${str(a.action)} ${str(a.entity_type)}`.trim() || "Event",
      subtitle: str(a.actor_email) || str(a.user_email),
      meta: [{ label: "When", value: date(a.created_at) }],
    }),
  },
  {
    key: "billing", label: "Billing & Payouts", group: "Admin",
    desktopOnly: "Connecting a payment account opens a Stripe page that needs a "
      + "desktop browser. Everything else about billing is here.",
  },
  {
    key: "theme", label: "Edit theme", group: "Admin",
    desktopOnly: "The theme editor is a drag and drop tool built for a large "
      + "screen. Open it on a computer.",
  },
];

import { DETAILS } from "@/admin/details";

export const GROUPS: string[] = SECTIONS.reduce<string[]>((acc, s) => {
  if (!acc.includes(s.group)) acc.push(s.group);
  return acc;
}, []);

export function sectionByKey(key: string): Section | undefined {
  const found = SECTIONS.find((s) => s.key === key);
  // Attached here rather than written into each entry, so the list config
  // stays about lists and a section without a record behind it simply has
  // no detail.
  return found && !found.detail && DETAILS[key]
    ? { ...found, detail: DETAILS[key] }
    : found;
}
