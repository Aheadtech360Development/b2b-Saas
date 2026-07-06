import { apiClient } from "@/lib/api-client";

export const accountService = {
  // Profile
  async getProfile() {
    return apiClient.get("/api/v1/account/profile");
  },
  async getFullProfile() {
    return apiClient.get("/api/v1/account/profile/full");
  },
  async updateProfile(data: { first_name?: string; last_name?: string; phone?: string }) {
    return apiClient.patch("/api/v1/account/profile", data);
  },
  async updateUserProfile(data: object) {
    return apiClient.patch("/api/v1/account/profile/user", data);
  },
  async updateCompanyProfile(data: object) {
    return apiClient.patch("/api/v1/account/profile/company", data);
  },
  async changePassword(current_password: string, new_password: string) {
    return apiClient.patch("/api/v1/account/change-password", { current_password, new_password });
  },

  // Users
  async getUsers() {
    return apiClient.get("/api/v1/account/users");
  },
  async inviteUser(data: { email: string; first_name: string; last_name: string; role?: string }) {
    return apiClient.post("/api/v1/account/users/invite", data);
  },
  async updateUserRole(userId: string, role: string) {
    return apiClient.patch(`/api/v1/account/users/${userId}`, { role });
  },
  async removeUser(userId: string) {
    return apiClient.delete(`/api/v1/account/users/${userId}`);
  },

  // Contacts
  async getContacts() {
    return apiClient.get("/api/v1/account/contacts");
  },
  async createContact(data: object) {
    return apiClient.post("/api/v1/account/contacts", data);
  },
  async updateContact(id: string, data: object) {
    return apiClient.patch(`/api/v1/account/contacts/${id}`, data);
  },
  async deleteContact(id: string) {
    return apiClient.delete(`/api/v1/account/contacts/${id}`);
  },

  // Addresses
  async getAddresses() {
    return apiClient.get("/api/v1/account/addresses");
  },
  async createAddress(data: object) {
    return apiClient.post("/api/v1/account/addresses", data);
  },
  async updateAddress(id: string, data: object) {
    return apiClient.patch(`/api/v1/account/addresses/${id}`, data);
  },
  async deleteAddress(id: string) {
    return apiClient.delete(`/api/v1/account/addresses/${id}`);
  },
  async setDefaultAddress(id: string) {
    return apiClient.patch(`/api/v1/account/addresses/${id}/set-default`, {});
  },

  // Payment methods
  async getPaymentMethods() {
    return apiClient.get("/api/v1/account/payment-methods");
  },
  async deletePaymentMethod(id: string) {
    return apiClient.delete(`/api/v1/account/payment-methods/${id}`);
  },

  // Messages
  async getMessages() {
    return apiClient.get("/api/v1/account/messages");
  },
  async sendMessage(data: { subject: string; body: string; parent_id?: string }) {
    return apiClient.post("/api/v1/account/messages", data);
  },

  // Orders
  async getOrders(params?: { q?: string; status?: string; page?: number }) {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    const q = qs.toString();
    return apiClient.get(`/api/v1/orders${q ? `?${q}` : ""}`);
  },
  async getOrder(id: string) {
    return apiClient.get(`/api/v1/orders/${id}`);
  },
  async reorder(id: string) {
    return apiClient.post(`/api/v1/orders/${id}/reorder`, {});
  },
  async getOrderComments(orderId: string) {
    return apiClient.get(`/api/v1/orders/${orderId}/comments`);
  },
  async addOrderComment(orderId: string, body: string) {
    return apiClient.post(`/api/v1/orders/${orderId}/comments`, { body });
  },
  downloadOrderPdf(orderId: string, type: "confirmation" | "invoice" | "ship-confirmation" | "pack-slip") {
    // Returns a URL to open/download — uses window.open or anchor download
    return `/api/v1/orders/${orderId}/pdf/${type}`;
  },

  // Price list
  async requestPriceList(format: "pdf" | "excel" = "pdf") {
    return apiClient.post(`/api/v1/account/price-list?format=${format}`, {});
  },
  async getPriceListStatus(requestId: string) {
    return apiClient.get(`/api/v1/account/price-list/${requestId}`);
  },

  // Templates
  async getTemplates() {
    return apiClient.get("/api/v1/account/templates");
  },
  async deleteTemplate(id: string) {
    return apiClient.delete(`/api/v1/account/templates/${id}`);
  },
  async loadTemplate(id: string) {
    return apiClient.post(`/api/v1/account/templates/${id}/load`, {});
  },

  // RMA
  async getRmas() {
    return apiClient.get("/api/v1/account/rma");
  },
  async getRma(id: string) {
    return apiClient.get(`/api/v1/account/rma/${id}`);
  },
  async createRma(data: {
    order_id: string;
    reason: string;
    items: { order_item_id: string; quantity: number; reason: string }[];
  }) {
    return apiClient.post("/api/v1/account/rma", data);
  },

  // QB Invoices
  async getInvoices() {
    return apiClient.get("/api/v1/account/invoices");
  },

  // Inventory report
  async getInventoryReport(params?: { q?: string; stock_level?: string; page?: number }) {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.stock_level) qs.set("stock_level", params.stock_level);
    if (params?.page) qs.set("page", String(params.page));
    const q = qs.toString();
    return apiClient.get(`/api/v1/account/inventory-report${q ? `?${q}` : ""}`);
  },
};
