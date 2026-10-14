/**
 * The Affiliates tab's calls: the platform admin's own session (apiClient),
 * on /api/v1/platform/affiliates, which only a platform admin can reach.
 */
import { apiClient } from "@/lib/api-client";

const BASE = "/api/v1/platform/affiliates";

export const aff = {
  get: <T>(path: string) => apiClient.get<T>(`${BASE}${path}`),
  post: <T>(path: string, body?: unknown) => apiClient.post<T>(`${BASE}${path}`, body ?? {}),
  put: <T>(path: string, body: unknown) => apiClient.put<T>(`${BASE}${path}`, body),
  del: <T>(path: string) => apiClient.delete<T>(`${BASE}${path}`),
  form: <T>(path: string, form: FormData) => apiClient.postForm<T>(`${BASE}${path}`, form),
  /** A file from the tab (CSV, PDF, a W-9), saved to the admin's downloads. */
  async save(path: string, filename: string) {
    const blob = await apiClient.blob(`${BASE}${path}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  /** An image the tab serves (a banner), as an address the page can show. */
  async objectUrl(path: string) {
    return URL.createObjectURL(await apiClient.blob(`${BASE}${path}`));
  },
};

export type RatePlan = { id: string; key: string; name: string; rate_bps: number; rate?: string; is_public?: boolean; is_default?: boolean };

/** The plan a new affiliate starts on: the default, else the first (the lowest rate), as the API picks it. */
export function defaultPlanId(plans: { id: string; is_default?: boolean }[]): string {
  return plans.find((p) => p.is_default)?.id ?? plans[0]?.id ?? "";
}
