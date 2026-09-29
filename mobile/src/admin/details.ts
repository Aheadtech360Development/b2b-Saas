/**
 * What one record looks like when you open it.
 *
 * Kept apart from the list config because a row and a record are different
 * readings of the same thing: a row is what you scan, a record is what you
 * act on, and the second wants the lines, the addresses and the money spelled
 * out.
 */
import type { Detail, DetailBlock } from "@/admin/sections";

const num = (v: unknown): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

const str = (v: unknown): string =>
  typeof v === "string" && v.trim() ? v.trim()
  : typeof v === "number" ? String(v)
  : "";

const money = (v: unknown): string => {
  const n = num(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const when = (v: unknown): string => {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      });
};

/** Drops the fields the record did not carry, so no block is half empty. */
const rows = (pairs: Array<[string, string]>) =>
  pairs.filter(([, v]) => v).map(([label, value]) => ({ label, value }));

/** An address, however the snapshot spells it. */
function address(a: any): string {
  if (!a || typeof a !== "object") return "";
  const parts = [
    [str(a.first_name), str(a.last_name)].filter(Boolean).join(" ") || str(a.name),
    str(a.company),
    str(a.address_line1) || str(a.line1) || str(a.street),
    str(a.address_line2) || str(a.line2),
    [str(a.city), str(a.state_province) || str(a.state), str(a.postal_code) || str(a.zip)]
      .filter(Boolean).join(", "),
    str(a.country),
    str(a.phone),
  ];
  return parts.filter(Boolean).join("\n");
}

export const ORDER_DETAIL: Detail = {
  path: (id) => `/api/v1/admin/orders/${id}`,
  render: (o: any): DetailBlock[] => {
    const blocks: DetailBlock[] = [];

    const lines = (o.items ?? []).map((i: any) => ({
      title: str(i.product_name) || str(i.sku) || "Item",
      sub: [str(i.sku), str(i.color), str(i.size)].filter(Boolean).join(" · "),
      qty: num(i.quantity),
      amount: num(i.line_total),
    }));
    if (lines.length) blocks.push({ title: "Items", lines });

    blocks.push({
      title: "Money",
      rows: rows([
        ["Subtotal", money(o.subtotal)],
        ["Shipping", money(o.shipping_cost)],
        ["Tax", o.tax_amount != null ? money(o.tax_amount) : ""],
        ["Fee", o.convenience_fee ? money(o.convenience_fee) : ""],
        ["Total", money(o.total)],
        ["Paid", o.amount_paid != null ? money(o.amount_paid) : ""],
        // Zero is worth saying here: it means nothing is owed.
        ["Balance", o.balance_due != null ? money(o.balance_due) : ""],
        ["Method", str(o.payment_method)],
        ["Terms", str(o.payment_terms)],
      ]),
    });

    const customer = rows([
      ["Company", str(o.company_name)],
      ["Name", str(o.customer_name) || str(o.guest_name)],
      ["Email", str(o.customer_email) || str(o.guest_email)],
      ["Phone", str(o.customer_phone) || str(o.guest_phone)],
      ["Pricing tier", str(o.pricing_tier)],
    ]);
    if (customer.length) blocks.push({ title: "Customer", rows: customer });

    const ship = address(o.shipping_address);
    const shipRows = rows([
      ["Method", str(o.shipping_method)],
      ["Courier", [str(o.courier), str(o.courier_service)].filter(Boolean).join(" ")],
      ["Tracking", str(o.tracking_number)],
      ["Shipped", when(o.shipped_at)],
    ]);
    if (ship || shipRows.length) {
      blocks.push({ title: "Shipping", text: ship || undefined, rows: shipRows });
    }

    blocks.push({
      title: "Order",
      rows: rows([
        ["Status", str(o.status)],
        ["Payment", str(o.payment_status)],
        ["PO number", str(o.po_number)],
        ["Placed", when(o.created_at)],
        ["Updated", when(o.updated_at)],
        ["Invoice sent", when(o.invoice_sent_at)],
        ["Marked paid", when(o.marked_paid_at)],
        ["Notes", str(o.order_notes)],
      ]),
    });

    return blocks.filter((b) => b.lines?.length || b.rows?.length || b.text);
  },
};

