/**
 * The Inbox — what the storefront's forms sent in (services/inbox.py).
 * Maps to /api/v1/admin/contact-submissions (customers scope, messages feature).
 */
import { apiClient } from "@/lib/api-client";

export type InboxBox = "all" | "messages" | "quotes" | "archived";

export interface ContactSubmission {
  id: string;
  /** A message, or a request from the "Get a quote" form. */
  kind: "message" | "quote";
  page_slug: string | null;
  form_name: string | null;
  /** Who wrote and what they said, read out of the form's own labels. */
  from: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    message: string | null;
    fields: { label: string; value: string }[];
  };
  data: Record<string, string>;
  is_read: boolean;
  answered_at: string | null;
  archived_at: string | null;
  created_at: string | null;
  /** The customer the address belongs to, when it does. */
  customer: { kind: "account"; id: string; name: string } | { kind: "guest"; email: string; orders: number } | null;
}

export interface InboxCounts { all: number; messages: number; quotes: number; archived: number; unread: number; waiting: number }

export interface InboxList { items: ContactSubmission[]; unread: number; counts: InboxCounts; box: InboxBox }

export const contactService = {
  list(box: InboxBox = "all", limit?: number): Promise<InboxList> {
    const q = new URLSearchParams({ box });
    if (limit) q.set("limit", String(limit));
    return apiClient.get(`/api/v1/admin/contact-submissions?${q}`);
  },
  markRead(id: string): Promise<{ status: string }> {
    return apiClient.patch(`/api/v1/admin/contact-submissions/${id}/read`);
  },
  change(id: string, body: { read?: boolean; answered?: boolean; archived?: boolean }): Promise<ContactSubmission> {
    return apiClient.patch(`/api/v1/admin/contact-submissions/${id}`, body);
  },
  reply(id: string, body: { subject: string; body: string }): Promise<ContactSubmission> {
    return apiClient.post(`/api/v1/admin/contact-submissions/${id}/reply`, body);
  },
  remove(id: string): Promise<{ status: string }> {
    return apiClient.delete(`/api/v1/admin/contact-submissions/${id}`);
  },
};
