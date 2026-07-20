/**
 * Contact submissions service — brand admin reads/manages form submissions.
 * Maps to /api/v1/admin/contact-submissions (customers scope).
 */
import { apiClient } from "@/lib/api-client";

export interface ContactSubmission {
  id: string;
  page_slug: string | null;
  form_name: string | null;
  data: Record<string, string>;
  is_read: boolean;
  created_at: string | null;
}

export const contactService = {
  list(): Promise<{ items: ContactSubmission[]; unread: number }> {
    return apiClient.get("/api/v1/admin/contact-submissions");
  },
  markRead(id: string): Promise<{ status: string }> {
    return apiClient.patch(`/api/v1/admin/contact-submissions/${id}/read`);
  },
  remove(id: string): Promise<{ status: string }> {
    return apiClient.delete(`/api/v1/admin/contact-submissions/${id}`);
  },
};
