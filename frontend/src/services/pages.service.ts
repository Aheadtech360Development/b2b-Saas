/**
 * Pages service — brand admin manages their multi-page storefront (Pages builder).
 * Maps to /api/v1/admin/storefront/pages (storefront scope).
 */
import { apiClient } from "@/lib/api-client";
import type { PageSection } from "@/components/storefront/SectionRenderer";

export interface StorefrontPageRecord {
  id: string;
  slug: string;
  title: string;
  sections: PageSection[];
  is_published: boolean;
  show_in_nav: boolean;
  sort_order: number;
}

export type PagePatch = Partial<Pick<StorefrontPageRecord,
  "title" | "slug" | "sections" | "is_published" | "show_in_nav" | "sort_order">>;

export const pagesService = {
  list(): Promise<StorefrontPageRecord[]> {
    return apiClient.get<StorefrontPageRecord[]>("/api/v1/admin/storefront/pages");
  },
  get(id: string): Promise<StorefrontPageRecord> {
    return apiClient.get<StorefrontPageRecord>(`/api/v1/admin/storefront/pages/${id}`);
  },
  create(title: string, slug?: string, sections?: PageSection[]): Promise<StorefrontPageRecord> {
    return apiClient.post<StorefrontPageRecord>("/api/v1/admin/storefront/pages", { title, slug, sections });
  },
  update(id: string, patch: PagePatch): Promise<StorefrontPageRecord> {
    return apiClient.put<StorefrontPageRecord>(`/api/v1/admin/storefront/pages/${id}`, patch);
  },
  remove(id: string): Promise<{ status: string }> {
    return apiClient.delete<{ status: string }>(`/api/v1/admin/storefront/pages/${id}`);
  },
};
