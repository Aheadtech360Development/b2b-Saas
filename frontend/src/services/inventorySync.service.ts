/**
 * Products → Inventory sync: a brand's own inventory system (AdvancePro first)
 * feeding its shop's stock. Server: backend/app/api/v1/admin/inventory_sync.py;
 * the login is saved with the brand's other accounts, /admin/integrations/advancepro.
 */
import { apiClient } from "@/lib/api-client";

export interface SyncSummary {
  advancepro_skus: number;
  matched: number;
  updated: number;
  created: number;
  unchanged: number;
  not_in_shop: number;
  not_in_shop_sample: string[];
  not_in_advancepro: number;
  not_in_advancepro_sample: string[];
  count_stock_on: number;
  duplicate_skus: number;
  zeroed: boolean;
  /** Numbers that would go (or went) from some to 0. */
  to_zero: number;
  /** A preview: nothing was written; these are the changes a sync would make (emptied shelves first). */
  preview?: boolean;
  changes_sample?: { sku: string; location: string; before: number | null; after: number }[];
}

export interface SyncRun {
  trigger: "manual" | "schedule";
  status: "completed" | "failed";
  message: string;
  started_at: string;
  finished_at: string;
  summary: Partial<SyncSummary>;
}

export interface SyncJob {
  trigger: "manual" | "schedule";
  status: "running" | "completed" | "failed" | "interrupted";
  done: number;
  total: number;
  message: string;
  started_at: string;
  finished_at?: string;
  summary?: Partial<SyncSummary>;
  /** A preview run: it writes nothing. */
  preview?: boolean;
}

export type LocationSource = "all" | "none" | string;

export interface SyncConfig {
  active: boolean;
  every_minutes: number;
  locations: Record<string, LocationSource>;
  safety_stock: number;
  count_stock: boolean;
  missing: "keep" | "zero";
  last_run_at: string | null;
  last_sync_at: string | null;
  history: SyncRun[];
}

export interface SyncConnection {
  connected: boolean;
  username?: string;
  api_url?: string;
  password_hint?: string;
  password_set?: boolean;
  connected_at?: string;
}

export interface SyncConnector {
  key: string;
  label: string;
  by?: string;
  available: boolean;
  connection: SyncConnection;
  config: SyncConfig;
  job: SyncJob | null;
}

export interface StoreLocation { id: string; name: string; code: string; is_active: boolean }
export interface ApWarehouse { id: string; name: string; active: boolean }

const BASE = "/api/v1/admin/inventory-sync";

export const inventorySyncService = {
  overview: () =>
    apiClient.get<{ connectors: SyncConnector[]; locations: StoreLocation[]; every_minutes: number[] }>(BASE),
  warehouses: (key: string) => apiClient.get<{ warehouses: ApWarehouse[] }>(`${BASE}/${key}/warehouses`),
  save: (key: string, body: Partial<Pick<SyncConfig, "active" | "every_minutes" | "locations" | "safety_stock" | "count_stock" | "missing">>) =>
    apiClient.put<{ config: SyncConfig }>(`${BASE}/${key}`, body),
  run: (key: string) => apiClient.post<{ job: SyncJob }>(`${BASE}/${key}/run`),
  preview: (key: string) => apiClient.post<{ job: SyncJob }>(`${BASE}/${key}/preview`),
  job: (key: string) => apiClient.get<{ job: SyncJob | null }>(`${BASE}/${key}/job`),
  // The login, through the brand's connected accounts: tested before it is kept.
  test: (key: string, values: Record<string, string>) =>
    apiClient.post<{ ok: boolean; message: string }>(`/api/v1/admin/integrations/${key}/test`, { values }),
  connect: (key: string, values: Record<string, string>) =>
    apiClient.post<{ ok?: boolean; message?: string; verified?: boolean }>(`/api/v1/admin/integrations/${key}`, { values, force: false }),
  disconnect: (key: string) => apiClient.delete(`/api/v1/admin/integrations/${key}`),
};
