/**
 * The brand's website theme — /api/v1/admin/storefront/theme (storefront scope).
 * Save keeps a draft; publish is what changes the live storefront.
 */
import { apiClient } from "@/lib/api-client";
import type { SlotItem, SlotSpec, ThemeDefinition, ThemeState } from "@/lib/themeValues";

export type ThemeStatus = "draft" | "changes" | "published";

export interface ThemePageSummary {
  key: string;
  label: string;
  kind: string;
  section_count: number;
  hidden_count: number;
}

export interface BrandTheme {
  id: string;
  name: string;
  status: ThemeStatus;
  published_at: string | null;
  updated_at: string | null;
  pages: ThemePageSummary[];
  definition: ThemeDefinition;
  draft: ThemeState;
}

const BASE = "/api/v1/admin/storefront/theme";

export const themesService = {
  get: () => apiClient.get<{ theme: BrandTheme | null }>(BASE),
  save: (draft: ThemeState) => apiClient.put<{ theme: BrandTheme }>(BASE, { draft }),
  publish: () => apiClient.post<{ theme: BrandTheme }>(`${BASE}/publish`, {}),
  discard: () => apiClient.post<{ theme: BrandTheme }>(`${BASE}/discard`, {}),
  /** The cards these rows would show — the same ones the storefront serves. */
  slotData: (slots: Record<string, SlotSpec>) =>
    apiClient.post<{ items: Record<string, SlotItem[]> }>(`${BASE}/data`, { slots }),
  /** An administrator imports a design file as this brand's theme. */
  importFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.postForm<{ theme: BrandTheme }>(`${BASE}/import`, form);
  },
};
