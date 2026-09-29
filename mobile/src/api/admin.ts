/** What a shop's own people see: the orders coming in, and how the shop is doing. */
import { call } from "@/api/client";

export interface Counts {
  orders: number;
  products: number;
  customers: number;
  returns: number;
}

export async function counts(): Promise<Counts> {
  const res = await call<Partial<Counts>>("/api/v1/admin/nav-counts");
  return {
    orders: res.orders ?? 0,
    products: res.products ?? 0,
    customers: res.customers ?? 0,
    returns: res.returns ?? 0,
  };
}

export interface AdminOrder {
  id: string;
  number: string;
  customer: string;
  status: string;
  paymentStatus: string;
  total: number;
  itemCount: number;
  placedAt: string | null;
  trackingNumber: string | null;
}

interface AdminOrderRow {
  id?: string;
  order_number?: string;
  company_name?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  status?: string;
  payment_status?: string;
  total?: number | string;
  item_count?: number;
  created_at?: string | null;
  tracking_number?: string | null;
}

function orderFrom(o: AdminOrderRow): AdminOrder {
  return {
    id: o.id ?? "",
    number: o.order_number ?? "",
    // A guest order has no company, so the name it was placed under is used.
    // "Guest" beats an empty row in a list somebody is scanning for a name.
    customer: o.company_name || o.guest_name || o.guest_email || "Guest",
    status: o.status ?? "",
    paymentStatus: o.payment_status ?? "",
    // Totals arrive as strings often enough that both are handled here rather
    // than discovered in somebody's order list.
    total: typeof o.total === "number" ? o.total : Number(o.total ?? 0),
    itemCount: o.item_count ?? 0,
    placedAt: o.created_at ?? null,
    trackingNumber: o.tracking_number ?? null,
  };
}

export async function orders(limit = 25): Promise<AdminOrder[]> {
  const res = await call<{ items?: AdminOrderRow[] }>(
    `/api/v1/admin/orders?page=1&page_size=${limit}`,
  );
  return (res.items ?? []).map(orderFrom);
}

export interface Analytics {
  revenue: number;
  orderCount: number;
}

/** The last 30 days, for the two numbers worth seeing on a phone. */
export async function analytics(): Promise<Analytics | null> {
  try {
    const res = await call<Record<string, unknown>>("/api/v1/admin/analytics?period=30d");
    const totals = (res.totals ?? res) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
    return {
      revenue: num(totals.revenue ?? totals.total_revenue),
      orderCount: num(totals.orders ?? totals.order_count),
    };
  } catch {
    // Analytics is the one panel a shop can do without. A plan that does not
    // include it should not take the rest of the screen down with it.
    return null;
  }
}
