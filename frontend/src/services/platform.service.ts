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
};

/** Open a brand's admin dashboard as the super admin (impersonation). */
export async function enterBrandDashboard(slug: string): Promise<void> {
  const { access_token } = await platformService.impersonate(slug);
  const base = tenantUrl(slug); // e.g. http://slug.localhost:3000
  window.open(`${base}/admin/dashboard#session=${encodeURIComponent(access_token)}`, "_blank");
}

/**
 * Build the public URL for a tenant's store/admin, based on the current host.
 * Local:      slug.localhost:3000
 * Production: slug.yourplatform.com
 * Deployment-safe: derives domain from NEXT_PUBLIC_PLATFORM_DOMAIN + window location.
 */
export function tenantUrl(slug: string): string {
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost";
  if (typeof window === "undefined") {
    return `https://${slug}.${platformDomain}`;
  }
  const { protocol, port } = window.location;
  const portPart = port ? `:${port}` : "";
  return `${protocol}//${slug}.${platformDomain}${portPart}`;
}
