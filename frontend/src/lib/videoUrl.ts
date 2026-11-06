/**
 * Video addresses, read the same way in the media library, its pickers and
 * the website builder's Video block. No "use client": the builder's renderer
 * runs on the server.
 */

/** A video file's address: an upload in the media library, or any https .mp4. */
export function isVideoFile(url: string): boolean {
  const u = (url || "").trim();
  return /^https:\/\/[^\s"'()<>\\]+$/i.test(u) && /\.(mp4|webm|mov|m4v)$/i.test(u.split(/[?#]/)[0]!);
}

/** A media library file that is a video: by its type, or by its address. */
export function isVideoItem(item: { mime?: string | null; url?: string | null }): boolean {
  return (item.mime ?? "").startsWith("video/") || isVideoFile(item.url ?? "");
}

/** The player address of a YouTube or Vimeo link; "" for anything else. */
export function videoEmbed(url: string): string {
  const u = (url || "").trim();
  let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/.exec(u);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = /vimeo\.com\/(?:video\/)?(\d{5,12})/.exec(u);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return "";
}
