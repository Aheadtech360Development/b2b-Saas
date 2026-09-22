/**
 * Product templates — /api/v1/admin/storefront/product-templates (storefront scope).
 * Save (PUT) stores the draft; only publish() changes what shoppers see.
 */
import { apiClient } from "@/lib/api-client";
import type { TemplateLayout } from "@/components/storefront/ProductTemplateBlocks";

export type TemplateStatus = "draft" | "changes" | "published";

export interface ProductTemplateRow {
  id: string;
  name: string;
  is_default: boolean;
  status: TemplateStatus;
  product_count: number;
  published_at: string | null;
  updated_at: string | null;
}

export interface ProductTemplateRecord extends ProductTemplateRow {
  draft: TemplateLayout;
  published: TemplateLayout | null;
}

export interface AssignedProduct { id: string; name: string; slug: string; status: string }

export interface TemplateMeta {
  metafield_keys: string[];
  limits: { code_bytes: number; blocks: number; sections: number };
}

const BASE = "/api/v1/admin/storefront/product-templates";

export const productTemplatesService = {
  list: () => apiClient.get<ProductTemplateRow[]>(BASE),
  meta: () => apiClient.get<TemplateMeta>(`${BASE}/meta`),
  get: (id: string) => apiClient.get<ProductTemplateRecord>(`${BASE}/${id}`),
  create: (name: string, copyFrom?: string) =>
    apiClient.post<ProductTemplateRecord>(BASE, { name, copy_from: copyFrom ?? null }),
  save: (id: string, patch: { name?: string; draft?: TemplateLayout }) =>
    apiClient.put<ProductTemplateRecord>(`${BASE}/${id}`, patch),
  publish: (id: string) => apiClient.post<ProductTemplateRecord>(`${BASE}/${id}/publish`, {}),
  discard: (id: string) => apiClient.post<ProductTemplateRecord>(`${BASE}/${id}/discard`, {}),
  setDefault: (id: string, isDefault: boolean) =>
    apiClient.post<ProductTemplateRecord>(`${BASE}/${id}/default`, { is_default: isDefault }),
  remove: (id: string) => apiClient.delete<{ status: string; products_reset: number }>(`${BASE}/${id}`),
  products: (id: string) => apiClient.get<AssignedProduct[]>(`${BASE}/${id}/products`),
  assign: (id: string, productIds: string[]) =>
    apiClient.post<{ assigned: number; product_count: number }>(`${BASE}/${id}/products`, { product_ids: productIds }),
  unassign: (id: string, productIds: string[]) =>
    apiClient.post<{ removed: number; product_count: number }>(`${BASE}/${id}/products/remove`, { product_ids: productIds }),
};
