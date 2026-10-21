/**
 * What the Platform Console reads (backend api/v1/platform/console.py) and the
 * shapes it comes in. Changes go through platformService, whose routes log
 * each one against its brand.
 */
import { apiClient } from "@/lib/api-client";
import type { Commission } from "@/services/platform.service";

export interface PlanDetail {
  key: string;
  known: boolean;
  /** For a key that is not a plan: the plan it is treated as. */
  treated_as?: string;
  name: string;
  amount_cents: number;
  price_display: string;
  commission_display: string;
  limits_display?: string;
  description?: string;
}

export interface BrandTrial {
  on_trial: boolean;
  days_left: number | null;
  ends_at: string | null;
  expired: boolean;
}

export interface Brand {
  id: string;
  slug: string;
  name: string;
  email: string;
  status: "active" | "suspended" | "cancelled" | string;
  plan: string;
  plan_detail: PlanDetail;
  custom_domain: string | null;
  created_at: string | null;
  /** Stripe's word for the brand's subscription, or "inactive"/"none". */
  billing_status: string;
  /** A Stripe subscription that is active, trialing or past due. */
  paying: boolean;
  period_end: string | null;
  cancel_at_period_end: boolean;
  trial: BrandTrial;
  users: number;
  staff: number;
  products: number;
  orders: number;
  orders_month: number;
  limits: { orders_per_month: number | null; staff_accounts: number | null };
  owner_email: string | null;
  last_activity: string | null;
  health: "empty" | "no_sales" | "selling";
  /** The platform closed this shop by hand. */
  held: boolean;
  hold: { status?: string; reason?: string; at?: string; by?: string } | null;
  store_url: string;
}

export interface BrandDetail extends Brand {
  commission: Commission;
  owner: { email: string; name: string; last_login: string | null; two_factor: boolean } | null;
  payments_connected: boolean;
}

export interface Person {
  id: string;
  email: string;
  name: string;
  role: string;
  type: "staff" | "buyer";
  active: boolean;
  last_login: string | null;
  two_factor: boolean | null;
  created_at: string | null;
  brand_name?: string;
  brand_slug?: string;
}

export interface DomainStatus {
  domain: string | null;
  platform_address: string | null;
  records: { type: string; name: string; value: string }[];
  status: "none" | "pending" | "live";
  message: string;
  slug: string;
  store_url: string;
}

export interface Checklist {
  brand: Brand;
  steps: { key: string; label: string; done: boolean; detail: string; optional?: boolean }[];
  vercel_host: string;
  store_url: string;
  fallback_url: string | null;
}

export interface ActivityRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  method: string | null;
  path: string | null;
  status_code: number | null;
  ip_address: string | null;
  user_agent: string | null;
  new_values: unknown;
  old_values: unknown;
  created_at: string | null;
  brand_name: string | null;
  brand_slug: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_platform: boolean;
  actor_active: boolean | null;
}

export interface Paged<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export interface SearchResults {
  brands: { name: string; slug: string; status: string; custom_domain: string | null }[];
  users: { id: string; email: string; name: string; type: "staff" | "buyer"; role: string; brand_name: string; brand_slug: string }[];
  orders: { id: string; order_number: string; status: string; total: number; brand_name: string | null; brand_slug: string | null }[];
  products: { id: string; name: string; slug: string; status: string; brand_name: string | null; brand_slug: string | null }[];
  customers: { id: string; name: string; brand_name: string | null; brand_slug: string | null }[];
}

export interface PlanRow {
  key: string;
  name: string;
  amount_cents: number;
  price_display: string;
  commission_display: string;
  commission_bps: number;
  features: string[];
  highlights: string[];
  limits: { orders_per_month: number | null; staff_accounts: number | null; custom_domains: number | null };
  description: string;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") out.set(k, String(v));
  const s = out.toString();
  return s ? `?${s}` : "";
}

const C = "/api/v1/platform/console";

export const consoleApi = {
  brands: () => apiClient.get<{ items: Brand[]; totals: { brands: number; active: number; suspended: number; users: number } }>(`${C}/brands`),
  brand: (slug: string) => apiClient.get<BrandDetail>(`${C}/brands/${encodeURIComponent(slug)}`),
  brandUsers: (slug: string) => apiClient.get<{ items: Person[] }>(`${C}/brands/${encodeURIComponent(slug)}/users`),
  domain: (slug: string, check = false) =>
    apiClient.get<DomainStatus>(`${C}/brands/${encodeURIComponent(slug)}/domain${check ? "?check=1" : ""}`),
  checklist: (slug: string) => apiClient.get<Checklist>(`${C}/brands/${encodeURIComponent(slug)}/checklist`),
  users: (p: { q?: string; brand?: string; kind?: "staff" | "buyer" | ""; two_step?: "on" | "off" | ""; page?: number; page_size?: number }) =>
    apiClient.get<Paged<Person> & { counts: { all: number; staff: number; buyers: number } }>(`${C}/users${qs(p)}`),
  activity: (p: { q?: string; brand?: string; action?: string; entity?: string; date_from?: string; date_to?: string; page?: number; page_size?: number }) =>
    apiClient.get<Paged<ActivityRow>>(`${C}/activity${qs(p)}`),
  search: (q: string) => apiClient.get<SearchResults>(`${C}/search${qs({ q })}`),
  plans: () => apiClient.get<{ plans: PlanRow[] }>("/api/v1/platform/billing/plans"),
};
