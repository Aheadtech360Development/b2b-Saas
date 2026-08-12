import { apiClient } from "@/lib/api-client";

// A condition tree node is either a group (nested AND/OR) or a leaf condition.
export interface SegmentCondition {
  field: string;
  operator: string;
  value?: unknown;
}
export interface SegmentGroup {
  op: "and" | "or";
  conditions: SegmentNode[];
}
export type SegmentNode = SegmentGroup | SegmentCondition;

export function isGroup(n: SegmentNode): n is SegmentGroup {
  return (n as SegmentGroup).conditions !== undefined;
}

export interface Segment {
  id: string;
  name: string;
  description?: string | null;
  definition: SegmentGroup;
  count?: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SegmentMember {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string;
  total_spend: number;
  order_count: number;
  last_order_at: string | null;
}

export interface FieldSpec {
  field: string;
  type: string;
  operators: string[];
}

export const segmentsService = {
  fields: () => apiClient.get<{ fields: FieldSpec[]; operators: Record<string, string[]> }>("/api/v1/admin/segments/fields"),
  list: () => apiClient.get<Segment[]>("/api/v1/admin/segments"),
  get: (id: string) => apiClient.get<Segment>(`/api/v1/admin/segments/${id}`),
  create: (p: { name: string; description?: string; definition: SegmentGroup }) =>
    apiClient.post<Segment>("/api/v1/admin/segments", p),
  update: (id: string, p: Partial<{ name: string; description: string; definition: SegmentGroup }>) =>
    apiClient.patch<Segment>(`/api/v1/admin/segments/${id}`, p),
  remove: (id: string) => apiClient.delete<void>(`/api/v1/admin/segments/${id}`),
  duplicate: (id: string) => apiClient.post<Segment>(`/api/v1/admin/segments/${id}/duplicate`),
  preview: (definition: SegmentGroup, limit = 25) =>
    apiClient.post<{ count: number; sample: SegmentMember[] }>("/api/v1/admin/segments/preview", { definition, limit }),
  members: (id: string, page = 1, page_size = 25) =>
    apiClient.get<{ total: number; page: number; page_size: number; items: SegmentMember[] }>(
      `/api/v1/admin/segments/${id}/members?page=${page}&page_size=${page_size}`
    ),
  recomputeAll: () => apiClient.post<{ recomputed: number }>("/api/v1/admin/segments/metrics/recompute-all"),
};

// ── UI metadata: friendly labels + which value input a field/operator needs ────
export const FIELD_LABELS: Record<string, string> = {
  total_spend: "Total spent",
  order_count: "Number of orders",
  aov: "Average order value",
  paid_order_count: "Paid orders",
  refunded_order_count: "Refunded orders",
  refunded_amount: "Refunded amount",
  cancelled_order_count: "Cancelled orders",
  first_order_date: "First order date",
  last_order_date: "Last order date",
  tags: "Tag",
  customer_tier: "Customer tier",
  tax_exempt: "Tax exempt",
  status: "Account status",
  country: "Country",
  state: "State / province",
  city: "City",
  zip: "ZIP / postal code",
  products_purchased: "Product purchased",
  categories_purchased: "Category purchased",
};

export const OPERATOR_LABELS: Record<string, string> = {
  eq: "is", neq: "is not", gt: "greater than", gte: "at least", lt: "less than", lte: "at most",
  between: "between", contains: "contains", not_contains: "does not contain", starts_with: "starts with",
  in: "is any of", not_in: "is none of", is_set: "is set", is_not_set: "is not set",
  within_last_days: "within last (days)", before: "before", after: "after",
  on_or_before: "on or before", on_or_after: "on or after",
  contains_any: "is any of", contains_all: "includes all of",
};