export const PRODUCT_DETAIL: Detail = {
  path: (id) => `/api/v1/admin/products/${id}`,
  render: (p: any): DetailBlock[] => {
    const blocks: DetailBlock[] = [];

    // Pictures first. A shop opening one of its own products is looking for
    // the thing it sells, not for a field called name.
    const images = (p.images ?? [])
      .map((i: any) => str(i.url_medium) || str(i.url_large) || str(i.url_thumbnail))
      .filter(Boolean);
    if (images.length) blocks.push({ title: `Media (${images.length})`, images });

    const variants: any[] = Array.isArray(p.variants) ? p.variants : [];
    const stock = variants.reduce((sum, v) => sum + num(v.stock_quantity), 0);
    const prices = variants.map((v) => num(v.retail_price)).filter((n) => n > 0);
    const low = prices.length ? Math.min(...prices) : 0;
    const high = prices.length ? Math.max(...prices) : 0;

    blocks.push({
      title: "Product",
      rows: rows([
        ["Status", str(p.status)],
        ["Code", str(p.product_code)],
        // A range where the variants disagree, one price where they do not.
        ["Price", prices.length ? (low === high ? money(low) : `${money(low)} – ${money(high)}`) : ""],
        ["Available", variants.length ? String(stock) : ""],
        ["Variants", variants.length ? String(variants.length) : ""],
        ["MOQ", p.moq > 1 ? String(num(p.moq)) : ""],
        ["Vendor", str(p.vendor)],
        ["Type", str(p.product_type)],
        ["Fabric", str(p.fabric)],
        ["Gender", str(p.gender)],
        ["Weight", str(p.weight)],
        ["Created", when(p.created_at)],
      ]),
    });

    const categories = (p.categories ?? []).map((c: any) => str(c.name)).filter(Boolean);
    const tags = [...categories, ...(Array.isArray(p.tags) ? p.tags.map(str) : [])].filter(Boolean);
    if (tags.length) blocks.push({ title: "Categories and tags", tags });

    if (variants.length) {
      blocks.push({
        title: `Variants (${variants.length})`,
        lines: variants.map((v) => ({
          title: [str(v.color), str(v.size)].filter(Boolean).join(" · ") || str(v.sku) || "Variant",
          // The SKU is what somebody reads a variant row for, and the stock
          // is what tells them whether they can sell it.
          sub: [str(v.sku), `${num(v.stock_quantity)} in stock`].filter(Boolean).join("  ·  "),
          amount: num(v.retail_price),
        })),
      });
    }

    if (str(p.description)) blocks.push({ title: "Description", text: str(p.description) });
    if (str(p.care_instructions)) blocks.push({ title: "Care", text: str(p.care_instructions) });
    return blocks;
  },
};

export const CUSTOMER_DETAIL: Detail = {
  path: (id) => `/api/v1/admin/companies/${id}`,
  render: (c: any): DetailBlock[] => {
    const blocks: DetailBlock[] = [{
      title: "Company",
      rows: rows([
        ["Name", str(c.name)],
        ["Status", str(c.status)],
        ["Email", str(c.company_email) || str(c.email)],
        ["Phone", str(c.phone)],
        ["Tax ID", str(c.tax_id)],
        ["Tax exempt", c.tax_exempt ? "Yes" : ""],
        ["Business", str(c.business_type)],
        ["Website", str(c.website)],
        ["Pricing tier", str(c.pricing_tier_name) || str(c.pricing_tier)],
        ["Credit limit", c.credit_limit != null ? money(c.credit_limit) : ""],
        ["Payment terms", str(c.payment_terms)],
        ["Joined", when(c.created_at)],
      ]),
    }];
    const addr = address(c);
    if (addr) blocks.push({ title: "Address", text: addr });
    if (str(c.admin_notes)) blocks.push({ title: "Notes", text: str(c.admin_notes) });
    return blocks;
  },
};

export const APPLICATION_DETAIL: Detail = {
  path: (id) => `/api/v1/admin/wholesale-applications/${id}`,
  render: (a: any): DetailBlock[] => {
    const blocks: DetailBlock[] = [{
      title: "Applicant",
      rows: rows([
        ["Name", [str(a.first_name), str(a.last_name)].filter(Boolean).join(" ")],
        ["Email", str(a.email)],
        ["Phone", str(a.phone)],
        ["Applied", when(a.created_at)],
        ["Status", str(a.status)],
      ]),
    }, {
      title: "Business",
      rows: rows([
        ["Company", str(a.company_name)],
        ["Type", str(a.business_type)],
        ["Tax ID", str(a.tax_id)],
        ["Website", str(a.website)],
        ["Monthly volume", str(a.expected_monthly_volume)],
        ["Annual volume", str(a.estimated_annual_volume)],
        ["Employees", str(a.num_employees)],
        ["Sales reps", str(a.num_sales_reps)],
        ["Heard via", str(a.how_heard)],
        ["PPAI", str(a.ppai_number)],
        ["ASI", str(a.asi_number)],
      ]),
    }];
    const addr = address(a);
    if (addr) blocks.push({ title: "Address", text: addr });
    if (str(a.rejection_reason)) blocks.push({ title: "Rejection reason", text: str(a.rejection_reason) });
    return blocks;
  },
};

