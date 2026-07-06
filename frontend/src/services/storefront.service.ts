/**
 * Storefront service — brand admin reads/updates their own storefront branding.
 */
import { apiClient } from "@/lib/api-client";
import type { Branding } from "@/components/providers/BrandingProvider";

export type BrandingUpdate = Partial<Branding>;

export const storefrontService = {
  /** Read the current brand's storefront branding (admin). */
  async get(): Promise<Branding> {
    return apiClient.get<Branding>("/api/v1/admin/storefront");
  },

  /** Update the current brand's storefront branding (admin). */
  async update(payload: BrandingUpdate): Promise<Branding> {
    return apiClient.put<Branding>("/api/v1/admin/storefront", payload);
  },

  /** Upload a logo/image; returns its URL. */
  async uploadImage(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiClient.postForm<{ url: string }>("/api/v1/upload", fd, { skipAuth: true });
    return res.url;
  },
};
