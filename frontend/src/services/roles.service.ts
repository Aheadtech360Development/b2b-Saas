import { apiClient } from "@/lib/api-client";

export interface CustomRole {
  id: string;
  name: string;
  scopes: string[];
  read_only: boolean;
  created_at?: string | null;
}

export interface ScopeCatalog {
  scopes: { key: string; label: string }[];
  fixed_roles: { key: string; label: string; scopes: string[] }[];
}

export const rolesService = {
  scopes: () => apiClient.get<ScopeCatalog>("/api/v1/admin/roles/scopes"),
  list: () => apiClient.get<CustomRole[]>("/api/v1/admin/roles"),
  create: (p: { name: string; scopes: string[]; read_only: boolean }) =>
    apiClient.post<CustomRole>("/api/v1/admin/roles", p),
  update: (id: string, p: Partial<{ name: string; scopes: string[]; read_only: boolean }>) =>
    apiClient.patch<CustomRole>(`/api/v1/admin/roles/${id}`, p),
  remove: (id: string) => apiClient.delete<void>(`/api/v1/admin/roles/${id}`),
};
