import { apiClient } from "@/lib/api-client";
import type { Category, ProductDetail, ProductListItem } from "@/types/product.types";
import type { PaginatedResponse } from "@/types/api.types";

export interface ProductFilters {
  category?: string;
  size?: string;
  color?: string;
  price_min?: number;
  price_max?: number;
  q?: string;
  page?: number;
  page_size?: number;
  gender?: string;
  in_stock?: boolean;
  product_code?: string;
}

export interface FacetColor { name: string; hex: string | null; products: number }

export interface ProductFacets {
  colors: FacetColor[];
  sizes: string[];
  category_counts: Record<string, number>;
  price: { min: number | null; max: number | null };
}

export const productsService = {
  async listProducts(
    filters: ProductFilters = {}
  ): Promise<PaginatedResponse<ProductListItem>> {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.size) params.set("size", filters.size);
    if (filters.color) params.set("color", filters.color);
    if (filters.price_min !== undefined)
      params.set("price_min", String(filters.price_min));
    if (filters.price_max !== undefined)
      params.set("price_max", String(filters.price_max));
    if (filters.q) params.set("q", filters.q);
    if (filters.page) params.set("page", String(filters.page));
    if (filters.page_size) params.set("page_size", String(filters.page_size));
    if (filters.gender) params.set("gender", filters.gender);
    if (filters.in_stock) params.set("in_stock", "true");
    if (filters.product_code) params.set("product_code", filters.product_code);

    const query = params.toString();
    return apiClient.get<PaginatedResponse<ProductListItem>>(
      `/api/v1/products${query ? `?${query}` : ""}`
    );
  },

  async getProductBySlug(slug: string): Promise<ProductDetail> {
    return apiClient.get<ProductDetail>(`/api/v1/products/${slug}`);
  },

  /** What the filter sidebar should offer: colours (with the brand's own hex),
   *  sizes, how many products each category holds, and the price range. */
  async getFilters(params?: { q?: string; gender?: string }): Promise<ProductFacets> {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.gender) qs.set("gender", params.gender);
    return apiClient.get<ProductFacets>(`/api/v1/products/filters${qs.toString() ? `?${qs}` : ""}`);
  },

  async getCategories(): Promise<Category[]> {
    return apiClient.get<Category[]>("/api/v1/products/categories");
  },
};