export const PO_DETAIL: Detail = {
  path: (id) => `/api/v1/admin/purchase-orders/${id}`,
  render: (p: any): DetailBlock[] => {
    const blocks: DetailBlock[] = [{
      title: "Purchase order",
      rows: rows([
        ["Number", str(p.po_number)],
        ["Supplier", str(p.manufacturer_name) || str(p.supplier_name)],
        ["Status", str(p.status)],
        ["Total", p.total != null ? money(p.total) : ""],
        ["Created", when(p.created_at)],
        ["Sent", when(p.sent_at)],
        ["Expected", when(p.expected_date)],
      ]),
    }];
    const lines = (p.items ?? p.line_items ?? []).map((i: any) => ({
      title: str(i.product_name) || str(i.sku) || "Line",
      sub: [str(i.sku), str(i.color), str(i.size)].filter(Boolean).join(" · "),
      qty: num(i.quantity ?? i.quantity_ordered),
      amount: num(i.line_total ?? i.total_cost),
    }));
    if (lines.length) blocks.push({ title: "Lines", lines });
    if (str(p.notes)) blocks.push({ title: "Notes", text: str(p.notes) });
    return blocks;
  },
};

export const RETURN_DETAIL: Detail = {
  path: (id) => `/api/v1/admin/rma/${id}`,
  render: (r: any): DetailBlock[] => {
    const blocks: DetailBlock[] = [{
      title: "Return",
      rows: rows([
        ["Number", str(r.rma_number)],
        ["Order", str(r.order_number)],
        ["Customer", str(r.company_name) || str(r.customer_name)],
        ["Status", str(r.status)],
        ["Refund", r.refund_amount != null ? money(r.refund_amount) : ""],
        ["Raised", when(r.created_at)],
      ]),
    }];
    if (str(r.reason)) blocks.push({ title: "Reason", text: str(r.reason) });
    const lines = (r.items ?? []).map((i: any) => ({
      title: str(i.product_name) || str(i.sku) || "Item",
      sub: str(i.sku),
      qty: num(i.quantity),
      amount: num(i.line_total ?? i.refund_amount),
    }));
    if (lines.length) blocks.push({ title: "Items", lines });
    return blocks;
  },
};

export const GANG_SHEET_DETAIL: Detail = {
  path: (id) => `/api/v1/admin/gang-sheets/orders/${id}`,
  render: (g: any): DetailBlock[] => {
    const blocks: DetailBlock[] = [{
      title: "Print job",
      rows: rows([
        ["Order", str(g.order_number)],
        ["Customer", str(g.contact_name) || str(g.customer_name)],
        ["Email", str(g.contact_email) || str(g.customer_email)],
        ["Status", str(g.status)],
        ["Total", g.total != null ? money(g.total) : ""],
        ["Submitted", when(g.created_at)],
      ]),
    }];
    const lines = (g.sheets ?? g.items ?? []).map((i: any) => ({
      title: str(i.size) || str(i.name) || "Sheet",
      sub: str(i.kind) || str(i.type),
      qty: num(i.quantity),
      amount: num(i.line_total ?? i.price),
    }));
    if (lines.length) blocks.push({ title: "Sheets", lines });
    if (str(g.notes)) blocks.push({ title: "Notes", text: str(g.notes) });
    return blocks;
  },
};

/** Which sections open a record, and which are a list only. */
export const DETAILS: Record<string, Detail> = {
  orders: ORDER_DETAIL,
  drafts: ORDER_DETAIL,
  products: PRODUCT_DETAIL,
  customers: CUSTOMER_DETAIL,
  applications: APPLICATION_DETAIL,
  "purchase-orders": PO_DETAIL,
  returns: RETURN_DETAIL,
  "gang-sheets": GANG_SHEET_DETAIL,
};
