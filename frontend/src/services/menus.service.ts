/**
 * Menus service — named navigation menus (Shopify-style). A menu is a list of
 * items; branding decides which menu is used for the header / footer.
 */
import { apiClient } from "@/lib/api-client";
import type { MenuItem } from "@/components/providers/BrandingProvider";

export interface NavMenu {
  id: string;
  name: string;
  items: MenuItem[];
}

export const menusService = {
  list(): Promise<NavMenu[]> {
    return apiClient.get<NavMenu[]>("/api/v1/admin/storefront/menus");
  },
  create(name: string): Promise<NavMenu> {
    return apiClient.post<NavMenu>("/api/v1/admin/storefront/menus", { name });
  },
  update(id: string, patch: { name?: string; items?: MenuItem[] }): Promise<NavMenu> {
    return apiClient.put<NavMenu>(`/api/v1/admin/storefront/menus/${id}`, patch);
  },
  remove(id: string): Promise<{ status: string }> {
    return apiClient.delete(`/api/v1/admin/storefront/menus/${id}`);
  },
};
