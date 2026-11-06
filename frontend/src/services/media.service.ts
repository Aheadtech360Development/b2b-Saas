/**
 * Media service — per-brand media library (ImageKit-backed).
 *
 * Pictures go up through our server. A video goes from the browser straight to
 * ImageKit, with a one-time permission our server signs for the brand's own
 * folder (backend admin/media.py video_upload): a big file never passes
 * through the server.
 */
import { apiClient } from "@/lib/api-client";

export interface MediaItem {
  file_id: string;
  url: string;
  thumbnail_url: string | null;
  name: string;
  size: number | null;
  file_type: string | null;
  /** "video/mp4" for a video. */
  mime?: string | null;
  created_at: string | null;
}

export interface MediaList {
  configured: boolean;
  items: MediaItem[];
  /** Videos can be uploaded. */
  videos?: boolean;
  /** The largest video, in MB. */
  video_max_mb?: number;
}

interface VideoPermission {
  upload_url: string;
  token: string;
  /** The upload's parameters, sent exactly as signed. */
  fields: Record<string, string>;
}

export const mediaService = {
  async list(): Promise<MediaList> {
    return apiClient.get("/api/v1/admin/media");
  },

  async upload(file: File): Promise<{ url: string; name: string; file_id: string }> {
    const fd = new FormData();
    fd.append("file", file);
    return apiClient.postForm("/api/v1/admin/media", fd);
  },

  /** A video into the library, saying how far it has gone (0 to 100). */
  async uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<{ url: string; name: string; file_id: string }> {
    const ok = await apiClient.post<VideoPermission>("/api/v1/admin/media/video-upload",
      { file_name: file.name, size: file.size, mime: file.type });
    const fd = new FormData();
    for (const [k, v] of Object.entries(ok.fields)) fd.append(k, v);
    fd.append("token", ok.token);
    fd.append("file", file);
    const body = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", ok.upload_url);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let answer: Record<string, unknown> = {};
        try { answer = JSON.parse(xhr.responseText); } catch { /* not JSON: said below */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(answer);
        else reject(new Error(typeof answer.message === "string" ? answer.message : "The video did not upload."));
      };
      xhr.onerror = () => reject(new Error("The video did not upload. Check the connection and try again."));
      xhr.send(fd);
    });
    return { url: String(body.url ?? ""), name: String(body.name ?? file.name), file_id: String(body.fileId ?? "") };
  },

  async remove(fileId: string): Promise<void> {
    return apiClient.delete(`/api/v1/admin/media/${fileId}`);
  },
};
