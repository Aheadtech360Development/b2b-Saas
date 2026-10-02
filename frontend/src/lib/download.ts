/**
 * Saving a file the browser would rather open.
 *
 * `<a download>` is ignored for a cross-origin URL. Artwork lives on the image
 * CDN, which is a different origin, so the attribute did nothing and a click
 * opened the picture in a new tab — leaving somebody to right-click and Save
 * As, on a file they asked to download.
 *
 * Fetching it first makes the file same-origin for the moment it is saved,
 * which is what the attribute needs. When that is not allowed — a host with
 * no CORS header, or an offline browser — the old behaviour is what is left,
 * so the link still does something rather than nothing.
 */

/** A file name a browser will accept, from a URL or a stored name. */
export function fileNameFrom(url: string, fallback?: string): string {
  if (fallback && fallback.trim()) return sanitise(fallback);
  try {
    const path = new URL(url, window.location.href).pathname;
    // A path ending in a slash names a folder, not a file: its last segment
    // would save the artwork as "shop".
    if (path.endsWith("/")) return "download";
    const last = path.split("/").filter(Boolean).pop() ?? "";
    const name = sanitise(decodeURIComponent(last));
    // Something with no extension is not a file name either.
    return name.includes(".") ? name : "download";
  } catch {
    return "download";
  }
}

function sanitise(name: string): string {
  // Windows refuses these outright and the rest confuse a download panel.
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 180);
}

/**
 * Save this URL to the person's downloads.
 *
 * Resolves true when the file was saved, false when the browser was handed
 * the URL to open instead. Never throws: a download that fails is a tab that
 * opens, not an error screen on top of the work somebody was doing.
 */
export async function downloadFile(url: string, name?: string): Promise<boolean> {
  const filename = fileNameFrom(url, name);
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    // Appended because Firefox will not follow a click on a detached node.
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked late: revoking in the same tick cancels the save in Safari.
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return true;
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return false;
  }
}
