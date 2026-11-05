import { apiClient } from "@/lib/api-client";

/**
 * One product, several sources (backend services/suppliers/sourcing.py): a
 * colour/size of the shop's own product linked to the same item at S&S and
 * SanMar. An order takes the shop's own stock first, then the cheapest
 * supplier that has it.
 */

export interface LinkedSupplier {
  supplier: string;
  label: string;
  style_id: string;
  linked: number;
  stock: number;
  cost_min: number | null;
  cost_max: number | null;
}

export interface VariantSourceRow {
  variant_id: string;
  color: string | null;
  size: string | null;
  /** The shop's own stock. */
  own: number;
  sources: Record<string, { sku: string; stock: number; cost: number | null }>;
}

export interface ProductSources {
  product_id: string;
  /** Set when the product itself was imported from a supplier: it takes no sources. */
  imported_from: string | null;
  suppliers: LinkedSupplier[];
  variants: VariantSourceRow[];
  can_link: { supplier: string; label: string; connected: boolean }[];
}

export interface SourcePreview {
  supplier: string;
  label: string;
  style_id: string;
  style: string;
  variants: number;
  supplier_rows: number;
  pairs: {
    variant_id: string; color: string | null; size: string | null;
    supplier_sku: string; supplier_color: string | null; supplier_size: string | null;
    /** exact: same colour and size; barcode: same GTIN; close: a near colour name. */
    how: "exact" | "barcode" | "close";
    stock: number; cost: number | null;
    /** Another product of the shop's already has this supplier SKU. */
    taken_by: string | null;
  }[];
  unmatched: { variant_id: string; color: string | null; size: string | null }[];
  spare: number;
  /** The same style imported from this supplier as a product of its own. */
  duplicates: { id: string; name: string; slug: string; status: string }[];
}

const base = "/api/v1/admin/suppliers";

export const productSourcesService = {
  get: (productId: string) => apiClient.get<ProductSources>(`${base}/product-sources/${productId}`),
  preview: (supplier: string, productId: string, styleId: string) =>
    apiClient.post<SourcePreview>(`${base}/${supplier}/product-sources/${productId}/preview`, { style_id: styleId }),
  link: (supplier: string, productId: string, styleId: string) =>
    apiClient.post<ProductSources & { linked: number; unmatched: number }>(
      `${base}/${supplier}/product-sources/${productId}`, { style_id: styleId }),
  unlink: (supplier: string, productId: string) =>
    apiClient.delete<ProductSources & { removed: number }>(`${base}/${supplier}/product-sources/${productId}`),
};
