/**
 * Platform service — Super Admin APIs for managing tenants (brands).
 * All calls hit /api/v1/platform/* which require is_platform_admin=true.
 */
import { apiClient } from "@/lib/api-client";
import type { Tenant } from "@/types/user.types";

export interface CreateTenantPayload {
  slug: string;
  name: string;
  email: string;
  plan: string;
  admin_email: string;
  admin_password: string;
  admin_first_name: string;
  admin_last_name: string;
}

export interface CreateTenantResponse {
  id: string;
  slug: string;
  name: string;
  admin_email: string;
  url_local: string;
  message: string;
}

export interface UpdateTenantPayload {
  name?: string;
  status?: "active" | "suspended" | "cancelled";
  plan?: string;
}

export interface FeatureFlag {
  feature: string;
  is_enabled: boolean;
}

export const platformService = {
  /** List all tenants (brands) with user counts. */
  async listTenants(): Promise<Tenant[]> {
    return apiClient.get<Tenant[]>("/api/v1/platform/tenants");
  },

  /** Create a new tenant (brand) plus its first admin user. */
  async createTenant(payload: CreateTenantPayload): Promise<CreateTenantResponse> {
    return apiClient.post<CreateTenantResponse>("/api/v1/platform/tenants", payload);
  },

  /** Get one tenant by slug. */
  async getTenant(slug: string): Promise<Tenant> {
    return apiClient.get<Tenant>(`/api/v1/platform/tenants/${slug}`);
  },

  /** Update a tenant (name / status / plan). */
  async updateTenant(slug: string, payload: UpdateTenantPayload): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/v1/platform/tenants/${slug}`, payload);
  },

  /** Soft-delete (cancel) a tenant. */
  async deleteTenant(slug: string): Promise<void> {
    return apiClient.delete<void>(`/api/v1/platform/tenants/${slug}`);
  },

  /** List a tenant's feature flags. */
  async getFeatures(slug: string): Promise<FeatureFlag[]> {
    return apiClient.get<FeatureFlag[]>(`/api/v1/platform/tenants/${slug}/features`);
  },

  /** Enable/disable a feature for a tenant. */
  async setFeature(slug: string, feature: string, isEnabled: boolean): Promise<FeatureFlag> {
    return apiClient.put<FeatureFlag>(`/api/v1/platform/tenants/${slug}/features`, {
      feature,
      is_enabled: isEnabled,
    });
  },

  /** Permanently delete a tenant + all its data (irreversible). */
  async purgeTenant(slug: string): Promise<void> {
    return apiClient.delete<void>(`/api/v1/platform/tenants/${slug}/purge`);
  },

  /** Enter a brand's admin dashboard (impersonate its admin). Returns an access token. */
  async impersonate(slug: string): Promise<{ access_token: string; slug: string; admin_email: string }> {
    return apiClient.post(`/api/v1/platform/tenants/${slug}/impersonate`);
  },

  // ── Cross-tenant insights (super admin) ─────────────────────────────────────
  async analytics(): Promise<PlatformAnalytics> {
    return apiClient.get<PlatformAnalytics>("/api/v1/platform/analytics");
  },

  async activity(params?: { tenant_id?: string; action?: string }): Promise<{ items: ActivityEntry[] }> {
    const qs = new URLSearchParams();
    if (params?.tenant_id) qs.set("tenant_id", params.tenant_id);
    if (params?.action) qs.set("action", params.action);
    const q = qs.toString();
    return apiClient.get<{ items: ActivityEntry[] }>(`/api/v1/platform/activity${q ? `?${q}` : ""}`);
  },

  async search(q: string): Promise<GlobalSearchResult> {
    return apiClient.get<GlobalSearchResult>(`/api/v1/platform/search?q=${encodeURIComponent(q)}`);
  },

  async brandsHealth(): Promise<BrandHealth[]> {
    return apiClient.get<BrandHealth[]>("/api/v1/platform/brands/health");
  },
};

export interface PlatformAnalytics {
  totals: {
    brands: number; active_brands: number; products: number;
    users: number; companies: number; orders: number; revenue: number;
  };
  brands: {
    id: string; slug: string; name: string; status: string;
    products: number; users: number; companies: number; orders: number; revenue: number;
  }[];
}

export interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  created_at: string | null;
  brand_name: string | null;
  brand_slug: string | null;
  actor_email: string | null;
}

export interface GlobalSearchResult {
  orders: { id: string; order_number: string; status: string; total: number; brand_name: string | null; brand_slug: string | null }[];
  customers: { id: string; name: string; brand_name: string | null; brand_slug: string | null }[];
  products: { id: string; name: string; slug: string; status: string; brand_name: string | null; brand_slug: string | null }[];
}

export interface BrandHealth {
  id: string; slug: string; name: string; status: string;
  products: number; orders: number; users: number;
  created_at: string | null; last_activity: string | null;
  state: "empty" | "no_sales" | "selling";
}

/** Open a brand's admin dashboard as the super admin (impersonation). */
export async function enterBrandDashboard(slug: string): Promise<void> {
  const { access_token } = await platformService.impersonate(slug);
  const url = tenantUrl(slug, "/admin/dashboard", `session=${encodeURIComponent(access_token)}`);
  window.open(url, "_blank");
}

/**
 * Build the public URL for a tenant's store/admin, based on the current host.
 * Local:      slug.localhost:3000
 * Production: slug.yourplatform.com
 * Deployment-safe: derives domain from NEXT_PUBLIC_PLATFORM_DOMAIN + window location.
 */
export function tenantUrl(slug: string, path = "/", hash?: string): string {
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost";
  const origin =
    typeof window === "undefined" ? `https://${platformDomain}` : window.location.origin;

  // Hosts without wildcard DNS (preview deployments, *.vercel.app) can never
  // serve slug.<domain>, so linking there produces an unreachable URL. In that
  // mode the brand travels in the query string instead — the same fallback the
  // middleware and api-client already resolve.
  //
  // Detected rather than configured: if the page is not being served from the
  // configured platform domain, then slug.<domain> is not where this app lives
  // and a subdomain link cannot resolve. NEXT_PUBLIC_TENANT_MODE stays available
  // to force query mode when the domain matches but wildcard DNS is missing.
  const host = typeof window === "undefined" ? "" : window.location.hostname;
  const domainMatchesHost =
    !host || host === platformDomain || host.endsWith(`.${platformDomain}`);
  const queryMode =
    process.env.NEXT_PUBLIC_TENANT_MODE === "query" || !domainMatchesHost;

  if (queryMode) {
    const url = new URL(path, origin);
    url.searchParams.set("tenant", slug);
    if (hash) url.hash = hash;
    return url.toString();
  }

  const { protocol, port } =
    typeof window === "undefined" ? { protocol: "https:", port: "" } : window.location;
  const portPart = port ? `:${port}` : "";
  const url = new URL(path, `${protocol}//${slug}.${platformDomain}${portPart}`);
  if (hash) url.hash = hash;
  return url.toString();
}
