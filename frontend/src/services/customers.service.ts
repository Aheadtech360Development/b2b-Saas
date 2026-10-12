/**
 * The customer list and a customer's page (api/v1/admin/customer_directory.py).
 *
 * Every plan has these. The wholesale parts of a customer (pricing tiers, net
 * terms) are still changed through /admin/companies, which only a plan with
 * wholesale accounts can reach.
 */
import { apiClient } from "@/lib/api-client";
import { downloadCsv } from "@/services/admin.service";

export type CustomerKind = "retail" | "wholesale" | "guest";

export interface CustomerRow {
  /** A company's id, or "guest:<email>" for somebody with no account. */
  id: string;
  kind: CustomerKind;
  name: string;
  contact: string | null;
  email: string | null;
  /** active | pending | suspended | rejected, or "guest". */
  status: string;
  logins: number;
  orders: number;
  spent: number;
  joined: string | null;
  last_order: string | null;
}

export interface CustomerCounts { all: number; retail: number; wholesale: number; guest: number; orders: number }

export interface CustomerList {
  items: CustomerRow[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  counts: CustomerCounts;
}

export interface CustomersOverview {
  counts: CustomerCounts;
  applications_pending: number;
  features: { wholesale_accounts: boolean; customer_tiers: boolean; net_terms: boolean };
}

export interface CustomerOrder {
  id: string;
  order_number: string;
  created_at: string | null;
  total: number;
  status: string;
  payment_status: string;
}

export interface CustomerLogin {
  user_id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  /** Invited and has not set a password yet. */
  invited: boolean;
  last_login: string | null;
  added: string | null;
}

export interface CustomerProfile {
  id: string;
  kind: CustomerKind;
  name: string;
  status: string;
  joined: string | null;
  email: string | null;
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  details?: Record<string, string | null>;
  address?: Record<string, string> | null;
  stats: { orders: number; spent: number; average: number; last_order: string | null };
  recent_orders: CustomerOrder[];
  logins: CustomerLogin[];
  notes?: string | null;
  tags?: string[];
  terms?: {
    pricing_tier: { id: string; name: string | null } | null;
    shipping_tier: { id: string; name: string | null } | null;
    shipping_override_amount: number | null;
    tax_exempt: boolean;
    net30_enabled: boolean;
  };
  /** A guest whose checkout opened an account they have not activated. */
  account_waiting?: boolean;
  invited?: boolean | null;
}

export interface CustomerOrdersPage { items: CustomerOrder[]; total: number; page: number; pages: number }

export interface ListParams { q?: string; type?: string; status?: string; sort?: string; page?: number; page_size?: number }

function qs(p: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}

/** The page address of a customer: an account by its id, a guest by address. */
export function customerHref(row: { id: string; kind: CustomerKind; email?: string | null }): string {
  if (row.kind === "guest") return `/admin/customers/guest?email=${encodeURIComponent(row.email ?? row.id.replace(/^guest:/, ""))}`;
  return `/admin/customers/${row.id}`;
}

export const customersService = {
  list: (p: ListParams) => apiClient.get<CustomerList>(`/api/v1/admin/customers${qs({ ...p })}`),
  overview: () => apiClient.get<CustomersOverview>("/api/v1/admin/customers/overview"),
  exportCsv: (p: ListParams) => downloadCsv(`/api/v1/admin/customers/export${qs({ ...p, page: undefined, page_size: undefined })}`, "customers.csv"),
  account: (id: string) => apiClient.get<CustomerProfile>(`/api/v1/admin/customers/${id}`),
  guest: (email: string) => apiClient.get<CustomerProfile>(`/api/v1/admin/customers/guest${qs({ email })}`),
  orders: (key: { id: string } | { email: string }, page = 1) =>
    "email" in key
      ? apiClient.get<CustomerOrdersPage>(`/api/v1/admin/customers/guest/orders${qs({ email: key.email, page })}`)
      : apiClient.get<CustomerOrdersPage>(`/api/v1/admin/customers/${key.id}/orders${qs({ page })}`),
  add: (body: Record<string, unknown>) => apiClient.post<{ id: string; invited: boolean }>("/api/v1/admin/customers", body),
  edit: (id: string, body: Record<string, unknown>) => apiClient.patch<CustomerProfile>(`/api/v1/admin/customers/${id}`, body),
  suspend: (id: string, reason: string) => apiClient.post<CustomerProfile>(`/api/v1/admin/customers/${id}/suspend`, { reason }),
  reactivate: (id: string) => apiClient.post<CustomerProfile>(`/api/v1/admin/customers/${id}/reactivate`, {}),
  addLogin: (id: string, body: { email: string; first_name?: string; last_name?: string; role?: string }) =>
    apiClient.post<CustomerProfile>(`/api/v1/admin/customers/${id}/logins`, body),
  changeLogin: (id: string, userId: string, body: { active?: boolean; role?: string; resend?: boolean }) =>
    apiClient.patch<CustomerProfile>(`/api/v1/admin/customers/${id}/logins/${userId}`, body),
};
