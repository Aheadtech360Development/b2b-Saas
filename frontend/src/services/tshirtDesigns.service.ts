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
  order_id: string | null;
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
