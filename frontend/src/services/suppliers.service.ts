import { apiClient } from "@/lib/api-client";

export type FilterField = "brand" | "category" | "style" | "title";
export type FilterOp = "equals" | "contains" | "not_equals";

export interface FilterRule { field: FilterField; op: FilterOp; value: string }
export interface Filters { match: "any" | "all"; rules: FilterRule[] }

export interface PriceRule {
  id?: string;
  scope: "all" | "brand" | "category" | "style";
  value: string;
  markup_pct: number;
  markup_fixed: number;
  active: boolean;
}

export interface SupplierJob {
  kind: "import" | "inventory" | "sync";
  trigger: "manual" | "schedule";
  status: "running" | "completed" | "failed" | "interrupted";
  done: number;
  total: number;
  message: string;
  started_at: string;
  finished_at?: string;
  summary?: {
    import?: { matched: number; already_imported: number; imported: number; failed: number; remaining: number; errors: string[] };
    inventory?: { styles: number; variants_checked: number; variants_changed: number; safety_stock: number };
  };
}

export interface HistoryEntry {
  kind: SupplierJob["kind"];
  trigger: SupplierJob["trigger"];
  status: SupplierJob["status"];
  message: string;
  started_at: string;
  finished_at: string;
}

export interface SupplierConfig {
  name: string;
  created_at: string | null;
  auto_import: boolean;
  filters: Filters;
  pricing: { rules: PriceRule[]; round_to: number | null };
  inventory: { sync: boolean; safety_stock: number };
  automatic_sync: { enabled: boolean; every_hours: number };
  last_sync_at: string | null;
  history: HistoryEntry[];
}

export interface SupplierRow {
  id: string;
  label: string;
  available: boolean;
  name?: string;
  connected: boolean;
  account?: string | null;
  auto_import?: boolean;
  automatic_sync?: { enabled: boolean; every_hours: number };
  last_sync_at?: string | null;
  created_at?: string | null;
  job?: SupplierJob | null;
}

export interface SupplierDetail {
  id: string;
  label: string;
  config: SupplierConfig;
  connection: { connected: boolean; account: string | null };
  job: SupplierJob | null;
}

export interface CatalogStyle {
  style_id: string;
  part_number: string;
  brand: string;
  style_name: string;
  title: string;
  category: string;
  description: string;
  image: string | null;
  is_imported: boolean;
  in_filters?: boolean;
  variants?: number | null;
  sizes?: string[];
  colors?: number | null;
}

const base = (id: string) => `/api/v1/admin/suppliers/${id}`;

export const suppliersService = {
  list: () => apiClient.get<SupplierRow[]>("/api/v1/admin/suppliers"),
  get: (id: string) => apiClient.get<SupplierDetail>(base(id)),
  update: (id: string, body: Partial<Pick<SupplierConfig, "name" | "auto_import" | "filters" | "pricing" | "inventory" | "automatic_sync">>) =>
    apiClient.put<{ config: SupplierConfig }>(base(id), body),
  brands: (id: string) => apiClient.get<{ brands: { brand: string; styles: number }[]; categories: string[] }>(`${base(id)}/brands`),
  catalog: (id: string, p: { q?: string; brand?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (p.q) qs.set("q", p.q);
    if (p.brand) qs.set("brand", p.brand);
    qs.set("page", String(p.page ?? 1));
    return apiClient.get<{ items: CatalogStyle[]; total: number; page: number; pages: number }>(`${base(id)}/catalog?${qs}`);
  },
  preview: (id: string, page = 1) =>
    apiClient.get<{ filters: Filters; products: number; already_imported: number; items: CatalogStyle[]; page: number; pages: number }>(
      `${base(id)}/import-preview?page=${page}`,
    ),
  previewCount: (id: string) =>
    apiClient.get<{ products: number; variants: number | null; complete?: boolean; note?: string }>(`${base(id)}/import-preview/count`),
  startImport: (id: string) => apiClient.post<{ job: SupplierJob }>(`${base(id)}/import`),
  startSync: (id: string, full = false) => apiClient.post<{ job: SupplierJob }>(`${base(id)}/sync${full ? "?full=true" : ""}`),
  job: (id: string) => apiClient.get<{ job: SupplierJob | null }>(`${base(id)}/job`),
};
