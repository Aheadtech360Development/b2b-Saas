import type { WrittenPage } from "@/components/storefront/ThemeWrittenPage";

/** One of the shop's written pages, or null when this brand has no store. */
export async function loadWrittenPage(slug: string): Promise<WrittenPage | null> {
  try {
    const { apiClient } = await import("@/lib/api-client");
    const r = await apiClient.get<{ page: WrittenPage }>(
      `/api/v1/storefront/page/${encodeURIComponent(slug)}`, { skipAuth: true },
    );
    return r?.page ?? null;
  } catch {
    return null;
  }
}
