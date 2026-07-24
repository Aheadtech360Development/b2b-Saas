import { apiClient } from "@/lib/api-client";

export interface GangSheetSize {
  id: string;
  name: string;
  width_in: number;
  height_in: number;
  price_per_sheet: number;
  bleed_in: number;
  spacing_in: number;
  is_active: boolean;
  sort_order: number;
}

export interface GangSheetArtwork {
  id?: string;
  file_url: string;
  file_name: string;
  file_type?: string | null;
  width_in: number;
  height_in: number;
  quantity: number;
  sort_order?: number;
}

export type GangSheetStatus =
  | "submitted"
  | "in_review"
  | "approved"
  | "revision_requested"
  | "rejected"
  | "completed";

export interface GangSheetOrder {
  id: string;
  reference: string;
  status: GangSheetStatus;
  sheet_name: string;
  sheet_width_in: number;
  sheet_height_in: number;
  price_per_sheet: number;
  sheet_quantity: number;
  subtotal: number;
  customer_notes: string | null;
  supplier_notes: string | null;
  revision_count: number;
  contact_email: string | null;
  contact_name: string | null;
  product_id: string | null;
  sheet_size_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  artworks?: GangSheetArtwork[];
}

export interface SubmitGangSheetPayload {
  sheet_size_id: string;
  sheet_quantity: number;
  artworks: Omit<GangSheetArtwork, "id" | "sort_order">[];
  product_id?: string;
  contact_email?: string;
  contact_name?: string;
  customer_notes?: string;
}

export const gangSheetsService = {
  // ── Customer ──────────────────────────────────────────────────────────────
  listSizes: () => apiClient.get<GangSheetSize[]>("/api/v1/gang-sheets/sizes"),

  submit: (payload: SubmitGangSheetPayload) =>
    apiClient.post<GangSheetOrder>("/api/v1/gang-sheets/orders", payload),

  myOrders: () => apiClient.get<GangSheetOrder[]>("/api/v1/gang-sheets/orders"),

  myOrder: (id: string) => apiClient.get<GangSheetOrder>(`/api/v1/gang-sheets/orders/${id}`),

  reorder: (id: string) =>
    apiClient.post<GangSheetOrder>(`/api/v1/gang-sheets/orders/${id}/reorder`),

  /** Upload one artwork file. Print formats are stored verbatim, not re-encoded. */
  uploadArtwork: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiClient.postForm<{ url: string; file_name: string; type: string; size: number }>(
      "/api/v1/upload/artwork",
      fd
    );
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  adminListSizes: () => apiClient.get<GangSheetSize[]>("/api/v1/admin/gang-sheets/sizes"),

  adminCreateSize: (payload: Partial<GangSheetSize>) =>
    apiClient.post<GangSheetSize>("/api/v1/admin/gang-sheets/sizes", payload),

  adminUpdateSize: (id: string, payload: Partial<GangSheetSize>) =>
    apiClient.patch<GangSheetSize>(`/api/v1/admin/gang-sheets/sizes/${id}`, payload),

  adminDeleteSize: (id: string) =>
    apiClient.delete<void>(`/api/v1/admin/gang-sheets/sizes/${id}`),

  adminListOrders: (status?: string) =>
    apiClient.get<GangSheetOrder[]>(
      `/api/v1/admin/gang-sheets/orders${status ? `?status_filter=${status}` : ""}`
    ),

  adminOrder: (id: string) =>
    apiClient.get<GangSheetOrder>(`/api/v1/admin/gang-sheets/orders/${id}`),

  adminSetStatus: (id: string, status: GangSheetStatus, supplier_notes?: string) =>
    apiClient.patch<GangSheetOrder>(`/api/v1/admin/gang-sheets/orders/${id}/status`, {
      status,
      supplier_notes,
    }),
};

export const GANG_SHEET_STATUS_LABEL: Record<GangSheetStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  revision_requested: "Revision requested",
  rejected: "Rejected",
  completed: "Completed",
};

export const GANG_SHEET_STATUS_COLOR: Record<GangSheetStatus, { bg: string; fg: string }> = {
  submitted: { bg: "#EEF2FF", fg: "#4338CA" },
  in_review: { bg: "#FEF3C7", fg: "#92400E" },
  approved: { bg: "#DCFCE7", fg: "#166534" },
  revision_requested: { bg: "#FFEDD5", fg: "#9A3412" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B" },
  completed: { bg: "#E0F2FE", fg: "#075985" },
};
