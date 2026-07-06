/**
 * Media service — per-brand media library (ImageKit-backed).
 */
import { apiClient } from "@/lib/api-client";

export interface MediaItem {
  file_id: string;
  url: string;
  thumbnail_url: string | null;
  name: string;
  size: number | null;
  file_type: string | null;
  created_at: string | null;
}

export const mediaService = {
  async list(): Promise<{ configured: boolean; items: MediaItem[] }> {
    return apiClient.get("/api/v1/admin/media");
  },

  async upload(file: File): Promise<{ url: string; name: string; file_id: string }> {
    const fd = new FormData();
    fd.append("file", file);
    return apiClient.postForm("/api/v1/admin/media", fd);
  },

  async remove(fileId: string): Promise<void> {
    return apiClient.delete(`/api/v1/admin/media/${fileId}`);
  },
};
