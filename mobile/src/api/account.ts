/** The signed-in person's own corner: who they are and what they've ordered. */
import { call } from "@/api/client";

export interface Profile {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

interface ProfileResponse {
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}

export async function profile(): Promise<Profile> {
  const res = await call<ProfileResponse>("/api/v1/account/profile");
  return {
    email: res.email ?? "",
    firstName: res.first_name ?? "",
    lastName: res.last_name ?? "",
    phone: res.phone ?? null,
  };
}

export interface OrderSummary {
  id: string;
  number: string;
  status: string;
  total: number;
  placedAt: string | null;
}

interface OrdersResponse {
  items?: Array<{
    id?: string;
    order_number?: string;
    status?: string;
    total?: number | string;
    created_at?: string | null;
  }>;
}

export async function orders(): Promise<OrderSummary[]> {
  const res = await call<OrdersResponse>("/api/v1/orders?page=1&page_size=20");
  return (res.items ?? []).map((o) => ({
    id: o.id ?? "",
    number: o.order_number ?? "",
    status: o.status ?? "",
    // Totals come back as a string often enough that parsing both is cheaper
    // than finding out at a customer's order history.
    total: typeof o.total === "number" ? o.total : Number(o.total ?? 0),
    placedAt: o.created_at ?? null,
  }));
}
