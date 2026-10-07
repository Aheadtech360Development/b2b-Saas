/**
 * The shop's written pages — Contact, Get a quote and the four policies — as
 * the brand edits them. Saved straight to the shop; not part of a builder draft.
 *
 * The address keeps the prefix it had when these sat inside the imported
 * theme's API (backend/app/api/v1/admin/shop_pages.py).
 */
import { apiClient } from "@/lib/api-client";

export interface WrittenPage {
  slug: string;
  title: string;
  intro: string;
  /** "contact" or "quote" when the page carries a form; "" when it is prose. */
  form: string;
  sections: { heading: string; body: string }[];
}

const BASE = "/api/v1/admin/storefront/theme";

export const writtenPagesService = {
  pages: () => apiClient.get<{ pages: Record<string, WrittenPage> }>(`${BASE}/pages`),
  savePages: (pages: Record<string, WrittenPage>) =>
    apiClient.put<{ pages: Record<string, WrittenPage> }>(`${BASE}/pages`, { pages }),
};
