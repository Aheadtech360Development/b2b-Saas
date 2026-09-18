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

export interface FieldMap { source: string; target: string; modify: string }

export interface AutoSync {
  enabled: boolean;
  every_hours: number;
  update: "inventory" | "inventory_price" | "all" | "none";
  create: "always" | "variants_only" | "never";
  on_unavailable: "none" | "zero_stock" | "draft" | "archive";
  images: "use_update" | "always";
  max_variants: number;
  variant_limit: "limit" | "skip";
}

export interface StoreAddress {
  customer: string; attn: string; address: string; city: string; state: string; zip: string; residential: boolean;
}

export interface OrderSettings {
  sync: "disabled" | "automatic" | "scheduled" | "manual";
  since: string | null;
  schedule_hour: number;
  combine: boolean;
  ship_to: "customer" | "store";
  store_address: StoreAddress;
  fulfillment: "on_ship" | "on_po" | "never";
  po_template: string;
  warehouses: "auto" | "list";
  warehouse_list: string[];
  warehouse_preference: "fewest" | "fastest";
  shipping_method: string;
  payment: "credit" | "card";
  payment_email: string;
  payment_profile_id: number | null;
  email_confirmation: string;
  ship_blind: boolean;
  test_mode: boolean;
}

export interface SupplierConfig {
  name: string;
  created_at: string | null;
  auto_import: boolean;
  filters: Filters;
  pricing: { rules: PriceRule[]; round_to: number | null };
  inventory: { sync: boolean; safety_stock: number; locations: Record<string, string> };
  product: { status: "active" | "draft"; fields: FieldMap[] };
  automatic_sync: AutoSync;
  orders: OrderSettings;
  last_sync_at: string | null;
  history: HistoryEntry[];
}

export interface SupplierMeta {
  sources: { key: string; label: string; level: "style" | "variant" }[];
  targets: { key: string; label: string; level: "product" | "variant"; kind: string }[];
  default_fields: FieldMap[];
  shipping_methods: { code: string; label: string }[];
}

export interface SupplierOrderRow {
  id: string; order_id: string; order_number: string | null;
  status: "sending" | "placed" | "shipped" | "failed" | "test";
  test: boolean; trigger: string; po_number: string | null; supplier_order_numbers: string | null;
  error: string | null; tracking_number: string | null; carrier: string | null; pieces: number;
  created_at: string | null; shipped_at: string | null;
}

export interface WaitingOrder {
  order_id: string; order_number: string; created_at: string; customer: string; status: string;
  payment_status: string; pieces: number;
  lines: { sku: string; qty: number; name: string; color: string | null; size: string | null }[];
  last_attempt: { status: string; error: string | null; at: string } | null;
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
  connection: { connected: boolean; account: string | null; country: "US" | "CA" };
  job: SupplierJob | null;
  meta: SupplierMeta;
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
  update: (id: string, body: Partial<Pick<SupplierConfig, "name" | "auto_import" | "filters" | "pricing" | "inventory" | "product" | "automatic_sync" | "orders">>) =>
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
  locations: (id: string) =>
    apiClient.get<{ locations: { id: string; name: string; code: string; city: string }[]; warehouses: { code: string; label: string }[] }>(
      `${base(id)}/locations`,
    ),
  previewFields: (id: string, fields: FieldMap[]) =>
    apiClient.post<{
      style: { style_id: string; name: string; image: string | null };
      product: Record<string, unknown>;
      variants: Record<string, unknown>[];
    }>(`${base(id)}/fields/preview`, { fields }),
  paymentProfiles: (id: string) =>
    apiClient.get<{ profiles: { id: number; type: string; name: string }[] }>(`${base(id)}/payment-profiles`),
  orders: (id: string) =>
    apiClient.get<{ mode: OrderSettings["sync"]; since: string | null; test_mode: boolean; waiting: WaitingOrder[]; recent: SupplierOrderRow[] }>(
      `${base(id)}/orders`,
    ),
  sendOrders: (id: string, orderIds: string[]) =>
    apiClient.post<{ results: { order_number: string; status: string; message: string }[] }>(`${base(id)}/orders/send`, { order_ids: orderIds }),
  refreshTracking: (id: string) => apiClient.post<{ shipped: number }>(`${base(id)}/orders/tracking`),
  // Credentials live with the brand's other connected accounts.
  connection: () =>
    apiClient.get<{ providers: { key: string; connection: Record<string, unknown> }[] }>("/api/v1/admin/integrations?category=supplier"),
  testConnection: (values: Record<string, string>) =>
    apiClient.post<{ ok: boolean; message: string }>("/api/v1/admin/integrations/ss_activewear/test", { values }),
  saveConnection: (values: Record<string, string>) =>
    apiClient.post<{ message: string; verified: boolean }>("/api/v1/admin/integrations/ss_activewear", { values }),
};
