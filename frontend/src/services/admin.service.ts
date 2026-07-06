import { apiClient, getAccessToken } from "@/lib/api-client";
import type { ProductDetail } from "@/types/product.types";

export interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: "admin" | "staff" | "customer";
  is_admin: boolean;
  is_active: boolean;
  email_verified: boolean;
  company_name: string | null;
  last_login: string | null;
  created_at: string | null;
}

const API_BASE =
  typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? "http://localhost:8000")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");

async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!response.ok) throw new Error("CSV export failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const adminService = {
  // Products
  async listProducts(params?: { q?: string; status?: string; page?: number }) {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    const qs = query.toString();
    return apiClient.get<ProductDetail[]>(`/api/v1/admin/products${qs ? `?${qs}` : ""}`);
  },

  async getProduct(slug: string) {
    return apiClient.get<ProductDetail>(`/api/v1/admin/products/${slug}`);
  },

  async createProduct(data: object) {
    return apiClient.post<ProductDetail>("/api/v1/admin/products", data);
  },

  async updateProduct(id: string, data: object) {
    return apiClient.patch<ProductDetail>(`/api/v1/admin/products/${id}`, data);
  },

  async deleteProduct(id: string) {
    return apiClient.delete(`/api/v1/admin/products/${id}`);
  },

  async addImageFromUrl(productId: string, url: string, altText?: string, isPrimary?: boolean) {
    return apiClient.post(`/api/v1/admin/products/${productId}/images/from-url`, {
      url,
      alt_text: altText,
      is_primary: isPrimary ?? false,
    });
  },

  async uploadImage(productId: string, file: File, altText?: string) {
    const form = new FormData();
    form.append("file", file);
    if (altText) form.append("alt_text", altText);
    return apiClient.postForm(`/api/v1/admin/products/${productId}/images`, form);
  },

  async deleteImage(productId: string, imageId: string) {
    return apiClient.delete(`/api/v1/admin/products/${productId}/images/${imageId}`);
  },

  async reorderImages(productId: string, imageIds: string[]) {
    return apiClient.patch(`/api/v1/admin/products/${productId}/images/reorder`, imageIds);
  },

  async bulkGenerateVariants(productId: string, data: object) {
    return apiClient.post(`/api/v1/admin/products/${productId}/variants/bulk-generate`, data);
  },

  async updateVariant(productId: string, variantId: string, data: object) {
    return apiClient.patch(`/api/v1/admin/products/${productId}/variants/${variantId}`, data);
  },

  async deleteVariant(productId: string, variantId: string) {
    return apiClient.delete(`/api/v1/admin/products/${productId}/variants/${variantId}`);
  },

  async deleteVariantsBulk(productId: string, variantIds: string[]) {
    return apiClient.delete<{ success: boolean; deleted: number; discontinued: number; message?: string }>(
      `/api/v1/admin/products/${productId}/variants`,
      { body: JSON.stringify({ variant_ids: variantIds }) },
    );
  },

  async bulkAction(ids: string[], action: string) {
    return apiClient.post("/api/v1/admin/products/bulk-action", { ids, action });
  },

  async importProductsCsv(file: File) {
    const form = new FormData();
    form.append("file", file);
    return apiClient.postForm("/api/v1/admin/products/import-csv", form);
  },

  async exportProductsCsv() {
    return downloadCsv("/api/v1/admin/products/export-csv", "products-export.csv");
  },

  // Inventory
  async listInventory(params?: { low_stock_only?: boolean; variant_id?: string }) {
    const query = new URLSearchParams();
    if (params?.low_stock_only) query.set("low_stock_only", "true");
    if (params?.variant_id) query.set("variant_id", params.variant_id);
    const qs = query.toString();
    return apiClient.get(`/api/v1/admin/inventory${qs ? `?${qs}` : ""}`);
  },

  async adjustStock(data: {
    variant_id: string;
    warehouse_id: string;
    quantity_delta: number;
    reason: string;
    notes?: string;
  }) {
    return apiClient.post("/api/v1/admin/inventory/adjust", data);
  },

  async listWarehouses() {
    return apiClient.get("/api/v1/admin/warehouses");
  },

  async createWarehouse(data: { name: string; code: string; address?: string }) {
    return apiClient.post("/api/v1/admin/warehouses", data);
  },

  // Pricing / Shipping tiers
  async listPricingTiers() {
    return apiClient.get("/api/v1/admin/pricing-tiers");
  },

  async createPricingTier(data: object) {
    return apiClient.post("/api/v1/admin/pricing-tiers", data);
  },

  async updatePricingTier(id: string, data: object) {
    return apiClient.patch(`/api/v1/admin/pricing-tiers/${id}`, data);
  },

  async deletePricingTier(id: string) {
    return apiClient.delete(`/api/v1/admin/pricing-tiers/${id}`);
  },

  async listShippingTiers() {
    return apiClient.get("/api/v1/admin/shipping-tiers");
  },

  async listDiscountGroups() {
    return apiClient.get("/api/v1/admin/discount-groups");
  },

  async createShippingTier(data: object) {
    return apiClient.post("/api/v1/admin/shipping-tiers", data);
  },

  async updateShippingTier(id: string, data: object) {
    return apiClient.patch(`/api/v1/admin/shipping-tiers/${id}`, data);
  },

  async deleteShippingTier(id: string) {
    return apiClient.delete(`/api/v1/admin/shipping-tiers/${id}`);
  },

  async seedDefaultShippingTiers() {
    return apiClient.post("/api/v1/admin/shipping-tiers/seed-defaults", {});
  },

  // Companies
  async listCompanies(params?: { q?: string; status?: string; page?: number; page_size?: number }) {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.page_size) query.set("page_size", String(params.page_size));
    const qs = query.toString();
    return apiClient.get(`/api/v1/admin/companies${qs ? `?${qs}` : ""}`);
  },

  async getCompany(id: string) {
    return apiClient.get(`/api/v1/admin/companies/${id}`);
  },

  async updateCompany(id: string, data: object) {
    return apiClient.patch(`/api/v1/admin/companies/${id}`, data);
  },

  async suspendCompany(id: string, reason: string) {
    return apiClient.post(`/api/v1/admin/companies/${id}/suspend`, { reason });
  },

  async reactivateCompany(id: string) {
    return apiClient.post(`/api/v1/admin/companies/${id}/reactivate`, {});
  },

  // Wholesale applications
  async listApplications(status?: string) {
    const qs = status ? `?status=${status}` : "";
    return apiClient.get(`/api/v1/admin/wholesale-applications${qs}`);
  },

  async approveApplication(
    id: string,
    data: { pricing_tier_id?: string; discount_group_id?: string; notes?: string; tax_exempt?: boolean }
  ) {
    return apiClient.post(`/api/v1/admin/wholesale-applications/${id}/approve`, data);
  },

  async rejectApplication(id: string, reason: string) {
    return apiClient.post(`/api/v1/admin/wholesale-applications/${id}/reject`, { rejection_reason: reason || "Rejected by admin" });
  },

  // Companies
  async createCompany(data: {
    name: string;
    business_type?: string;
    tax_id?: string;
    website?: string;
    phone?: string;
    company_email?: string;
    address_line1?: string;
    city?: string;
    state_province?: string;
    postal_code?: string;
    country?: string;
    contact_first_name?: string;
    contact_last_name?: string;
    contact_email?: string;
    contact_phone?: string;
    pricing_tier_id?: string;
    shipping_tier_id?: string;
    admin_notes?: string;
  }) {
    return apiClient.post("/api/v1/admin/companies", data);
  },

  async exportCompaniesCsv() {
    return downloadCsv("/api/v1/admin/companies/export-csv", "customers-export.csv");
  },

  // Orders
  async listOrders(params?: { q?: string; status?: string; page?: number | string; company_id?: string; page_size?: number; date_from?: string; date_to?: string; guest_only?: string }) {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.company_id) query.set("company_id", params.company_id);
    if (params?.page_size) query.set("page_size", String(params.page_size));
    if (params?.date_from) query.set("date_from", params.date_from);
    if (params?.date_to) query.set("date_to", params.date_to);
    if (params?.guest_only) query.set("guest_only", params.guest_only);
    const qs = query.toString();
    return apiClient.get(`/api/v1/admin/orders${qs ? `?${qs}` : ""}`);
  },

  async exportOrdersCsv(params?: { q?: string; status?: string; date_from?: string; date_to?: string }) {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.status) query.set("status", params.status);
    if (params?.date_from) query.set("date_from", params.date_from);
    if (params?.date_to) query.set("date_to", params.date_to);
    const qs = query.toString();
    return downloadCsv(`/api/v1/admin/orders/export-csv${qs ? `?${qs}` : ""}`, "orders-export.csv");
  },

  async getOrder(id: string) {
    return apiClient.get(`/api/v1/admin/orders/${id}`);
  },

  async updateOrder(id: string, data: object) {
    return apiClient.patch(`/api/v1/admin/orders/${id}`, data);
  },

  async cancelOrder(id: string, reason: string) {
    return apiClient.post(`/api/v1/admin/orders/${id}/cancel`, { reason });
  },

  async syncOrderToQb(id: string) {
    return apiClient.post(`/api/v1/admin/orders/${id}/sync-quickbooks`, {});
  },

  // Email templates
  async listEmailTemplates() {
    return apiClient.get("/api/v1/admin/email-templates");
  },

  async getEmailTemplate(id: string) {
    return apiClient.get(`/api/v1/admin/email-templates/${id}`);
  },

  async updateEmailTemplate(id: string, data: object) {
    return apiClient.patch(`/api/v1/admin/email-templates/${id}`, data);
  },

  async previewEmailTemplate(id: string, variables: object) {
    return apiClient.post(`/api/v1/admin/email-templates/${id}/preview`, { variables });
  },

  // Settings
  async getSettings() {
    return apiClient.get("/api/v1/admin/settings");
  },

  async updateSettings(data: object) {
    return apiClient.patch("/api/v1/admin/settings", data);
  },

  // Reports
  async getSalesReport(params?: { from?: string; to?: string; group_by?: string }) {
    const query = new URLSearchParams(params as Record<string, string>);
    return apiClient.get(`/api/v1/admin/reports/sales?${query.toString()}`);
  },

  async getInventoryReport() {
    return apiClient.get("/api/v1/admin/reports/inventory");
  },

  async getCustomerReport(params?: { from?: string; to?: string }) {
    const query = new URLSearchParams(params as Record<string, string>);
    return apiClient.get(`/api/v1/admin/reports/customers?${query.toString()}`);
  },

  // QB
  async getQbStatus() {
    return apiClient.get("/api/v1/admin/quickbooks/status");
  },

  async retryQbSync(logId: string) {
    return apiClient.post(`/api/v1/admin/quickbooks/retry/${logId}`, {});
  },

  // Audit log
  async getAuditLog(params?: {
    entity_type?: string;
    entity_id?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
  }) {
    const query = new URLSearchParams(params as Record<string, string>);
    return apiClient.get(`/api/v1/admin/audit-log?${query.toString()}`);
  },

  // RMA
  async listRmas(status?: string) {
    const qs = status ? `?status=${status}` : "";
    return apiClient.get(`/api/v1/admin/rma${qs}`);
  },

  async updateRma(id: string, data: { status: string; notes?: string }) {
    return apiClient.patch(`/api/v1/admin/rma/${id}`, data);
  },

  // CSV exports (authenticated blob download)
  async exportSalesCsv(period: string) {
    return downloadCsv(
      `/api/v1/admin/reports/sales/export-csv?period=${period}`,
      `sales-report-${period}.csv`
    );
  },

  async exportInventoryCsv() {
    return downloadCsv(
      "/api/v1/admin/reports/inventory/export-csv",
      "inventory-report.csv"
    );
  },

  async exportCustomersCsv(period: string) {
    return downloadCsv(
      `/api/v1/admin/reports/customers/export-csv?period=${period}`,
      `customers-report-${period}.csv`
    );
  },

  // Users
  async listUsers(params?: { q?: string; role?: string; status?: string; page?: number; page_size?: number }) {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.role) query.set("role", params.role);
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.page_size) query.set("page_size", String(params.page_size));
    const qs = query.toString();
    return apiClient.get<{ items: AdminUser[]; total: number }>(`/api/v1/admin/users${qs ? `?${qs}` : ""}`);
  },

  async createUser(data: {
    email: string; first_name: string; last_name: string;
    role: string; password?: string; send_welcome_email?: boolean;
  }) {
    return apiClient.post<AdminUser>("/api/v1/admin/users", data);
  },

  async updateUser(id: string, data: {
    first_name?: string; last_name?: string; email?: string;
    role?: string; is_active?: boolean;
  }) {
    return apiClient.patch<AdminUser>(`/api/v1/admin/users/${id}`, data);
  },

  async deleteUser(id: string) {
    return apiClient.delete(`/api/v1/admin/users/${id}`);
  },

  async resetUserPassword(id: string) {
    return apiClient.post(`/api/v1/admin/users/${id}/reset-password`, {});
  },
};
