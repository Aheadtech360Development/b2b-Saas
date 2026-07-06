import { apiClient } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SSCategory {
  id: string;
  name: string;
  gender: string | null;
  product_count: number;
  is_active: boolean;
}

export interface SSProductListItem {
  id: string;
  style_id: string;
  style_name: string;
  brand_name: string | null;
  category_name: string | null;
  gender_name: string | null;
  piece_price: number | null;
  case_price: number | null;
  case_size: number | null;
  front_image: string | null;
  color_count: number;
  is_imported: boolean;
  imported_product_id: string | null;
  last_synced_at: string | null;
}

export interface SSVariant {
  id: string;
  sku: string;
  color_name: string | null;
  color_code: string | null;
  size_name: string | null;
  piece_price: number | null;
  front_image: string | null;
  back_image: string | null;
  side_image: string | null;
  color_swatch: string | null;
  qty_on_hand: number;
  last_inventory_sync: string | null;
}

export interface SSProductDetail extends SSProductListItem {
  description: string | null;
  keywords: string | null;
  variants: SSVariant[];
}

export interface SSProductsResponse {
  items: SSProductListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface SSMarkupRule {
  id: string;
  rule_type: "global" | "category" | "brand" | "product";
  target_value: string | null;
  markup_pct: number;
  markup_fixed: number;
  is_active: boolean;
  created_at: string;
}

export interface MarkupRuleCreate {
  rule_type: string;
  target_value?: string | null;
  markup_pct?: number;
  markup_fixed?: number;
  is_active?: boolean;
}

export interface SyncLog {
  id: string;
  sync_type: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  records_fetched: number;
  records_upserted: number;
  error_message: string | null;
}

export interface SyncStatus {
  latest_by_type: Record<
    string,
    {
      status: string;
      last_run: string | null;
      completed_at: string | null;
      records_upserted: number;
      error: string | null;
    }
  >;
  history: SyncLog[];
}

export interface ImportResult {
  success: boolean;
  product_id: string | null;
  product_slug: string | null;
  message: string;
}

export interface ProductsFilter {
  q?: string;
  category?: string;
  brand?: string;
  gender?: string;
  imported_only?: boolean;
  page?: number;
  page_size?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const supplierCatalogService = {
  async getCategories(): Promise<SSCategory[]> {
    return apiClient.get<SSCategory[]>("/api/v1/admin/supplier-catalog/categories");
  },

  async getProducts(filter: ProductsFilter = {}): Promise<SSProductsResponse> {
    const params = new URLSearchParams();
    if (filter.q) params.set("q", filter.q);
    if (filter.category) params.set("category", filter.category);
    if (filter.brand) params.set("brand", filter.brand);
    if (filter.gender) params.set("gender", filter.gender);
    if (filter.imported_only) params.set("imported_only", "true");
    if (filter.page) params.set("page", String(filter.page));
    if (filter.page_size) params.set("page_size", String(filter.page_size));
    const qs = params.toString();
    return apiClient.get<SSProductsResponse>(
      `/api/v1/admin/supplier-catalog/products${qs ? `?${qs}` : ""}`
    );
  },

  async getProduct(styleId: string): Promise<SSProductDetail> {
    return apiClient.get<SSProductDetail>(
      `/api/v1/admin/supplier-catalog/products/${styleId}`
    );
  },

  async importProduct(styleId: string): Promise<ImportResult> {
    return apiClient.post<ImportResult>(
      `/api/v1/admin/supplier-catalog/products/${styleId}/import`
    );
  },

  async getSyncStatus(limit = 20): Promise<SyncStatus> {
    return apiClient.get<SyncStatus>(
      `/api/v1/admin/supplier-catalog/sync-status?limit=${limit}`
    );
  },

  async triggerSync(syncType: "categories" | "products" | "inventory"): Promise<{ status: string; task_id: string }> {
    return apiClient.post<{ status: string; task_id: string }>(
      `/api/v1/admin/supplier-catalog/sync/trigger?sync_type=${syncType}`
    );
  },

  async getMarkupRules(): Promise<SSMarkupRule[]> {
    return apiClient.get<SSMarkupRule[]>("/api/v1/admin/supplier-catalog/markup-rules");
  },

  async createMarkupRule(data: MarkupRuleCreate): Promise<SSMarkupRule> {
    return apiClient.post<SSMarkupRule>("/api/v1/admin/supplier-catalog/markup-rules", data);
  },

  async updateMarkupRule(id: string, data: MarkupRuleCreate): Promise<SSMarkupRule> {
    return apiClient.put<SSMarkupRule>(`/api/v1/admin/supplier-catalog/markup-rules/${id}`, data);
  },

  async deleteMarkupRule(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/v1/admin/supplier-catalog/markup-rules/${id}`);
  },
};
