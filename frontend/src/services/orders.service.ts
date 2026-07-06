// frontend/src/services/orders.service.ts
import { apiClient } from "@/lib/api-client";
import type { OrderDetail, OrderListItem } from "@/types/order.types";
import type { PaginatedResponse } from "@/types/api.types";

export interface CreatePaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
  amount: number;
}

export interface ConfirmOrderPayload {
  // QB Payments flow
  qb_token?: string;
  saved_card_id?: string;
  qb_customer_id?: string;
  save_card?: boolean;
  // Stripe flow (legacy)
  payment_intent_id?: string;
  address_id?: string;
  shipping_address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  shipping_method?: string;
  po_number?: string;
  order_notes?: string;
  discount_code?: string;
  tax_amount?: number;
  tax_rate?: number;
  tax_region?: string;
  shipping_cost?: number;
  // ACH payment
  payment_method?: string;
  ach_bank_name?: string;
  ach_account_holder?: string;
  ach_routing_number?: string;
  ach_account_last4?: string;
  ach_account_type?: string;
}

export const ordersService = {
  async createPaymentIntent(): Promise<CreatePaymentIntentResponse> {
    return apiClient.post<CreatePaymentIntentResponse>("/api/v1/checkout/intent", {
      cart_validated: true,
    });
  },

  async confirmOrder(payload: ConfirmOrderPayload): Promise<OrderDetail> {
    return apiClient.post<OrderDetail>("/api/v1/checkout/confirm", payload);
  },

  async getOrders(page = 1): Promise<PaginatedResponse<OrderListItem>> {
    return apiClient.get<PaginatedResponse<OrderListItem>>(
      `/api/v1/orders?page=${page}`
    );
  },

  async getOrder(id: string): Promise<OrderDetail> {
    return apiClient.get<OrderDetail>(`/api/v1/orders/${id}`);
  },

  async reorder(orderId: string): Promise<{ added: unknown[]; skipped: unknown[] }> {
    return apiClient.post(`/api/v1/orders/${orderId}/reorder`, {});
  },
};
