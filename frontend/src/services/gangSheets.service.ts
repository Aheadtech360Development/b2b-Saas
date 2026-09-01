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
  pricing_mode: "fixed" | "custom_length";
  price_per_inch: number;
  min_length_in: number;
  max_length_in: number;
  max_upload_mb: number | null;
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

export interface GangSheetLibraryDesign {
  id: string;
  name: string;
  file_url: string;
  file_type?: string | null;
  category?: string | null;
  is_active: boolean;
  sort_order: number;
}

export type GangSheetStatus =
  | "submitted"
  | "in_review"
  | "approved"
  | "production"
  | "revision_requested"
  | "rejected"
  | "completed";

export interface GangSheetVersion {
  version: number;
  created_at: string;
  artworks: GangSheetArtwork[];
  layout: GangSheetPlacement[];
}

export interface GangSheetPlacement {
  artwork_id: string;
  x_in: number;
  y_in: number;
  rotation: number;
  w_in: number;
  h_in: number;
}

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
  layout?: GangSheetPlacement[];
  artworks?: GangSheetArtwork[];
  // Checkout link: set once the buyer pays for this sheet through the cart.
  order_id?: string | null;
  paid?: boolean;
  // Batch 3
  version?: number;
  status_timeline?: GangSheetStatus[];
  internal_notes?: string | null; // admin responses only
  versions?: GangSheetVersion[];  // admin responses only
}

export interface SubmitGangSheetPayload {
  sheet_size_id: string;
  sheet_quantity: number;
  artworks: Omit<GangSheetArtwork, "id" | "sort_order">[];
  product_id?: string;
  contact_email?: string;
  contact_name?: string;
  customer_notes?: string;
  custom_length_in?: number;
}

export interface GangSheetDashboard {
  total_jobs: number;
  total_sheets: number;
  total_orders: number;
  total_amount: number;
  status_breakdown: { status: string; count: number }[];
  recent_designs: {
    reference: string;
    contact: string | null;
    status: GangSheetStatus;
    sheet_name: string;
    subtotal: number;
    created_at: string | null;
  }[];
  recent_orders: {
    reference: string;
    subtotal: number;
    paid: boolean;
    created_at: string | null;
  }[];
}

export interface GangSheetProduct {
  id: string;
  name: string;
  slug: string;
  gang_sheet_enabled: boolean;
  gang_sheet_type: "gang_sheet" | "upload_by_size" | null;
  size_count: number;
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

  resubmit: (id: string) =>
    apiClient.post<GangSheetOrder>(`/api/v1/gang-sheets/orders/${id}/resubmit`),

  saveLayout: (id: string, layout: GangSheetPlacement[]) =>
    apiClient.patch<GangSheetOrder>(`/api/v1/gang-sheets/orders/${id}/layout`, { layout }),

  /** Replace an editable order's artwork/sheet/qty when reopened in the builder. */
  rebuild: (id: string, payload: { sheet_size_id: string; sheet_quantity: number; custom_length_in?: number; artworks: Omit<GangSheetArtwork, "id" | "sort_order">[] }) =>
    apiClient.patch<GangSheetOrder>(`/api/v1/gang-sheets/orders/${id}/contents`, payload),

  addArtwork: (id: string, artwork: Omit<GangSheetArtwork, "id" | "sort_order">) =>
    apiClient.post<GangSheetOrder>(`/api/v1/gang-sheets/orders/${id}/artwork`, artwork),

  /** Store-curated ready-made designs the buyer can drop onto a sheet. */
  listLibrary: () => apiClient.get<GangSheetLibraryDesign[]>("/api/v1/gang-sheets/library"),

  /** The buyer's own previously-uploaded designs, de-duplicated (the "Gallery"). */
  myArtworks: () => apiClient.get<GangSheetArtwork[]>("/api/v1/gang-sheets/my-artworks"),

  adminSaveLayout: (id: string, layout: GangSheetPlacement[]) =>
    apiClient.patch<GangSheetOrder>(`/api/v1/admin/gang-sheets/orders/${id}/layout`, { layout }),

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

  adminListLibrary: () => apiClient.get<GangSheetLibraryDesign[]>("/api/v1/admin/gang-sheets/library"),

  adminCreateLibrary: (payload: Partial<GangSheetLibraryDesign>) =>
    apiClient.post<GangSheetLibraryDesign>("/api/v1/admin/gang-sheets/library", payload),

  adminDeleteLibrary: (id: string) =>
    apiClient.delete<void>(`/api/v1/admin/gang-sheets/library/${id}`),

  adminListOrders: (status?: string) =>
    apiClient.get<GangSheetOrder[]>(
      `/api/v1/admin/gang-sheets/orders${status ? `?status_filter=${status}` : ""}`
    ),

  adminOrder: (id: string) =>
    apiClient.get<GangSheetOrder>(`/api/v1/admin/gang-sheets/orders/${id}`),

  adminSetStatus: (id: string, status: GangSheetStatus, supplier_notes?: string, internal_notes?: string) =>
    apiClient.patch<GangSheetOrder>(`/api/v1/admin/gang-sheets/orders/${id}/status`, {
      status,
      supplier_notes,
      internal_notes,
    }),

  /** Live stats for the gang-sheet admin Dashboard (this brand only). */
  adminDashboard: () => apiClient.get<GangSheetDashboard>("/api/v1/admin/gang-sheets/dashboard"),

  /** Products with the gang-sheet builder. showAll=true browses every product. */
  adminListProducts: (showAll = false) =>
    apiClient.get<GangSheetProduct[]>(`/api/v1/admin/gang-sheets/products${showAll ? "?show_all=true" : ""}`),

  /** Enable/disable the builder on a product and/or set its builder type. */
  adminUpdateProduct: (id: string, data: { gang_sheet_enabled?: boolean; gang_sheet_type?: string }) =>
    apiClient.patch<GangSheetProduct>(`/api/v1/admin/gang-sheets/products/${id}`, data),
};

export const GANG_SHEET_STATUS_LABEL: Record<GangSheetStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  production: "In production",
  revision_requested: "Revision requested",
  rejected: "Rejected",
  completed: "Completed",
};

export const GANG_SHEET_STATUS_COLOR: Record<GangSheetStatus, { bg: string; fg: string }> = {
  submitted: { bg: "#EEF2FF", fg: "#4338CA" },
  in_review: { bg: "#FEF3C7", fg: "#92400E" },
  approved: { bg: "#DCFCE7", fg: "#166534" },
  production: { bg: "#E0E7FF", fg: "#3730A3" },
  revision_requested: { bg: "#FFEDD5", fg: "#9A3412" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B" },
  completed: { bg: "#E0F2FE", fg: "#075985" },
};
