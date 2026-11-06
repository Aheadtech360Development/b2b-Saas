import { apiClient } from "@/lib/api-client";
import type { DesignDoc, ViewKey } from "@/lib/designer/types";

/** A finished file of a design, kept in the shop's ImageKit folder. */
export interface TShirtOutput {
  id: string;
  shirt_key: string;
  view: ViewKey;
  /** preview: the garment with the design on it. print: the artwork alone at 300 DPI. */
  kind: "preview" | "print";
  file_url: string;
  file_name: string;
  width_px: number;
  height_px: number;
  dpi: number | null;
}

/** A buyer's design as the shop sees it: a job with a reference and a status. */
export interface TShirtDesignRecord {
  id: string;
  reference: string;
  name: string;
  method: "print" | "embroidery";
  status: string;
  status_timeline: string[];
  version: number;
  shirt_count: number;
  total_qty: number;
  quoted_total: number;
  contact_name: string;
  contact_email: string | null;
  customer_notes: string | null;
  supplier_notes: string | null;
  revision_count: number;
  /** The order it was bought on; null while it is only in a cart (or nobody bought it). */
  order_id: string | null;
  order_number?: string | null;
  paid: boolean;
  created_at: string | null;
  updated_at: string | null;
  document?: DesignDoc;
  outputs?: TShirtOutput[];
}

export interface DesignPayload {
  document: DesignDoc;
  quoted_total: number;
  contact_name?: string;
  contact_email?: string;
  customer_notes?: string;
  /** Going into the cart: the buyer is known from the order, so no email is asked for. */
  for_cart?: boolean;
}

/** The picture a design's cart line shows: the first shirt's front preview. */
export function designPreview(record: Pick<TShirtDesignRecord, "outputs">): string | null {
  const previews = (record.outputs ?? []).filter((o) => o.kind === "preview");
  return (previews.find((o) => o.view === "front") ?? previews[0])?.file_url ?? null;
}

export const tshirtDesignsService = {
  submit: (payload: DesignPayload) => apiClient.post<TShirtDesignRecord>("/api/v1/tshirt-designs", payload),
  update: (id: string, payload: DesignPayload) => apiClient.patch<TShirtDesignRecord>(`/api/v1/tshirt-designs/${id}`, payload),
  get: (id: string) => apiClient.get<TShirtDesignRecord>(`/api/v1/tshirt-designs/${id}`),
  mine: () => apiClient.get<TShirtDesignRecord[]>("/api/v1/tshirt-designs/mine"),

  /** One finished file. Sending the same shirt, side and kind again replaces it. */
  uploadOutput: (id: string, file: Blob, meta: { shirt_key: string; view: ViewKey; kind: TShirtOutput["kind"] }) => {
    const fd = new FormData();
    fd.append("file", file, `${meta.shirt_key.replace(":", "-")}-${meta.view}-${meta.kind}.png`);
    fd.append("shirt_key", meta.shirt_key);
    fd.append("view", meta.view);
    fd.append("kind", meta.kind);
    return apiClient.postForm<TShirtOutput>(`/api/v1/tshirt-designs/${id}/outputs`, fd);
  },

  // ── Shop ──────────────────────────────────────────────────────────────────
  adminList: (status?: string) =>
    apiClient.get<TShirtDesignRecord[]>(`/api/v1/admin/tshirt-designs${status ? `?status_filter=${status}` : ""}`),
  adminGet: (id: string) => apiClient.get<TShirtDesignRecord>(`/api/v1/admin/tshirt-designs/${id}`),
  adminSetStatus: (id: string, status: string, supplier_notes?: string) =>
    apiClient.patch<TShirtDesignRecord>(`/api/v1/admin/tshirt-designs/${id}/status`, { status, supplier_notes }),
  adminSetNotes: (id: string, internal_notes: string) =>
    apiClient.patch<TShirtDesignRecord>(`/api/v1/admin/tshirt-designs/${id}/notes`, { internal_notes }),
};

// ── Products → T-shirt designer (backend api/v1/admin/tshirt_designer.py) ────

/** A product as the designer page lists it. */
export interface DesignerProduct {
  id: string;
  name: string;
  slug: string;
  status: string;
  image: string | null;
  enabled: boolean;
  silhouette: string;
  embroidery: boolean;
  colours: number;
  sizes: string[];
  from_price: number | null;
  /** Why it cannot be designed; null when it can. */
  problem: string | null;
}

export interface DesignerTier { min: number; per_side: number }

export interface DesignerRates {
  print: DesignerTier[];
  embroidery: DesignerTier[];
  embroidery_minimum: number;
  name: number;
  number: number;
}

export interface DesignerSettings {
  rates: DesignerRates;
  /** The shop has saved its own prices (else they are the starting ones). */
  saved: boolean;
  silhouettes: { key: string; label: string }[];
}

export interface DesignerSetup {
  has_products: boolean;
  prices_saved: boolean;
  has_designs: boolean;
  available: boolean;
}

const D = "/api/v1/admin/tshirt-designer";

export const tshirtDesignerService = {
  settings: () => apiClient.get<DesignerSettings>(`${D}/settings`),
  saveRates: (rates: DesignerRates) => apiClient.put<DesignerSettings>(`${D}/settings`, { rates }),
  products: () => apiClient.get<{ items: DesignerProduct[] }>(`${D}/products`),
  /** Products that could be added: the shop's others sold by colour and size. */
  pickable: (q: string) => apiClient.get<{ items: DesignerProduct[] }>(`${D}/products?pick=true&q=${encodeURIComponent(q)}`),
  update: (id: string, change: { enabled?: boolean; silhouette?: string; embroidery?: boolean }) =>
    apiClient.patch<DesignerProduct>(`${D}/products/${id}`, change),
  setup: () => apiClient.get<DesignerSetup>(`${D}/setup`),
};
