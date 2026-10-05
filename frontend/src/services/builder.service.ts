/**
 * The visual builder's admin API (backend/app/api/v1/admin/builder.py), and
 * the brand's existing records the editor picks from — menus, products,
 * collections, pictures. Nothing here creates a second copy of any of them.
 */
import { apiClient } from "@/lib/api-client";
import type { SiteDoc, SitePayload } from "@/lib/builder/types";

const BASE = "/api/v1/admin/storefront/builder";

/** Which template a product or collection uses: in the draft, and on the live site. */
export interface TemplateAssignment {
  /** False when the brand has not opened the Website builder: there is nothing to choose. */
  available: boolean;
  mode?: "legacy" | "visual_builder";
  templates?: { id: string; name: string }[];
  defaultId?: string;
  /** Chosen for this record in the draft; "" follows the default. */
  assigned?: string;
  effective?: string;
  /** What the published site draws it with; null when nothing is published. */
  live?: { id: string; name: string } | null;
  /** The draft's choice is not what shoppers see yet. */
  pending?: boolean;
  revision?: number;
}

export interface BuilderVersionRow { id: string; number: number; note: string | null; published_at: string | null; live: boolean; pinned: boolean }

export interface BuilderState {
  draft: SiteDoc;
  revision: number;
  mode: "legacy" | "visual_builder";
  liveVersion: number | null;
  versions: BuilderVersionRow[];
  /** How many versions history keeps (pinned ones and the live one aside). */
  keepVersions?: number;
}

export interface BuilderIssue { path: string; code: string; message: string; severity: "error" | "warning" }

export interface UploadedFont { id: string; family: string; weight: number; style: string; format: string; url: string; size: number }

export interface PickMenu { id: string; name: string; items: SitePayload["data"]["menus"][string] }
export interface PickProduct { id: string; name: string; slug: string; image: string; status: string }
export interface PickCollection { id: string; name: string; slug: string; image: string; active: boolean }

export const builderService = {
  open: () => apiClient.get<BuilderState>(BASE),
  save: (draft: SiteDoc, revision: number | null) =>
    apiClient.put<{ revision: number }>(`${BASE}/draft`, { draft, revision }),
  validate: () => apiClient.post<{ ok: boolean; issues: BuilderIssue[] }>(`${BASE}/validate`, {}),
  publish: (note: string) =>
    apiClient.post<BuilderState & { version: number; warnings: BuilderIssue[]; unchanged: boolean; pruned: number[] }>(`${BASE}/publish`, { note }),
  pin: (versionId: string, pinned: boolean) =>
    apiClient.put<BuilderState>(`${BASE}/versions/${versionId}/pin`, { pinned }),
  rollback: (versionId: string) =>
    apiClient.post<BuilderState & { version: number }>(`${BASE}/rollback`, { version_id: versionId }),
  setMode: (mode: "legacy" | "visual_builder") => apiClient.put<BuilderState>(`${BASE}/mode`, { mode }),
  reset: () => apiClient.post<BuilderState>(`${BASE}/reset`, {}),
  preview: (params: { route: string; slug?: string; q?: string; template?: string }) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return apiClient.get<SitePayload>(`${BASE}/preview?${q.toString()}`);
  },

  fonts: () => apiClient.get<UploadedFont[]>(`${BASE}/fonts`),
  uploadFont: (file: File, family: string, weight: number, style: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("family", family);
    form.append("weight", String(weight));
    form.append("style", style);
    return apiClient.post<UploadedFont>(`${BASE}/fonts`, form);
  },
  deleteFont: (id: string) => apiClient.delete<void>(`${BASE}/fonts/${id}`),

  menus: () => apiClient.get<PickMenu[]>("/api/v1/admin/storefront/menus"),
  products: async (q = ""): Promise<PickProduct[]> => {
    const rows = await apiClient.get<{ id: string; name: string; slug: string; status: string; images?: { url_thumbnail?: string; url_medium?: string }[] }[]>(
      `/api/v1/admin/products?page_size=40${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    );
    return (rows ?? []).map((p) => ({
      id: p.id, name: p.name, slug: p.slug, status: p.status,
      image: p.images?.[0]?.url_thumbnail || p.images?.[0]?.url_medium || "",
    }));
  },
  /** A product's or collection's template, for its own admin page. Never makes a site. */
  assignment: (kind: "product" | "collection", id: string) =>
    apiClient.get<TemplateAssignment>(`${BASE}/assignment?kind=${kind}&id=${encodeURIComponent(id)}`),
  /** Choose it. Saved to the draft; shoppers see it after the next publish. "" follows the default. */
  assign: (kind: "product" | "collection", id: string, template: string) =>
    apiClient.put<TemplateAssignment>(`${BASE}/assignment`, { kind, id, template }),
  /** Names for products the site refers to by id, however many products the shop has. */
  lookupProducts: async (ids: string[]): Promise<PickProduct[]> => {
    const rows = await apiClient.post<{ id: string; name: string; slug: string; status: string }[]>(
      `${BASE}/products/lookup`, { ids: ids.slice(0, 500) },
    );
    return (rows ?? []).map((p) => ({ ...p, image: "" }));
  },
  collections: async (): Promise<PickCollection[]> => {
    const rows = await apiClient.get<{ id: string; name: string; slug: string; image_url: string | null; is_active: boolean }[]>(
      "/api/v1/admin/collections?include_counts=false",
    );
    return (rows ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug, image: c.image_url || "", active: c.is_active }));
  },
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post<{ url: string }>("/api/v1/admin/media", form);
  },
};
