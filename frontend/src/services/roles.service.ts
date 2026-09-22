import { apiClient } from "@/lib/api-client";

/** What a role may do in one section. A section that is absent is not accessible. */
export type Level = "read" | "write";

/** {section: level}. The API always answers in this shape, whatever is stored —
 *  roles saved by the older screen were a plain list of sections. */
export type ScopeMap = Record<string, Level>;

export interface CustomRole {
  id: string;
  name: string;
  scopes: ScopeMap;
  read_only: boolean;
  created_at?: string | null;
}

export interface ScopeInfo {
  key: string;
  label: string;
  /** Money, staff, settings and the activity log — the ones where a mistake
   *  costs something. Marked so the screen can say so. */
  sensitive: boolean;
  read_means: string;
  write_means: string;
}

export interface ScopeCatalog {
  scopes: ScopeInfo[];
  fixed_roles: { key: string; label: string; scopes: string[] }[];
  levels: Level[];
}

export const rolesService = {
  scopes: () => apiClient.get<ScopeCatalog>("/api/v1/admin/roles/scopes"),
  list: () => apiClient.get<CustomRole[]>("/api/v1/admin/roles"),
  create: (p: { name: string; scopes: ScopeMap; read_only: boolean }) =>
    apiClient.post<CustomRole>("/api/v1/admin/roles", p),
  update: (id: string, p: Partial<{ name: string; scopes: ScopeMap; read_only: boolean }>) =>
    apiClient.patch<CustomRole>(`/api/v1/admin/roles/${id}`, p),
  remove: (id: string) => apiClient.delete<void>(`/api/v1/admin/roles/${id}`),
};

/** A role's sections in words, for a list row. */
export function summariseScopes(scopes: ScopeMap, labels: Record<string, string> = {}): string {
  const entries = Object.entries(scopes ?? {});
  if (!entries.length) return "No access";
  const manage = entries.filter(([, l]) => l === "write").map(([k]) => labels[k] ?? k);
  const view = entries.filter(([, l]) => l === "read").map(([k]) => labels[k] ?? k);
  const parts: string[] = [];
  if (manage.length) parts.push(`Manages ${manage.join(", ")}`);
  if (view.length) parts.push(`Views ${view.join(", ")}`);
  return parts.join(" · ");
}
